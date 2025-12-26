// Утилита для уведомлений с учетом настроек

import toast from 'react-hot-toast'
import { loadSettings } from './settings'

// Глобальный AudioContext для переиспользования
let audioContext: AudioContext | null = null

// Инициализирует AudioContext (требуется пользовательское взаимодействие)
function initAudioContext(): AudioContext | null {
  if (audioContext) {
    return audioContext
  }
  
  try {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    return audioContext
  } catch (e) {
    console.warn('Failed to create AudioContext:', e)
    return null
  }
}

// Генерирует звуковой сигнал через Web Audio API
function playSound(frequency: number, duration: number, volume: number = 0.3): void {
  const ctx = initAudioContext()
  
  if (!ctx) {
    // Если AudioContext не доступен, пытаемся использовать HTML5 Audio
    try {
      // Создаем простой звуковой сигнал через data URI (тишина, но может сработать)
      const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=')
      audio.volume = volume
      audio.play().catch(() => {})
    } catch (err) {
      console.warn('Failed to play sound:', err)
    }
    return
  }

  try {
    // Проверяем состояние AudioContext (может быть suspended из-за autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        playSoundInternal(ctx, frequency, duration, volume)
      }).catch((e) => {
        console.warn('Failed to resume AudioContext:', e)
      })
    } else {
      playSoundInternal(ctx, frequency, duration, volume)
    }
  } catch (e) {
    console.warn('Failed to play sound:', e)
  }
}

// Внутренняя функция для воспроизведения звука
function playSoundInternal(ctx: AudioContext, frequency: number, duration: number, volume: number): void {
  try {
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.frequency.value = frequency
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0, ctx.currentTime)
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + duration)
  } catch (e) {
    console.warn('Failed to create oscillator:', e)
  }
}

/**
 * Показывает уведомление об успехе с учетом настроек
 */
export function showSuccessToast(message: string): void {
  const settings = loadSettings()
  
  if (!settings.notifications.enabled) return
  if (settings.notifications.onlyOnErrors) return
  if (!settings.notifications.showSuccess) return
  
  toast.success(message, {
    duration: settings.notifications.duration,
    position: settings.notifications.position,
  })
  
  // Звуковое уведомление (если включено) - приятный высокий звук для успеха
  if (settings.notifications.soundEnabled) {
    playSound(800, 0.15, 0.2)
  }
}

/**
 * Показывает уведомление об ошибке с учетом настроек
 */
export function showErrorToast(message: string): void {
  const settings = loadSettings()
  
  if (!settings.notifications.enabled) return
  if (!settings.notifications.showErrors) return
  
  toast.error(message, {
    duration: settings.notifications.duration,
    position: settings.notifications.position,
  })
  
  // Звуковое уведомление (если включено) - низкий предупреждающий звук для ошибки
  if (settings.notifications.soundEnabled) {
    playSound(300, 0.2, 0.4)
    // Добавляем второй короткий сигнал для более заметного звука
    setTimeout(() => playSound(250, 0.15, 0.3), 100)
  }
}

/**
 * Показывает уведомление-предупреждение с учетом настроек
 */
export function showWarningToast(message: string): void {
  const settings = loadSettings()
  
  if (!settings.notifications.enabled) return
  if (settings.notifications.onlyOnErrors) return
  if (!settings.notifications.showWarnings) return
  
  toast(message, {
    icon: '⚠️',
    duration: settings.notifications.duration,
    position: settings.notifications.position,
    style: {
      backgroundColor: '#f59e0b',
      color: '#fff',
    },
  })
  
  // Звуковое уведомление (если включено) - средний тон для предупреждения
  if (settings.notifications.soundEnabled) {
    playSound(500, 0.18, 0.25)
  }
}

/**
 * Показывает критическое предупреждение (всегда показывается, дольше висит)
 */
export function showCriticalWarningToast(title: string, message: string): void {
  const settings = loadSettings()
  
  // Критические предупреждения показываются всегда, если уведомления включены
  if (!settings.notifications.enabled) return
  
  toast(`${title}\n\n${message}`, {
    icon: '🚨',
    duration: 8000, // 8 секунд
    position: settings.notifications.position,
    style: {
      backgroundColor: '#dc2626',
      color: '#fff',
      padding: '12px 16px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
      maxWidth: '400px',
      lineHeight: '1.4',
    },
  })
  
  // Двойной звуковой сигнал для критического предупреждения
  if (settings.notifications.soundEnabled) {
    playSound(400, 0.25, 0.4)
    setTimeout(() => playSound(350, 0.25, 0.4), 150)
    setTimeout(() => playSound(300, 0.3, 0.5), 350)
  }
}

/**
 * Показывает информационное уведомление с учетом настроек
 */
export function showInfoToast(message: string): void {
  const settings = loadSettings()
  
  if (!settings.notifications.enabled) return
  if (settings.notifications.onlyOnErrors) return
  
  toast(message, {
    duration: settings.notifications.duration,
    position: settings.notifications.position,
  })
}
