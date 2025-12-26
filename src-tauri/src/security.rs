use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use zeroize::{Zeroize, ZeroizeOnDrop};
use log::{error, warn, info};
use std::path::PathBuf;
use std::fs;

static ENCRYPTION_KEY: Mutex<Option<Key<Aes256Gcm>>> = Mutex::new(None);
static KEY_FILE_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Инициализирует систему шифрования с сохранением ключа между сессиями
/// Ключ сохраняется в app_data_dir для постоянного хранения
pub fn init_encryption(app_data_dir: Option<PathBuf>) {
    let key = if let Some(app_dir) = app_data_dir {
        // Сохраняем путь к файлу ключа
        if let Ok(mut guard) = KEY_FILE_PATH.lock() {
            *guard = Some(app_dir.join("encryption.key"));
        }
        
        // Пытаемся загрузить существующий ключ
        load_encryption_key().unwrap_or_else(|| {
            // Если ключ не найден, генерируем новый
            info!("Generating new encryption key");
            let new_key = Aes256Gcm::generate_key(&mut OsRng);
            // Сохраняем новый ключ
            if let Err(e) = save_encryption_key(&new_key) {
                error!("Failed to save encryption key: {}", e);
            }
            new_key
        })
    } else {
        // Если нет app_data_dir, генерируем временный ключ (не будет работать между сессиями)
        warn!("No app_data_dir provided, using temporary encryption key (won't persist between sessions)");
        Aes256Gcm::generate_key(&mut OsRng)
    };
    
    let mut key_guard = ENCRYPTION_KEY.lock().unwrap_or_else(|e| {
        error!("Failed to lock encryption key mutex: {}", e);
        e.into_inner()
    });
    *key_guard = Some(key);
}

/// Загружает ключ шифрования из файла
fn load_encryption_key() -> Option<Key<Aes256Gcm>> {
    let key_path = KEY_FILE_PATH.lock().ok()?.as_ref()?.clone();
    
    // Читаем ключ из файла
    let key_bytes = fs::read(&key_path).ok()?;
    
    // Проверяем размер ключа (AES-256 требует 32 байта)
    if key_bytes.len() != 32 {
        error!("Invalid encryption key size: {} bytes (expected 32)", key_bytes.len());
        return None;
    }
    
    // Конвертируем байты в Key
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes).clone();
    
    info!("Encryption key loaded from file");
    Some(key)
}

/// Сохраняет ключ шифрования в файл
fn save_encryption_key(key: &Key<Aes256Gcm>) -> Result<(), String> {
    let key_path = KEY_FILE_PATH.lock()
        .map_err(|e| format!("Failed to lock key file path mutex: {}", e))?
        .as_ref()
        .ok_or("Key file path not set")?
        .clone();
    
    // Создаем директорию если не существует
    if let Some(parent) = key_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create encryption key directory: {}", e))?;
    }
    
    // Записываем ключ в файл
    // На Windows файл автоматически имеет ограниченные права доступа
    fs::write(&key_path, key.as_slice())
        .map_err(|e| format!("Failed to write encryption key to file: {}", e))?;
    
    // На Unix-системах устанавливаем права доступа только для владельца
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&key_path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o600); // rw------- только для владельца
        fs::set_permissions(&key_path, perms)
            .map_err(|e| format!("Failed to set file permissions: {}", e))?;
    }
    
    info!("Encryption key saved to file");
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, ZeroizeOnDrop, Clone)]
pub struct EncryptedData {
    ciphertext: Vec<u8>,
    nonce: Vec<u8>,
}

impl EncryptedData {
    /// Создает пустой EncryptedData (для ошибок)
    pub fn empty() -> Self {
        Self {
            ciphertext: vec![],
            nonce: vec![],
        }
    }
}

/// Шифрует пароль для безопасного хранения
pub fn encrypt_password(password: &str) -> Result<EncryptedData, String> {
    let key_guard = ENCRYPTION_KEY.lock().map_err(|e| {
        error!("Failed to lock encryption key mutex: {}", e);
        "Encryption key mutex poisoned".to_string()
    })?;
    
    let key = key_guard.as_ref().ok_or("Encryption not initialized")?;
    let cipher = Aes256Gcm::new(key);
    
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, password.as_bytes())
        .map_err(|e| format!("Encryption error: {}", e))?;
    
    Ok(EncryptedData {
        ciphertext,
        nonce: nonce.to_vec(),
    })
}

/// Расшифровывает пароль для использования
/// ВАЖНО: Результат должен быть очищен после использования через zeroize
pub fn decrypt_password(encrypted: &EncryptedData) -> Result<ZeroizingString, String> {
    let key_guard = ENCRYPTION_KEY.lock().map_err(|e| {
        error!("Failed to lock encryption key mutex: {}", e);
        "Encryption key mutex poisoned".to_string()
    })?;
    
    let key = key_guard.as_ref().ok_or("Encryption not initialized")?;
    let cipher = Aes256Gcm::new(key);
    
    let nonce = Nonce::from_slice(&encrypted.nonce);
    let plaintext = cipher
        .decrypt(nonce, encrypted.ciphertext.as_ref())
        .map_err(|e| format!("Decryption error: {}", e))?;
    
    let password = String::from_utf8(plaintext)
        .map_err(|e| format!("UTF-8 error: {}", e))?;
    
    Ok(ZeroizingString(password))
}

/// Строка, которая автоматически очищается при удалении
#[derive(Clone)]
pub struct ZeroizingString(String);

impl ZeroizingString {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Zeroize for ZeroizingString {
    fn zeroize(&mut self) {
        unsafe {
            use std::ptr;
            let vec = self.0.as_mut_vec();
            ptr::write_bytes(vec.as_mut_ptr(), 0, vec.len());
        }
        self.0.clear();
    }
}

impl Drop for ZeroizingString {
    fn drop(&mut self) {
        self.zeroize();
    }
}

/// Хеширует пароль для безопасного хранения (для паролей настроек)
/// Использует bcrypt с автоматической генерацией соли
pub fn hash_password(password: &str) -> Result<String, String> {
    bcrypt::hash(password, bcrypt::DEFAULT_COST)
        .map_err(|e| format!("Failed to hash password: {}", e))
}

/// Проверяет пароль против хеша
pub fn verify_password(password: &str, hash: &str) -> Result<bool, String> {
    bcrypt::verify(password, hash)
        .map_err(|e| format!("Failed to verify password: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_encryption() {
        // Для тестов используем None (временный ключ)
        init_encryption(None);
        let password = "test_password_123";
        let encrypted = encrypt_password(password).unwrap();
        let decrypted = decrypt_password(&encrypted).unwrap();
        assert_eq!(password, decrypted.as_str());
    }
}
