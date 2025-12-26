// Утилита для управления таймером сессии

import { loadSettings } from './settings'

let sessionTimer: NodeJS.Timeout | null = null
let lastActivityTime: number = Date.now()
let onTimeoutCallback: (() => void) | null = null

/**
 * Обновляет время последней активности
 */
export function updateActivityTime(): void {
  lastActivityTime = Date.now()
}

/**
 * Запускает таймер сессии
 */
export function startSessionTimer(onTimeout: () => void): void {
  onTimeoutCallback = onTimeout
  resetSessionTimer()
  
  // Отслеживаем активность пользователя
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
  events.forEach(event => {
    document.addEventListener(event, updateActivityTime, true)
  })
}

/**
 * Сбрасывает таймер сессии
 */
export function resetSessionTimer(): void {
  if (sessionTimer) {
    clearTimeout(sessionTimer)
  }
  
  const settings = loadSettings()
  if (!settings.security.autoLogout || settings.security.sessionTimeout <= 0) {
    return
  }
  
  const timeoutMs = settings.security.sessionTimeout * 60 * 1000 // Конвертируем минуты в миллисекунды
  
  sessionTimer = setTimeout(() => {
    const now = Date.now()
    const timeSinceLastActivity = now - lastActivityTime
    
    // Проверяем, действительно ли прошло достаточно времени с последней активности
    if (timeSinceLastActivity >= timeoutMs) {
      if (onTimeoutCallback) {
        onTimeoutCallback()
      }
    } else {
      // Если активность была недавно, перезапускаем таймер
      resetSessionTimer()
    }
  }, timeoutMs)
}

/**
 * Останавливает таймер сессии
 */
export function stopSessionTimer(): void {
  if (sessionTimer) {
    clearTimeout(sessionTimer)
    sessionTimer = null
  }
  
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
  events.forEach(event => {
    document.removeEventListener(event, updateActivityTime, true)
  })
}
