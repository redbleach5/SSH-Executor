// Утилита для работы с буфером обмена

import { loadSettings } from './settings'

/**
 * Копирует текст в буфер обмена и очищает его через заданное время, если включена настройка
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    
    const settings = loadSettings()
    if (settings.security.clearClipboardAfterUse) {
      // Очищаем буфер обмена через 30 секунд
      setTimeout(async () => {
        try {
          await navigator.clipboard.writeText('')
        } catch (e) {
          // Игнорируем ошибки очистки
          console.warn('Failed to clear clipboard:', e)
        }
      }, 30000) // 30 секунд
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    throw error
  }
}

/**
 * Очищает буфер обмена
 */
export async function clearClipboard(): Promise<void> {
  try {
    await navigator.clipboard.writeText('')
  } catch (error) {
    console.error('Failed to clear clipboard:', error)
    throw error
  }
}
