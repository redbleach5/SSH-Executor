import { useState, useEffect } from 'react'
import { showSuccessToast, showErrorToast, showWarningToast } from '../utils/toast'
import ToggleSwitch from '../components/ToggleSwitch'
import SegmentedControl from '../components/SegmentedControl'
import {
  KeyIcon,
  LockIcon,
  BellIcon,
  ServerIcon,
  SettingsIcon,
  DownloadIcon,
  ActivityIcon,
  FileTextIcon,
  TerminalIcon,
  UserIcon,
  UsersIcon,
  TrendingUpIcon,
  XIcon,
  InfoIcon,
  ChevronRightIcon,
} from '../components/icons'
import { loadSettings, saveSettings, resetSettings, type AppSettings } from '../utils/settings'
import HelpTooltip from '../components/HelpTooltip'
import ConfirmDialog from '../components/ConfirmDialog'
import { invoke } from '@tauri-apps/api/tauri'

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [activeTab, setActiveTab] = useState<string>(() => {
    return localStorage.getItem('ssh-executor-settings-tab') || 'connection'
  })

  // Сохраняем текущую вкладку настроек
  useEffect(() => {
    localStorage.setItem('ssh-executor-settings-tab', activeTab)
  }, [activeTab])

  // Синхронизация настроек при изменении извне
  useEffect(() => {
    const handleSettingsChanged = () => {
      setSettings(loadSettings())
    }
    
    window.addEventListener('settings-changed', handleSettingsChanged)
    
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChanged)
    }
  }, [])
  
  // Обновляем состояние при изменении настроек извне (например, из другой вкладки)
  useEffect(() => {
    const interval = setInterval(() => {
      const currentSettings = loadSettings()
      if (JSON.stringify(currentSettings) !== JSON.stringify(settings)) {
        setSettings(currentSettings)
      }
    }, 500)
    
    return () => clearInterval(interval)
  }, [settings])

  // Синхронизация настроек аудита с Rust
  const syncAuditSettings = async (currentSettings: AppSettings) => {
    try {
      await invoke('update_audit_settings', {
        logLevel: currentSettings.audit.logLevel,
        retentionDays: currentSettings.audit.retentionDays,
        autoRotate: currentSettings.audit.autoRotate,
        maxLogFileSize: currentSettings.audit.maxLogFileSize,
        logFormat: currentSettings.audit.logFormat,
        enableAudit: currentSettings.security.enableAudit,
      })
    } catch (error) {
      console.error('Ошибка синхронизации настроек аудита:', error)
    }
  }

  // Синхронизация настроек аудита при загрузке
  useEffect(() => {
    syncAuditSettings(settings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Только при монтировании

  // Валидация числовых значений
  const validateNumber = (value: string, min: number, max: number, defaultValue: number): number => {
    const num = parseInt(value, 10)
    if (isNaN(num)) return defaultValue
    return Math.max(min, Math.min(max, num))
  }

  const handleReset = () => {
    setShowResetConfirm(true)
  }

  const confirmReset = () => {
    setShowResetConfirm(false)
    const defaultSettings = resetSettings()
    setSettings(defaultSettings)
    // Уведомляем об изменении
    window.dispatchEvent(new Event('settings-changed'))
    showSuccessToast('Настройки сброшены')
  }

  const confirmClearFavorites = () => {
    setShowClearFavoritesConfirm(false)
    const currentSettings = loadSettings()
    saveSettings({
      ...currentSettings,
      commands: {
        ...currentSettings.commands,
        favoriteCommands: [],
      },
    })
    window.dispatchEvent(new Event('settings-changed'))
    showSuccessToast('Все избранные команды удалены')
  }

  const [settingsPassword, setSettingsPassword] = useState<string>('')
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [pendingUpdate, setPendingUpdate] = useState<{ category: keyof AppSettings; key: string; value: unknown } | null>(null)
  const [showAbout, setShowAbout] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showClearFavoritesConfirm, setShowClearFavoritesConfirm] = useState(false)

  const updateSetting = <K extends keyof AppSettings>(
    category: K,
    key: keyof AppSettings[K],
    value: any
  ) => {
    const currentSettings = loadSettings()
    
    // Проверяем, требуется ли пароль для изменения настроек
    if (currentSettings.security.requirePasswordForSettings) {
      setPendingUpdate({ category, key: String(key), value })
      setShowPasswordPrompt(true)
      return
    }
    
    performUpdate(category, key, value)
  }

  const performUpdate = <K extends keyof AppSettings>(
    category: K,
    key: keyof AppSettings[K],
    value: unknown
  ) => {
    performUpdateRaw(category, key as string, value)
  }

  // Версия без строгой типизации для использования с pendingUpdate
  const performUpdateRaw = (
    category: keyof AppSettings,
    key: string,
    value: unknown
  ) => {
    setSettings((prev) => {
      const newSettings = {
        ...prev,
        [category]: {
          ...(prev[category] as Record<string, unknown>),
          [key]: value,
        },
      }
      // Применяем все настройки сразу при изменении
      const currentSettings = loadSettings()
      const updatedSettings = {
        ...currentSettings,
        [category]: newSettings[category],
      }
      saveSettings(updatedSettings as AppSettings)
      // Уведомляем об изменении
      window.dispatchEvent(new Event('settings-changed'))
      
      // Синхронизируем настройки аудита с Rust
      if (category === 'audit' || category === 'security') {
        syncAuditSettings(updatedSettings as AppSettings)
      }
      return newSettings
    })
  }

  const handlePasswordSubmit = async () => {
    try {
      const storedPassword = localStorage.getItem('settings-password-hash')
      
      if (!storedPassword) {
        // Первый раз - сохраняем хеш пароля
        const hash = await invoke<string>('hash_settings_password', {
          password: settingsPassword
        })
        localStorage.setItem('settings-password-hash', hash)
        if (pendingUpdate) {
          performUpdateRaw(pendingUpdate.category, pendingUpdate.key, pendingUpdate.value)
          setPendingUpdate(null)
        }
        setShowPasswordPrompt(false)
        setSettingsPassword('')
        showSuccessToast('Пароль установлен')
      } else {
        // Проверяем пароль против сохраненного хеша
        const isValid = await invoke<boolean>('verify_settings_password', {
          password: settingsPassword,
          hash: storedPassword
        })
        
        if (isValid) {
          if (pendingUpdate) {
            performUpdateRaw(pendingUpdate.category, pendingUpdate.key, pendingUpdate.value)
            setPendingUpdate(null)
          }
          setShowPasswordPrompt(false)
          setSettingsPassword('')
          showSuccessToast('Пароль подтвержден')
        } else {
          showErrorToast('Неверный пароль')
          setSettingsPassword('')
        }
      }
    } catch (error) {
      console.error('Ошибка при работе с паролем:', error)
      showErrorToast('Ошибка при проверке пароля')
      setSettingsPassword('')
    }
  }

  const tabs = [
    { id: 'connection', label: 'Подключение', icon: ServerIcon },
    { id: 'interface', label: 'Интерфейс', icon: SettingsIcon },
    { id: 'notifications', label: 'Уведомления', icon: BellIcon },
    { id: 'export', label: 'Экспорт', icon: DownloadIcon },
    { id: 'performance', label: 'Производительность', icon: ActivityIcon },
    { id: 'security', label: 'Безопасность', icon: LockIcon },
    { id: 'audit', label: 'Журнал', icon: FileTextIcon },
    { id: 'commands', label: 'Команды', icon: TerminalIcon },
    { id: 'hosts', label: 'Хосты', icon: UsersIcon },
    { id: 'general', label: 'Общие', icon: TrendingUpIcon },
  ]

  return (
    <div className="space-y-3">
      {/* Header - компактный */}
      <div className="card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-button border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
              <span style={{ color: 'var(--text-secondary)' }}><SettingsIcon className="w-4 h-4" /></span>
            </div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Настройки</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAbout(true)}
              className="btn-secondary px-3 py-1.5 text-sm"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-primary)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <InfoIcon className="w-3.5 h-3.5" />
              О программе
            </button>
            <button
              onClick={handleReset}
              className="btn-secondary px-3 py-1.5 text-sm"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-primary)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <XIcon className="w-3.5 h-3.5" />
              Сбросить
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Sidebar with tabs */}
        <div className="w-52 flex-shrink-0">
          <div className="card p-2">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded transition-all duration-150"
                    style={{
                      backgroundColor: isActive ? 'var(--bg-active)' : 'transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium text-sm">{tab.label}</span>
                  </button>
                )
              })}
            </nav>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1">
          {/* Connection Settings */}
          {activeTab === 'connection' && (
            <div className="space-y-3">
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ color: 'var(--text-tertiary)' }}><KeyIcon className="w-4 h-4" /></span>
                  <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Подключение
                  </h2>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <HelpTooltip text="Номер порта по умолчанию (обычно 22)." />
                      Порт
                    </label>
                    <input
                      type="number"
                      value={settings.connection.defaultPort}
                      onChange={(e) =>
                        updateSetting('connection', 'defaultPort', validateNumber(e.target.value, 1, 65535, 22))
                      }
                      className="input-modern"
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <HelpTooltip text="Время ожидания подключения к хосту. При недоступном хосте каждая попытка будет ждать это время. Рекомендуется 5-10 сек для быстрой обратной связи." />
                      Таймаут (сек)
                    </label>
                    <input
                      type="number"
                      value={settings.connection.defaultTimeout}
                      onChange={(e) =>
                        updateSetting('connection', 'defaultTimeout', validateNumber(e.target.value, 1, 300, 10))
                      }
                      className="input-modern"
                      min="1"
                      max="300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <HelpTooltip text="Сколько команд выполнять одновременно. Рекомендуется 50." />
                      Потоков
                    </label>
                    <input
                      type="number"
                      value={settings.connection.maxConcurrent}
                      onChange={(e) =>
                        updateSetting('connection', 'maxConcurrent', validateNumber(e.target.value, 1, 500, 50))
                      }
                      className="input-modern"
                      min="1"
                      max="500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <HelpTooltip text="Как часто отправлять сигнал для поддержания соединения. Предотвращает разрыв связи при длительном выполнении команд или неактивности." />
                      Пинг соединения
                    </label>
                    <input
                      type="number"
                      value={settings.connection.keepAliveInterval}
                      onChange={(e) =>
                        updateSetting('connection', 'keepAliveInterval', validateNumber(e.target.value, 10, 600, 60))
                      }
                      className="input-modern"
                      min="10"
                      max="600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <HelpTooltip text="Количество повторных попыток подключения при ошибке. Каждая попытка увеличивает время ожидания. При 3 попытках и таймауте 10с: худший случай ~33с на недоступный хост. Установите 0-1 для быстрого выполнения." />
                      Реконнект
                    </label>
                    <input
                      type="number"
                      value={settings.connection.reconnectAttempts}
                      onChange={(e) =>
                        updateSetting('connection', 'reconnectAttempts', validateNumber(e.target.value, 0, 10, 3))
                      }
                      className="input-modern"
                      min="0"
                      max="10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <HelpTooltip text="Базовая задержка между повторными попытками (в секундах). Умножается экспоненциально: при значении 1 задержки будут 1с, 2с, 4с... При значении 0.5: 0.5с, 1с, 2с..." />
                      Задержка (сек)
                    </label>
                    <input
                      type="number"
                      value={settings.connection.reconnectDelayBase}
                      onChange={(e) =>
                        updateSetting('connection', 'reconnectDelayBase', validateNumber(e.target.value, 0.1, 10, 1))
                      }
                      className="input-modern"
                      min="0.1"
                      max="10"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <HelpTooltip text="Способ входа на удаленный компьютер по умолчанию. Пароль - вводите каждый раз. Ключ - использует файл ключа для автоматического входа, безопаснее." />
                      Метод аутентификации
                    </label>
                    <SegmentedControl
                      options={[
                        { value: 'password', label: 'Пароль' },
                        { value: 'key', label: 'SSH ключ' },
                      ]}
                      value={settings.connection.defaultAuthMethod}
                      onChange={(value) =>
                        updateSetting('connection', 'defaultAuthMethod', value)
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <HelpTooltip text="Режим выполнения команд по умолчанию." />
                      Режим по умолчанию
                    </label>
                    <SegmentedControl
                      options={[
                        { value: 'single', label: 'Одиночное', icon: UserIcon },
                        { value: 'batch', label: 'Пакетное', icon: UsersIcon },
                      ]}
                      value={settings.connection.defaultMode}
                      onChange={(value) =>
                        updateSetting('connection', 'defaultMode', value)
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <HelpTooltip text="Путь к файлу приватного ключа SSH." />
                      Путь к SSH ключу
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={settings.connection.defaultKeyPath}
                        onChange={(e) =>
                          updateSetting('connection', 'defaultKeyPath', e.target.value)
                        }
                        className="flex-1 input-modern"
                        placeholder="C:\Users\...\.ssh\id_rsa"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const { open } = await import('@tauri-apps/api/dialog')
                            const filePath = await open({
                              multiple: false,
                            })
                            if (filePath && typeof filePath === 'string') {
                              updateSetting('connection', 'defaultKeyPath', filePath)
                            }
                          } catch (error) {
                            showErrorToast(`Ошибка выбора файла: ${String(error)}`)
                          }
                        }}
                        className="btn-secondary px-3"
                        style={{ 
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                          e.currentTarget.style.color = 'var(--text-primary)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-primary)'
                          e.currentTarget.style.color = 'var(--text-secondary)'
                        }}
                      >
                        <FileTextIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <HelpTooltip text="Сжимать данные при передаче. Уменьшает объем передаваемых данных, но требует больше ресурсов компьютера. Включите при медленном интернете." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Включить сжатие
                          </p>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          Использовать сжатие данных при передаче
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={settings.connection.compressionEnabled}
                        onChange={(checked) =>
                          updateSetting('connection', 'compressionEnabled', checked)
                        }
                      />
                    </div>
                  </div>
                  {settings.connection.compressionEnabled && (
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                        <HelpTooltip text="Уровень сжатия данных (1-9)." />
                        Уровень сжатия
                      </label>
                      <input
                        type="number"
                        value={settings.connection.compressionLevel}
                        onChange={(e) =>
                          updateSetting('connection', 'compressionLevel', validateNumber(e.target.value, 1, 9, 6))
                        }
                        className="input-modern"
                        min="1"
                        max="9"
                      />
                    </div>
                  )}
                  <div className="col-span-2">
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <HelpTooltip text="Автоматически повторять подключение к хостам, которые не ответили с первого раза. Повторные попытки выполняются только для временных ошибок (таймауты, проблемы с сетью, недоступность хоста). Ошибки аутентификации (неверный ключ, пароль, пользователь) не будут повторяться, так как они не исправятся при повторной попытке. Интервал между попытками: время ожидания в секундах перед следующей попыткой (рекомендуется 30-60 сек). Количество повторений: максимальное число попыток (0 = бесконечно, до успешного выполнения). Полезно при нестабильном интернете или временных проблемах с сетью." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Повторять попытки для недоступных хостов
                          </p>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          Автоматически повторять выполнение на недоступных хостах
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={settings.connection.retryFailedHosts}
                        onChange={(checked) =>
                          updateSetting('connection', 'retryFailedHosts', checked)
                        }
                      />
                    </div>
                  </div>
                  {settings.connection.retryFailedHosts && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                          Интервал между попытками
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={settings.connection.retryInterval}
                            onChange={(e) =>
                              updateSetting('connection', 'retryInterval', validateNumber(e.target.value, 5, 300, 30))
                            }
                            className="input-modern flex-1"
                            min="5"
                            max="300"
                          />
                          <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            сек
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                          Количество повторений
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={settings.connection.retryMaxAttempts === 0 ? '' : settings.connection.retryMaxAttempts}
                            onChange={(e) => {
                              const value = e.target.value === '' ? 0 : validateNumber(e.target.value, 0, 100, 0)
                              updateSetting('connection', 'retryMaxAttempts', value)
                            }}
                            className="input-modern flex-1"
                            min="0"
                            max="100"
                            placeholder="0 = бесконечно"
                          />
                          <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            {settings.connection.retryMaxAttempts === 0 ? 'до успеха' : 'раз'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Interface Settings */}
          {activeTab === 'interface' && (
            <div className="space-y-3">
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ color: 'var(--text-tertiary)' }}><KeyIcon className="w-4 h-4" /></span>
                  <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Настройки интерфейса</h2>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                        <HelpTooltip text="Размер текста в программе. Маленький - поместится больше информации, Большой - удобнее читать." />
                        Размер шрифта
                      </label>
                      <SegmentedControl
                        options={[
                          { value: 'small', label: 'Маленький' },
                          { value: 'medium', label: 'Средний' },
                          { value: 'large', label: 'Большой' },
                        ]}
                        value={settings.interface.fontSize}
                        onChange={(value) => updateSetting('interface', 'fontSize', value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                        <HelpTooltip text="Расстояние между элементами интерфейса. Компактная - больше помещается на экране, Просторная - удобнее для работы." />
                        Плотность отображения
                      </label>
                      <SegmentedControl
                        options={[
                          { value: 'compact', label: 'Компактная' },
                          { value: 'comfortable', label: 'Комфортная' },
                          { value: 'spacious', label: 'Просторная' },
                        ]}
                        value={settings.interface.density}
                        onChange={(value) => updateSetting('interface', 'density', value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                        <HelpTooltip text="Тема оформления интерфейса." />
                        Тема
                      </label>
                      <SegmentedControl
                        options={[
                          { value: 'light', label: 'Светлая' },
                          { value: 'dark', label: 'Темная' },
                          { value: 'auto', label: 'Авто' },
                        ]}
                        value={settings.interface.theme}
                        onChange={(value) => updateSetting('interface', 'theme', value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <HelpTooltip text="Показывать боковое меню при запуске." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Показывать боковую панель
                          </p>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          Боковая панель будет открыта при запуске приложения
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={settings.interface.showSidebarByDefault}
                        onChange={(checked) =>
                          updateSetting('interface', 'showSidebarByDefault', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <HelpTooltip text="Показывать подсказки при наведении." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Показывать подсказки
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.interface.showTooltips}
                        onChange={(checked) =>
                          updateSetting('interface', 'showTooltips', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <HelpTooltip text="Плавные переходы и анимации интерфейса." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Включить анимации
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.interface.animationsEnabled}
                        onChange={(checked) =>
                          updateSetting('interface', 'animationsEnabled', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <HelpTooltip text="Debug консоль для просмотра логов." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Debug консоль
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.interface.showDebugConsole}
                        onChange={(checked) =>
                          updateSetting('interface', 'showDebugConsole', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <HelpTooltip text="Показывать расчёт ожидаемого времени выполнения команд на основе количества хостов и настроек подключения." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Расчёт времени выполнения
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.interface.showExecutionTimeEstimate}
                        onChange={(checked) =>
                          updateSetting('interface', 'showExecutionTimeEstimate', checked)
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notifications Settings */}
          {activeTab === 'notifications' && (
            <div className="space-y-3">
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ color: 'var(--text-tertiary)' }}><BellIcon className="w-4 h-4" /></span>
                  <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Уведомления</h2>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Включить уведомления
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={settings.notifications.enabled}
                      onChange={(checked) =>
                        updateSetting('notifications', 'enabled', checked)
                      }
                    />
                  </div>
                  {settings.notifications.enabled && (
                    <>
                      <div className="flex items-center justify-between p-3 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <div className="flex items-center gap-1.5">
                          <HelpTooltip text="Показывать успешные операции." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Успешные операции
                          </p>
                        </div>
                        <ToggleSwitch
                          checked={settings.notifications.showSuccess}
                          onChange={(checked) =>
                            updateSetting('notifications', 'showSuccess', checked)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <div className="flex items-center gap-1.5">
                          <HelpTooltip text="Показывать ошибки выполнения." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Ошибки
                          </p>
                        </div>
                        <ToggleSwitch
                          checked={settings.notifications.showErrors}
                          onChange={(checked) =>
                            updateSetting('notifications', 'showErrors', checked)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <div className="flex items-center gap-1.5">
                          <HelpTooltip text="Показывать предупреждения." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Предупреждения
                          </p>
                        </div>
                        <ToggleSwitch
                          checked={settings.notifications.showWarnings}
                          onChange={(checked) =>
                            updateSetting('notifications', 'showWarnings', checked)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <div className="flex items-center gap-1.5">
                          <HelpTooltip text="Звуковые сигналы при уведомлениях." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Звуковые уведомления
                          </p>
                        </div>
                        <ToggleSwitch
                          checked={settings.notifications.soundEnabled}
                          onChange={(checked) =>
                            updateSetting('notifications', 'soundEnabled', checked)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <div className="flex items-center gap-1.5">
                          <HelpTooltip text="Только при ошибках выполнения." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Только при ошибках
                          </p>
                        </div>
                        <ToggleSwitch
                          checked={settings.notifications.onlyOnErrors}
                          onChange={(checked) =>
                            updateSetting('notifications', 'onlyOnErrors', checked)
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                          <HelpTooltip text="Длительность показа (мс)." />
                          Длительность (мс)
                        </label>
                        <input
                          type="number"
                          value={settings.notifications.duration}
                          onChange={(e) =>
                            updateSetting('notifications', 'duration', validateNumber(e.target.value, 1000, 10000, 3000))
                          }
                          className="input-modern"
                          min="1000"
                          max="10000"
                          step="500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                          <HelpTooltip text="Позиция уведомлений на экране." />
                          Позиция
                        </label>
                        <SegmentedControl
                          options={[
                            { value: 'top-left', label: '↖ Сверху' },
                            { value: 'top-right', label: '↗ Сверху' },
                            { value: 'bottom-left', label: '↙ Снизу' },
                            { value: 'bottom-right', label: '↘ Снизу' },
                          ]}
                          value={settings.notifications.position}
                          onChange={(value) =>
                            updateSetting('notifications', 'position', value)
                          }
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Export Settings */}
          {activeTab === 'export' && (
            <div className="space-y-3">
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ color: 'var(--text-tertiary)' }}><DownloadIcon className="w-4 h-4" /></span>
                  <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Настройки экспорта</h2>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                        <HelpTooltip text="В каком формате сохранять результаты. Excel - для открытия в Excel, CSV - для импорта в другие программы, JSON - для технических целей." />
                        Формат по умолчанию
                      </label>
                      <SegmentedControl
                        options={[
                          { value: 'xlsx', label: 'Excel' },
                          { value: 'csv', label: 'CSV' },
                          { value: 'json', label: 'JSON' },
                        ]}
                        value={settings.export.defaultFormat}
                        onChange={(value) => updateSetting('export', 'defaultFormat', value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <HelpTooltip text="Формат времени в сохраненных файлах. 12 часов - с AM/PM (например, 2:30 PM), 24 часа - обычный формат (например, 14:30)." />
                        Формат времени
                      </label>
                      <SegmentedControl
                        options={[
                          { value: '12h', label: '12 часов' },
                          { value: '24h', label: '24 часа' },
                        ]}
                        value={settings.export.timeFormat}
                        onChange={(value) => updateSetting('export', 'timeFormat', value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <HelpTooltip text="Папка для сохранения результатов по умолчанию. Если оставить пустым, каждый раз будет запрашиваться выбор папки." />
                      Путь сохранения по умолчанию
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={settings.export.defaultPath}
                        onChange={(e) =>
                          updateSetting('export', 'defaultPath', e.target.value)
                        }
                        className="flex-1 input-modern"
                        placeholder="Оставьте пустым для выбора каждый раз"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const { open } = await import('@tauri-apps/api/dialog')
                            const folderPath = await open({
                              directory: true,
                              multiple: false,
                            })
                            if (folderPath && typeof folderPath === 'string') {
                              updateSetting('export', 'defaultPath', folderPath)
                            }
                          } catch (error) {
                            showErrorToast(`Ошибка выбора папки: ${String(error)}`)
                          }
                        }}
                        className="btn-secondary px-3"
                        style={{ 
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                          e.currentTarget.style.color = 'var(--text-primary)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-primary)'
                          e.currentTarget.style.color = 'var(--text-secondary)'
                        }}
                      >
                        <FileTextIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <HelpTooltip text="Формат даты в сохраненных файлах. Выберите из списка популярных форматов или введите свой. DD - день, MM - месяц, YYYY - год." />
                      Формат даты
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={
                          ['DD.MM.YYYY', 'MM.DD.YYYY', 'YYYY.MM.DD', 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'DD.MM.YY'].includes(settings.export.dateFormat || '')
                            ? settings.export.dateFormat || ''
                            : '__custom__'
                        }
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            // Если выбран "Свой формат", очищаем значение и фокус на input
                            updateSetting('export', 'dateFormat', '')
                            setTimeout(() => {
                              const input = document.querySelector('input[placeholder="DD.MM.YYYY"]') as HTMLInputElement
                              input?.focus()
                            }, 0)
                            return
                          }
                          updateSetting('export', 'dateFormat', e.target.value)
                        }}
                        className="input-modern"
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          borderColor: 'var(--border-primary)',
                          color: 'var(--text-primary)',
                          minWidth: '200px'
                        }}
                      >
                        <option value="DD.MM.YYYY">DD.MM.YYYY (25.12.2024)</option>
                        <option value="MM.DD.YYYY">MM.DD.YYYY (12.25.2024)</option>
                        <option value="YYYY.MM.DD">YYYY.MM.DD (2024.12.25)</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD (2024-12-25)</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY (25/12/2024)</option>
                        <option value="MM/DD/YYYY">MM/DD/YYYY (12/25/2024)</option>
                        <option value="DD-MM-YYYY">DD-MM-YYYY (25-12-2024)</option>
                        <option value="DD.MM.YY">DD.MM.YY (25.12.24)</option>
                        <option value="__custom__">Свой формат...</option>
                      </select>
                      <input
                        type="text"
                        value={settings.export.dateFormat || ''}
                        onChange={(e) =>
                          updateSetting('export', 'dateFormat', e.target.value)
                        }
                        className="flex-1 input-modern"
                        placeholder="DD.MM.YYYY"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2">
                        <HelpTooltip text="Автоматически открывать сохраненный файл в программе по умолчанию после экспорта. Полезно для быстрого просмотра результатов без ручного поиска файла." />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Автоматически открывать после экспорта
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Открывать экспортированный файл после сохранения
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.export.autoOpenAfterExport}
                        onChange={(checked) =>
                          updateSetting('export', 'autoOpenAfterExport', checked)
                        }
                      />
                    </div>
                  </div>

                  {/* Настройки столбцов для экспорта */}
                  <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Столбцы для экспорта
                      </h3>
                      <HelpTooltip text="Настройте, какие столбцы данных будут включены в экспортируемые файлы. Вы можете включать/отключать столбцы и изменять их порядок кнопками вверх/вниз." />
                    </div>
                    
                    {/* Настройка включения заголовков - внутри секции столбцов */}
                    <div className="mb-4 flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2">
                        <HelpTooltip text="Добавлять первую строку с названиями столбцов в экспортируемые файлы. Если включено - в файле будет строка с названиями выбранных столбцов (Хост, ID ТС, Статус и т.д.) перед данными. Если отключено - будут только данные без названий." />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Показывать названия столбцов в первой строке
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            {settings.export.includeHeaders 
                              ? 'В файле будет строка с названиями выбранных столбцов'
                              : 'В файле будут только данные без названий столбцов'}
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.export.includeHeaders}
                        onChange={(checked) =>
                          updateSetting('export', 'includeHeaders', checked)
                        }
                      />
                    </div>
                    
                    <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                      Выберите столбцы, которые будут включены в экспортируемые файлы (Excel, CSV, HTML). 
                      Используйте кнопки ↑↓ для изменения порядка столбцов.
                    </p>
                    
                    <div className="space-y-2">
                      {(() => {
                        const columnOrder = settings.export.columnOrder || ['host', 'vehicleId', 'status', 'exitStatus', 'stdout', 'stderr', 'timestamp', 'command']
                        const columnDefinitions = {
                          host: { key: 'host', label: 'Хост / IP', description: 'IP-адрес или имя хоста', required: true },
                          vehicleId: { key: 'vehicleId', label: 'ID ТС', description: 'Идентификатор транспортного средства', required: false },
                          status: { key: 'status', label: 'Статус', description: 'Успешно / Ошибка', required: false },
                          exitStatus: { key: 'exitStatus', label: 'Код выхода', description: 'Код завершения команды (0 = успех)', required: false },
                          stdout: { key: 'stdout', label: 'Вывод команды', description: 'Стандартный вывод команды', required: false },
                          stderr: { key: 'stderr', label: 'Ошибки', description: 'Сообщения об ошибках', required: false },
                          timestamp: { key: 'timestamp', label: 'Время выполнения', description: 'Дата и время выполнения команды', required: false },
                          command: { key: 'command', label: 'Команда', description: 'Выполненная команда (если доступно)', required: false },
                        }
                        
                        return columnOrder.map((colKey, index) => {
                          const column = columnDefinitions[colKey as keyof typeof columnDefinitions]
                          if (!column) return null
                          
                          const isEnabled = settings.export.columns?.[column.key as keyof typeof settings.export.columns] ?? (column.required ? true : false)
                          const canMoveUp = index > 0
                          const canMoveDown = index < columnOrder.length - 1
                          
                          const moveColumn = (direction: 'up' | 'down') => {
                            const newOrder = [...columnOrder]
                            const currentIndex = index
                            const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
                            if (newIndex >= 0 && newIndex < newOrder.length) {
                              [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]]
                              updateSetting('export', 'columnOrder', newOrder)
                            }
                          }
                          
                          return (
                            <div
                              key={column.key}
                              className="flex items-center justify-between p-3 rounded-lg border"
                              style={{
                                borderColor: 'var(--border-secondary)',
                                backgroundColor: column.required ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                                opacity: column.required ? 1 : (isEnabled ? 1 : 0.6)
                              }}
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isEnabled}
                                  onChange={(e) => {
                                    if (column.required) return
                                    const newColumns = {
                                      ...settings.export.columns,
                                      [column.key]: e.target.checked
                                    }
                                    updateSetting('export', 'columns', newColumns)
                                  }}
                                  disabled={column.required}
                                  className="w-4 h-4 rounded"
                                  style={{
                                    accentColor: 'var(--accent-primary)',
                                    cursor: column.required ? 'not-allowed' : 'pointer'
                                  }}
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <label
                                      className="text-sm font-medium"
                                      style={{ color: 'var(--text-primary)' }}
                                    >
                                      {column.label}
                                      {column.required && <span className="text-red-500 ml-1">*</span>}
                                    </label>
                                  </div>
                                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    {column.description}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveColumn('up')}
                                  disabled={!canMoveUp}
                                  className="p-1 rounded"
                                  style={{
                                    backgroundColor: canMoveUp ? 'var(--bg-tertiary)' : 'transparent',
                                    color: canMoveUp ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                    cursor: canMoveUp ? 'pointer' : 'not-allowed',
                                    opacity: canMoveUp ? 1 : 0.5
                                  }}
                                  title="Переместить вверх"
                                >
                                  <ChevronRightIcon className="w-4 h-4 transform -rotate-90" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveColumn('down')}
                                  disabled={!canMoveDown}
                                  className="p-1 rounded"
                                  style={{
                                    backgroundColor: canMoveDown ? 'var(--bg-tertiary)' : 'transparent',
                                    color: canMoveDown ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                    cursor: canMoveDown ? 'pointer' : 'not-allowed',
                                    opacity: canMoveDown ? 1 : 0.5
                                  }}
                                  title="Переместить вниз"
                                >
                                  <ChevronRightIcon className="w-4 h-4 transform rotate-90" />
                                </button>
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                    
                    <div className="mt-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span className="text-red-500">*</span> Обязательные столбцы нельзя отключить
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Performance Settings */}
          {activeTab === 'performance' && (
            <div className="space-y-3">
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ color: 'var(--text-tertiary)' }}><ActivityIcon className="w-4 h-4" /></span>
                  <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Производительность</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <HelpTooltip text="Размер буфера виртуализации." />
                      Буфер виртуализации
                    </label>
                    <input
                      type="number"
                      value={settings.performance.virtualizationBuffer}
                      onChange={(e) =>
                        updateSetting('performance', 'virtualizationBuffer', validateNumber(e.target.value, 5, 50, 10))
                      }
                      className="input-modern"
                      min="5"
                      max="50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <HelpTooltip text="Сколько элементов показывать в списках результатов. Больше значение - больше элементов видно сразу, но может замедлить работу." />
                      Элементов на странице
                    </label>
                    <input
                      type="number"
                      value={settings.performance.itemsPerPage}
                      onChange={(e) =>
                        updateSetting('performance', 'itemsPerPage', validateNumber(e.target.value, 10, 500, 50))
                      }
                      className="input-modern"
                      min="10"
                      max="500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <HelpTooltip text="Сколько результатов хранить в памяти одновременно. Когда лимит превышен, старые результаты удаляются. Больше значение - больше используется памяти компьютера." />
                      Максимум результатов в памяти
                    </label>
                    <input
                      type="number"
                      value={settings.performance.maxResultsInMemory}
                      onChange={(e) =>
                        updateSetting('performance', 'maxResultsInMemory', validateNumber(e.target.value, 100, 10000, 1000))
                      }
                      className="input-modern"
                      min="100"
                      max="10000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <HelpTooltip text="Сколько дней хранить результаты выполненных команд. Старые результаты автоматически удаляются. 0 - хранить бессрочно (не рекомендуется)." />
                      Дней хранения результатов
                    </label>
                    <input
                      type="number"
                      value={settings.performance.resultsRetentionDays}
                      onChange={(e) =>
                        updateSetting('performance', 'resultsRetentionDays', validateNumber(e.target.value, 1, 365, 7))
                      }
                      className="input-modern"
                      min="1"
                      max="365"
                    />
                  </div>
                  <div className="col-span-2 space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2">
                        <HelpTooltip text="Автоматически удалять старые результаты выполнения команд на основе настроек хранения. Если выключено, результаты нужно удалять вручную. Работает вместе с настройкой 'Дней хранения результатов'." />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Автоматическая очистка результатов
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Удалять старые результаты автоматически
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.performance.autoCleanupResults}
                        onChange={(checked) =>
                          updateSetting('performance', 'autoCleanupResults', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2">
                        <HelpTooltip text="Кэшировать часто используемые данные для ускорения работы приложения. Улучшает производительность при работе с большими списками хостов и результатов, но использует дополнительную память." />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Включить кэширование
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Кэшировать данные для ускорения работы
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.performance.enableCaching}
                        onChange={(checked) =>
                          updateSetting('performance', 'enableCaching', checked)
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Security Settings */}
          {activeTab === 'security' && (
            <div className="space-y-3">
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ color: 'var(--text-tertiary)' }}><LockIcon className="w-4 h-4" /></span>
                  <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Безопасность</h2>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <HelpTooltip text="Через сколько минут неактивности автоматически закрывать программу. Защищает от доступа других людей, если вы отошли от компьютера. 0 - не закрывать автоматически." />
                        Таймаут сессии (минуты)
                      </label>
                      <input
                        type="number"
                        value={settings.security.sessionTimeout}
                        onChange={(e) =>
                          updateSetting('security', 'sessionTimeout', validateNumber(e.target.value, 5, 480, 60))
                        }
                        className="input-modern"
                        min="5"
                        max="480"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <HelpTooltip text="Минимальная длина паролей для подключения к удаленным компьютерам. Если ввести пароль короче этого значения, будет показано предупреждение и команда не выполнится. Помогает избежать ошибок и использовать более безопасные пароли." />
                        Минимальная длина пароля SSH
                      </label>
                      <input
                        type="number"
                        value={settings.security.passwordMinLength}
                        onChange={(e) =>
                          updateSetting('security', 'passwordMinLength', validateNumber(e.target.value, 4, 32, 8))
                        }
                        className="input-modern"
                        min="4"
                        max="32"
                      />
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        При вводе пароля SSH короче {settings.security.passwordMinLength} символов в формах подключения будет показано предупреждение и заблокировано выполнение команды
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2">
                        <HelpTooltip text="Включает запись всех действий пользователя в журнал аудита. Журнал сохраняется в файл и содержит информацию о выполненных командах, подключениях и изменениях настроек. Настройки журнала находятся в разделе 'Журнал аудита'." />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Включить журнал аудита
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Записывать все действия в журнал аудита
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.security.enableAudit}
                        onChange={(checked) =>
                          updateSetting('security', 'enableAudit', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2">
                        <HelpTooltip text="Автоматически шифровать пароли SSH при сохранении в памяти приложения. Использует AES-256-GCM шифрование. Защищает пароли от несанкционированного доступа, если кто-то получит доступ к данным приложения." />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Автоматическое шифрование паролей
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Шифровать пароли при сохранении
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.security.autoEncryptPasswords}
                        onChange={(checked) =>
                          updateSetting('security', 'autoEncryptPasswords', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2">
                        <HelpTooltip text="Автоматически закрывать приложение при истечении таймаута сессии (если включен). Работает вместе с настройкой 'Таймаут сессии'. Если выключено, при истечении сессии приложение только заблокируется, но не закроется." />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Автоматический выход
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Выходить из приложения при истечении сессии
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.security.autoLogout}
                        onChange={(checked) =>
                          updateSetting('security', 'autoLogout', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2">
                        <HelpTooltip text="Автоматически очищать буфер обмена через 30 секунд после копирования паролей или других чувствительных данных. Защищает от случайного раскрытия паролей, если вы скопировали их в буфер обмена." />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Очищать буфер обмена после использования
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Автоматически очищать пароли из буфера обмена
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.security.clearClipboardAfterUse}
                        onChange={(checked) =>
                          updateSetting('security', 'clearClipboardAfterUse', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2">
                        <HelpTooltip text="Требовать ввод пароля перед изменением любых настроек приложения. Пароль устанавливается при первом изменении настроек. Защищает настройки от несанкционированного изменения." />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Требовать пароль для настроек
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Запрашивать пароль при изменении настроек
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.security.requirePasswordForSettings}
                        onChange={(checked) =>
                          updateSetting('security', 'requirePasswordForSettings', checked)
                        }
                      />
                    </div>
                  </div>

                  {/* Отключение валидации команд */}
                  <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border-secondary)', backgroundColor: settings.security.disableCommandValidation ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-secondary)' }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Отключить валидацию команд
                          </label>
                          <HelpTooltip text="При включении этой опции все проверки безопасности команд будут отключены. Это позволит выполнять любые команды, включая опасные (rm -rf, dd, shutdown и т.д.). Используйте только если вы полностью понимаете риски!" />
                        </div>
                        {settings.security.disableCommandValidation && (
                          <div className="mt-3 p-3 rounded-lg border" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                            <div className="flex items-start gap-2">
                              <span style={{ color: '#ef4444' }}><InfoIcon className="w-5 h-5 flex-shrink-0 mt-0.5" /></span>
                              <div className="text-sm" style={{ color: '#dc2626' }}>
                                <p className="font-semibold mb-1">⚠️ ВНИМАНИЕ: Валидация отключена!</p>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                  <li>Теперь можно выполнять любые команды, включая опасные</li>
                                  <li>Риск случайного удаления данных или повреждения системы</li>
                                  <li>Риск выполнения вредоносных команд</li>
                                  <li>Рекомендуется использовать только опытным администраторам</li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        )}
                        {!settings.security.disableCommandValidation && (
                          <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                            Валидация команд включена. Опасные команды (rm -rf, dd, shutdown и т.д.) будут заблокированы для защиты от случайного выполнения.
                          </p>
                        )}
                      </div>
                      <ToggleSwitch
                        checked={settings.security.disableCommandValidation}
                        onChange={(checked) => {
                          if (checked) {
                            // Показываем предупреждение перед включением
                            const confirmed = window.confirm(
                              '⚠️ ВНИМАНИЕ!\n\n' +
                              'Вы собираетесь отключить валидацию команд. Это означает:\n\n' +
                              '• Можно будет выполнять любые команды, включая опасные\n' +
                              '• Риск случайного удаления данных или повреждения системы\n' +
                              '• Риск выполнения вредоносных команд\n\n' +
                              'Вы уверены, что хотите продолжить?'
                            )
                            if (confirmed) {
                              updateSetting('security', 'disableCommandValidation', true)
                              showWarningToast('Валидация команд отключена. Будьте осторожны!')
                            }
                          } else {
                            updateSetting('security', 'disableCommandValidation', false)
                            showSuccessToast('Валидация команд включена')
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Audit Settings */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ color: 'var(--text-tertiary)' }}><FileTextIcon className="w-4 h-4" /></span>
                  <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Журнал аудита</h2>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <HelpTooltip text="Какие события записывать в журнал. Ошибки - только проблемы, Информация - основные события, Отладка - все детали. Для обычной работы выберите 'Информация'." />
                      Уровень логирования
                    </label>
                    <SegmentedControl
                      options={[
                        { value: 'error', label: 'Ошибки' },
                        { value: 'warn', label: 'Предупреждения' },
                        { value: 'info', label: 'Информация' },
                        { value: 'debug', label: 'Отладка' },
                      ]}
                      value={settings.audit.logLevel}
                      onChange={(value) => updateSetting('audit', 'logLevel', value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <HelpTooltip text="Сколько дней хранить записи в журнале. Старые записи автоматически удаляются. 0 - хранить бессрочно (может занять много места)." />
                        Дней хранения
                      </label>
                      <input
                        type="number"
                        value={settings.audit.retentionDays}
                        onChange={(e) =>
                          updateSetting('audit', 'retentionDays', validateNumber(e.target.value, 1, 365, 30))
                        }
                        className="input-modern"
                        min="1"
                        max="365"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <HelpTooltip text="Максимальный размер файла журнала в мегабайтах. Когда файл достигает этого размера, создается новый файл, а старый сохраняется как архив." />
                        Максимальный размер файла (МБ)
                      </label>
                      <input
                        type="number"
                        value={settings.audit.maxLogFileSize}
                        onChange={(e) =>
                          updateSetting('audit', 'maxLogFileSize', validateNumber(e.target.value, 10, 1000, 100))
                        }
                        className="input-modern"
                        min="10"
                        max="1000"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <HelpTooltip text="В каком формате сохранять записи журнала. JSON - для программной обработки, Текст - обычный читаемый формат для просмотра." />
                      Формат лога
                    </label>
                    <SegmentedControl
                      options={[
                        { value: 'json', label: 'JSON' },
                        { value: 'text', label: 'Текст' },
                      ]}
                      value={settings.audit.logFormat}
                      onChange={(value) => updateSetting('audit', 'logFormat', value)}
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <div className="flex items-center gap-2">
                      <HelpTooltip text="Автоматически создавать новый файл журнала, когда текущий файл достигает максимального размера. Старый файл сохраняется с меткой времени. Работает вместе с настройкой 'Максимальный размер файла'." />
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          Автоматическая ротация логов
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          Автоматически создавать новые файлы логов
                        </p>
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={settings.audit.autoRotate}
                      onChange={(checked) =>
                        updateSetting('audit', 'autoRotate', checked)
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Commands Settings */}
          {activeTab === 'commands' && (
            <div className="space-y-3">
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ color: 'var(--text-tertiary)' }}><TerminalIcon className="w-4 h-4" /></span>
                  <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Настройки команд</h2>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <HelpTooltip text="Сколько выполненных команд запоминать. Старые команды удаляются, когда лимит превышен. Можно выбрать из истории ранее выполненные команды." />
                        Максимальный размер истории
                      </label>
                      <input
                        type="number"
                        value={settings.commands.maxHistorySize}
                        onChange={(e) =>
                          updateSetting('commands', 'maxHistorySize', validateNumber(e.target.value, 10, 1000, 100))
                        }
                        className="input-modern"
                        min="10"
                        max="1000"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2">
                        <HelpTooltip text="Сохранять историю выполненных команд для быстрого доступа. Можно выбрать команду из истории вместо повторного ввода. История ограничена настройкой 'Максимальный размер истории'." />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Сохранять историю команд
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Запоминать выполненные команды
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.commands.saveHistory}
                        onChange={(checked) =>
                          updateSetting('commands', 'saveHistory', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2">
                        <HelpTooltip text="Показывать список подсказок команд при вводе в поле команды. Подсказки основаны на истории выполненных команд и избранных командах. Ускоряет ввод часто используемых команд." />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Показывать подсказки
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Предлагать команды при вводе
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.commands.showSuggestions}
                        onChange={(checked) =>
                          updateSetting('commands', 'showSuggestions', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center gap-2">
                        <HelpTooltip text="Автоматически дополнять команды при вводе на основе истории и избранных команд. Когда вы начинаете вводить команду, она автоматически дополняется до полной версии из истории." />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Автодополнение
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Автоматически дополнять команды
                          </p>
                        </div>
                      </div>
                      <ToggleSwitch
                        checked={settings.commands.autoComplete}
                        onChange={(checked) =>
                          updateSetting('commands', 'autoComplete', checked)
                        }
                      />
                    </div>
                  </div>
                  
                  {/* Избранные команды */}
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                        <HelpTooltip text="Команды, которые вы используете чаще всего. Они будут показываться первыми в списке подсказок для быстрого выбора." />
                        Избранные команды
                      </label>
                    </div>
                    <div className="space-y-2">
                      {settings.commands.favoriteCommands.length === 0 ? (
                        <div className="p-4 rounded-card text-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                            Нет избранных команд. Добавьте команды через кнопку "В избранное" при выполнении команд.
                          </p>
                        </div>
                      ) : (
                        settings.commands.favoriteCommands.map((cmd, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 rounded-card"
                            style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}
                          >
                            <code className="text-sm font-mono flex-1" style={{ color: 'var(--text-primary)' }}>
                              {cmd}
                            </code>
                            <button
                              onClick={() => {
                                const currentSettings = loadSettings()
                                const updatedFavorites = settings.commands.favoriteCommands.filter((_, i) => i !== idx)
                                saveSettings({
                                  ...currentSettings,
                                  commands: {
                                    ...currentSettings.commands,
                                    favoriteCommands: updatedFavorites,
                                  },
                                })
                                window.dispatchEvent(new Event('settings-changed'))
                                showSuccessToast('Команда удалена из избранного')
                              }}
                              className="ml-3 px-2 py-1 rounded-button text-xs"
                              style={{
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                color: '#dc2626',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'
                              }}
                            >
                              Удалить
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    {settings.commands.favoriteCommands.length > 0 && (
                      <button
                        onClick={() => {
                          setShowClearFavoritesConfirm(true)
                        }}
                        className="mt-3 px-4 py-2 rounded-button text-sm"
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-primary)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                          e.currentTarget.style.color = 'var(--text-primary)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
                          e.currentTarget.style.color = 'var(--text-secondary)'
                        }}
                      >
                        Очистить все
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Hosts Settings */}
          {activeTab === 'hosts' && (
            <div className="space-y-3">
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ color: 'var(--text-tertiary)' }}><UsersIcon className="w-4 h-4" /></span>
                  <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Настройки хостов</h2>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <HelpTooltip text="Имя группы, в которую автоматически попадают хосты без указанной группы. Например, при импорте CSV-файла без столбца 'group' или при добавлении хоста вручную без выбора группы. В рабочей области хосты отображаются сгруппированными по этому полю." />
                        Группа для новых хостов
                      </label>
                      <input
                        type="text"
                        value={settings.hosts.defaultGroup}
                        onChange={(e) =>
                          updateSetting('hosts', 'defaultGroup', e.target.value)
                        }
                        className="input-modern"
                        placeholder="Например: Основные, Серверы, default"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <HelpTooltip text="Как часто автоматически обновлять список устройств в рабочей области (если включено автообновление). При каждом обновлении список перезагружается из файла или из сохраненных данных. Рекомендуется 300 секунд (5 минут)." />
                        Интервал обновления (секунды)
                      </label>
                      <input
                        type="number"
                        value={settings.hosts.refreshInterval}
                        onChange={(e) =>
                          updateSetting('hosts', 'refreshInterval', validateNumber(e.target.value, 10, 3600, 300))
                        }
                        className="input-modern"
                        min="10"
                        max="3600"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <HelpTooltip text="Автоматически сохраняет список хостов в памяти при каждом изменении. Позволяет сохранить список устройств даже после закрытия приложения. Сохраненные хосты отображаются в рабочей области при следующем запуске." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Автоматическое сохранение
                          </p>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          Автоматически сохранять список хостов
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={settings.hosts.autoSave}
                        onChange={(checked) =>
                          updateSetting('hosts', 'autoSave', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <HelpTooltip text="Если включено, хосты в рабочей области группируются по их тегам вместо групп. Хосты с одинаковыми тегами будут показаны вместе. Хосты без тегов попадут в группу по умолчанию." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Группировать по тегам
                          </p>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          Организовывать хосты по тегам
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={settings.hosts.groupByTags}
                        onChange={(checked) =>
                          updateSetting('hosts', 'groupByTags', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <HelpTooltip text="Включает цветовую маркировку хостов в рабочей области. Каждый хост получает уникальный цвет на основе его группы, что помогает визуально различать устройства. Цвет отображается на левой границе карточки хоста и иконке статуса." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Показывать цвета
                          </p>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          Использовать цветовую маркировку хостов
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={settings.hosts.showColors}
                        onChange={(checked) =>
                          updateSetting('hosts', 'showColors', checked)
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <HelpTooltip text="Включает автоматическое периодическое обновление списка хостов в рабочей области. Каждые N секунд (где N = интервал обновления) список перезагружается из последнего открытого файла или из сохраненных данных. Полезно при работе с динамически изменяющимися списками устройств." />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Автоматическое обновление
                          </p>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          Автоматически обновлять список хостов
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={settings.hosts.autoRefresh}
                        onChange={(checked) =>
                          updateSetting('hosts', 'autoRefresh', checked)
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* General Settings */}
          {activeTab === 'general' && (
            <div className="space-y-3">
              <div className="card p-3">
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ color: 'var(--text-tertiary)' }}><TrendingUpIcon className="w-4 h-4" /></span>
                  <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Общие настройки</h2>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Запускать свернутым
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={settings.general.startMinimized}
                      onChange={(checked) =>
                        updateSetting('general', 'startMinimized', checked)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Сворачивать в трей
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={settings.general.minimizeToTray}
                      onChange={(checked) =>
                        updateSetting('general', 'minimizeToTray', checked)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-card" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Закрывать в трей
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        При закрытии сворачивать в трей вместо завершения
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={settings.general.closeToTray}
                      onChange={(checked) =>
                        updateSetting('general', 'closeToTray', checked)
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно "О программе" */}
      {showAbout && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="card p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                О программе
              </h2>
              <button
                onClick={() => setShowAbout(false)}
                className="p-1 rounded-lg transition-colors"
                style={{ 
                  color: 'var(--text-secondary)',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-button border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
                  <span style={{ color: 'var(--text-primary)' }}><TerminalIcon className="w-8 h-8" /></span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    SSH Executor
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Управление удаленными компьютерами через SSH
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Версия 1.0.0
                  </p>
                  <a 
                    href="https://github.com/redbleach5/SSH-Executor"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs mt-1 inline-flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    GitHub
                  </a>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Программа для выполнения команд на удаленных компьютерах и серверах. 
                    Позволяет управлять одним или множеством устройств одновременно, не подключаясь к каждому вручную.
                  </p>
                </div>
                
                <div className="pt-2 border-t" style={{ borderColor: 'var(--border-secondary)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Что умеет программа:
                  </p>
                  <ul className="text-xs space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <li>• Выполнять команды на одном или многих компьютерах сразу (до 200 одновременно)</li>
                    <li>• Подключаться по паролю, OpenSSH-ключам или PPK-ключам (PuTTY)</li>
                    <li>• Загружать списки устройств из файлов CSV, Excel и JSON (перетаскивание)</li>
                    <li>• Сохранять результаты в Excel (XLSX), CSV, JSON и HTML</li>
                    <li>• Работать с большими списками устройств (тысячи хостов)</li>
                    <li>• Запоминать часто используемые команды с автодополнением</li>
                    <li>• Группировать устройства по категориям с цветными метками</li>
                    <li>• Автоматически повторять неуспешные подключения</li>
                    <li>• Показывать прогресс выполнения в реальном времени</li>
                    <li>• Отменять выполнение команд в любой момент</li>
                  </ul>
                </div>
                
                <div className="pt-2 border-t" style={{ borderColor: 'var(--border-secondary)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Безопасность:
                  </p>
                  <ul className="text-xs space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <li>• Пароли шифруются алгоритмом AES-256-GCM</li>
                    <li>• Все действия записываются в журнал аудита</li>
                    <li>• Старые данные автоматически удаляются</li>
                    <li>• Можно защитить настройки паролем</li>
                    <li>• Автоматический выход при бездействии</li>
                    <li>• Безопасное удаление паролей из памяти</li>
                  </ul>
                </div>
                
                <div className="pt-2 border-t" style={{ borderColor: 'var(--border-secondary)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Удобство использования:
                  </p>
                  <ul className="text-xs space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <li>• Простой и понятный интерфейс</li>
                    <li>• Поддержка темной и светлой темы</li>
                    <li>• Настраиваемый размер шрифта и плотность интерфейса</li>
                    <li>• Уведомления о выполнении команд</li>
                    <li>• Работает в фоновом режиме (системный трей)</li>
                    <li>• Горячие клавиши для быстрого доступа</li>
                    <li>• Консоль отладки для диагностики</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowAbout(false)}
                className="btn-primary"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно для ввода пароля */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="card p-6 max-w-4xl w-full mx-4">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Требуется пароль
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Для изменения настроек требуется ввести пароль
            </p>
            <input
              type="password"
              value={settingsPassword}
              onChange={(e) => setSettingsPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handlePasswordSubmit()
                } else if (e.key === 'Escape') {
                  setShowPasswordPrompt(false)
                  setPendingUpdate(null)
                  setSettingsPassword('')
                }
              }}
              className="input-modern w-full mb-4"
              placeholder="Введите пароль"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowPasswordPrompt(false)
                  setPendingUpdate(null)
                  setSettingsPassword('')
                }}
                className="btn-secondary"
              >
                Отмена
              </button>
              <button
                onClick={handlePasswordSubmit}
                className="btn-primary"
              >
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Сбросить настройки"
        message="Вы уверены, что хотите сбросить все настройки к значениям по умолчанию?"
        confirmText="Сбросить"
        cancelText="Отмена"
        type="warning"
        onConfirm={confirmReset}
        onCancel={() => setShowResetConfirm(false)}
      />

      <ConfirmDialog
        isOpen={showClearFavoritesConfirm}
        title="Удалить избранные команды"
        message="Вы уверены, что хотите удалить все избранные команды?"
        confirmText="Удалить"
        cancelText="Отмена"
        type="danger"
        onConfirm={confirmClearFavorites}
        onCancel={() => setShowClearFavoritesConfirm(false)}
      />
    </div>
  )
}
