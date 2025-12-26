// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod ssh;
mod security;
mod file_parser;
mod audit;
mod error;
mod excel_export;
mod error_handler;
mod command_validation;

use tauri::{Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, CustomMenuItem, WindowEvent};
use std::sync::atomic::{AtomicBool, Ordering};

// Глобальное состояние для настройки closeToTray
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);

/// Функция для установки настройки closeToTray из других модулей
pub fn set_close_to_tray_setting(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::SeqCst);
}

fn main() {
    env_logger::init();
    error_handler::setup_error_handling();
    
    let quit = CustomMenuItem::new("quit".to_string(), "Выход");
    let show = CustomMenuItem::new("show".to_string(), "Показать");
    let hide = CustomMenuItem::new("hide".to_string(), "Скрыть");
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_item(quit);

    let system_tray = SystemTray::new().with_menu(tray_menu);
    let pool = std::sync::Arc::new(ssh::SshConnectionPool::new(100));
    let pool_for_tray = pool.clone();

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_window_event(|event| {
            if let WindowEvent::CloseRequested { api, .. } = event.event() {
                let window = event.window();
                let close_to_tray = CLOSE_TO_TRAY.load(Ordering::SeqCst);
                
                if close_to_tray {
                    // Скрываем окно в трей вместо закрытия
                    api.prevent_close();
                    if let Err(e) = window.hide() {
                        log::error!("Failed to hide window: {}", e);
                    }
                }
                // Если close_to_tray = false, окно закрывается нормально
            }
        })
        .on_system_tray_event(move |app, event| {
            if let SystemTrayEvent::MenuItemClick { id, .. } = event {
                match id.as_str() {
                    "quit" => {
                        // Закрываем все SSH соединения перед выходом
                        pool_for_tray.shutdown();
                        std::process::exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_window("main") {
                            if let Err(e) = window.show() {
                                log::error!("Failed to show window: {}", e);
                            }
                            if let Err(e) = window.set_focus() {
                                log::error!("Failed to focus window: {}", e);
                            }
                        } else {
                            log::warn!("Main window not found");
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_window("main") {
                            if let Err(e) = window.hide() {
                                log::error!("Failed to hide window: {}", e);
                            }
                        } else {
                            log::warn!("Main window not found");
                        }
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::parse_hosts_file,
            commands::execute_ssh_command,
            commands::execute_batch_commands,
            commands::export_to_excel,
            commands::get_audit_logs,
            commands::clear_audit_logs,
            commands::test_ssh_connection,
            commands::save_temp_file,
            commands::save_file,
            commands::cancel_command_execution,
            commands::update_audit_settings,
            commands::hash_settings_password,
            commands::verify_settings_password,
            commands::set_close_to_tray,
        ])
        .manage(pool.clone())
        .manage(commands::CancellationToken::new())
        .setup(move |app| {
            // Получаем app_data_dir для инициализации шифрования
            let app_data_dir = app.path_resolver().app_data_dir();
            
            // Инициализация шифрования (с сохранением ключа между сессиями)
            security::init_encryption(app_data_dir);
            
            // Инициализация аудита
            audit::init_audit_log(app.app_handle());
            
            // Применяем настройки запуска после загрузки окна
            if let Some(window) = app.get_window("main") {
                // Ждем загрузки DOM и применяем настройки
                let window_clone = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1000));
                    let _ = window_clone.eval(
                        r#"
                        (async () => {
                            try {
                                const settings = JSON.parse(localStorage.getItem('ssh-executor-settings') || '{}');
                                
                                // Запуск свернутым
                                // Используем Tauri v1 API: appWindow
                                if (settings.general?.startMinimized) {
                                    const { appWindow } = await import('@tauri-apps/api/window');
                                    await appWindow.minimize();
                                }
                            } catch (e) {
                                console.error('Error applying startup settings:', e);
                            }
                        })()
                        "#
                    );
                });
            }
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
