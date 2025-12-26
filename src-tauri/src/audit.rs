use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::AppHandle;
use chrono::{Utc, DateTime, TimeDelta};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    pub timestamp: String,
    pub level: String,
    pub action: String,
    pub details: String,
    pub user: Option<String>,
}

static AUDIT_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);
static AUDIT_SETTINGS: Mutex<Option<AuditSettings>> = Mutex::new(None);

// Счётчик для периодической очистки логов (вместо каждого вызова)
static LOG_ACTION_COUNTER: AtomicU64 = AtomicU64::new(0);
// Последняя очистка логов (timestamp в секундах)
static LAST_CLEANUP_TIME: AtomicU64 = AtomicU64::new(0);
// Интервал между очистками (1 час = 3600 секунд)
const CLEANUP_INTERVAL_SECS: u64 = 3600;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditSettings {
    pub log_level: String, // "error" | "warn" | "info" | "debug"
    pub retention_days: u32,
    pub auto_rotate: bool,
    pub max_log_file_size: u64, // в МБ
    pub log_format: String, // "json" | "text"
    pub enable_audit: bool,
}

impl Default for AuditSettings {
    fn default() -> Self {
        AuditSettings {
            log_level: "info".to_string(),
            retention_days: 30,
            auto_rotate: true,
            max_log_file_size: 100,
            log_format: "json".to_string(),
            enable_audit: true,
        }
    }
}

// Обновляет настройки аудита
pub fn update_audit_settings(settings: AuditSettings) {
    if let Ok(mut guard) = AUDIT_SETTINGS.lock() {
        *guard = Some(settings);
    }
}

pub fn init_audit_log(app: AppHandle) {
    let app_data_dir = match app.path_resolver().app_data_dir() {
        Some(dir) => dir,
        None => {
            log::error!("Failed to get app data directory");
            return;
        }
    };
    
    if let Err(e) = std::fs::create_dir_all(&app_data_dir) {
        log::error!("Failed to create app data directory: {}", e);
        return;
    }
    
    let log_file = app_data_dir.join("audit.log");
    if let Ok(mut guard) = AUDIT_FILE.lock() {
        *guard = Some(log_file);
    } else {
        log::error!("Failed to lock audit file mutex");
        return;
    }
    
    log_action("INFO", "Система", "Приложение запущено", None);
}

// Получает настройки аудита
fn get_audit_settings() -> AuditSettings {
    if let Ok(guard) = AUDIT_SETTINGS.lock() {
        if let Some(ref settings) = *guard {
            return settings.clone();
        }
    }
    // Дефолтные настройки
    AuditSettings::default()
}

// Проверяет, должен ли уровень логирования быть записан
fn should_log_level(level: &str, min_level: &str) -> bool {
    let levels = vec!["debug", "info", "warn", "error"];
    let level_idx = levels.iter().position(|&l| l == level.to_lowercase()).unwrap_or(0);
    let min_level_idx = levels.iter().position(|&l| l == min_level.to_lowercase()).unwrap_or(0);
    level_idx >= min_level_idx
}

// Проверяет размер файла и выполняет ротацию если нужно
fn check_and_rotate_log(log_path: &PathBuf, max_size_mb: u64) -> Result<(), String> {
    if let Ok(metadata) = fs::metadata(log_path) {
        let size_mb = metadata.len() / (1024 * 1024);
        if size_mb >= max_size_mb {
            // Создаем резервную копию с timestamp
            let backup_path = log_path.with_extension(format!("log.{}", Utc::now().timestamp()));
            if let Err(e) = fs::copy(log_path, &backup_path) {
                return Err(format!("Failed to create backup: {}", e));
            }
            // Очищаем основной файл, оставляя только последние 100 строк
            if let Ok(content) = fs::read_to_string(log_path) {
                let lines: Vec<&str> = content.lines().collect();
                let keep_lines = if lines.len() > 100 { 100 } else { lines.len() };
                let new_content = lines[lines.len() - keep_lines..].join("\n");
                if let Err(e) = fs::write(log_path, new_content) {
                    return Err(format!("Failed to rotate log: {}", e));
                }
            }
        }
    }
    Ok(())
}

// Очищает старые логи по retentionDays
fn cleanup_old_logs(log_path: &PathBuf, retention_days: u32) -> Result<(), String> {
    if retention_days == 0 {
        return Ok(());
    }
    
    let cutoff_date = Utc::now() - TimeDelta::try_days(retention_days as i64).unwrap_or(TimeDelta::zero());
    
    if let Ok(content) = fs::read_to_string(log_path) {
        let lines: Vec<&str> = content.lines().collect();
        let total_lines = lines.len();
        let mut kept_lines = Vec::new();
        
        for line in &lines {
            if let Ok(log_entry) = serde_json::from_str::<AuditLog>(line) {
                if let Ok(timestamp) = DateTime::parse_from_rfc3339(&log_entry.timestamp) {
                    let log_date = timestamp.with_timezone(&Utc);
                    if log_date >= cutoff_date {
                        kept_lines.push(*line);
                    }
                } else {
                    // Если не удалось распарсить дату, оставляем строку
                    kept_lines.push(*line);
                }
            } else {
                // Если не JSON, оставляем строку
                kept_lines.push(*line);
            }
        }
        
        if kept_lines.len() < total_lines {
            let new_content = kept_lines.join("\n");
            if let Err(e) = fs::write(log_path, new_content) {
                return Err(format!("Failed to cleanup old logs: {}", e));
            }
        }
    }
    
    Ok(())
}

/// Проверяет, нужно ли выполнить периодическое обслуживание логов
fn should_run_maintenance() -> bool {
    let now = Utc::now().timestamp() as u64;
    let last_cleanup = LAST_CLEANUP_TIME.load(Ordering::Relaxed);
    
    // Если прошло достаточно времени с последней очистки
    if now.saturating_sub(last_cleanup) >= CLEANUP_INTERVAL_SECS {
        // Пытаемся атомарно обновить время последней очистки
        // Это предотвращает одновременное выполнение очистки несколькими потоками
        LAST_CLEANUP_TIME.compare_exchange(
            last_cleanup,
            now,
            Ordering::SeqCst,
            Ordering::Relaxed
        ).is_ok()
    } else {
        false
    }
}

pub fn log_action(level: &str, action: &str, details: &str, user: Option<&str>) {
    let settings = get_audit_settings();
    
    // Проверяем, включен ли аудит
    if !settings.enable_audit {
        return;
    }
    
    // Проверяем уровень логирования
    if !should_log_level(level, &settings.log_level) {
        return;
    }
    
    // Увеличиваем счётчик вызовов
    LOG_ACTION_COUNTER.fetch_add(1, Ordering::Relaxed);
    
    let log_entry = AuditLog {
        timestamp: Utc::now().to_rfc3339(),
        level: level.to_string(),
        action: action.to_string(),
        details: details.to_string(),
        user: user.map(|s| s.to_string()),
    };

    if let Ok(guard) = AUDIT_FILE.lock() {
        if let Some(ref log_path) = *guard {
            // Периодическое обслуживание: ротация и очистка выполняются раз в час
            if should_run_maintenance() {
                // Проверяем размер и ротируем если нужно
                if settings.auto_rotate {
                    let _ = check_and_rotate_log(log_path, settings.max_log_file_size);
                }
                
                // Очищаем старые логи
                let _ = cleanup_old_logs(log_path, settings.retention_days);
            }
            
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_path)
            {
                if settings.log_format == "text" {
                    // Текстовый формат
                    let text_line = format!(
                        "[{}] {}: {} - {}",
                        log_entry.timestamp,
                        log_entry.level,
                        log_entry.action,
                        log_entry.details
                    );
                    if let Some(user) = &log_entry.user {
                        let _ = writeln!(file, "{} (User: {})", text_line, user);
                    } else {
                        let _ = writeln!(file, "{}", text_line);
                    }
                } else {
                    // JSON формат (по умолчанию)
                    if let Ok(json) = serde_json::to_string(&log_entry) {
                        let _ = writeln!(file, "{}", json);
                    }
                }
            }
        }
    }
}

pub fn get_audit_logs(limit: Option<usize>) -> Vec<AuditLog> {
    if let Ok(guard) = AUDIT_FILE.lock() {
        if let Some(ref log_path) = *guard {
            if let Ok(content) = std::fs::read_to_string(log_path) {
                let mut logs: Vec<AuditLog> = content
                    .lines()
                    .filter_map(|line| serde_json::from_str(line).ok())
                    .collect();
                
                logs.reverse();
                
                if let Some(lim) = limit {
                    logs.truncate(lim);
                }
                
                return logs;
            }
        }
    }
    Vec::new()
}

pub fn clear_audit_logs() -> Result<(), String> {
    if let Ok(guard) = AUDIT_FILE.lock() {
        if let Some(ref log_path) = *guard {
            // Создаем новый пустой файл, перезаписывая старый
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(log_path)
            {
                // Записываем начальную запись о очистке
                let log_entry = AuditLog {
                    timestamp: Utc::now().to_rfc3339(),
                    level: "INFO".to_string(),
                    action: "Система".to_string(),
                    details: "Журнал аудита очищен".to_string(),
                    user: None,
                };
                if let Ok(json) = serde_json::to_string(&log_entry) {
                    let _ = writeln!(file, "{}", json);
                }
                Ok(())
            } else {
                Err("Не удалось открыть файл журнала для очистки".to_string())
            }
        } else {
            Err("Путь к файлу журнала не установлен".to_string())
        }
    } else {
        Err("Не удалось заблокировать мьютекс файла журнала".to_string())
    }
}
