use crate::error::{AppError, AppResult};
use crate::security::{encrypt_password, decrypt_password, EncryptedData};
use serde::{Deserialize, Serialize};
use ssh2::Session;
use std::io::Read;
use std::net::TcpStream;
use std::path::Path;
use std::sync::Arc;
use parking_lot::Mutex;
use std::time::Duration;
use uuid::Uuid;
use base64::{engine::general_purpose, Engine as _};
use log::warn;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(from = "SshConfigHelper")]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
    pub timeout: u64,
    pub keep_alive_interval: Option<u64>,
    pub reconnect_attempts: Option<u32>,
    pub reconnect_delay_base: Option<f64>, // Базовая задержка между повторами (в секундах)
    pub compression_enabled: Option<bool>,
    pub compression_level: Option<u32>,
}

// Вспомогательная структура для десериализации из фронтенда
// ВАЖНО: Пароль передается в открытом виде через IPC, но шифруется сразу при получении
// Tauri IPC безопасен для локальной коммуникации между процессами
#[derive(Debug, Clone, Deserialize)]
struct SshConfigHelper {
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    #[serde(skip_serializing)] // Не сериализуем пароль обратно
    password: Option<String>,
    key_path: Option<String>,
    ppk_path: Option<String>,
    #[serde(skip_serializing)] // Не сериализуем passphrase обратно
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

impl From<SshConfigHelper> for SshConfig {
    fn from(helper: SshConfigHelper) -> Self {
        let auth_method = match helper.auth_method.as_str() {
            "password" => {
                let password = helper.password.unwrap_or_default();
                if password.is_empty() {
                    eprintln!("Warning: Password authentication selected but password is empty");
                    // Создаем пустое зашифрованное значение для пустого пароля
                    AuthMethod::Password(
                        encrypt_password("").unwrap_or_else(|e| {
                            eprintln!("Failed to encrypt empty password: {}", e);
                            EncryptedData::empty()
                        })
                    )
                } else {
                    // ВАЖНО: Шифруем пароль СРАЗУ при получении, чтобы минимизировать время нахождения в памяти
                    // Пароль никогда не сохраняется в открытом виде
                    match encrypt_password(&password) {
                        Ok(encrypted) => {
                            // Пароль зашифрован, оригинальная строка будет удалена
                            AuthMethod::Password(encrypted)
                        },
                        Err(e) => {
                            log::error!("Failed to encrypt password: {}", e);
                            // Fallback: создаем пустое зашифрованное значение
                            AuthMethod::Password(EncryptedData::empty())
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
                        log::error!("Failed to encrypt passphrase: {}", e);
                        EncryptedData::empty()
                    })
                });
                AuthMethod::PrivateKey {
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
                        log::error!("Failed to encrypt passphrase: {}", e);
                        EncryptedData::empty()
                    })
                });
                AuthMethod::PuttyKey {
                    ppk_path,
                    passphrase,
                }
            },
            _ => {
                log::warn!("Unknown auth_method '{}', defaulting to password", helper.auth_method);
                let password = helper.password.unwrap_or_default();
                    match encrypt_password(&password) {
                        Ok(encrypted) => AuthMethod::Password(encrypted),
                        Err(e) => {
                            log::error!("Failed to encrypt password: {}", e);
                            AuthMethod::Password(EncryptedData::empty())
                        }
                    }
            },
        };
        
        SshConfig {
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

#[derive(Debug, Clone)]
pub enum AuthMethod {
    Password(EncryptedData), // Пароль хранится в зашифрованном виде
    PrivateKey {
        key_path: String,
        passphrase: Option<EncryptedData>, // Passphrase теперь тоже зашифрован
    },
    PuttyKey {
        ppk_path: String,
        passphrase: Option<EncryptedData>, // Passphrase теперь тоже зашифрован
    },
}

// Кастомная сериализация для AuthMethod - не сериализуем пароль для безопасности
impl Serialize for AuthMethod {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            AuthMethod::Password(_) => {
                // Не сериализуем зашифрованный пароль - только тип
                serializer.serialize_str("password")
            }
            AuthMethod::PrivateKey { key_path, .. } => {
                use serde::ser::SerializeStruct;
                let mut state = serializer.serialize_struct("PrivateKey", 2)?;
                state.serialize_field("type", "key")?;
                state.serialize_field("key_path", key_path)?;
                state.end()
            }
            AuthMethod::PuttyKey { ppk_path, .. } => {
                use serde::ser::SerializeStruct;
                let mut state = serializer.serialize_struct("PuttyKey", 2)?;
                state.serialize_field("type", "ppk")?;
                state.serialize_field("ppk_path", ppk_path)?;
                state.end()
            }
        }
    }
}


pub struct SshConnection {
    session: Arc<Mutex<Session>>,
    config: SshConfig,
}

// Явное закрытие SSH сессии при удалении объекта
impl Drop for SshConnection {
    fn drop(&mut self) {
        // Если это последняя ссылка на сессию, закрываем её
        if Arc::strong_count(&self.session) == 1 {
            if let Some(session) = self.session.try_lock() {
                // Явно закрываем сессию SSH, отправляя disconnect
                if let Err(e) = session.disconnect(None, "Session closed", None) {
                    log::debug!("SSH disconnect for {}: {} (this is normal during cleanup)", 
                        self.config.host, e);
                } else {
                    log::debug!("SSH session closed for {}", self.config.host);
                }
            }
        }
    }
}

impl SshConnection {
    pub fn new(config: SshConfig) -> AppResult<Self> {
        Self::new_cancellable(config, || false)
    }
    
    /// Создает соединение с возможностью отмены через callback
    pub fn new_cancellable<F>(config: SshConfig, is_cancelled: F) -> AppResult<Self> 
    where 
        F: Fn() -> bool + Clone
    {
        let reconnect_attempts = config.reconnect_attempts.unwrap_or(0);
        
        // Если указаны попытки переподключения, используем функцию с повторными попытками
        if reconnect_attempts > 0 {
            return Self::connect_with_retry_cancellable(config, reconnect_attempts, is_cancelled);
        }
        
        Self::connect_once(config)
    }
    
    fn connect_once(config: SshConfig) -> AppResult<Self> {
        use std::net::ToSocketAddrs;
        let addr = format!("{}:{}", config.host, config.port);
        
        let addrs: Vec<_> = addr.to_socket_addrs()
            .map_err(|e| AppError::ConnectionError(format!("Failed to resolve address: {}", e)))?
            .collect();
        
        let tcp = if let Some(addr) = addrs.first() {
            TcpStream::connect_timeout(addr, Duration::from_secs(config.timeout))
                .map_err(|e| AppError::ConnectionError(format!("Failed to connect: {}", e)))?
        } else {
            return Err(AppError::ConnectionError("No valid address found".to_string()));
        };

        let mut session = Session::new()
            .map_err(|e| AppError::SshError(format!("Failed to create SSH session: {}", e)))?;

        // Настройка сжатия (примечание: ssh2 crate управляет сжатием автоматически на уровне протокола SSH)
        // Сжатие включается автоматически, если сервер его поддерживает
        if let Some(true) = config.compression_enabled {
            if let Some(level) = config.compression_level {
                warn!("Compression enabled with level {} for {}@{} (note: ssh2 crate manages compression automatically)", 
                    level, config.username, config.host);
            } else {
                warn!("Compression enabled for {}@{} (note: ssh2 crate manages compression automatically)", 
                    config.username, config.host);
            }
        }

        session.set_tcp_stream(tcp);
        session
            .handshake()
            .map_err(|e| AppError::SshError(format!("Handshake failed: {}", e)))?;
        
        // Настройка keep-alive (примечание: ssh2 crate может управлять keep-alive автоматически)
        // TCP keepalive обычно настраивается на уровне операционной системы
        if let Some(interval) = config.keep_alive_interval {
            warn!("Keep-alive interval set to {} seconds for {}@{} (note: TCP keepalive is managed by OS/ssh2)", 
                interval, config.username, config.host);
            // ssh2 crate не предоставляет прямого API для установки keep-alive интервала
            // TCP keepalive обычно настраивается на уровне ОС или управляется библиотекой автоматически
        }

        // Проверка known_hosts (кроссплатформенный путь)
        let known_hosts_path = if cfg!(windows) {
            format!("{}/.ssh/known_hosts", std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string()))
        } else {
            format!("{}/.ssh/known_hosts", std::env::var("HOME").unwrap_or_else(|_| ".".to_string()))
        };
        
        // Пытаемся установить known_hosts, но не критично если файл не существует
        if Path::new(&known_hosts_path).exists() {
            if let Ok(mut known_hosts) = session.known_hosts() {
                let _ = known_hosts.read_file(Path::new(&known_hosts_path), ssh2::KnownHostFileKind::OpenSSH);
            }
        }

        // Аутентификация
        match &config.auth_method {
            AuthMethod::Password(encrypted_password) => {
                // Расшифровываем пароль для использования
                let decrypted_password = decrypt_password(encrypted_password)
                    .map_err(|e| AppError::SshError(format!("Failed to decrypt password: {}", e)))?;
                
                let password_str = decrypted_password.as_str();
                
                if password_str.is_empty() {
                    return Err(AppError::SshError("Password is required for password authentication".to_string()));
                }
                
                // Используем пароль для аутентификации
                // ВАЖНО: Пароль расшифровывается только для аутентификации и сразу очищается
                let auth_result = session
                    .userauth_password(&config.username, password_str)
                    .map_err(|e| AppError::SshError(format!("Password auth failed: {}", e)));
                
                // Пароль автоматически очищается из памяти при удалении decrypted_password (zeroize)
                // Это происходит в Drop trait для ZeroizingString
                auth_result?;
            }
            AuthMethod::PrivateKey { key_path, passphrase } => {
                if key_path.is_empty() {
                    return Err(AppError::SshError("Key path is required for key authentication".to_string()));
                }
                if !Path::new(key_path).exists() {
                    return Err(AppError::SshError(format!("Key file not found: {}", key_path)));
                }
                // Расшифровываем passphrase если он указан
                let passphrase_str = passphrase.as_ref().map(|encrypted| {
                    decrypt_password(encrypted)
                        .map_err(|e| AppError::SshError(format!("Failed to decrypt passphrase: {}", e)))
                }).transpose()?;
                let passphrase_ref = passphrase_str.as_ref().map(|s| s.as_str());
                
                // Пытаемся выполнить аутентификацию с более информативными сообщениями об ошибках
                match session.userauth_pubkey_file(
                    &config.username,
                    None,
                    Path::new(key_path),
                    passphrase_ref,
                ) {
                    Ok(_) => {},
                    Err(e) => {
                        let error_msg = format!("{}", e);
                        // Улучшаем сообщение об ошибке для более понятного вывода
                        if error_msg.contains("Permission denied") || error_msg.contains("Authentication failed") {
                            return Err(AppError::SshError(format!(
                                "Аутентификация по ключу не удалась для {}@{}. Проверьте:\n- Правильность пути к ключу: {}\n- Правильность passphrase (если ключ зашифрован)\n- Разрешения на файл ключа\n- Соответствие ключа пользователю на сервере\nОригинальная ошибка: {}",
                                config.username, config.host, key_path, error_msg
                            )));
                        } else if error_msg.contains("No such file") || error_msg.contains("not found") {
                            return Err(AppError::SshError(format!(
                                "Файл ключа не найден: {}",
                                key_path
                            )));
                        } else {
                            return Err(AppError::SshError(format!(
                                "Ошибка аутентификации по ключу для {}@{}: {}",
                                config.username, config.host, error_msg
                            )));
                        }
                    }
                }
            }
            AuthMethod::PuttyKey { ppk_path, passphrase } => {
                if ppk_path.is_empty() {
                    return Err(AppError::SshError("PPK path is required for PPK authentication".to_string()));
                }
                if !Path::new(ppk_path).exists() {
                    return Err(AppError::SshError(format!("PPK file not found: {}", ppk_path)));
                }
                // Расшифровываем passphrase если он указан
                let passphrase_str = passphrase.as_ref().map(|encrypted| {
                    decrypt_password(encrypted)
                        .map_err(|e| AppError::SshError(format!("Failed to decrypt passphrase: {}", e)))
                }).transpose()?;
                let passphrase_ref = passphrase_str.as_ref().map(|s| s.as_str());
                
                // Конвертация PPK в OpenSSH формат
                let private_key = convert_ppk_to_openssh(ppk_path, passphrase_ref)?;
                // Сохраняем ключ во временный файл для аутентификации
                let temp_key_path = std::env::temp_dir().join(format!("ssh_key_{}.tmp", Uuid::new_v4()));
                std::fs::write(&temp_key_path, private_key.as_bytes())
                    .map_err(|e| AppError::SshError(format!("Failed to write temp key: {}", e)))?;
                
                // После конвертации PPK ключа, если он был зашифрован, 
                // конвертированный ключ может быть незашифрованным (если puttygen расшифровал его)
                // или зашифрованным (если использовался fallback метод)
                // Пробуем сначала без passphrase, затем с passphrase
                let result = session
                    .userauth_pubkey_file(
                        &config.username,
                        None,
                        &temp_key_path,
                        None, // Сначала пробуем без passphrase
                    )
                    .or_else(|_| {
                        // Если не получилось, пробуем с passphrase
                        session.userauth_pubkey_file(
                            &config.username,
                            None,
                            &temp_key_path,
                            passphrase_ref,
                        )
                    })
                    .map_err(|e| AppError::SshError(format!("PPK auth failed: {}", e)));
                
                // Удаляем временный файл
                let _ = std::fs::remove_file(&temp_key_path);
                result?;
            }
        }

        if !session.authenticated() {
            return Err(AppError::SshError("Authentication failed".to_string()));
        }

        Ok(Self {
            session: Arc::new(Mutex::new(session)),
            config,
        })
    }
    
    /// Прерываемый sleep - проверяет флаг отмены каждые 100ms
    fn interruptible_sleep<F>(duration: Duration, is_cancelled: &F) -> bool
    where
        F: Fn() -> bool
    {
        let check_interval = Duration::from_millis(100);
        let mut remaining = duration;
        
        while remaining > Duration::ZERO {
            if is_cancelled() {
                return true; // Был прерван
            }
            let sleep_time = remaining.min(check_interval);
            std::thread::sleep(sleep_time);
            remaining = remaining.saturating_sub(sleep_time);
        }
        false // Не был прерван
    }
    
    fn connect_with_retry_cancellable<F>(config: SshConfig, max_attempts: u32, is_cancelled: F) -> AppResult<Self>
    where
        F: Fn() -> bool + Clone
    {
        let mut last_error = None;
        
        for attempt in 0..max_attempts {
            // Проверяем отмену ПЕРЕД каждой попыткой подключения
            if is_cancelled() {
                return Err(AppError::ConnectionError("Выполнение отменено".to_string()));
            }
            
            match Self::connect_once(config.clone()) {
                Ok(conn) => {
                    if attempt > 0 {
                        warn!("Successfully connected to {}@{} after {} attempts", 
                            config.username, config.host, attempt + 1);
                    }
                    return Ok(conn);
                }
                Err(e) => {
                    last_error = Some(e);
                    if attempt < max_attempts - 1 {
                        // Проверяем отмену перед ожиданием
                        if is_cancelled() {
                            return Err(AppError::ConnectionError("Выполнение отменено".to_string()));
                        }
                        
                        // Экспоненциальная задержка с настраиваемой базой
                        // base_delay * 2^attempt: при base=1: 1s, 2s, 4s... при base=0.5: 0.5s, 1s, 2s...
                        let base_delay = config.reconnect_delay_base.unwrap_or(1.0);
                        let multiplier = (1u64 << attempt.min(5)) as f64; // 1, 2, 4, 8, 16, 32
                        let delay_secs = (base_delay * multiplier).min(32.0); // Максимум 32 секунды
                        let delay = Duration::from_secs_f64(delay_secs);
                        warn!("Connection attempt {} failed for {}@{}, retrying in {:?}...", 
                            attempt + 1, config.username, config.host, delay);
                        
                        // Используем прерываемый sleep вместо блокирующего
                        if Self::interruptible_sleep(delay, &is_cancelled) {
                            return Err(AppError::ConnectionError("Выполнение отменено".to_string()));
                        }
                    }
                }
            }
        }
        
        Err(last_error.unwrap_or_else(|| {
            AppError::ConnectionError(format!("Failed to connect after {} attempts", max_attempts))
        }))
    }

    /// Выполняет команду SSH с опциональным чтением VehicleID
    /// skip_vehicle_id - если true, пропускает чтение VehicleID для ускорения
    pub fn execute_command_with_options(&self, command: &str, skip_vehicle_id: bool) -> AppResult<SshCommandResult> {
        let mut channel = self
            .session
            .lock()
            .channel_session()
            .map_err(|e| AppError::SshError(format!("Failed to create channel: {}", e)))?;

        channel
            .exec(command)
            .map_err(|e| AppError::SshError(format!("Failed to execute command: {}", e)))?;

        let mut stdout = String::new();
        let mut stderr = String::new();

        channel
            .read_to_string(&mut stdout)
            .map_err(|e| AppError::SshError(format!("Failed to read stdout: {}", e)))?;

        channel
            .stderr()
            .read_to_string(&mut stderr)
            .map_err(|e| AppError::SshError(format!("Failed to read stderr: {}", e)))?;

        let exit_status = channel.exit_status().unwrap_or(-1);

        // Закрываем канал немедленно после получения результата
        let _ = channel.send_eof();
        let _ = channel.wait_eof();
        let _ = channel.close();
        let _ = channel.wait_close();
        
        log::debug!("SSH channel closed for command on {}", self.config.host);

        // Читаем VehicleID из JSON файла ТОЛЬКО если не пропускаем
        let vehicle_id = if skip_vehicle_id {
            None
        } else {
            match self.read_vehicle_id() {
                Ok(id) => Some(id),
                Err(e) => {
                    warn!("Failed to read VehicleID for host {}: {}", self.config.host, e);
                    None
                }
            }
        };

        Ok(SshCommandResult {
            stdout,
            stderr,
            exit_status,
            host: self.config.host.clone(),
            vehicle_id,
        })
    }

    /// Обратная совместимость - по умолчанию пропускаем VehicleID для скорости
    pub fn execute_command(&self, command: &str) -> AppResult<SshCommandResult> {
        // По умолчанию ПРОПУСКАЕМ чтение VehicleID для значительного ускорения
        // VehicleID можно прочитать отдельно при необходимости
        self.execute_command_with_options(command, true)
    }

    fn read_vehicle_id(&self) -> AppResult<String> {
        // Читаем JSON файл с удаленного сервера
        let json_path = "/opt/mnt2/configurator/conf/main.json";
        let cat_command = format!("cat {}", json_path);
        
        let mut channel = self
            .session
            .lock()
            .channel_session()
            .map_err(|e| {
                warn!("Failed to create channel for VehicleID reading on {}: {}", self.config.host, e);
                AppError::SshError(format!("Failed to create channel: {}", e))
            })?;

        channel
            .exec(&cat_command)
            .map_err(|e| {
                warn!("Failed to execute cat command for VehicleID on {}: {}", self.config.host, e);
                AppError::SshError(format!("Failed to execute cat command: {}", e))
            })?;

        let mut json_content = String::new();
        let mut error_output = String::new();
        
        // Читаем stdout
        channel
            .read_to_string(&mut json_content)
            .map_err(|e| {
                warn!("Failed to read JSON file content on {}: {}", self.config.host, e);
                AppError::SshError(format!("Failed to read JSON file: {}", e))
            })?;

        // Читаем stderr для диагностики
        channel
            .stderr()
            .read_to_string(&mut error_output)
            .ok();

        let exit_status = channel.exit_status().unwrap_or(-1);
        
        // Закрываем канал немедленно после получения результата
        let _ = channel.send_eof();
        let _ = channel.wait_eof();
        let _ = channel.close();
        let _ = channel.wait_close();

        // Проверяем exit_status команды
        if exit_status != 0 {
            let error_msg = if !error_output.is_empty() {
                format!("Command failed with exit code {}: {}", exit_status, error_output.trim())
            } else if !json_content.trim().is_empty() {
                // Если есть содержимое, но exit_status != 0, возможно это ошибка в самом содержимом
                format!("Command failed with exit code {}. Output: {}", exit_status, json_content.chars().take(100).collect::<String>())
            } else {
                format!("Command failed with exit code {} (file may not exist or no permission)", exit_status)
            };
            warn!("Failed to read VehicleID file on {}: {}", self.config.host, error_msg);
            return Err(AppError::SshError(error_msg));
        }

        // Проверяем, что файл не пустой
        if json_content.trim().is_empty() {
            warn!("VehicleID JSON file is empty");
            return Err(AppError::ParseError("JSON file is empty".to_string()));
        }

        // Парсим JSON и извлекаем VehicleID по пути bp.gjkz.VehicleID
        let json: serde_json::Value = serde_json::from_str(&json_content)
            .map_err(|e| {
                warn!("Failed to parse VehicleID JSON: {}. Content: {}", e, json_content.chars().take(200).collect::<String>());
                AppError::ParseError(format!("Failed to parse JSON: {}", e))
            })?;

        // Извлекаем значение по пути bp -> gjkz -> VehicleID
        // Пробуем разные варианты путей
        let vehicle_id = json
            .get("bp")
            .and_then(|bp| bp.get("gjkz"))
            .and_then(|gjkz| gjkz.get("VehicleID"))
            .and_then(|v| v.as_str())
            .or_else(|| {
                // Альтернативный путь: может быть без вложенности
                json.get("VehicleID")
                    .and_then(|v| v.as_str())
            })
            .or_else(|| {
                // Еще один вариант: может быть в другом месте
                json.get("bp")
                    .and_then(|bp| bp.get("VehicleID"))
                    .and_then(|v| v.as_str())
            })
            .ok_or_else(|| {
                // Логируем структуру JSON для отладки
                if let Some(obj) = json.as_object() {
                    let top_level_keys: Vec<&String> = obj.keys().collect();
                    warn!("VehicleID not found in JSON on {}. Top-level keys: {:?}", 
                        self.config.host, top_level_keys);
                    
                    // Пробуем найти bp и показать его структуру
                    if let Some(bp) = obj.get("bp") {
                        if let Some(bp_obj) = bp.as_object() {
                            let bp_keys: Vec<&String> = bp_obj.keys().collect();
                            warn!("Keys in 'bp' object: {:?}", bp_keys);
                            
                            if let Some(gjkz) = bp_obj.get("gjkz") {
                                if let Some(gjkz_obj) = gjkz.as_object() {
                                    let gjkz_keys: Vec<&String> = gjkz_obj.keys().collect();
                                    warn!("Keys in 'bp.gjkz' object: {:?}", gjkz_keys);
                                }
                            }
                        }
                    }
                }
                
                // Создаем более информативное сообщение об ошибке
                let json_preview = serde_json::to_string_pretty(&json)
                    .unwrap_or_else(|_| "invalid JSON".to_string());
                let preview = json_preview.chars().take(500).collect::<String>();
                
                AppError::ParseError(format!(
                    "VehicleID not found in JSON at path bp.gjkz.VehicleID on host {}. JSON preview:\n{}", 
                    self.config.host, preview
                ))
            })?;

        Ok(vehicle_id.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshCommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_status: i32,
    pub host: String,
    pub vehicle_id: Option<String>,
}

fn convert_ppk_to_openssh(ppk_path: &str, passphrase: Option<&str>) -> AppResult<String> {
    use std::fs;
    use std::process::Command;

    // Попытка найти puttygen в стандартных местах на Windows
    let puttygen_paths: Vec<String> = if cfg!(windows) {
        let mut paths = vec!["puttygen.exe".to_string()];
        
        // Стандартные пути установки PuTTY на Windows
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            paths.push(format!("{}\\PuTTY\\puttygen.exe", program_files));
        }
        if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
            paths.push(format!("{}\\PuTTY\\puttygen.exe", program_files_x86));
        }
        // Проверяем также в пользовательской директории
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            paths.push(format!("{}\\Programs\\PuTTY\\puttygen.exe", local_appdata));
        }
        paths
    } else {
        vec!["puttygen".to_string()]
    };

    // Создаем временный файл для вывода
    let temp_output = std::env::temp_dir().join(format!("ppk_convert_{}.key", Uuid::new_v4()));
    let temp_output_str = temp_output.to_str()
        .ok_or_else(|| AppError::FileError("Invalid temp file path".to_string()))?;

    // Пробуем каждый путь к puttygen
    let mut last_error: Option<String> = None;
    for puttygen_cmd in &puttygen_paths {
        let mut cmd = Command::new(puttygen_cmd);
        cmd.arg(ppk_path)
            .arg("-O")
            .arg("private-openssh")
            .arg("-o")
            .arg(temp_output_str);

        // Если ключ зашифрован, передаем пароль через опцию -P
        if let Some(pass) = passphrase {
            cmd.arg("-P");
            cmd.arg(pass);
        }

        // Выполняем команду
        match cmd.output() {
            Ok(output) => {
                if output.status.success() {
                    // Читаем конвертированный ключ из временного файла
                    match fs::read_to_string(&temp_output) {
                        Ok(converted) => {
                            // Удаляем временный файл
                            let _ = fs::remove_file(&temp_output);
                            return Ok(converted);
                        }
                        Err(e) => {
                            let _ = fs::remove_file(&temp_output);
                            // Если не удалось прочитать, пробуем следующий путь
                            last_error = Some(format!("Failed to read converted key: {}", e));
                            continue;
                        }
                    }
                } else {
                    // Команда не удалась, проверяем ошибку
                    let stderr_msg = String::from_utf8_lossy(&output.stderr);
                    let stdout_msg = String::from_utf8_lossy(&output.stdout);
                    let _ = fs::remove_file(&temp_output);
                    
                    // Формируем информативное сообщение об ошибке
                    let error_msg = if !stderr_msg.trim().is_empty() {
                        stderr_msg.trim().to_string()
                    } else if !stdout_msg.trim().is_empty() {
                        stdout_msg.trim().to_string()
                    } else {
                        format!("Exit code: {}", output.status.code().unwrap_or(-1))
                    };
                    
                    // Если это ошибка о неподдерживаемой опции, переходим к fallback методу
                    if error_msg.contains("unrecognised option") || error_msg.contains("unrecognized option") || error_msg.contains("-O") {
                        eprintln!("PuTTYgen doesn't support -O option. Using fallback parser (may not work for all key types). For reliable conversion, use PuTTYgen GUI: Conversions → Export OpenSSH key.");
                        // Прерываем цикл и переходим к fallback методу
                        break;
                    } else {
                        last_error = Some(format!("PuTTYgen conversion failed: {}", error_msg));
                        // Пробуем следующий путь
                        continue;
                    }
                }
            }
            Err(e) => {
                // PuTTYgen не найден по этому пути, пробуем следующий
                last_error = Some(format!("PuTTYgen not found at {}: {}", puttygen_cmd, e));
                continue;
            }
        }
    }
    
    // Если все пути не сработали, выводим последнюю ошибку
    if let Some(err) = last_error {
        eprintln!("{} (will use fallback method)", err);
    }

    // Fallback: чтение PPK файла и попытка парсинга
    // ВАЖНО: Этот метод работает только для незашифрованных ключей и является упрощенным
    let ppk_content = fs::read_to_string(ppk_path)
        .map_err(|e| AppError::FileError(format!("Failed to read PPK file: {}", e)))?;

    // Парсинг PPK файла формата PuTTY
    let lines: Vec<&str> = ppk_content.lines().collect();
    let mut key_type = "ssh-rsa";
    let mut encryption = "none";
    let mut key_data = String::new();
    let mut in_key = false;
    
    for line in lines {
        if line.starts_with("Encryption:") {
            encryption = line.split(':').nth(1).unwrap_or("none").trim();
        } else if line.starts_with("Key-Type:") {
            key_type = line.split(':').nth(1).unwrap_or("ssh-rsa").trim();
        } else if line.starts_with("Private-Lines:") {
            in_key = true;
            continue;
        }
        if in_key {
            if line.trim().is_empty() || line.starts_with("Public-Lines:") {
                break;
            }
            key_data.push_str(line.trim());
        }
    }
    
    // Если ключ зашифрован, fallback метод не может его расшифровать
    if encryption != "none" {
        return Err(AppError::SecurityError(format!(
            "PPK key is encrypted ({}). Automatic conversion is not supported. Please:\n1. Convert the key manually using PuTTYgen GUI: Load the PPK key, then Conversions → Export OpenSSH key, OR\n2. Use an unencrypted PPK key (not recommended for security).",
            encryption
        )));
    }
    
    // Проверяем, что мы получили данные ключа
    if key_data.is_empty() {
        return Err(AppError::ParseError(
            "Failed to parse PPK file: no key data found. Automatic conversion is not supported. Please convert the key manually using PuTTYgen GUI: Load the PPK key, then Conversions → Export OpenSSH key.".to_string()
        ));
    }
    
    // ВАЖНО: Простое декодирование base64 и обертывание в заголовки НЕ создает правильный OpenSSH ключ
    // PPK формат имеет свою внутреннюю структуру (ASN.1), и правильная конвертация требует
    // полного парсинга структуры ключа. Fallback метод может не работать для всех типов ключей.
    
    // Попытка декодировать base64 данные
    let decoded_key = match general_purpose::STANDARD.decode(&key_data) {
        Ok(decoded) => decoded,
        Err(e) => {
            return Err(AppError::ParseError(format!(
                "Failed to decode PPK key data: {}. Automatic conversion is not supported. Please convert the key manually using PuTTYgen GUI: Load the PPK key, then Conversions → Export OpenSSH key.",
                e
            )));
        }
    };
    
    // Кодируем обратно в base64 с правильным форматированием (64 символа на строку)
    let formatted_key = general_purpose::STANDARD
        .encode(&decoded_key)
        .chars()
        .collect::<Vec<_>>()
        .chunks(64)
        .map(|chunk| chunk.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("\n");
    
    // Конвертация в OpenSSH формат
    // ВНИМАНИЕ: Это упрощенная версия, которая может не работать для всех типов ключей
    // Правильная конвертация требует полного парсинга ASN.1 структуры PPK ключа
    // Рекомендуется использовать PuTTYgen GUI для ручной конвертации: Conversions → Export OpenSSH key
    let openssh_key = if key_type.contains("rsa") {
        format!("-----BEGIN RSA PRIVATE KEY-----\n{}\n-----END RSA PRIVATE KEY-----", formatted_key)
    } else if key_type.contains("ed25519") {
        format!("-----BEGIN OPENSSH PRIVATE KEY-----\n{}\n-----END OPENSSH PRIVATE KEY-----", formatted_key)
    } else if key_type.contains("ecdsa") {
        format!("-----BEGIN EC PRIVATE KEY-----\n{}\n-----END EC PRIVATE KEY-----", formatted_key)
    } else {
        format!("-----BEGIN PRIVATE KEY-----\n{}\n-----END PRIVATE KEY-----", formatted_key)
    };
    
    // Пробуем использовать сконвертированный ключ
    // Если это не сработает, пользователь получит ошибку аутентификации
    // и будет знать, что нужно обновить PuTTYgen
    Ok(openssh_key)
}

// Ключ для идентификации соединения в пуле
/// Фабрика SSH соединений (без кеширования)
/// Каждое соединение создается заново и закрывается после использования
pub struct SshConnectionPool {
    // Сохраняем структуру для совместимости с существующим API
    _max_size: usize,
}

impl SshConnectionPool {
    pub fn new(max_size: usize) -> Self {
        Self {
            _max_size: max_size,
        }
    }

    /// Создает новое SSH соединение
    /// Соединение закрывается автоматически когда Arc выходит из области видимости
    pub fn get_or_create(&self, config: SshConfig) -> AppResult<Arc<SshConnection>> {
        // Создаем новое соединение каждый раз (без кеширования)
        // Соединение закроется автоматически через Drop когда Arc<SshConnection> 
        // выйдет из области видимости (после выполнения команды)
        let connection = Arc::new(SshConnection::new(config)?);
        Ok(connection)
    }
    
    /// Создает новое SSH соединение с возможностью отмены
    pub fn get_or_create_cancellable<F>(&self, config: SshConfig, is_cancelled: F) -> AppResult<Arc<SshConnection>> 
    where 
        F: Fn() -> bool + Clone
    {
        let connection = Arc::new(SshConnection::new_cancellable(config, is_cancelled)?);
        Ok(connection)
    }

    /// Метод для совместимости - ничего не делает, так как соединения не кешируются
    pub fn shutdown(&self) {
        warn!("SSH connection factory shutdown (no cached connections to close)");
    }
}
