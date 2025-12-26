// Утилита для работы с настройками приложения

export interface AppSettings {
  // Настройки подключения
  connection: {
    defaultPort: number
    defaultTimeout: number
    maxConcurrent: number
    keepAliveInterval: number
    reconnectAttempts: number
    reconnectDelayBase: number // базовая задержка между повторами (в секундах), умножается экспоненциально
    defaultAuthMethod: 'password' | 'key'
    defaultKeyPath: string
    defaultMode: 'single' | 'batch'
    compressionEnabled: boolean
    compressionLevel: number
    retryFailedHosts: boolean
    retryInterval: number // в секундах
    retryMaxAttempts: number // максимальное количество попыток (0 = бесконечно, до успешного выполнения)
  }
  
  // Настройки интерфейса
  interface: {
    fontSize: 'small' | 'medium' | 'large'
    density: 'compact' | 'comfortable' | 'spacious'
    showSidebarByDefault: boolean
    theme: 'light' | 'dark' | 'auto'
    showTooltips: boolean
    animationsEnabled: boolean
    showDebugConsole: boolean
    showExecutionTimeEstimate: boolean // Показывать расчёт времени выполнения
  }
  
  // Настройки уведомлений
  notifications: {
    enabled: boolean
    showSuccess: boolean
    showErrors: boolean
    showWarnings: boolean
    soundEnabled: boolean
    onlyOnErrors: boolean
    duration: number // в миллисекундах
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  }
  
  // Настройки экспорта
  export: {
    defaultFormat: 'xlsx' | 'csv' | 'json'
    defaultPath: string
    includeHeaders: boolean
    dateFormat: string
    timeFormat: '12h' | '24h'
    autoOpenAfterExport: boolean
    // Настройки столбцов для экспорта
    columns: {
      host: boolean
      vehicleId: boolean
      status: boolean
      exitStatus: boolean
      stdout: boolean
      stderr: boolean
      timestamp: boolean
      command: boolean
    }
    // Порядок столбцов (массив ключей в порядке отображения)
    columnOrder: string[]
  }
  
  // Настройки производительности
  performance: {
    virtualizationBuffer: number
    itemsPerPage: number
    autoCleanupResults: boolean
    resultsRetentionDays: number
    maxResultsInMemory: number
    enableCaching: boolean
  }
  
  // Настройки безопасности
  security: {
    enableAudit: boolean
    autoEncryptPasswords: boolean
    sessionTimeout: number // в минутах
    autoLogout: boolean
    clearClipboardAfterUse: boolean
    passwordMinLength: number
    requirePasswordForSettings: boolean
    disableCommandValidation: boolean // Отключение валидации команд (опасно!)
  }
  
  // Настройки журнала аудита
  audit: {
    logLevel: 'error' | 'warn' | 'info' | 'debug'
    retentionDays: number
    autoRotate: boolean
    maxLogFileSize: number // в МБ
    logFormat: 'json' | 'text'
  }
  
  // Настройки команд
  commands: {
    saveHistory: boolean
    maxHistorySize: number
    showSuggestions: boolean
    autoComplete: boolean
    favoriteCommands: string[]
  }
  
  // Настройки хостов
  hosts: {
    autoSave: boolean
    groupByTags: boolean
    showColors: boolean
    defaultGroup: string
    autoRefresh: boolean
    refreshInterval: number // в секундах
  }
  
  // Общие настройки
  general: {
    startMinimized: boolean
    minimizeToTray: boolean
    closeToTray: boolean
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  connection: {
    defaultPort: 22,
    defaultTimeout: 10, // Уменьшено с 30 до 10 секунд для быстрой обратной связи
    maxConcurrent: 50,
    keepAliveInterval: 60,
    reconnectAttempts: 3,
    reconnectDelayBase: 1, // Базовая задержка 1 сек, экспоненциально: 1s, 2s, 4s...
    defaultAuthMethod: 'password',
    defaultKeyPath: '',
    defaultMode: 'single',
    compressionEnabled: false,
    compressionLevel: 6,
    retryFailedHosts: false,
    retryInterval: 30, // 30 секунд по умолчанию
    retryMaxAttempts: 0, // 0 = бесконечно, до успешного выполнения
  },
  interface: {
    fontSize: 'medium',
    density: 'comfortable',
    showSidebarByDefault: true,
    theme: 'light',
    showTooltips: true,
    animationsEnabled: true,
    showDebugConsole: false,
    showExecutionTimeEstimate: true, // По умолчанию включено
  },
  notifications: {
    enabled: true,
    showSuccess: true,
    showErrors: true,
    showWarnings: true,
    soundEnabled: false,
    onlyOnErrors: false,
    duration: 3000,
    position: 'top-right',
  },
  export: {
    defaultFormat: 'xlsx',
    defaultPath: '',
    includeHeaders: true,
    dateFormat: 'DD.MM.YYYY',
    timeFormat: '24h',
    autoOpenAfterExport: false,
    columns: {
      host: true, // Хост - всегда включен по умолчанию
      vehicleId: true,
      status: true,
      exitStatus: true,
      stdout: true,
      stderr: true,
      timestamp: false, // Время выполнения - по умолчанию выключено
      command: false, // Команда - по умолчанию выключено (может быть не доступно)
    },
    columnOrder: ['host', 'vehicleId', 'status', 'exitStatus', 'stdout', 'stderr'], // Порядок столбцов по умолчанию
  },
  performance: {
    virtualizationBuffer: 15,
    itemsPerPage: 100,
    autoCleanupResults: true,
    resultsRetentionDays: 7,
    maxResultsInMemory: 10000, // Поддержка 5000+ хостов
    enableCaching: true,
  },
  security: {
    enableAudit: true,
    autoEncryptPasswords: false,
    sessionTimeout: 60,
    autoLogout: false,
    clearClipboardAfterUse: false,
    passwordMinLength: 8,
    requirePasswordForSettings: false,
    disableCommandValidation: false, // По умолчанию валидация включена
  },
  audit: {
    logLevel: 'info',
    retentionDays: 30,
    autoRotate: true,
    maxLogFileSize: 100,
    logFormat: 'json',
  },
  commands: {
    saveHistory: true,
    maxHistorySize: 100,
    showSuggestions: true,
    autoComplete: true,
    favoriteCommands: [],
  },
  hosts: {
    autoSave: true,
    groupByTags: false,
    showColors: true,
    defaultGroup: 'default',
    autoRefresh: false,
    refreshInterval: 300,
  },
  general: {
    startMinimized: false,
    minimizeToTray: true,
    closeToTray: false,
  },
}

const SETTINGS_KEY = 'ssh-executor-settings'

export function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // Мерджим с дефолтными настройками для обратной совместимости
      return deepMerge(DEFAULT_SETTINGS, parsed)
    }
  } catch (error) {
    // Откладываем console.error чтобы не вызывать setState во время рендеринга
    queueMicrotask(() => {
      console.error('Ошибка загрузки настроек:', error)
    })
  }
  return DEFAULT_SETTINGS
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    // Уведомляем об изменении настроек
    window.dispatchEvent(new Event('settings-changed'))
  } catch (error) {
    console.error('Ошибка сохранения настроек:', error)
    throw error
  }
}

export function resetSettings(): AppSettings {
  saveSettings(DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}

function deepMerge(target: any, source: any): any {
  const output = { ...target }
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] })
        } else {
          output[key] = deepMerge(target[key], source[key])
        }
      } else {
        Object.assign(output, { [key]: source[key] })
      }
    })
  }
  return output
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item)
}

export function getSetting<T>(settings: AppSettings, path: string): T | undefined {
  const keys = path.split('.')
  let value: any = settings
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    } else {
      return undefined
    }
  }
  return value as T
}

export function setSetting(settings: AppSettings, path: string, value: any): AppSettings {
  const keys = path.split('.')
  const newSettings = { ...settings }
  let current: any = newSettings
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!(key in current) || !isObject(current[key])) {
      current[key] = {}
    }
    current = current[key]
  }
  
  current[keys[keys.length - 1]] = value
  return newSettings
}
