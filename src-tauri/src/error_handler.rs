use crate::error::AppError;
use log::error;
use std::panic;

pub fn setup_error_handling() {
    // Обработка паник
    panic::set_hook(Box::new(|panic_info| {
        error!("Panic occurred: {:?}", panic_info);
        
        // В production можно отправить отчет об ошибке
        // Например, через Sentry или другой сервис
    }));
}

#[allow(dead_code)]
pub fn log_error(error: &AppError, context: &str) {
    error!("Error in {}: {}", context, error);
    
    // Здесь можно добавить отправку ошибок на сервер
    // для crash reporting
}
