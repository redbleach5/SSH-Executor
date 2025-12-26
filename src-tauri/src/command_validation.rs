use crate::error::{AppError, AppResult};
use regex::Regex;
use std::sync::OnceLock;

// Кэшируем регулярные выражения для производительности
static ENV_VAR_REGEX: OnceLock<Regex> = OnceLock::new();
static REDIRECT_REGEX: OnceLock<Regex> = OnceLock::new();

fn get_env_var_regex() -> &'static Regex {
    ENV_VAR_REGEX.get_or_init(|| {
        Regex::new(r"\$\{?[A-Za-z_][A-Za-z0-9_]*\}?")
            .expect("ENV_VAR_REGEX pattern is invalid")
    })
}

fn get_redirect_regex() -> &'static Regex {
    REDIRECT_REGEX.get_or_init(|| {
        Regex::new(r"[<>]\s*[0-9]*")
            .expect("REDIRECT_REGEX pattern is invalid")
    })
}

// Список опасных символов и операторов, которые могут использоваться для инъекции команд
const DANGEROUS_CHARS: &[&str] = &[
    ";", "|", "&", "&&", "||", ">", "<", ">>", "<<", "`", "$", "(", ")", "{", "}",
    "\n", "\r", "\t", "\\", "'", "\"", "#", "*", "?", "[", "]",
];

// Черный список опасных команд (базовые имена команд)
const DANGEROUS_COMMANDS: &[&str] = &[
    "rm",      // Удаление файлов
    "dd",      // Копирование/уничтожение данных
    "mkfs",    // Форматирование файловых систем
    "fdisk",   // Разметка дисков
    "parted",  // Разметка дисков
    "shutdown", // Выключение системы
    "reboot",  // Перезагрузка системы
    "halt",    // Остановка системы
    "poweroff", // Выключение системы
    "init",    // Управление процессами (может быть опасно)
    "killall", // Убийство процессов
    "pkill",   // Убийство процессов по имени
    "kill",    // Убийство процессов (может быть опасно с -9)
    "format",  // Форматирование (Windows)
    "del",     // Удаление (Windows, но может быть в Linux как алиас)
];

// Опасные аргументы, которые могут использоваться с командами
const DANGEROUS_ARGUMENTS: &[&str] = &[
    "-rf",     // Рекурсивное принудительное удаление
    "-r -f",   // Рекурсивное принудительное удаление (раздельно)
    "-f -r",   // Рекурсивное принудительное удаление (раздельно, обратный порядок)
    "/",       // Корневая директория
    "/dev/",   // Устройства
    "/proc/",  // Виртуальная файловая система
    "/sys/",   // Виртуальная файловая система
    "of=/dev/", // Для dd - запись в устройство
    "if=/dev/zero", // Для dd - чтение из /dev/zero
    "if=/dev/urandom", // Для dd - чтение случайных данных
];

// Максимальная длина команды (предотвращение DoS)
const MAX_COMMAND_LENGTH: usize = 10000;

// Минимальная длина команды (предотвращение пустых команд)
const MIN_COMMAND_LENGTH: usize = 1;

/// Валидирует команду перед выполнением
/// 
/// Проверяет:
/// - Наличие опасных символов
/// - Длину команды
/// - Базовую структуру команды
/// 
/// # Параметры
/// * `command` - Команда для валидации
/// * `skip_validation` - Если true, пропускает все проверки (опасно!)
pub fn validate_command(command: &str, skip_validation: bool) -> AppResult<()> {
    // Если валидация отключена, пропускаем все проверки
    if skip_validation {
        return Ok(());
    }
    // Проверка длины
    if command.len() < MIN_COMMAND_LENGTH {
        return Err(AppError::SecurityError(
            "Команда не может быть пустой".to_string(),
        ));
    }

    if command.len() > MAX_COMMAND_LENGTH {
        return Err(AppError::SecurityError(format!(
            "Команда слишком длинная (максимум {} символов)",
            MAX_COMMAND_LENGTH
        )));
    }

    // Проверка на опасные символы
    for dangerous_char in DANGEROUS_CHARS {
        if command.contains(dangerous_char) {
            return Err(AppError::SecurityError(format!(
                "Команда содержит недопустимый символ: '{}'. Использование специальных символов запрещено для безопасности.",
                dangerous_char
            )));
        }
    }

    // Проверка на попытки выполнения нескольких команд
    let trimmed = command.trim();
    if trimmed.contains("  ") {
        return Err(AppError::SecurityError(
            "Команда содержит множественные пробелы, что может указывать на попытку инъекции".to_string(),
        ));
    }

    // Проверка на попытки использования переменных окружения через $ или ${}
    if get_env_var_regex().is_match(command) {
        return Err(AppError::SecurityError(
            "Использование переменных окружения в командах запрещено для безопасности".to_string(),
        ));
    }

    // Проверка на попытки перенаправления ввода/вывода
    if get_redirect_regex().is_match(command) {
        return Err(AppError::SecurityError(
            "Перенаправление ввода/вывода запрещено для безопасности".to_string(),
        ));
    }

    // Проверка на базовую структуру команды (должна начинаться с буквы или цифры)
    if let Some(first_char) = trimmed.chars().next() {
        if !first_char.is_alphanumeric() && first_char != '/' && first_char != '.' {
            return Err(AppError::SecurityError(
                "Команда должна начинаться с допустимого символа".to_string(),
            ));
        }
    }

    // Проверка на опасные команды
    // Извлекаем базовое имя команды (первое слово или имя файла из пути)
    let command_parts: Vec<&str> = trimmed.split_whitespace().collect();
    if let Some(first_part) = command_parts.first() {
        // Извлекаем имя команды из пути (если есть путь)
        let command_name = if first_part.starts_with('/') || first_part.starts_with("./") {
            // Извлекаем имя файла из пути
            first_part.split('/').last().unwrap_or(first_part)
        } else {
            first_part
        };

        // Проверяем, не является ли команда опасной
        for dangerous_cmd in DANGEROUS_COMMANDS {
            if command_name == *dangerous_cmd || command_name.ends_with(&format!("/{}", dangerous_cmd)) {
                return Err(AppError::SecurityError(format!(
                    "Выполнение команды '{}' запрещено для безопасности. Эта команда может привести к потере данных или нарушению работы системы.",
                    command_name
                )));
            }
        }
    }

    // Проверка на опасные аргументы в команде
    let command_lower = trimmed.to_lowercase();
    for dangerous_arg in DANGEROUS_ARGUMENTS {
        if command_lower.contains(dangerous_arg) {
            return Err(AppError::SecurityError(format!(
                "Команда содержит опасный аргумент '{}', который может привести к потере данных или нарушению работы системы.",
                dangerous_arg
            )));
        }
    }

    // Дополнительная проверка: комбинация rm с -rf или -r -f
    if command_lower.starts_with("rm ") || command_lower.contains("/rm ") {
        if command_lower.contains("-rf") || command_lower.contains("-r -f") || command_lower.contains("-f -r") {
            return Err(AppError::SecurityError(
                "Команда 'rm' с флагами '-rf' запрещена для безопасности. Используйте 'rm' без флага '-f' или удаляйте файлы по одному.".to_string(),
            ));
        }
    }

    // Дополнительная проверка: команда dd с опасными параметрами
    if command_lower.starts_with("dd ") || command_lower.contains("/dd ") {
        if command_lower.contains("of=/dev/") && !command_lower.contains("if=/dev/zero") {
            // Разрешаем только безопасные операции с dd (например, копирование файлов)
            // Но блокируем запись в устройства
            if command_lower.contains("of=/dev/sd") || command_lower.contains("of=/dev/hd") {
                return Err(AppError::SecurityError(
                    "Команда 'dd' с записью в блочные устройства запрещена для безопасности.".to_string(),
                ));
            }
        }
    }

    Ok(())
}

/// Санитизирует команду для логирования (удаляет чувствительные данные)
pub fn sanitize_command_for_logging(command: &str) -> String {
    let mut sanitized = command.to_string();
    
    // Ограничиваем длину в логах
    if sanitized.len() > 200 {
        sanitized = format!("{}...", &sanitized[..200]);
    }
    
    // Маскируем потенциально чувствительные данные
    // Ищем паттерны типа "password=xxx" или "key=xxx"
    let sensitive_patterns = vec![
        (r"(?i)password\s*=\s*\S+", "password=***"),
        (r"(?i)passwd\s*=\s*\S+", "passwd=***"),
        (r"(?i)pass\s*=\s*\S+", "pass=***"),
        (r"(?i)key\s*=\s*\S+", "key=***"),
        (r"(?i)token\s*=\s*\S+", "token=***"),
        (r"(?i)secret\s*=\s*\S+", "secret=***"),
    ];
    
    for (pattern, replacement) in sensitive_patterns {
        if let Ok(re) = Regex::new(pattern) {
            sanitized = re.replace_all(&sanitized, replacement).to_string();
        }
    }
    
    sanitized
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_command_safe() {
        assert!(validate_command("ls -la", false).is_ok());
        assert!(validate_command("cat /etc/passwd", false).is_ok());
        assert!(validate_command("echo hello", false).is_ok());
        assert!(validate_command("ps aux", false).is_ok());
        assert!(validate_command("df -h", false).is_ok());
        assert!(validate_command("netstat -tulpn", false).is_ok());
    }

    #[test]
    fn test_validate_command_skip_validation() {
        // При skip_validation=true все команды должны проходить, даже опасные
        assert!(validate_command("rm -rf /", true).is_ok());
        assert!(validate_command("dd if=/dev/zero of=/dev/sda", true).is_ok());
        assert!(validate_command("shutdown -h now", true).is_ok());
        assert!(validate_command("ls; rm -rf /", true).is_ok());
    }

    #[test]
    fn test_validate_command_dangerous_chars() {
        assert!(validate_command("ls; rm -rf /", false).is_err());
        assert!(validate_command("ls | cat", false).is_err());
        assert!(validate_command("ls && rm -rf /", false).is_err());
        assert!(validate_command("ls > file.txt", false).is_err());
        assert!(validate_command("ls `rm -rf /`", false).is_err());
    }

    #[test]
    fn test_validate_command_too_long() {
        let long_command = "a".repeat(MAX_COMMAND_LENGTH + 1);
        assert!(validate_command(&long_command, false).is_err());
    }

    #[test]
    fn test_validate_command_empty() {
        assert!(validate_command("", false).is_err());
        assert!(validate_command("   ", false).is_err());
    }

    #[test]
    fn test_sanitize_command_for_logging() {
        let cmd = "echo password=secret123";
        let sanitized = sanitize_command_for_logging(cmd);
        assert!(sanitized.contains("password=***"));
        assert!(!sanitized.contains("secret123"));
    }

    #[test]
    fn test_validate_command_dangerous_commands() {
        // Проверка на опасные команды
        assert!(validate_command("rm -rf /home/user", false).is_err());
        assert!(validate_command("dd if=/dev/zero of=/dev/sda", false).is_err());
        assert!(validate_command("mkfs.ext4 /dev/sda1", false).is_err());
        assert!(validate_command("shutdown -h now", false).is_err());
        assert!(validate_command("reboot", false).is_err());
        assert!(validate_command("halt", false).is_err());
        assert!(validate_command("poweroff", false).is_err());
        assert!(validate_command("killall -9 process", false).is_err());
        assert!(validate_command("/usr/bin/rm file.txt", false).is_err());
        assert!(validate_command("./rm file.txt", false).is_err());
    }

    #[test]
    fn test_validate_command_dangerous_arguments() {
        // Проверка на опасные аргументы
        assert!(validate_command("command -rf /", false).is_err());
        assert!(validate_command("command /dev/sda", false).is_err());
        assert!(validate_command("command /proc", false).is_err());
    }

    #[test]
    fn test_validate_command_rm_with_rf() {
        // Проверка на rm с -rf
        assert!(validate_command("rm -rf directory", false).is_err());
        assert!(validate_command("rm -r -f directory", false).is_err());
        assert!(validate_command("rm -f -r directory", false).is_err());
        // Но rm без -f должен быть разрешен (хотя сама команда rm все равно заблокирована)
    }

    #[test]
    fn test_validate_command_dd_dangerous() {
        // Проверка на dd с опасными параметрами
        assert!(validate_command("dd if=/dev/zero of=/dev/sda", false).is_err());
        assert!(validate_command("dd if=/dev/zero of=/dev/hda", false).is_err());
    }
}
