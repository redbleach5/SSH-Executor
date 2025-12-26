import { useState, useEffect, useRef } from 'react'
import { loadSettings, type AppSettings } from './settings'

// Хук для реактивной загрузки настроек
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const settingsRef = useRef(settings)

  // Обновляем ref при изменении settings
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  // Слушаем изменения в localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      setSettings(loadSettings())
    }

    const handleSettingsChanged = () => {
      setSettings(loadSettings())
    }

    // Слушаем события изменения localStorage (для других вкладок)
    window.addEventListener('storage', handleStorageChange)
    
    // Слушаем кастомное событие (для той же вкладки)
    window.addEventListener('settings-changed', handleSettingsChanged)
    
    // Также проверяем изменения через интервал (fallback)
    const interval = setInterval(() => {
      const newSettings = loadSettings()
      // Простое сравнение через JSON для обнаружения изменений
      if (JSON.stringify(newSettings) !== JSON.stringify(settingsRef.current)) {
        setSettings(newSettings)
      }
    }, 500) // Проверяем каждые 500мс

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('settings-changed', handleSettingsChanged)
      clearInterval(interval)
    }
  }, [])

  return settings
}
