use crate::ssh::SshCommandResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcelExportRequest {
    pub results: Vec<SshCommandResult>,
    pub file_path: String,
    pub sheet_name: Option<String>,
    #[serde(default)]
    pub column_settings: Option<ColumnSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ColumnSettings {
    #[serde(default = "default_true")]
    pub host: bool,
    #[serde(default = "default_true")]
    pub vehicle_id: bool,
    #[serde(default = "default_true")]
    pub status: bool,
    #[serde(default = "default_true")]
    pub exit_status: bool,
    #[serde(default = "default_true")]
    pub stdout: bool,
    #[serde(default = "default_true")]
    pub stderr: bool,
    #[serde(default = "default_false")]
    pub timestamp: bool,
    #[serde(default = "default_false")]
    pub command: bool,
    #[serde(default)]
    pub column_order: Vec<String>,
    #[serde(default = "default_true")]
    pub include_headers: bool,
}

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

pub fn export_to_excel_csv(request: ExcelExportRequest) -> Result<(), String> {
    use csv::Writer;
    
    let mut wtr = Writer::from_path(&request.file_path)
        .map_err(|e| format!("Failed to create CSV file: {}", e))?;
    
    // Получаем настройки столбцов (с учетом обратной совместимости)
    let col_settings = request.column_settings.unwrap_or_default();
    
    // Определяем порядок и включенные столбцы
    let default_order = vec![
        "host".to_string(),
        "vehicle_id".to_string(),
        "status".to_string(),
        "exit_status".to_string(),
        "stdout".to_string(),
        "stderr".to_string(),
    ];
    let column_order = if col_settings.column_order.is_empty() {
        default_order
    } else {
        col_settings.column_order.clone()
    };
    
    // Определяем, какие столбцы включены
    let enabled_columns: Vec<String> = column_order.into_iter()
        .filter(|col| {
            match col.as_str() {
                "host" => col_settings.host,
                "vehicleId" | "vehicle_id" => col_settings.vehicle_id,
                "status" => col_settings.status,
                "exitStatus" | "exit_status" => col_settings.exit_status,
                "stdout" => col_settings.stdout,
                "stderr" => col_settings.stderr,
                "timestamp" => col_settings.timestamp,
                "command" => col_settings.command,
                _ => false,
            }
        })
        .collect();
    
    // Заголовки (если включены)
    if col_settings.include_headers {
        let headers: Vec<String> = enabled_columns.iter().map(|col| {
            match col.as_str() {
                "host" => "Хост",
                "vehicleId" | "vehicle_id" => "ID ТС",
                "status" => "Статус",
                "exitStatus" | "exit_status" => "Код выхода",
                "stdout" => "Вывод",
                "stderr" => "Ошибки",
                "timestamp" => "Время выполнения",
                "command" => "Команда",
                _ => "",
            }.to_string()
        }).collect();
        wtr.write_record(&headers)
            .map_err(|e| format!("Failed to write header: {}", e))?;
    }
    
    // Данные
    for result in &request.results {
        let status = if result.exit_status == 0 {
            "Успешно"
        } else {
            "Ошибка"
        };
        
        let vehicle_id = result.vehicle_id.as_deref().unwrap_or("");
        
        let record: Vec<String> = enabled_columns.iter().map(|col| {
            match col.as_str() {
                "host" => result.host.clone(),
                "vehicleId" | "vehicle_id" => vehicle_id.to_string(),
                "status" => status.to_string(),
                "exitStatus" | "exit_status" => result.exit_status.to_string(),
                "stdout" => result.stdout.clone(),
                "stderr" => result.stderr.clone(),
                "timestamp" => "".to_string(), // TODO: добавить timestamp если будет доступен
                "command" => "".to_string(), // TODO: добавить command если будет доступен
                _ => "".to_string(),
            }
        }).collect();
        
        wtr.write_record(&record)
            .map_err(|e| format!("Failed to write record: {}", e))?;
    }
    
    wtr.flush()
        .map_err(|e| format!("Failed to flush CSV: {}", e))?;
    
    Ok(())
}

pub fn export_to_excel_html(request: ExcelExportRequest) -> Result<(), String> {
    // Получаем настройки столбцов (с учетом обратной совместимости)
    let col_settings = request.column_settings.unwrap_or_default();
    
    // Определяем порядок и включенные столбцы
    let default_order = vec![
        "host".to_string(),
        "vehicle_id".to_string(),
        "status".to_string(),
        "exit_status".to_string(),
        "stdout".to_string(),
        "stderr".to_string(),
    ];
    let column_order = if col_settings.column_order.is_empty() {
        default_order
    } else {
        col_settings.column_order.clone()
    };
    
    // Определяем, какие столбцы включены
    let enabled_columns: Vec<String> = column_order.into_iter()
        .filter(|col| {
            match col.as_str() {
                "host" => col_settings.host,
                "vehicleId" | "vehicle_id" => col_settings.vehicle_id,
                "status" => col_settings.status,
                "exitStatus" | "exit_status" => col_settings.exit_status,
                "stdout" => col_settings.stdout,
                "stderr" => col_settings.stderr,
                "timestamp" => col_settings.timestamp,
                "command" => col_settings.command,
                _ => false,
            }
        })
        .collect();
    
    let mut html = String::from(
        r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; }
        tr:nth-child(even) { background-color: #f2f2f2; }
        .success { color: green; }
        .error { color: red; }
    </style>
</head>
<body>
    <h1>Результаты выполнения команд</h1>
    <table>
        <tr>
"#,
    );
    
    // Заголовки (если включены)
    if col_settings.include_headers {
        for col in &enabled_columns {
            let header = match col.as_str() {
                "host" => "Хост",
                "vehicleId" | "vehicle_id" => "ID ТС",
                "status" => "Статус",
                "exitStatus" | "exit_status" => "Код выхода",
                "stdout" => "Вывод",
                "stderr" => "Ошибки",
                "timestamp" => "Время выполнения",
                "command" => "Команда",
                _ => "",
            };
            html.push_str(&format!("            <th>{}</th>\n", header));
        }
        html.push_str("        </tr>\n");
    }
    
    // Данные
    for result in &request.results {
        let status = if result.exit_status == 0 {
            "Успешно"
        } else {
            "Ошибка"
        };
        let status_class = if result.exit_status == 0 {
            "success"
        } else {
            "error"
        };
        
        let vehicle_id = result.vehicle_id.as_deref().unwrap_or("");
        
        html.push_str("        <tr>\n");
        
        for col in &enabled_columns {
            let cell_value = match col.as_str() {
                "host" => html_escape(&result.host),
                "vehicleId" | "vehicle_id" => html_escape(vehicle_id),
                "status" => format!(r#"<span class="{}">{}</span>"#, status_class, status),
                "exitStatus" | "exit_status" => result.exit_status.to_string(),
                "stdout" => format!("<pre>{}</pre>", html_escape(&result.stdout)),
                "stderr" => format!("<pre>{}</pre>", html_escape(&result.stderr)),
                "timestamp" => "".to_string(), // TODO: добавить timestamp если будет доступен
                "command" => "".to_string(), // TODO: добавить command если будет доступен
                _ => "".to_string(),
            };
            html.push_str(&format!("            <td>{}</td>\n", cell_value));
        }
        
        html.push_str("        </tr>\n");
    }
    
    html.push_str(
        r#"    </table>
</body>
</html>"#,
    );
    
    std::fs::write(&request.file_path, html)
        .map_err(|e| format!("Failed to write HTML file: {}", e))?;
    
    Ok(())
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}
