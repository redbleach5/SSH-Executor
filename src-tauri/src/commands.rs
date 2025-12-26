use crate::audit;
use crate::file_parser;
use crate::ssh;
use crate::security::encrypt_password;
use rayon::prelude::*;
use rayon::ThreadPoolBuilder;
use serde::{Deserialize, Serialize};
use tauri::{State, Window};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, mpsc};

pub type SshPool = std::sync::Arc<ssh::SshConnectionPool>;

// Структура для управления отменой выполнения команд
#[derive(Clone)]
pub struct CancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn reset(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

impl Default for CancellationToken {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
pub async fn parse_hosts_file(
    file_path: String,
) -> Result<Vec<file_parser::HostEntry>, String> {
    audit::log_action("INFO", "parse_hosts", &format!("Загрузка файла: {}", file_path), None);
    
    file_parser::parse_hosts_file(&file_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_ssh_connection(
    config: ssh::SshConfig,
    pool: State<'_, SshPool>,
) -> Result<ssh::SshCommandResult, String> {
    audit::log_action("INFO", "test_connection", &format!("Тест подключения к {}", config.host), None);
    
    let connection = pool.get_or_create(config.clone())
        .map_err(|e| e.to_string())?;
    
    connection.execute_command("echo 'Connection test successful'")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn execute_ssh_command(
    config: ssh::SshConfig,
    command: String,
    pool: State<'_, SshPool>,
    cancellation_token: State<'_, CancellationToken>,
    skip_validation: Option<bool>,
) -> Result<ssh::SshCommandResult, String> {
    // Сбрасываем токен отмены перед началом выполнения
    cancellation_token.reset();
    
    // Валидация команды перед выполнением (если не отключена)
    let skip_val = skip_validation.unwrap_or(false);
    crate::command_validation::validate_command(&command, skip_val)
        .map_err(|e| format!("Ошибка валидации команды: {}", e))?;
    
    // Санитизируем команду для логирования
    let sanitized_command = crate::command_validation::sanitize_command_for_logging(&command);
    audit::log_action("INFO", "execute_command", &format!("Выполнение команды на {}: {}", config.host, sanitized_command), None);
    
    // Проверяем отмену перед подключением
    if cancellation_token.is_cancelled() {
        return Err("Выполнение команды отменено".to_string());
    }
    
    let connection = pool.get_or_create(config)
        .map_err(|e| e.to_string())?;
    
    // Проверяем отмену перед выполнением команды
    if cancellation_token.is_cancelled() {
        return Err("Выполнение команды отменено".to_string());
    }
    
    connection.execute_command(&command)
        .map_err(|e| {
            if cancellation_token.is_cancelled() {
                "Выполнение команды отменено".to_string()
            } else {
                e.to_string()
            }
        })
}

// Вспомогательная структура для десериализации из фронтенда
#[derive(Debug, Clone, Deserialize)]
struct BatchCommandRequestHelper {
    pub hosts: Vec<file_parser::HostEntry>,
    pub config_template: SshConfigHelperForBatch,
    pub command: String,
    pub max_concurrent: Option<usize>,
    #[serde(default)]
    pub retry_failed_hosts: Option<bool>,
    #[serde(default)]
    pub retry_interval: Option<u64>,
    #[serde(default)]
    pub skip_validation: Option<bool>,
}

// Копия SshConfigHelper для использования в BatchCommandRequest
#[derive(Debug, Clone, Deserialize)]
struct SshConfigHelperForBatch {
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    key_path: Option<String>,
    ppk_path: Option<String>,
    passphrase: Option<String>,
    timeout: u64,
    #[serde(default)]
    keep_alive_interval: Option<u64>,
    #[serde(default)]
    reconnect_attempts: Option<u32>,
    #[serde(default)]
    reconnect_delay_base: Option<f64>,
    #[serde(default)]
    compression_enabled: Option<bool>,
    #[serde(default)]
    compression_level: Option<u32>,
}

impl From<SshConfigHelperForBatch> for ssh::SshConfig {
    fn from(helper: SshConfigHelperForBatch) -> Self {
        // Используем ту же логику, что и в ssh.rs - шифруем пароль сразу
        let auth_method = match helper.auth_method.as_str() {
            "password" => {
                let password = helper.password.unwrap_or_default();
                if password.is_empty() {
                    eprintln!("Warning: Password authentication selected but password is empty");
                    ssh::AuthMethod::Password(
                        encrypt_password("").unwrap_or_else(|e| {
                            eprintln!("Failed to encrypt empty password: {}", e);
                            crate::security::EncryptedData::empty()
                        })
                    )
                } else {
                    match encrypt_password(&password) {
                        Ok(encrypted) => ssh::AuthMethod::Password(encrypted),
                        Err(e) => {
                            eprintln!("Failed to encrypt password: {}", e);
                            ssh::AuthMethod::Password(crate::security::EncryptedData::empty())
                        }
                    }
                }
            },
            "key" => {
                let key_path = helper.key_path.unwrap_or_default();
                if key_path.is_empty() {
                    eprintln!("Warning: Key authentication selected but key_path is empty");
                }
                // Шифруем passphrase если он указан
                let passphrase = helper.passphrase.map(|p| {
                    encrypt_password(&p).unwrap_or_else(|e| {
                        eprintln!("Failed to encrypt passphrase: {}", e);
                        crate::security::EncryptedData::empty()
                    })
                });
                ssh::AuthMethod::PrivateKey {
                    key_path,
                    passphrase,
                }
            },
            "ppk" => {
                let ppk_path = helper.ppk_path.unwrap_or_default();
                if ppk_path.is_empty() {
                    eprintln!("Warning: PPK authentication selected but ppk_path is empty");
                }
                // Шифруем passphrase если он указан
                let passphrase = helper.passphrase.map(|p| {
                    encrypt_password(&p).unwrap_or_else(|e| {
                        eprintln!("Failed to encrypt passphrase: {}", e);
                        crate::security::EncryptedData::empty()
                    })
                });
                ssh::AuthMethod::PuttyKey {
                    ppk_path,
                    passphrase,
                }
            },
            _ => {
                eprintln!("Warning: Unknown auth_method '{}', defaulting to password", helper.auth_method);
                let password = helper.password.unwrap_or_default();
                match encrypt_password(&password) {
                    Ok(encrypted) => ssh::AuthMethod::Password(encrypted),
                    Err(e) => {
                        eprintln!("Failed to encrypt password: {}", e);
                        ssh::AuthMethod::Password(crate::security::EncryptedData::empty())
                    }
                }
            },
        };
        
        ssh::SshConfig {
            host: helper.host,
            port: helper.port,
            username: helper.username,
            auth_method,
            timeout: helper.timeout,
            keep_alive_interval: helper.keep_alive_interval,
            reconnect_attempts: helper.reconnect_attempts,
            reconnect_delay_base: helper.reconnect_delay_base,
            compression_enabled: helper.compression_enabled,
            compression_level: helper.compression_level,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(from = "BatchCommandRequestHelper")]
pub struct BatchCommandRequest {
    pub hosts: Vec<file_parser::HostEntry>,
    pub config_template: ssh::SshConfig,
    pub command: String,
    pub max_concurrent: Option<usize>,
    pub retry_failed_hosts: bool,
    pub retry_interval: u64,
    pub skip_validation: bool,
}

impl From<BatchCommandRequestHelper> for BatchCommandRequest {
    fn from(helper: BatchCommandRequestHelper) -> Self {
        Self {
            hosts: helper.hosts,
            config_template: ssh::SshConfig::from(helper.config_template),
            command: helper.command,
            max_concurrent: helper.max_concurrent,
            retry_failed_hosts: helper.retry_failed_hosts.unwrap_or(false),
            retry_interval: helper.retry_interval.unwrap_or(30),
            skip_validation: helper.skip_validation.unwrap_or(false),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchCommandResult {
    pub result: Option<ssh::SshCommandResult>,
    pub error: Option<String>,
    pub host: String,
}

// Счетчик ID выполнения для предотвращения смешивания результатов
static EXECUTION_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
// Текущий активный ID выполнения
static CURRENT_EXECUTION_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[tauri::command]
pub async fn execute_batch_commands(
    request: BatchCommandRequest,
    pool: State<'_, SshPool>,
    cancellation_token: State<'_, CancellationToken>,
    window: Window,
) -> Result<Vec<BatchCommandResult>, String> {
    // Генерируем уникальный ID для этого выполнения
    let execution_id = EXECUTION_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    // Устанавливаем текущий активный ID (отменяет предыдущие выполнения)
    CURRENT_EXECUTION_ID.store(execution_id, std::sync::atomic::Ordering::SeqCst);
    
    let start_time = std::time::Instant::now();
    log::info!("[Batch Execute] Начало выполнения пакетной команды #{}, Хостов: {}", execution_id, request.hosts.len());
    
    // Проверяем, что список хостов не пустой
    if request.hosts.is_empty() {
        let error_msg = "Список хостов пуст. Загрузите хосты перед выполнением команды.";
        log::error!("[Batch Execute] {}", error_msg);
        return Err(error_msg.to_string());
    }
    
    // Сбрасываем токен отмены перед началом выполнения
    cancellation_token.reset();
    
    log::debug!("[Batch Execute] Валидация команды: {}", &request.command);
    // Валидация команды перед пакетным выполнением (если не отключена)
    crate::command_validation::validate_command(&request.command, request.skip_validation)
        .map_err(|e| {
            let error_msg = format!("Ошибка валидации команды: {}", e);
            log::error!("[Batch Execute] {}", error_msg);
            error_msg
        })?;
    
    log::debug!("[Batch Execute] Валидация конфигурации SSH. Метод аутентификации: {:?}", request.config_template.auth_method);
    // Валидация конфигурации SSH перед пакетным выполнением
    match &request.config_template.auth_method {
        ssh::AuthMethod::PrivateKey { key_path, .. } => {
            if key_path.is_empty() {
                let error_msg = "Ошибка конфигурации: выбран метод аутентификации по ключу, но путь к ключу не указан".to_string();
                log::error!("[Batch Execute] {}", error_msg);
                return Err(error_msg);
            }
            if !std::path::Path::new(key_path).exists() {
                let error_msg = format!("Ошибка конфигурации: файл ключа не найден: {}", key_path);
                log::error!("[Batch Execute] {}", error_msg);
                return Err(error_msg);
            }
            log::debug!("[Batch Execute] Путь к ключу валиден: {}", key_path);
        },
        ssh::AuthMethod::PuttyKey { ppk_path, .. } => {
            if ppk_path.is_empty() {
                let error_msg = "Ошибка конфигурации: выбран метод аутентификации по PPK ключу, но путь к ключу не указан".to_string();
                log::error!("[Batch Execute] {}", error_msg);
                return Err(error_msg);
            }
            if !std::path::Path::new(ppk_path).exists() {
                let error_msg = format!("Ошибка конфигурации: файл PPK ключа не найден: {}", ppk_path);
                log::error!("[Batch Execute] {}", error_msg);
                return Err(error_msg);
            }
            log::debug!("[Batch Execute] Путь к PPK ключу валиден: {}", ppk_path);
        },
        _ => {
            log::debug!("[Batch Execute] Используется аутентификация по паролю");
        } // Для пароля валидация не требуется здесь
    }
    
    // Санитизируем команду для логирования
    let sanitized_command = crate::command_validation::sanitize_command_for_logging(&request.command);
    let command_preview = if sanitized_command.len() > 100 {
        format!("{}...", &sanitized_command[..100])
    } else {
        sanitized_command.clone()
    };
    
    audit::log_action(
        "INFO",
        "batch_execute",
        &format!("Пакетное выполнение команды на {} хостах. Команда: {}", request.hosts.len(), command_preview),
        None,
    );

    // Проверяем отмену перед началом
    if cancellation_token.is_cancelled() {
        return Err("Выполнение команды отменено".to_string());
    }

    let max_concurrent = request.max_concurrent.unwrap_or(50);
    let pool_clone = pool.clone();
    let total_hosts = request.hosts.len();
    let command = request.command.clone();
    let config_template = request.config_template.clone();
    let cancellation_token_clone = cancellation_token.inner().clone();
    
    // Сохраняем оригинальный список хостов для повторных попыток
    let original_hosts = request.hosts.clone();

    // Подготавливаем список хостов с конфигурациями
    let hosts_with_configs: Vec<_> = request
        .hosts
        .into_iter()
        .map(|host| {
            let mut config = config_template.clone();
            config.host = host.ip.clone();
            if let Some(port) = host.port {
                config.port = port;
            }
            let host_ip = host.ip.clone();
            let cmd = command.clone();
            let pool_ref = pool_clone.clone();
            
            (host_ip, config, cmd, pool_ref)
        })
        .collect();

    log::info!("[Batch Execute] Создание пула потоков. Максимум параллельных соединений: {}", max_concurrent);
    // Создаем пул потоков с ограничением параллельности
    let thread_pool = ThreadPoolBuilder::new()
        .num_threads(max_concurrent)
        .build()
        .map_err(|e| {
            let error_msg = format!("Failed to create thread pool: {}", e);
            log::error!("[Batch Execute] {}", error_msg);
            error_msg
        })?;

    let total_hosts_count = hosts_with_configs.len();
    log::info!("[Batch Execute] Начало выполнения команд на {} хостах", total_hosts_count);
    
    // Создаем канал для отправки результатов в реальном времени
    let (tx, rx) = mpsc::channel::<BatchCommandResult>();
    let window_clone = window.clone();
    let sender_execution_id = execution_id; // Копируем ID для потока
    
    // Запускаем поток для отправки событий
    let event_sender = std::thread::spawn(move || {
        let mut completed = 0;
        let total = total_hosts_count;
        
        while let Ok(result) = rx.recv() {
            // Проверяем, является ли это выполнение все еще актуальным
            let current_id = CURRENT_EXECUTION_ID.load(std::sync::atomic::Ordering::SeqCst);
            if sender_execution_id != current_id {
                // Это устаревшее выполнение, пропускаем отправку события
                log::debug!("[Batch Execute] Пропуск события от устаревшего выполнения #{} (текущее: #{})", 
                    sender_execution_id, current_id);
                continue;
            }
            
            completed += 1;
            // Отправляем событие с результатом
            if let Err(e) = window_clone.emit("batch-result", &result) {
                log::error!("[Batch Execute] Ошибка отправки события: {}", e);
            }
            // Отправляем событие с прогрессом
            if let Err(e) = window_clone.emit("batch-progress", serde_json::json!({
                "completed": completed,
                "total": total,
                "host": result.host,
            })) {
                log::error!("[Batch Execute] Ошибка отправки прогресса: {}", e);
            }
        }
    });
    
    // Выполняем команды с ограниченной параллельностью
    let worker_execution_id = execution_id; // Копируем ID для рабочих потоков
    let mut results: Vec<BatchCommandResult> = thread_pool.install(|| {
        hosts_with_configs
            .into_par_iter()
            .map(|(host_ip, config, cmd, pool_ref)| {
                let tx = tx.clone();
                
                // Проверяем, является ли это выполнение все еще актуальным
                let current_id = CURRENT_EXECUTION_ID.load(std::sync::atomic::Ordering::SeqCst);
                if worker_execution_id != current_id {
                    // Это устаревшее выполнение, возвращаем отмену без SSH-подключения
                    let batch_result = BatchCommandResult {
                        result: None,
                        error: Some("Выполнение прервано новым запуском".to_string()),
                        host: host_ip.clone(),
                    };
                    let _ = tx.send(batch_result.clone());
                    return batch_result;
                }
                
                // Проверяем отмену перед обработкой каждого хоста
                if cancellation_token_clone.is_cancelled() {
                    let batch_result = BatchCommandResult {
                        result: None,
                        error: Some("Выполнение отменено".to_string()),
                        host: host_ip.clone(),
                    };
                    let _ = tx.send(batch_result.clone());
                    return batch_result;
                }
                
                        log::debug!("[Batch Execute] Обработка хоста: {}", host_ip);
                        // Передаем callback для проверки отмены в SSH connection
                        let cancel_check = cancellation_token_clone.clone();
                        match pool_ref.get_or_create_cancellable(config.clone(), move || cancel_check.is_cancelled()) {
                    Ok(connection) => {
                        log::debug!("[Batch Execute] Подключение к {} установлено", host_ip);
                        // Проверяем отмену перед выполнением команды
                        if cancellation_token_clone.is_cancelled() {
                            log::info!("[Batch Execute] Выполнение отменено для {}", host_ip);
                            return BatchCommandResult {
                                result: None,
                                error: Some("Выполнение отменено".to_string()),
                                host: host_ip,
                            };
                        }
                        
                        // Логируем выполнение команды на конкретном хосте (санитизированная версия)
                        let sanitized_cmd = crate::command_validation::sanitize_command_for_logging(&cmd);
                        let cmd_preview = if sanitized_cmd.len() > 80 {
                            format!("{}...", &sanitized_cmd[..80])
                        } else {
                            sanitized_cmd.clone()
                        };
                        log::info!("[Batch Execute] Выполнение команды на {}: {}", host_ip, cmd_preview);
                        audit::log_action(
                            "DEBUG",
                            "batch_host_execute",
                            &format!("Выполнение команды на {}: {}", host_ip, cmd_preview),
                            None,
                        );
                        
                        match connection.execute_command(&cmd) {
                            Ok(result) => {
                                // Логируем успешное выполнение
                                if result.exit_status == 0 {
                                    log::info!("[Batch Execute] Команда успешно выполнена на {} (код выхода: {})", host_ip, result.exit_status);
                                    audit::log_action(
                                        "INFO",
                                        "batch_host_success",
                                        &format!("Команда успешно выполнена на {} (код выхода: {})", host_ip, result.exit_status),
                                        None,
                                    );
                                } else {
                                    log::warn!("[Batch Execute] Команда выполнена на {} с кодом выхода: {}", host_ip, result.exit_status);
                                    audit::log_action(
                                        "WARN",
                                        "batch_host_warning",
                                        &format!("Команда выполнена на {} с кодом выхода: {}", host_ip, result.exit_status),
                                        None,
                                    );
                                }
                                    let batch_result = BatchCommandResult {
                                        result: Some(result),
                                        error: None,
                                        host: host_ip.clone(),
                                    };
                                    // Отправляем результат через канал
                                    let _ = tx.send(batch_result.clone());
                                    batch_result
                                },
                            Err(e) => {
                                // Если отмена произошла во время выполнения, возвращаем соответствующее сообщение
                                if cancellation_token_clone.is_cancelled() {
                                    log::info!("[Batch Execute] Выполнение команды отменено на {}", host_ip);
                                    audit::log_action(
                                        "INFO",
                                        "batch_host_cancelled",
                                        &format!("Выполнение команды отменено на {}", host_ip),
                                        None,
                                    );
                                    let batch_result = BatchCommandResult {
                                        result: None,
                                        error: Some("Выполнение отменено".to_string()),
                                        host: host_ip.clone(),
                                    };
                                    let _ = tx.send(batch_result.clone());
                                    batch_result
                                } else {
                                    log::error!("[Batch Execute] Ошибка выполнения команды на {}: {}", host_ip, e);
                                    audit::log_action(
                                        "ERROR",
                                        "batch_host_error",
                                        &format!("Ошибка выполнения команды на {}: {}", host_ip, e),
                                        None,
                                    );
                                    let batch_result = BatchCommandResult {
                                        result: None,
                                        error: Some(format!("{}", e)),
                                        host: host_ip.clone(),
                                    };
                                    let _ = tx.send(batch_result.clone());
                                    batch_result
                                }
                            },
                        }
                    },
                    Err(e) => {
                        log::error!("[Batch Execute] Ошибка подключения к {}: {}", host_ip, e);
                        if cancellation_token_clone.is_cancelled() {
                            let batch_result = BatchCommandResult {
                                result: None,
                                error: Some("Выполнение отменено".to_string()),
                                host: host_ip.clone(),
                            };
                            let _ = tx.send(batch_result.clone());
                            batch_result
                        } else {
                            // Улучшаем сообщение об ошибке подключения
                            let error_msg = format!("{}", e);
                            let improved_error = if error_msg.contains("Key path is required") {
                                format!("Ошибка подключения к {}: путь к ключу не указан", host_ip)
                            } else if error_msg.contains("Key file not found") || error_msg.contains("not found") {
                                format!("Ошибка подключения к {}: файл ключа не найден. Проверьте путь к ключу в настройках", host_ip)
                            } else if error_msg.contains("Authentication failed") || error_msg.contains("Permission denied") {
                                format!("Ошибка подключения к {}: аутентификация не удалась. Проверьте правильность ключа, passphrase и соответствие ключа пользователю на сервере", host_ip)
                            } else if error_msg.contains("Connection failed") || error_msg.contains("Failed to connect") {
                                format!("Ошибка подключения к {}: не удалось установить соединение. Проверьте доступность хоста и правильность порта", host_ip)
                            } else if error_msg.contains("timeout") || error_msg.contains("Timeout") {
                                format!("Ошибка подключения к {}: превышено время ожидания. Проверьте доступность хоста и настройки таймаута", host_ip)
                            } else {
                                format!("Ошибка подключения к {}: {}", host_ip, error_msg)
                            };
                            
                            audit::log_action(
                                "ERROR",
                                "batch_host_connection_error",
                                &format!("Ошибка подключения к {}: {}", host_ip, error_msg),
                                None,
                            );
                            
                            let batch_result = BatchCommandResult {
                                result: None,
                                error: Some(improved_error),
                                host: host_ip.clone(),
                            };
                            let _ = tx.send(batch_result.clone());
                            batch_result
                        }
                    },
                }
            })
            .collect()
    });
    
    // Закрываем канал и ждем завершения потока отправки событий
    drop(tx);
    let _ = event_sender.join();
    
    // Отправляем событие завершения, чтобы фронтенд знал, что все события отправлены
    if let Err(e) = window.emit("batch-complete", serde_json::json!({
        "execution_id": execution_id,
        "total_results": results.len(),
    })) {
        log::error!("[Batch Execute] Ошибка отправки события завершения: {}", e);
    }
    
    log::info!("[Batch Execute] Выполнение #{} завершено. Получено результатов: {}", execution_id, results.len());
    
    // Если выполнение было отменено, возвращаем частичные результаты
    if cancellation_token_clone.is_cancelled() {
        log::info!("[Batch Execute] Выполнение было отменено пользователем");
        let command_summary = if command.len() > 100 {
            format!("{}...", &command[..100])
        } else {
            command.clone()
        };
        audit::log_action(
            "INFO",
            "batch_cancelled",
            &format!("Пакетное выполнение отменено пользователем. Команда: {}", command_summary),
            None,
        );
        return Ok(results);
    }

    // Если включен режим повторных попыток, повторяем для неудачных хостов
    if request.retry_failed_hosts {
        let mut retry_count = 0;
        let max_retries = 10; // Максимум 10 попыток для предотвращения бесконечного цикла
        
        loop {
            // Проверяем отмену перед каждой повторной попыткой
            if cancellation_token_clone.is_cancelled() {
                break;
            }
            
            // Собираем список неудачных хостов
            let failed_hosts: Vec<_> = results
                .iter()
                .filter(|r| r.result.is_none())
                .filter_map(|r| {
                    // Находим оригинальный хост из original_hosts
                    original_hosts.iter().find(|h| h.ip == r.host).cloned()
                })
                .collect();
            
            // Если нет неудачных хостов или достигнут лимит попыток, выходим
            if failed_hosts.is_empty() || retry_count >= max_retries {
                break;
            }
            
            retry_count += 1;
            
            // Логируем начало повторной попытки с информацией о команде
            let cmd_preview = if command.len() > 80 {
                format!("{}...", &command[..80])
            } else {
                command.clone()
            };
            audit::log_action(
                "INFO",
                "batch_retry",
                &format!("Повторная попытка #{} для {} хостов. Команда: {}", retry_count, failed_hosts.len(), cmd_preview),
                None,
            );
            
            // Ждем указанный интервал перед повторной попыткой с проверкой отмены
            let sleep_duration = std::time::Duration::from_secs(request.retry_interval);
            let sleep_start = std::time::Instant::now();
            while sleep_start.elapsed() < sleep_duration {
                if cancellation_token_clone.is_cancelled() {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            
            // Проверяем отмену после ожидания
            if cancellation_token_clone.is_cancelled() {
                break;
            }
            
            // Подготавливаем конфигурации для повторной попытки
            let retry_hosts_with_configs: Vec<_> = failed_hosts
                .iter()
                .map(|host| {
                    let mut config = config_template.clone();
                    config.host = host.ip.clone();
                    if let Some(port) = host.port {
                        config.port = port;
                    }
                    let host_ip = host.ip.clone();
                    let cmd = command.clone();
                    let pool_ref = pool_clone.clone();
                    
                    // Логируем повторную попытку для каждого хоста
                    let cmd_preview = if cmd.len() > 80 {
                        format!("{}...", &cmd[..80])
                    } else {
                        cmd.clone()
                    };
                    audit::log_action(
                        "INFO",
                        "batch_host_retry",
                        &format!("Повторная попытка выполнения команды на {}: {}", host_ip, cmd_preview),
                        None,
                    );
                    
                    (host_ip, config, cmd, pool_ref)
                })
                .collect();
            
            // Выполняем повторную попытку
            let retry_results: Vec<BatchCommandResult> = thread_pool.install(|| {
                retry_hosts_with_configs
                    .into_par_iter()
                    .map(|(host_ip, config, cmd, pool_ref)| {
                        // Проверяем отмену перед обработкой каждого хоста
                        if cancellation_token_clone.is_cancelled() {
                            return BatchCommandResult {
                                result: None,
                                error: Some("Выполнение отменено".to_string()),
                                host: host_ip,
                            };
                        }
                        
                        match pool_ref.get_or_create(config.clone()) {
                            Ok(connection) => {
                                // Проверяем отмену перед выполнением команды
                                if cancellation_token_clone.is_cancelled() {
                                    return BatchCommandResult {
                                        result: None,
                                        error: Some("Выполнение отменено".to_string()),
                                        host: host_ip,
                                    };
                                }
                                
                                match connection.execute_command(&cmd) {
                                    Ok(result) => {
                                        if result.exit_status == 0 {
                                            audit::log_action(
                                                "INFO",
                                                "batch_host_retry_success",
                                                &format!("Повторная попытка успешна на {}: команда выполнена", host_ip),
                                                None,
                                            );
                                        } else {
                                            audit::log_action(
                                                "WARN",
                                                "batch_host_retry_warning",
                                                &format!("Повторная попытка на {}: код выхода {}", host_ip, result.exit_status),
                                                None,
                                            );
                                        }
                                        BatchCommandResult {
                                            result: Some(result),
                                            error: None,
                                            host: host_ip,
                                        }
                                    },
                                    Err(e) => {
                                        if cancellation_token_clone.is_cancelled() {
                                            audit::log_action(
                                                "INFO",
                                                "batch_host_retry_cancelled",
                                                &format!("Повторная попытка отменена на {}", host_ip),
                                                None,
                                            );
                                            BatchCommandResult {
                                                result: None,
                                                error: Some("Выполнение отменено".to_string()),
                                                host: host_ip,
                                            }
                                        } else {
                                            audit::log_action(
                                                "ERROR",
                                                "batch_host_retry_error",
                                                &format!("Повторная попытка на {} завершилась ошибкой: {}", host_ip, e),
                                                None,
                                            );
                                            BatchCommandResult {
                                                result: None,
                                                error: Some(format!("{}", e)),
                                                host: host_ip,
                                            }
                                        }
                                    },
                                }
                            },
                            Err(e) => {
                                if cancellation_token_clone.is_cancelled() {
                                    BatchCommandResult {
                                        result: None,
                                        error: Some("Выполнение отменено".to_string()),
                                        host: host_ip,
                                    }
                                } else {
                                    BatchCommandResult {
                                        result: None,
                                        error: Some(format!("Connection failed: {}", e)),
                                        host: host_ip,
                                    }
                                }
                            },
                        }
                    })
                    .collect()
            });
            
            // Обновляем результаты: заменяем неудачные результаты на новые
            for retry_result in retry_results {
                if let Some(existing_result) = results.iter_mut().find(|r| r.host == retry_result.host) {
                    // Если повторная попытка успешна, обновляем результат
                    if retry_result.result.is_some() {
                        *existing_result = retry_result;
                    } else {
                        // Если снова неудача, обновляем ошибку (может быть другая)
                        existing_result.error = retry_result.error;
                    }
                }
            }
        }
        
        if retry_count > 0 {
            audit::log_action(
                "INFO",
                "batch_retry_complete",
                &format!("Завершено {} повторных попыток", retry_count),
                None,
            );
        }
    }

    // Логирование результатов с информацией о команде
    let success_count = results.iter().filter(|r| r.result.is_some()).count();
    let failed_count = total_hosts - success_count;
    
    let command_summary = if command.len() > 100 {
        format!("{}...", &command[..100])
    } else {
        command.clone()
    };
    
    let duration = start_time.elapsed();
    log::info!("[Batch Execute] Пакетное выполнение завершено: успешно {} из {}, ошибок {} за {:.2}с", 
               success_count, total_hosts, failed_count, duration.as_secs_f64());
    
    audit::log_action(
        "INFO",
        "batch_complete",
        &format!("Пакетное выполнение завершено: успешно {} из {}, ошибок {}. Команда: {}", 
                 success_count, total_hosts, failed_count, command_summary),
        None,
    );

    log::info!("[Batch Execute] Возврат {} результатов", results.len());
    Ok(results)
}

#[tauri::command]
pub async fn export_to_excel(
    request: crate::excel_export::ExcelExportRequest,
) -> Result<(), String> {
    audit::log_action(
        "INFO",
        "export_excel",
        &format!("Экспорт {} результатов в {}", request.results.len(), request.file_path),
        None,
    );

    // Определяем формат по расширению файла
    let file_ext = std::path::Path::new(&request.file_path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("csv")
        .to_lowercase();

    match file_ext.as_str() {
        "csv" => {
            crate::excel_export::export_to_excel_csv(request)
        }
        "html" | "htm" => {
            crate::excel_export::export_to_excel_html(request)
        }
        "xlsx" | "xls" => {
            // Для Excel используем JSON как промежуточный формат
            // Фронтенд обработает его через библиотеку xlsx
            let export_data = serde_json::to_string_pretty(&request.results)
                .map_err(|e| format!("Failed to serialize data: {}", e))?;
            
            std::fs::write(&request.file_path, export_data)
                .map_err(|e| format!("Failed to write file: {}", e))?;
            Ok(())
        }
        _ => {
            // По умолчанию CSV
            crate::excel_export::export_to_excel_csv(request)
        }
    }
}

#[tauri::command]
pub async fn get_audit_logs(limit: Option<usize>) -> Result<Vec<audit::AuditLog>, String> {
    Ok(audit::get_audit_logs(limit))
}

#[tauri::command]
pub async fn clear_audit_logs() -> Result<(), String> {
    audit::log_action("INFO", "clear_audit_logs", "Очистка журнала аудита", None);
    audit::clear_audit_logs()
}

#[tauri::command]
pub async fn save_temp_file(
    content: Vec<u8>,
    extension: String,
) -> Result<String, String> {
    use std::fs;
    
    let temp_dir = std::env::temp_dir();
    let file_name = format!("ssh_executor_{}.{}", 
        uuid::Uuid::new_v4().to_string(), 
        extension);
    let file_path = temp_dir.join(file_name);
    
    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    
    file_path.to_str()
        .ok_or_else(|| "Invalid file path".to_string())
        .map(|s| s.to_string())
}

#[tauri::command]
pub async fn save_file(
    file_path: String,
    content: Vec<u8>,
) -> Result<(), String> {
    use std::fs;
    
    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn cancel_command_execution(
    cancellation_token: State<'_, CancellationToken>,
) -> Result<(), String> {
    cancellation_token.cancel();
    audit::log_action("INFO", "cancel_command", "Выполнение команды отменено пользователем", None);
    Ok(())
}

#[tauri::command]
pub async fn update_audit_settings(
    log_level: String,
    retention_days: u32,
    auto_rotate: bool,
    max_log_file_size: u64,
    log_format: String,
    enable_audit: bool,
) -> Result<(), String> {
    let settings = audit::AuditSettings {
        log_level,
        retention_days,
        auto_rotate,
        max_log_file_size,
        log_format,
        enable_audit,
    };
    audit::update_audit_settings(settings);
    Ok(())
}

#[tauri::command]
pub async fn hash_settings_password(password: String) -> Result<String, String> {
    crate::security::hash_password(&password)
        .map_err(|e| format!("Ошибка хеширования пароля: {}", e))
}

#[tauri::command]
pub async fn verify_settings_password(password: String, hash: String) -> Result<bool, String> {
    crate::security::verify_password(&password, &hash)
        .map_err(|e| format!("Ошибка проверки пароля: {}", e))
}

#[tauri::command]
pub async fn set_close_to_tray(enabled: bool) -> Result<(), String> {
    crate::set_close_to_tray_setting(enabled);
    Ok(())
}
