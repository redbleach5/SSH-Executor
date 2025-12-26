use crate::error::{AppError, AppResult};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::OnceLock;

// Кэшируем регулярные выражения для производительности
static IP_REGEX: OnceLock<Regex> = OnceLock::new();
static PORT_REGEX: OnceLock<Regex> = OnceLock::new();

fn get_ip_regex() -> &'static Regex {
    IP_REGEX.get_or_init(|| {
        Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
            .expect("IP regex pattern is invalid")
    })
}

fn get_port_regex() -> &'static Regex {
    PORT_REGEX.get_or_init(|| {
        Regex::new(r":(\d{1,5})")
            .expect("Port regex pattern is invalid")
    })
}

/// Проверяет, является ли строка валидным IPv4 адресом
/// Каждый октет должен быть в диапазоне 0-255
/// Ведущие нули не допускаются (001, 01 и т.д.)
fn is_valid_ipv4(ip: &str) -> bool {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() != 4 {
        return false;
    }
    
    for part in parts {
        // Проверяем, что часть состоит только из цифр
        if part.is_empty() || !part.chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
        
        // Проверка на ведущие нули: "0" валидно, но "00", "01", "001" - нет
        if part.len() > 1 && part.starts_with('0') {
            return false;
        }
        
        // Проверяем, что значение в диапазоне 0-255
        match part.parse::<u16>() {
            Ok(n) if n <= 255 => continue,
            _ => return false,
        }
    }
    
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostEntry {
    pub ip: String,
    pub port: Option<u16>,
    pub hostname: Option<String>,
    pub metadata: std::collections::HashMap<String, String>,
}

pub fn parse_hosts_file(file_path: &str) -> AppResult<Vec<HostEntry>> {
    let path = Path::new(file_path);
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::FileError("Unknown file extension".to_string()))?;

    match extension.to_lowercase().as_str() {
        "txt" => parse_txt_file(file_path),
        "csv" => parse_csv_file(file_path),
        "xlsx" | "xls" => parse_excel_file(file_path),
        _ => Err(AppError::FileError(format!("Unsupported file format: {}", extension))),
    }
}

fn parse_txt_file(file_path: &str) -> AppResult<Vec<HostEntry>> {
    let content = std::fs::read_to_string(file_path)
        .map_err(|e| AppError::FileError(format!("Failed to read file: {}", e)))?;

    let ip_regex = get_ip_regex();
    let mut hosts = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // Находим все IP адреса в строке (для случаев, когда несколько IP через пробел)
        for captures in ip_regex.find_iter(line) {
            let ip = captures.as_str().to_string();
            // Проверяем валидность IP адреса (каждый октет должен быть <= 255)
            if !is_valid_ipv4(&ip) {
                log::warn!("Пропущен невалидный IP адрес: {}", ip);
                continue;
            }
            let port = extract_port(line);
            hosts.push(HostEntry {
                ip,
                port,
                hostname: None,
                metadata: std::collections::HashMap::new(),
            });
        }
    }

    Ok(hosts)
}

fn parse_csv_file(file_path: &str) -> AppResult<Vec<HostEntry>> {
    use std::fs::File;
    use std::io::BufReader;

    let file = File::open(file_path)
        .map_err(|e| AppError::FileError(format!("Failed to open file: {}", e)))?;
    let reader = BufReader::new(file);

    let mut rdr = csv::Reader::from_reader(reader);
    let mut hosts = Vec::new();
    let ip_regex = get_ip_regex();

    for result in rdr.records() {
        let record = result.map_err(|e| AppError::ParseError(format!("CSV parse error: {}", e)))?;
        
        let mut metadata = std::collections::HashMap::new();
        let mut ip: Option<String> = None;
        let mut port: Option<u16> = None;
        let hostname: Option<String> = None;

        for (i, field) in record.iter().enumerate() {
            if ip_regex.is_match(field) && is_valid_ipv4(field) {
                ip = Some(field.to_string());
            } else if ip_regex.is_match(field) {
                // IP найден по regex, но не прошел валидацию октетов
                log::warn!("Пропущен невалидный IP адрес в CSV: {}", field);
            } else if let Ok(p) = field.parse::<u16>() {
                if port.is_none() {
                    port = Some(p);
                }
            } else if !field.is_empty() {
                metadata.insert(format!("column_{}", i), field.to_string());
            }
        }

        if let Some(ip_addr) = ip {
            hosts.push(HostEntry {
                ip: ip_addr,
                port,
                hostname,
                metadata,
            });
        }
    }

    Ok(hosts)
}

fn parse_excel_file(file_path: &str) -> AppResult<Vec<HostEntry>> {
    use calamine::{open_workbook, Reader, Xlsx};

    let mut workbook: Xlsx<_> = open_workbook(file_path)
        .map_err(|e| AppError::FileError(format!("Failed to open Excel file: {}", e)))?;

    let range = workbook
        .worksheet_range_at(0)
        .ok_or_else(|| AppError::FileError("No worksheet found".to_string()))?
        .map_err(|e| AppError::ParseError(format!("Excel parse error: {}", e)))?;

    let ip_regex = get_ip_regex();
    let mut hosts = Vec::new();

    for (row_idx, row) in range.rows().enumerate() {
        if row_idx == 0 {
            continue; // Пропускаем заголовок
        }

        let mut metadata = std::collections::HashMap::new();
        let mut ip: Option<String> = None;
        let mut port: Option<u16> = None;
        let hostname: Option<String> = None;

        for (col_idx, cell) in row.iter().enumerate() {
            let cell_value = cell.to_string();
            
            if ip_regex.is_match(&cell_value) && is_valid_ipv4(&cell_value) {
                ip = Some(cell_value.clone());
            } else if ip_regex.is_match(&cell_value) {
                // IP найден по regex, но не прошел валидацию октетов
                log::warn!("Пропущен невалидный IP адрес в Excel: {}", cell_value);
            } else if let Ok(p) = cell_value.parse::<u16>() {
                if port.is_none() {
                    port = Some(p);
                }
            } else if !cell_value.is_empty() {
                metadata.insert(format!("column_{}", col_idx), cell_value);
            }
        }

        if let Some(ip_addr) = ip {
            hosts.push(HostEntry {
                ip: ip_addr,
                port,
                hostname,
                metadata,
            });
        }
    }

    Ok(hosts)
}

fn extract_port(line: &str) -> Option<u16> {
    let port_regex = get_port_regex();
    port_regex
        .captures(line)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ip_extraction() {
        let ip_regex = get_ip_regex();
        assert!(ip_regex.is_match("192.168.1.1"));
        assert!(ip_regex.is_match("10.0.0.1:22"));
    }
    
    #[test]
    fn test_valid_ipv4() {
        // Валидные IP адреса
        assert!(is_valid_ipv4("192.168.1.1"));
        assert!(is_valid_ipv4("10.0.0.1"));
        assert!(is_valid_ipv4("0.0.0.0"));
        assert!(is_valid_ipv4("255.255.255.255"));
        assert!(is_valid_ipv4("172.16.0.1"));
        assert!(is_valid_ipv4("8.8.8.8"));
        
        // Невалидные IP адреса (октеты > 255)
        assert!(!is_valid_ipv4("256.1.1.1"));
        assert!(!is_valid_ipv4("192.168.1.256"));
        assert!(!is_valid_ipv4("999.999.999.999"));
        assert!(!is_valid_ipv4("192.300.1.1"));
        
        // Невалидные форматы
        assert!(!is_valid_ipv4("192.168.1"));          // Только 3 октета
        assert!(!is_valid_ipv4("192.168.1.1.1"));      // 5 октетов
        assert!(!is_valid_ipv4(""));                   // Пустая строка
        assert!(!is_valid_ipv4("abc.def.ghi.jkl"));    // Буквы вместо цифр
        assert!(!is_valid_ipv4("192.168.1."));         // Пустой октет
        assert!(!is_valid_ipv4(".168.1.1"));           // Пустой первый октет
    }
}
