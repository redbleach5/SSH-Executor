use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("SSH ошибка: {0}")]
    SshError(String),
    
    #[error("Ошибка файла: {0}")]
    FileError(String),
    
    #[error("Ошибка парсинга: {0}")]
    ParseError(String),
    
    #[error("Ошибка безопасности: {0}")]
    SecurityError(String),
    
    #[error("Ошибка подключения: {0}")]
    ConnectionError(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
