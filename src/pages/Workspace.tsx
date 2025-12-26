import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { invoke } from '@tauri-apps/api/tauri'
import { listen } from '@tauri-apps/api/event'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useSearchParams } from 'react-router-dom'
import { showSuccessToast, showErrorToast, showInfoToast } from '../utils/toast'
import { humanizeError, humanizeCommandError, humanizeSuccessMessage, isRetryableError } from '../utils/errorMessages'
import {
  ServerIcon,
  TerminalIcon,
  UploadIcon,
  XIcon,
  CheckCircleIcon,
  PlayIcon,
  DownloadIcon,
  UserIcon,
  UsersIcon,
  KeyIcon
} from '../components/icons'
import SegmentedControl from '../components/SegmentedControl'
import ToggleSwitch from '../components/ToggleSwitch'
import HelpTooltip from '../components/HelpTooltip'
import type { HostEntry, CommandResult, BatchCommandResult } from '../types'
import { useSettings } from '../utils/useSettings'
import { loadSettings, saveSettings } from '../utils/settings'
import {
  loadCommandHistory,
  saveCommandToHistory,
  getCommandSuggestions,
  autocompleteCommand,
} from '../utils/commandHistory'
import { cleanupOldResults, addTimestamp, cleanupStoredResults } from '../utils/resultsCleanup'
import { getHostColor, getFlattenedHosts } from '../utils/hostsUtils'
import { 
  validateSshConfig, 
  safeJsonParse, 
  isValidHostEntryArray,
  isValidCommandResultArray,
  isValidBatchCommandResultArray,
  isValidSshConfig,
  isValidBatchConfig
} from '../utils/validation'

type Mode = 'single' | 'batch'

// Компонент для отображения ошибки с умной прокруткой
// Показывает прокрутку только если текст больше 10 строк
function ErrorMessage({ error }: { error: string }) {
  const textRef = useRef<HTMLParagraphElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const updateScroll = () => {
      if (textRef.current && containerRef.current) {
        // Высота одной строки text-xs с leading-relaxed примерно 19.5px
        // 10 строк = 195px, плюс padding (24px) = 219px
        const maxHeightFor10Lines = 219
        const actualHeight = textRef.current.scrollHeight
        
        // Применяем прокрутку только если высота больше 10 строк
        if (actualHeight > maxHeightFor10Lines) {
          containerRef.current.style.maxHeight = `${maxHeightFor10Lines}px`
          containerRef.current.style.overflowY = 'auto'
        } else {
          containerRef.current.style.maxHeight = 'none'
          containerRef.current.style.overflowY = 'visible'
        }
      }
    }

    // Выполняем сразу и с небольшой задержкой для учета рендеринга
    updateScroll()
    const timeoutId = setTimeout(updateScroll, 0)
    
    return () => clearTimeout(timeoutId)
  }, [error])

  return (
    <div 
      ref={containerRef}
      className="border p-3 rounded-lg text-xs" 
      style={{ 
        backgroundColor: 'rgba(239, 68, 68, 0.1)', 
        borderColor: 'rgba(239, 68, 68, 0.3)', 
        wordWrap: 'break-word', 
        overflowWrap: 'anywhere',
        transition: 'max-height 0.2s ease-in-out',
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        overflowX: 'hidden',
        overflowY: 'auto',
        boxSizing: 'border-box'
      }}
    >
      <p 
        ref={textRef}
        className="text-xs break-words leading-relaxed" 
        style={{ 
          color: '#dc2626', 
          wordBreak: 'break-all', 
          overflowWrap: 'break-word', 
          margin: 0,
          minWidth: 0,
          maxWidth: '100%',
          width: '100%',
          overflow: 'visible',
          whiteSpace: 'normal',
          wordSpacing: 'normal'
        }}
      >
        {(() => {
          const errorText = humanizeError(error)
          const lines = errorText.split('\n')
          return lines.map((line, idx) => (
            <span key={idx}>
              {line}
              {idx < lines.length - 1 && <br />}
            </span>
          ))
        })()}
      </p>
    </div>
  )
}

// Интерфейс для сохранения состояния рабочего пространства
interface WorkspaceState {
  // Состояние выполнения
  batchExecuting: boolean
  singleExecuting: boolean
  progress: { current: number; total: number }
  retryTimers: Array<[string, number]> // Map сериализуется как массив пар
  retrying: boolean
  retryCount: number
  
  // Команда и конфигурация
  command: string
  mode: Mode
  
  // Результаты (только если есть незавершенные задачи)
  batchResults?: BatchCommandResult[]
  singleResults?: CommandResult[]
  
  // Timestamp сохранения
  savedAt: string
}

interface SshConfig {
  host: string
  port: number
  username: string
  auth_method: 'password' | 'key' | 'ppk'
  password?: string
  key_path?: string
  ppk_path?: string
  passphrase?: string
  timeout: number
}

interface BatchConfig extends Omit<SshConfig, 'host'> {
  max_concurrent: number
}

export default function Workspace() {
  const settings = useSettings()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>(() => {
    const modeParam = searchParams.get('mode')
    if (modeParam === 'batch' || modeParam === 'single') {
      return modeParam
    }
    // Пытаемся восстановить из localStorage
    const savedMode = localStorage.getItem('ssh-executor-mode')
    if (savedMode === 'batch' || savedMode === 'single') {
      return savedMode
    }
    // Используем настройку по умолчанию, если нет параметра в URL
    const currentSettings = loadSettings()
    return currentSettings.connection.defaultMode
  })

  // Hosts tab state
  const [hosts, setHosts] = useState<HostEntry[]>(() => {
    // Загружаем хосты из localStorage только если включено автосохранение
    const currentSettings = loadSettings()
    if (currentSettings.hosts.autoSave) {
      const saved = localStorage.getItem('ssh-executor-hosts')
      return safeJsonParse(saved, [], isValidHostEntryArray)
    }
    return []
  })
  const [loading, setLoading] = useState(false)
  const [lastLoadedFilePath, setLastLoadedFilePath] = useState<string | null>(() => {
    return localStorage.getItem('ssh-executor-last-file-path')
  })
  const hostsParentRef = useRef<HTMLDivElement>(null)

  // Группировка хостов
  // Если включена группировка по тегам или цветовая маркировка, используем функцию группировки
  // Иначе просто маппим хосты с использованием группы по умолчанию из настроек
  // ОПТИМИЗАЦИЯ: используем useMemo для кеширования при работе с 5000+ хостами
  const groupedHosts = useMemo(() => {
    if (settings.hosts.groupByTags || settings.hosts.showColors) {
      return getFlattenedHosts(hosts)
    }
    return hosts.map((host) => ({ host, groupName: host.group || settings.hosts.defaultGroup || 'default' }))
  }, [hosts, settings.hosts.groupByTags, settings.hosts.showColors, settings.hosts.defaultGroup])
  
  const hostsVirtualizer = useVirtualizer({
    count: groupedHosts.length,
    getScrollElement: () => hostsParentRef.current,
    estimateSize: () => settings.hosts.groupByTags ? 80 : 60,
    overscan: settings.performance.virtualizationBuffer,
  })

  // Автоматическое обновление хостов
  // Работает только если включено автообновление и интервал > 0
  // Перезагружает хосты из файла или localStorage с заданным интервалом
  useEffect(() => {
    if (!settings.hosts.autoRefresh || settings.hosts.refreshInterval <= 0) return

    const interval = setInterval(async () => {
      try {
        // Если есть путь к последнему загруженному файлу, перезагружаем из него
        if (lastLoadedFilePath) {
          try {
            const parsedHosts = await invoke<HostEntry[]>('parse_hosts_file', {
              filePath: lastLoadedFilePath,
            })
            setHosts(parsedHosts)
            // Сохраняем обновленные хосты
            if (settings.hosts.autoSave) {
              localStorage.setItem('ssh-executor-hosts', JSON.stringify(parsedHosts))
            }
          } catch (error) {
            // Если не удалось загрузить из файла, пробуем из localStorage
            console.warn('Не удалось обновить хосты из файла, используем localStorage:', error)
            const saved = localStorage.getItem('ssh-executor-hosts')
            if (saved) {
              const parsed = safeJsonParse(saved, [], isValidHostEntryArray)
              setHosts(parsed)
            }
          }
        } else {
          // Если файл не был загружен, просто синхронизируем из localStorage
          // (полезно при работе в нескольких вкладках)
          const saved = localStorage.getItem('ssh-executor-hosts')
          if (saved) {
            const parsed = safeJsonParse(saved, [], isValidHostEntryArray)
            setHosts(parsed)
          }
        }
      } catch (error) {
        console.error('Ошибка автоматического обновления хостов:', error)
      }
    }, settings.hosts.refreshInterval * 1000)

    return () => clearInterval(interval)
  }, [settings.hosts.autoRefresh, settings.hosts.refreshInterval, lastLoadedFilePath, settings.hosts.autoSave])

  // Автоматическое сохранение хостов
  // Сохраняет список хостов в localStorage при каждом изменении, если включено автосохранение
  // При выключении автосохранения удаляет сохранённые хосты
  useEffect(() => {
    if (settings.hosts.autoSave) {
      if (hosts.length > 0) {
        localStorage.setItem('ssh-executor-hosts', JSON.stringify(hosts))
      }
    } else {
      // При выключении автосохранения удаляем сохранённые хосты
      localStorage.removeItem('ssh-executor-hosts')
    }
  }, [hosts, settings.hosts.autoSave])

  // Commands tab state
  const [singleConfig, setSingleConfig] = useState<SshConfig>(() => {
    // Пытаемся восстановить из localStorage
    const saved = localStorage.getItem('ssh-executor-single-config')
    const currentSettings = loadSettings()
    
    if (saved) {
      const parsed = safeJsonParse(saved, null, isValidSshConfig)
      if (parsed) {
        // Восстанавливаем конфигурацию, но обновляем порт, auth_method и timeout из настроек
        return {
          ...parsed,
          port: parsed.port || currentSettings.connection.defaultPort,
          auth_method: parsed.auth_method || currentSettings.connection.defaultAuthMethod,
          timeout: parsed.timeout || currentSettings.connection.defaultTimeout,
          // Не сохраняем пароль в localStorage для безопасности
          password: undefined,
        }
      }
    }
    
    return {
      host: '',
      port: currentSettings.connection.defaultPort,
      username: '',
      auth_method: currentSettings.connection.defaultAuthMethod,
      timeout: currentSettings.connection.defaultTimeout,
    }
  })

  useEffect(() => {
    setSingleConfig(prev => ({
      ...prev,
      port: settings.connection.defaultPort,
      auth_method: settings.connection.defaultAuthMethod,
      timeout: settings.connection.defaultTimeout,
    }))
  }, [settings.connection.defaultPort, settings.connection.defaultAuthMethod, settings.connection.defaultTimeout])

  // Сохраняем singleConfig в localStorage при изменении (без пароля для безопасности)
  useEffect(() => {
    const configToSave = { ...singleConfig }
    delete configToSave.password // Не сохраняем пароль
    localStorage.setItem('ssh-executor-single-config', JSON.stringify(configToSave))
  }, [singleConfig])

  const [singleResults, setSingleResults] = useState<CommandResult[]>(() => {
    // Восстанавливаем результаты из localStorage, если автоматическая очистка отключена
    const currentSettings = loadSettings()
    if (!currentSettings.performance.autoCleanupResults) {
      const saved = localStorage.getItem('ssh-executor-single-results')
      return safeJsonParse(saved, [], isValidCommandResultArray)
    }
    return []
  })
  const [singleExecuting, setSingleExecuting] = useState(false)

  // Автоматическая очистка результатов
  useEffect(() => {
    if (!settings.performance.autoCleanupResults) return

    const cleanup = () => {
      setSingleResults(prev => cleanupOldResults(prev, settings.performance.resultsRetentionDays))
      setBatchResults(prev => cleanupOldResults(prev, settings.performance.resultsRetentionDays))
      cleanupStoredResults(settings.performance.resultsRetentionDays)
    }

    // Очистка при изменении настроек
    cleanup()

    // Очистка каждый час
    const interval = setInterval(cleanup, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [settings.performance.autoCleanupResults, settings.performance.resultsRetentionDays])

  const [batchConfig, setBatchConfig] = useState<BatchConfig>(() => {
    // Пытаемся восстановить из localStorage
    const saved = localStorage.getItem('ssh-executor-batch-config')
    const currentSettings = loadSettings()
    
    if (saved) {
      const parsed = safeJsonParse(saved, null, isValidBatchConfig)
      if (parsed) {
        // Восстанавливаем конфигурацию, но обновляем порт, auth_method, timeout и max_concurrent из настроек
        return {
          ...parsed,
          port: parsed.port || currentSettings.connection.defaultPort,
          auth_method: parsed.auth_method || currentSettings.connection.defaultAuthMethod,
          timeout: parsed.timeout || currentSettings.connection.defaultTimeout,
          max_concurrent: parsed.max_concurrent || currentSettings.connection.maxConcurrent,
          // Не сохраняем пароль в localStorage для безопасности
          password: undefined,
        }
      }
    }
    
    return {
      username: '',
      port: currentSettings.connection.defaultPort,
      auth_method: currentSettings.connection.defaultAuthMethod,
      timeout: currentSettings.connection.defaultTimeout,
      max_concurrent: currentSettings.connection.maxConcurrent,
    }
  })

  useEffect(() => {
    setBatchConfig(prev => ({
      ...prev,
      port: settings.connection.defaultPort,
      auth_method: settings.connection.defaultAuthMethod,
      timeout: settings.connection.defaultTimeout,
      max_concurrent: settings.connection.maxConcurrent,
    }))
  }, [settings.connection.defaultPort, settings.connection.defaultAuthMethod, settings.connection.defaultTimeout, settings.connection.maxConcurrent])

  // Сохраняем batchConfig в localStorage при изменении (без пароля для безопасности)
  useEffect(() => {
    const configToSave = { ...batchConfig }
    delete configToSave.password // Не сохраняем пароль
    localStorage.setItem('ssh-executor-batch-config', JSON.stringify(configToSave))
  }, [batchConfig])

  const [batchResults, setBatchResults] = useState<BatchCommandResult[]>(() => {
    // Восстанавливаем результаты из localStorage, если автоматическая очистка отключена
    const currentSettings = loadSettings()
    if (!currentSettings.performance.autoCleanupResults) {
      const saved = localStorage.getItem('ssh-executor-batch-results')
      return safeJsonParse(saved, [], isValidBatchCommandResultArray)
    }
    return []
  })
  const [batchExecuting, setBatchExecuting] = useState(false)
  
  // Оптимизация для 5000+ хостов: батчинг обновлений результатов
  // Используем Map для O(1) поиска и ref для накопления обновлений
  const pendingResultsRef = useRef<Map<string, BatchCommandResult>>(new Map())
  const batchUpdateScheduledRef = useRef(false)
  const batchResultsMapRef = useRef<Map<string, BatchCommandResult>>(new Map())
  
  // Refs для хранения функций отписки от событий
  const unlistenResultRef = useRef<(() => void) | null>(null)
  const unlistenProgressRef = useRef<(() => void) | null>(null)
  
  // Функция для очистки слушателей событий
  const cleanupEventListeners = useCallback(() => {
    if (unlistenResultRef.current) {
      try {
        unlistenResultRef.current()
      } catch (e) {
        console.warn('[Batch Execute] Ошибка при отписке от событий результатов:', e)
      }
      unlistenResultRef.current = null
    }
    if (unlistenProgressRef.current) {
      try {
        unlistenProgressRef.current()
      } catch (e) {
        console.warn('[Batch Execute] Ошибка при отписке от событий прогресса:', e)
      }
      unlistenProgressRef.current = null
    }
  }, [])
  
  // Функция для применения накопленных обновлений
  const flushPendingResults = useCallback(() => {
    if (pendingResultsRef.current.size === 0) {
      batchUpdateScheduledRef.current = false
      return
    }
    
    // Копируем pending results ДО вызова setState
    const pendingCopy = new Map(pendingResultsRef.current)
    
    setBatchResults(prev => {
      // Создаем Map из текущего массива для O(1) поиска
      const currentMap = new Map(prev.map(r => [r.host, r]))
      
      // Применяем все накопленные обновления
      pendingCopy.forEach((result, host) => {
        currentMap.set(host, result)
      })
      
      // Сохраняем актуальную Map для быстрого доступа
      batchResultsMapRef.current = currentMap
      
      // Конвертируем обратно в массив, сохраняя порядок
      return Array.from(currentMap.values())
    })
    
    // Очищаем очередь ПОСЛЕ вызова setState
    pendingResultsRef.current.clear()
    batchUpdateScheduledRef.current = false
  }, [])
  
  // Функция для добавления результата в очередь с батчингом
  // ИСПРАВЛЕНИЕ: Для обеспечения мгновенного отображения результатов,
  // используем queueMicrotask вместо requestAnimationFrame для малых партий,
  // и немедленное обновление для первых результатов
  const queueResultUpdate = useCallback((result: BatchCommandResult) => {
    const resultWithTimestamp = addTimestamp(result)
    pendingResultsRef.current.set(result.host, resultWithTimestamp)
    
    // Используем queueMicrotask для быстрого обновления UI
    if (!batchUpdateScheduledRef.current) {
      batchUpdateScheduledRef.current = true
      
      // Используем queueMicrotask для более быстрого обновления, чем requestAnimationFrame
      // queueMicrotask выполняется сразу после текущего выполнения, до следующего рендера
      queueMicrotask(() => {
        flushPendingResults()
      })
    }
  }, [flushPendingResults])
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [executionStartTime, setExecutionStartTime] = useState<number | null>(null)
  const retryFailedHosts = settings.connection.retryFailedHosts
  const retryInterval = settings.connection.retryInterval
  const retryMaxAttempts = settings.connection.retryMaxAttempts
  const [retrying, setRetrying] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  // Состояние для отслеживания хостов, ожидающих повторной попытки с таймером
  const [retryTimers, setRetryTimers] = useState<Map<string, number>>(new Map())
  // Состояние для отслеживания количества попыток для каждого хоста
  const [_retryAttempts, setRetryAttempts] = useState<Map<string, number>>(new Map())
  const batchParentRef = useRef<HTMLDivElement>(null)

  // Сохраняем результаты в localStorage, если автоматическая очистка отключена
  useEffect(() => {
    if (!settings.performance.autoCleanupResults) {
      try {
        localStorage.setItem('ssh-executor-single-results', JSON.stringify(singleResults))
      } catch (e) {
        console.warn('Ошибка сохранения результатов в localStorage:', e)
      }
    } else {
      // Если автоматическая очистка включена, удаляем сохраненные результаты
      localStorage.removeItem('ssh-executor-single-results')
    }
  }, [singleResults, settings.performance.autoCleanupResults])

  // Сохраняем batch результаты в localStorage, если автоматическая очистка отключена
  // ОПТИМИЗАЦИЯ: добавлен debounce для предотвращения частых записей при 5000+ обновлениях
  const batchResultsSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    // Отменяем предыдущий таймер при каждом обновлении
    if (batchResultsSaveTimeoutRef.current) {
      clearTimeout(batchResultsSaveTimeoutRef.current)
    }
    
    if (!settings.performance.autoCleanupResults) {
      // Сохраняем с задержкой 2 секунды после последнего обновления
      // Это снижает нагрузку при массовых обновлениях (5000+ хостов)
      batchResultsSaveTimeoutRef.current = setTimeout(() => {
        try {
          localStorage.setItem('ssh-executor-batch-results', JSON.stringify(batchResults))
        } catch (e) {
          console.warn('Ошибка сохранения результатов в localStorage:', e)
        }
      }, 2000)
    } else {
      // Если автоматическая очистка включена, удаляем сохраненные результаты
      localStorage.removeItem('ssh-executor-batch-results')
    }
    
    // Очистка таймера при размонтировании
    return () => {
      if (batchResultsSaveTimeoutRef.current) {
        clearTimeout(batchResultsSaveTimeoutRef.current)
      }
    }
  }, [batchResults, settings.performance.autoCleanupResults])

  const [command, setCommand] = useState(() => {
    // Восстанавливаем команду из localStorage
    const saved = localStorage.getItem('ssh-executor-command')
    return saved || ''
  })

  // Функция для проверки наличия незавершенных задач
  // ОПТИМИЗАЦИЯ: используем useCallback для стабильности
  // Используем batchResults.length как простой индикатор вместо полного .some()
  const hasUnfinishedTasks = useCallback((): boolean => {
    // Быстрые проверки без обхода массива
    if (batchExecuting || singleExecuting || retryTimers.size > 0) {
      return true
    }
    // Если повторные попытки включены и есть результаты, считаем что есть потенциально незавершенные задачи
    // Точная проверка ошибок будет выполнена позже при необходимости
    if (retryFailedHosts && batchResults.length > 0) {
      // Быстрая проверка: если хотя бы один результат имеет ошибку без результата
      for (let i = 0; i < batchResults.length; i++) {
        const r = batchResults[i]
        if (r.error !== null && !r.result) {
          return true
        }
      }
    }
    return false
  }, [batchExecuting, singleExecuting, retryTimers.size, retryFailedHosts, batchResults])

  // Функция для сохранения состояния рабочего пространства
  const saveWorkspaceState = () => {
    if (!hasUnfinishedTasks()) {
      // Если нет незавершенных задач, очищаем сохраненное состояние
      localStorage.removeItem('ssh-executor-workspace-state')
      return
    }

    const state: WorkspaceState = {
      batchExecuting,
      singleExecuting,
      progress,
      retryTimers: Array.from(retryTimers.entries()),
      retrying,
      retryCount,
      command,
      mode,
      batchResults: batchExecuting || retryTimers.size > 0 ? batchResults : undefined,
      singleResults: singleExecuting ? singleResults : undefined,
      savedAt: new Date().toISOString(),
    }

    try {
      localStorage.setItem('ssh-executor-workspace-state', JSON.stringify(state))
      console.log('[Workspace] Состояние рабочего пространства сохранено', {
        hasUnfinishedTasks: hasUnfinishedTasks(),
        batchExecuting,
        singleExecuting,
        retryTimersCount: retryTimers.size,
      })
    } catch (e) {
      console.warn('[Workspace] Ошибка сохранения состояния рабочего пространства:', e)
    }
  }

  // Функция для восстановления состояния рабочего пространства
  const restoreWorkspaceState = (): Partial<WorkspaceState> | null => {
    try {
      const saved = localStorage.getItem('ssh-executor-workspace-state')
      if (!saved) return null

      const state = JSON.parse(saved) as WorkspaceState
      
      // Проверяем, не устарело ли состояние (больше 24 часов)
      const savedAt = new Date(state.savedAt)
      const now = new Date()
      const hoursDiff = (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60)
      
      if (hoursDiff > 24) {
        console.log('[Workspace] Сохраненное состояние устарело (больше 24 часов), очищаем')
        localStorage.removeItem('ssh-executor-workspace-state')
        return null
      }

      console.log('[Workspace] Восстановление состояния рабочего пространства', {
        savedAt: state.savedAt,
        hoursDiff: hoursDiff.toFixed(2),
        batchExecuting: state.batchExecuting,
        singleExecuting: state.singleExecuting,
        retryTimersCount: state.retryTimers?.length || 0,
      })

      return state
    } catch (e) {
      console.warn('[Workspace] Ошибка восстановления состояния рабочего пространства:', e)
      localStorage.removeItem('ssh-executor-workspace-state')
      return null
    }
  }

  // Восстанавливаем состояние рабочего пространства при загрузке
  useEffect(() => {
    const restoredState = restoreWorkspaceState()
    if (restoredState) {
      // Восстанавливаем только если есть незавершенные задачи
      if (restoredState.batchExecuting || restoredState.singleExecuting || (restoredState.retryTimers && restoredState.retryTimers.length > 0)) {
        console.log('[Workspace] Обнаружены незавершенные задачи, восстанавливаем состояние')
        
        // Восстанавливаем результаты, если они были сохранены
        if (restoredState.batchResults) {
          setBatchResults(restoredState.batchResults)
        }
        if (restoredState.singleResults) {
          setSingleResults(restoredState.singleResults)
        }
        
        // Восстанавливаем таймеры повторных попыток
        if (restoredState.retryTimers && restoredState.retryTimers.length > 0) {
          setRetryTimers(new Map(restoredState.retryTimers))
        }
        
        // Восстанавливаем команду и режим
        if (restoredState.command) {
          setCommand(restoredState.command)
        }
        if (restoredState.mode) {
          setMode(restoredState.mode)
        }
        
        // Уведомление убрано - состояние восстанавливается автоматически и видно в интерфейсе
      }
    }
  }, []) // Выполняем только при монтировании компонента

  // Сохраняем состояние рабочего пространства при изменении незавершенных задач
  useEffect(() => {
    // Используем небольшую задержку, чтобы избежать частых сохранений
    const timeoutId = setTimeout(() => {
      saveWorkspaceState()
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [batchExecuting, singleExecuting, retryTimers, progress, command, mode, batchResults, singleResults, retryFailedHosts])
  
  // Command history and suggestions state
  const [commandHistory, setCommandHistory] = useState<string[]>(() => {
    if (settings.commands.saveHistory) {
      return loadCommandHistory(settings.commands.maxHistorySize)
    }
    return []
  })
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const commandInputRef = useRef<HTMLTextAreaElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const batchVirtualizer = useVirtualizer({
    count: batchResults.length,
    getScrollElement: () => batchParentRef.current,
    estimateSize: () => 280, // Увеличенная оценка для карточек с ошибками
    overscan: settings.performance.virtualizationBuffer,
    measureElement: typeof window !== 'undefined' && 'ResizeObserver' in window 
      ? (element) => element?.getBoundingClientRect().height ?? 0 
      : undefined,
  })

  // Track if mode was manually changed by user
  const modeManuallyChanged = useRef(false)
  const isInitialMount = useRef(true)

  // Очищаем таймеры и счетчики попыток при отключении повторных попыток
  useEffect(() => {
    if (!retryFailedHosts) {
      setRetryTimers(new Map())
      setRetryAttempts(new Map())
    }
  }, [retryFailedHosts])
  
  // Очищаем счетчики попыток при начале нового выполнения
  useEffect(() => {
    if (batchExecuting) {
      setRetryAttempts(new Map())
    }
  }, [batchExecuting])

  // Таймер обратного отсчета для повторных попыток
  useEffect(() => {
    if (retryTimers.size === 0 || !batchExecuting || !retryFailedHosts) {
      return
    }

    const interval = setInterval(() => {
      setRetryTimers(prev => {
        const newMap = new Map(prev)
        let hasUpdates = false
        
        for (const [host, timeLeft] of newMap.entries()) {
          if (timeLeft > 0) {
            newMap.set(host, timeLeft - 1)
            hasUpdates = true
          } else {
            // Таймер истек, но не удаляем - повторная попытка должна начаться
            // Удалим только когда получим новый результат
          }
        }
        
        return hasUpdates ? newMap : prev
      })
    }, 1000) // Обновляем каждую секунду

    return () => clearInterval(interval)
  }, [retryTimers, batchExecuting, retryFailedHosts])

  // Sync mode with URL params (only when URL changes)
  useEffect(() => {
    const modeParam = searchParams.get('mode')
    if (modeParam === 'batch' || modeParam === 'single') {
      setMode(modeParam)
      modeManuallyChanged.current = false // Reset flag when URL changes
    }
  }, [searchParams])

  // Apply default mode only on initial load if no URL param
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      const modeParam = searchParams.get('mode')
      if (!modeParam) {
        // Применяем настройку по умолчанию только при первой загрузке, если нет параметра в URL
        setMode(settings.connection.defaultMode)
      }
    }
  }, [searchParams, settings.connection.defaultMode])

  // Update URL when mode changes manually (but not on initial mount)
  useEffect(() => {
    if (modeManuallyChanged.current && !isInitialMount.current) {
      const params: Record<string, string> = {}
      if (mode === 'batch') {
        params.mode = 'batch'
      }
      setSearchParams(params, { replace: true })
    }
  }, [mode, setSearchParams])

  // Сохраняем режим в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('ssh-executor-mode', mode)
  }, [mode])

  // Сохраняем команду в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('ssh-executor-command', command)
  }, [command])

  // Обновляем историю при изменении настроек
  useEffect(() => {
    if (settings.commands.saveHistory) {
      const history = loadCommandHistory(settings.commands.maxHistorySize)
      setCommandHistory(history)
    } else {
      setCommandHistory([])
    }
  }, [settings.commands.saveHistory, settings.commands.maxHistorySize])

  // Обновляем подсказки при изменении команды
  useEffect(() => {
    if (settings.commands.showSuggestions && command.trim()) {
      const newSuggestions = getCommandSuggestions(
        command,
        commandHistory,
        settings.commands.favoriteCommands,
        10
      )
      setSuggestions(newSuggestions)
      setShowSuggestions(newSuggestions.length > 0)
      setSelectedSuggestionIndex(-1)
    } else if (!command.trim() && settings.commands.showSuggestions) {
      // Показываем избранные команды, если ввод пустой
      setSuggestions(settings.commands.favoriteCommands.slice(0, 10))
      setShowSuggestions(settings.commands.favoriteCommands.length > 0)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [command, commandHistory, settings.commands.showSuggestions, settings.commands.favoriteCommands])

  // Очистка таймера blur при размонтировании
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
        blurTimeoutRef.current = null
      }
    }
  }, [])

  // Hosts tab handlers
  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    setLoading(true)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const fileContent = Array.from(new Uint8Array(arrayBuffer))
      const extension = file.name.split('.').pop() || ''

      const filePath = await invoke<string>('save_temp_file', {
        content: fileContent,
        extension,
      })

      const parsedHosts = await invoke<HostEntry[]>('parse_hosts_file', {
        filePath,
      })

      setHosts(parsedHosts)
      setLastLoadedFilePath(filePath)
      // Сохраняем хосты в localStorage только если включено автосохранение
      if (settings.hosts.autoSave) {
        localStorage.setItem('ssh-executor-hosts', JSON.stringify(parsedHosts))
      }
      localStorage.setItem('ssh-executor-last-file-path', filePath)
      
      const activity = {
        type: 'host_loaded' as const,
        timestamp: new Date().toISOString(),
        success: true,
      }
      const existing = safeJsonParse(localStorage.getItem('ssh-executor-recent-activity'), [], (data): data is any[] => Array.isArray(data))
      existing.unshift(activity)
      localStorage.setItem('ssh-executor-recent-activity', JSON.stringify(existing.slice(0, 50)))
      
      showSuccessToast(`Загружено ${parsedHosts.length} хостов из файла`)
    } catch (error) {
      showErrorToast(humanizeError(error))
    } finally {
      setLoading(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    multiple: false,
  })

  // Commands tab handlers
  const handleCancel = async () => {
    try {
      await invoke('cancel_command_execution')
      
      // ВАЖНО: Очищаем слушатели событий при отмене
      cleanupEventListeners()
      
      // Сбрасываем состояние выполнения
      setBatchExecuting(false)
      setSingleExecuting(false)
      setProgress({ current: 0, total: 0 })
      setRetrying(false)
      setRetryCount(0)
      setRetryTimers(new Map()) // Очищаем таймеры повторных попыток
      // Очищаем сохраненное состояние рабочего пространства
      localStorage.removeItem('ssh-executor-workspace-state')
      showInfoToast('Выполнение команды отменено')
    } catch (error) {
      // Очищаем слушатели даже при ошибке
      cleanupEventListeners()
      
      showErrorToast(humanizeError(error))
      // Все равно сбрасываем состояние, даже если была ошибка
      setBatchExecuting(false)
      setSingleExecuting(false)
      setProgress({ current: 0, total: 0 })
      setRetrying(false)
      setRetryCount(0)
      setRetryTimers(new Map())
    }
  }

  const handleClearResults = () => {
    if (mode === 'batch') {
      if (batchResults.length === 0) {
        showInfoToast('Нет результатов для очистки')
        return
      }
      setBatchResults([])
      // Очищаем из localStorage, если автоматическая очистка отключена
      if (!settings.performance.autoCleanupResults) {
        localStorage.removeItem('ssh-executor-batch-results')
      }
      showSuccessToast('Результаты пакетного выполнения очищены')
    } else {
      if (singleResults.length === 0) {
        showInfoToast('Нет результатов для очистки')
        return
      }
      setSingleResults([])
      // Очищаем из localStorage, если автоматическая очистка отключена
      if (!settings.performance.autoCleanupResults) {
        localStorage.removeItem('ssh-executor-single-results')
      }
      showSuccessToast('Результаты выполнения очищены')
    }
  }

  const handleSingleExecute = async () => {
    if (!command.trim()) {
      showErrorToast('Не указана команда для выполнения.\n\nВведите команду в поле "Команда" перед выполнением.')
      return
    }
    
    // Валидация конфигурации с проверкой длины пароля и пути к ключу
    const validation = validateSshConfig({
      host: singleConfig.host,
      port: singleConfig.port,
      username: singleConfig.username,
      auth_method: singleConfig.auth_method,
      password: singleConfig.password,
      key_path: singleConfig.key_path,
      ppk_path: singleConfig.ppk_path,
      passwordMinLength: settings.security.passwordMinLength,
    })
    
    if (!validation.valid) {
      validation.errors.forEach(error => showErrorToast(error))
      return
    }

    setSingleExecuting(true)
    setSingleResults([])

    try {
      const sshConfig = {
        host: singleConfig.host,
        port: singleConfig.port,
        username: singleConfig.username,
        auth_method: singleConfig.auth_method,
        password: singleConfig.auth_method === 'password' ? singleConfig.password : undefined,
        key_path: singleConfig.auth_method === 'key' ? singleConfig.key_path : undefined,
        ppk_path: singleConfig.auth_method === 'ppk' ? singleConfig.ppk_path : undefined,
        passphrase: singleConfig.passphrase,
        timeout: singleConfig.timeout,
        keep_alive_interval: settings.connection.keepAliveInterval,
        reconnect_attempts: settings.connection.reconnectAttempts,
        reconnect_delay_base: settings.connection.reconnectDelayBase,
        compression_enabled: settings.connection.compressionEnabled,
        compression_level: settings.connection.compressionLevel,
      }

      const result = await invoke<CommandResult>('execute_ssh_command', {
        skipValidation: settings.security.disableCommandValidation,
        config: sshConfig,
        command,
      })

      const resultWithTimestamp = addTimestamp(result)
      setSingleResults([resultWithTimestamp])
      
      // Сохраняем команду в историю
      saveCommandToHistory(
        command,
        settings.commands.maxHistorySize,
        settings.commands.saveHistory
      )
      // Обновляем локальную историю
      if (settings.commands.saveHistory) {
        const updatedHistory = loadCommandHistory(settings.commands.maxHistorySize)
        setCommandHistory(updatedHistory)
      }
      
      const activity = {
        type: 'command' as const,
        host: singleConfig.host,
        command,
        timestamp: new Date().toISOString(),
        success: result.exit_status === 0,
      }
      const existing = safeJsonParse(localStorage.getItem('ssh-executor-recent-activity'), [], (data): data is any[] => Array.isArray(data))
      existing.unshift(activity)
      localStorage.setItem('ssh-executor-recent-activity', JSON.stringify(existing.slice(0, 50)))
      
      // Показываем соответствующее уведомление в зависимости от exit_status
      if (result.exit_status === 0) {
        showSuccessToast(humanizeSuccessMessage(result.exit_status, result.stdout))
      } else {
        // Команда выполнена, но с ошибкой - улучшаем сообщение
        const errorMsg = humanizeCommandError(result.exit_status, result.stderr, command)
        showErrorToast(errorMsg)
      }
    } catch (error) {
      const errorMessage = String(error)
      if (errorMessage.includes('отменено') || errorMessage.includes('отменен')) {
        showInfoToast('Выполнение команды отменено')
      } else {
        const activity = {
          type: 'command' as const,
          host: singleConfig.host,
          command,
          timestamp: new Date().toISOString(),
          success: false,
        }
        const existing = safeJsonParse(localStorage.getItem('ssh-executor-recent-activity'), [], (data): data is any[] => Array.isArray(data))
        existing.unshift(activity)
        localStorage.setItem('ssh-executor-recent-activity', JSON.stringify(existing.slice(0, 50)))
        
        showErrorToast(humanizeError(error))
      }
    } finally {
      setSingleExecuting(false)
      // Очищаем сохраненное состояние рабочего пространства, если все задачи завершены
      setTimeout(() => {
        // Проверяем состояние напрямую
        const currentSettings = loadSettings()
        const hasUnfinished = retryTimers.size > 0 || 
          (currentSettings.connection.retryFailedHosts && batchResults.some(r => r.error !== null && !r.result && isRetryableError(r.error)))
        if (!hasUnfinished) {
          localStorage.removeItem('ssh-executor-workspace-state')
          console.log('[Workspace] Все задачи завершены, сохраненное состояние очищено')
        }
      }, 1000)
    }
  }

  // Функция для обработки ошибок выполнения batch команд
  const handleBatchError = (error: unknown, hostsCount: number, commandPreview: string) => {
    console.error('[Batch Execute] ОШИБКА выполнения:', error)
    console.error('[Batch Execute] Тип ошибки:', typeof error)
    console.error('[Batch Execute] Стек ошибки:', error instanceof Error ? error.stack : 'Нет стека')
    
    const errorMessage = String(error)
    console.error('[Batch Execute] Сообщение об ошибке:', errorMessage)
    
    if (errorMessage.includes('отменено') || errorMessage.includes('отменен')) {
      console.log('[Batch Execute] Выполнение было отменено')
      showInfoToast('Выполнение команды отменено')
      return
    }
    
    // Улучшаем отображение ошибок для более понятных сообщений
    let displayError = errorMessage
    if (errorMessage.includes('Ошибка конфигурации')) {
      displayError = errorMessage
    } else if (errorMessage.includes('Key path') || errorMessage.includes('путь к ключу')) {
      displayError = 'Ошибка: путь к ключу не указан или указан неверно. Проверьте настройки аутентификации.'
    } else if (errorMessage.includes('Key file not found') || errorMessage.includes('файл ключа не найден')) {
      displayError = 'Ошибка: файл ключа не найден. Проверьте путь к ключу в настройках.'
    } else if (errorMessage.includes('Authentication failed') || errorMessage.includes('аутентификация не удалась')) {
      displayError = 'Ошибка: аутентификация не удалась. Проверьте правильность ключа, passphrase и соответствие ключа пользователю на сервере.'
    } else if (errorMessage.includes('Connection failed') || errorMessage.includes('не удалось установить соединение')) {
      displayError = 'Ошибка: не удалось установить соединение. Проверьте доступность хостов и правильность настроек подключения.'
    } else if (errorMessage.includes('Failed to create thread pool')) {
      displayError = 'Ошибка: не удалось создать пул потоков. Возможно, слишком большое значение max_concurrent.'
    } else if (errorMessage.includes('Ошибка валидации команды')) {
      displayError = errorMessage
    }
    
    // Улучшаем сообщение об ошибке для пользователя
    const improvedError = humanizeError(errorMessage)
    showErrorToast(`Ошибка пакетного выполнения на ${hostsCount} хостах:\n\n${improvedError}`)
    console.error('[Batch Execute] Детали ошибки:', {
      error,
      errorMessage,
      displayError,
      hostsCount,
      command: commandPreview,
    })
  }

  // Функция для очистки ресурсов после выполнения
  const cleanupBatchExecution = () => {
    // Отписываемся от событий
    cleanupEventListeners()
    
    // Сбрасываем состояние
    console.log('[Batch Execute] Завершение выполнения, сброс флага batchExecuting')
    setBatchExecuting(false)
    setProgress({ current: 0, total: 0 })
    setExecutionStartTime(null)
    setRetrying(false)
    setRetryCount(0)
    setRetryTimers(new Map())
    
    // Очищаем сохраненное состояние рабочего пространства, если все задачи завершены
    // Используем setTimeout для проверки после обновления состояния
    setTimeout(() => {
      // Проверяем состояние напрямую, так как функции могут быть недоступны в этом контексте
      const currentSettings = loadSettings()
      const hasUnfinished = retryTimers.size > 0 || 
        (currentSettings.connection.retryFailedHosts && batchResults.some(r => r.error !== null && !r.result))
      if (!hasUnfinished) {
        localStorage.removeItem('ssh-executor-workspace-state')
        console.log('[Workspace] Все задачи завершены, сохраненное состояние очищено')
      }
    }, 1000) // Небольшая задержка для проверки после обновления состояния
  }

  const handleBatchExecute = async () => {
    if (hosts.length === 0) {
      showErrorToast('Список хостов пуст.\n\nЗагрузите хосты:\n• Используйте кнопку "Загрузить хосты"\n• Или перетащите файл в область загрузки')
      // Scroll to hosts section
      document.querySelector('.grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (!command.trim()) {
      showErrorToast('Не указана команда для выполнения.\n\nВведите команду в поле "Команда" перед выполнением.')
      return
    }
    
    // Валидация конфигурации с проверкой длины пароля и пути к ключу
    const validation = validateSshConfig({
      host: 'batch', // Для пакетного режима хост не требуется
      port: batchConfig.port,
      username: batchConfig.username,
      auth_method: batchConfig.auth_method,
      password: batchConfig.password,
      key_path: batchConfig.key_path,
      ppk_path: batchConfig.ppk_path,
      passwordMinLength: settings.security.passwordMinLength,
    })
    
    if (!validation.valid) {
      validation.errors.forEach(error => showErrorToast(error))
      return
    }

    // Проверка существования файла ключа выполняется в Rust коде
    // Здесь не проверяем, так как Tauri имеет ограничения на доступ к файлам вне разрешенной области
    // (например, .ssh директория может быть вне scope)
    // Rust код корректно проверит существование файла перед подключением

    setBatchExecuting(true)
    setBatchResults([])
    setProgress({ current: 0, total: hosts.length })
    setExecutionStartTime(Date.now())
    setRetrying(false)
    setRetryCount(0)

    // Показываем уведомление с информацией о расчётном времени (если включено в настройках)
    if (settings.interface.showExecutionTimeEstimate && estimatedExecutionTime && hosts.length > 10) {
      const timeRange = estimatedExecutionTime.best === estimatedExecutionTime.worst 
        ? estimatedExecutionTime.best 
        : `${estimatedExecutionTime.best} – ${estimatedExecutionTime.worst}`
      showInfoToast(`Запуск выполнения на ${hosts.length} хостах\nОжидаемое время: ${timeRange}`)
    }

    console.log('[Batch Execute] Начало выполнения пакетной команды', {
      hostsCount: hosts.length,
      command: command.substring(0, 100),
      authMethod: batchConfig.auth_method,
      username: batchConfig.username,
      port: batchConfig.port,
    })

    // ВАЖНО: Очищаем старые слушатели перед регистрацией новых
    cleanupEventListeners()
    
    try {
      const sshConfig = {
        host: '',
        port: batchConfig.port,
        username: batchConfig.username,
        auth_method: batchConfig.auth_method,
        password: batchConfig.auth_method === 'password' ? batchConfig.password : undefined,
        key_path: batchConfig.auth_method === 'key' ? batchConfig.key_path : undefined,
        ppk_path: batchConfig.auth_method === 'ppk' ? batchConfig.ppk_path : undefined,
        passphrase: batchConfig.passphrase,
        timeout: batchConfig.timeout,
        keep_alive_interval: settings.connection.keepAliveInterval,
        reconnect_attempts: settings.connection.reconnectAttempts,
        reconnect_delay_base: settings.connection.reconnectDelayBase,
        compression_enabled: settings.connection.compressionEnabled,
        compression_level: settings.connection.compressionLevel,
      }

      console.log('[Batch Execute] Конфигурация SSH подготовлена', {
        hasPassword: !!sshConfig.password,
        hasKeyPath: !!sshConfig.key_path,
        timeout: sshConfig.timeout,
      })

      console.log('[Batch Execute] Вызов execute_batch_commands...', {
        hostsCount: hosts.length,
        command: command.substring(0, 50),
        maxConcurrent: batchConfig.max_concurrent,
      })
      
      // Инициализируем результаты для всех хостов со статусом "выполняется"
      // ОПТИМИЗАЦИЯ: очищаем очередь и инициализируем Map для быстрого поиска
      pendingResultsRef.current.clear()
      batchUpdateScheduledRef.current = false
      
      const initialResults: BatchCommandResult[] = hosts.map(host => ({
        result: null,
        error: null,
        host: host.ip,
        timestamp: new Date().toISOString(),
      }))
      const resultsWithTimestamp = initialResults.map(r => addTimestamp(r))
      
      // Инициализируем Map для O(1) поиска при обновлениях
      batchResultsMapRef.current = new Map(resultsWithTimestamp.map(r => [r.host, r]))
      setBatchResults(resultsWithTimestamp)
      
      try {
        // Слушаем события с результатами в реальном времени
        // ОПТИМИЗАЦИЯ для 5000+ хостов: используем батчинг обновлений через queueResultUpdate
        unlistenResultRef.current = await listen<BatchCommandResult>('batch-result', (event) => {
          const result = event.payload
          
          // Используем оптимизированную функцию батчинга для обновления результатов
          // Это снижает количество ререндеров с O(n) до O(1) для больших списков
          queueResultUpdate(result)
          
          // Получаем актуальное значение настройки повторных попыток
          const currentSettings = loadSettings()
          const currentRetryEnabled = currentSettings.connection.retryFailedHosts
          const currentRetryInterval = currentSettings.connection.retryInterval
          
          // Если результат отменен или повторные попытки отключены, очищаем таймер для этого хоста
          if (result.error?.includes('отменено') || result.error?.includes('отменен') || !currentRetryEnabled) {
            setRetryTimers(prev => {
              const newMap = new Map(prev)
              newMap.delete(result.host)
              return newMap
            })
          } else if (result.error !== null) {
            // Проверяем, имеет ли смысл повторять попытку для данной ошибки
            const shouldRetry = isRetryableError(result.error)
            
            if (shouldRetry) {
              // Проверяем лимит попыток перед запуском таймера
              setRetryAttempts(prevAttempts => {
                const currentAttempts = prevAttempts.get(result.host) || 0
                const maxAttempts = currentSettings.connection.retryMaxAttempts || 0
                
                // Проверяем лимит попыток (0 = бесконечно)
                if (maxAttempts === 0 || currentAttempts < maxAttempts) {
                  // Если есть ошибка, включен режим повторных попыток и ошибка может быть исправлена повторной попыткой, запускаем таймер
                  // Проверяем, что выполнение еще идет через функциональную форму setState
                  setBatchExecuting(prevExecuting => {
                    if (prevExecuting) {
                      setRetryTimers(prevTimers => {
                        const newMap = new Map(prevTimers)
                        newMap.set(result.host, currentRetryInterval)
                        return newMap
                      })
                    }
                    return prevExecuting
                  })
                  // Увеличиваем счетчик попыток
                  const newMap = new Map(prevAttempts)
                  newMap.set(result.host, currentAttempts + 1)
                  return newMap
                } else {
                  // Достигнут лимит попыток, не запускаем таймер
                  setRetryTimers(prev => {
                    const newMap = new Map(prev)
                    newMap.delete(result.host)
                    return newMap
                  })
                  return prevAttempts
                }
              })
            } else {
              // Ошибка не может быть исправлена повторной попыткой (например, неверный ключ), не запускаем таймер
              setRetryTimers(prev => {
                const newMap = new Map(prev)
                newMap.delete(result.host)
                return newMap
              })
            }
          } else if (result.result !== null) {
            // Если есть результат, убираем таймер
            setRetryTimers(prev => {
              const newMap = new Map(prev)
              newMap.delete(result.host)
              return newMap
            })
          }
        })
        
        // Слушаем события с прогрессом
        unlistenProgressRef.current = await listen<{ completed: number; total: number; host: string }>('batch-progress', (event) => {
          const progressData = event.payload
          setProgress({ current: progressData.completed, total: progressData.total })
          console.log(`[Batch Execute] Прогресс: ${progressData.completed}/${progressData.total} (${progressData.host})`)
        })
        
        const startTime = Date.now()
        const results = await invoke<BatchCommandResult[]>('execute_batch_commands', {
          request: {
            hosts,
            config_template: sshConfig,
            command,
            max_concurrent: batchConfig.max_concurrent,
            retry_failed_hosts: retryFailedHosts,
            retry_interval: retryInterval,
            skip_validation: settings.security.disableCommandValidation,
          },
        })
        const duration = Date.now() - startTime
        console.log(`[Batch Execute] Команда выполнена за ${duration}ms`)

        // Отписываемся от событий после завершения
        cleanupEventListeners()

        console.log('[Batch Execute] Получены финальные результаты', {
          totalResults: results.length,
          results: results.map(r => ({
            host: r.host,
            hasResult: !!r.result,
            hasError: !!r.error,
            error: r.error?.substring(0, 100),
          })),
        })

        // Обновляем результаты финальными данными (на случай, если какие-то события не пришли)
        const resultsWithTimestamp = results.map(r => addTimestamp(r))
        setBatchResults(resultsWithTimestamp)
        const successCount = results.filter(r => r.result !== null).length
        const failedCount = results.length - successCount
        const cancelledCount = results.filter(r => r.error?.includes('отменено') || r.error?.includes('отменен')).length
        
        console.log('[Batch Execute] Статистика выполнения', {
          successCount,
          failedCount,
          cancelledCount,
          total: results.length,
        })
        
        // Сохраняем команду в историю
        saveCommandToHistory(
          command,
          settings.commands.maxHistorySize,
          settings.commands.saveHistory
        )
        // Обновляем локальную историю
        if (settings.commands.saveHistory) {
          const updatedHistory = loadCommandHistory(settings.commands.maxHistorySize)
          setCommandHistory(updatedHistory)
        }
        
        const activity = {
          type: 'command' as const,
          host: `${hosts.length} хостов`,
          command,
          timestamp: new Date().toISOString(),
          success: successCount > 0,
        }
        const existing = safeJsonParse(localStorage.getItem('ssh-executor-recent-activity'), [], (data): data is any[] => Array.isArray(data))
        existing.unshift(activity)
        localStorage.setItem('ssh-executor-recent-activity', JSON.stringify(existing.slice(0, 50)))
        
        if (cancelledCount > 0) {
          showInfoToast(`Выполнение отменено.\n\nОбработано:\n• Успешно: ${successCount}\n• Ошибок: ${failedCount - cancelledCount}\n• Отменено: ${cancelledCount}`)
        } else {
          const totalHosts = hosts.length
          if (successCount === totalHosts) {
            showSuccessToast(`Все команды выполнены успешно\n\nОбработано ${totalHosts} из ${totalHosts} хостов`)
          } else if (failedCount === totalHosts) {
            showErrorToast(`Все команды завершились с ошибкой\n\nОшибок: ${failedCount} из ${totalHosts} хостов\n\nПроверьте:\n• Доступность хостов\n• Правильность команды\n• Права доступа на серверах`)
          } else {
            const message = retryFailedHosts && failedCount > 0
              ? `Выполнено с повторными попытками:\n• Успешно: ${successCount}\n• Ошибок: ${failedCount}\n• Всего хостов: ${totalHosts}`
              : `Выполнено:\n• Успешно: ${successCount}\n• Ошибок: ${failedCount}\n• Всего хостов: ${totalHosts}`
            
            if (successCount > failedCount) {
              showSuccessToast(message)
            } else {
              showErrorToast(message)
            }
          }
        }
      } catch (error) {
        handleBatchError(error, hosts.length, command.substring(0, 100))
      } finally {
        cleanupBatchExecution()
      }
    } catch (error) {
      handleBatchError(error, hosts.length, command.substring(0, 100))
    } finally {
      cleanupBatchExecution()
    }
  }

  const handleExport = async (results: CommandResult[] | BatchCommandResult[]) => {
    if (results.length === 0) {
      showErrorToast('Нет результатов для экспорта\n\nВыполните команды и получите результаты перед экспортом')
      return
    }

    try {
      const { save } = await import('@tauri-apps/api/dialog')
      
      const filters = []
      if (settings.export.defaultFormat === 'xlsx') {
        filters.push({ name: 'Excel', extensions: ['xlsx'] })
      } else if (settings.export.defaultFormat === 'csv') {
        filters.push({ name: 'CSV', extensions: ['csv'] })
      } else {
        filters.push({ name: 'JSON', extensions: ['json'] })
      }
      
      const filePath = await save({
        filters,
        defaultPath: settings.export.defaultPath || undefined,
      })

      if (filePath) {
        let exportResults: CommandResult[]
        if (mode === 'single') {
          // Добавляем команду и timestamp к результатам для экспорта
          exportResults = (results as CommandResult[]).map(r => ({
            ...r,
            command: command || undefined, // Добавляем команду, если она доступна
            timestamp: r.timestamp || new Date().toISOString(), // Убеждаемся, что timestamp есть
          }))
        } else {
          // Для пакетного выполнения команда уже должна быть в контексте
          exportResults = (results as BatchCommandResult[]).map(r => {
            if (r.result) {
              return {
                ...r.result,
                command: command || undefined, // Добавляем команду, если она доступна
                timestamp: r.result.timestamp || r.timestamp || new Date().toISOString(),
              }
            } else {
              return {
                host: r.host,
                stdout: '',
                stderr: r.error || 'Неизвестная ошибка',
                exit_status: -1,
                vehicle_id: undefined,
                command: command || undefined,
                timestamp: r.timestamp || new Date().toISOString(),
              }
            }
          })
        }
        
        if (settings.export.defaultFormat === 'xlsx') {
          const { exportToExcel } = await import('../utils/excel')
          await exportToExcel(exportResults, filePath, `Результаты ${mode === 'single' ? 'команд' : 'пакетного выполнения'}`)
        } else if (settings.export.defaultFormat === 'csv') {
          // Подготавливаем настройки столбцов для передачи в бэкенд
          const columnSettings = {
            host: settings.export.columns?.host ?? true,
            vehicle_id: settings.export.columns?.vehicleId ?? true,
            status: settings.export.columns?.status ?? true,
            exit_status: settings.export.columns?.exitStatus ?? true,
            stdout: settings.export.columns?.stdout ?? true,
            stderr: settings.export.columns?.stderr ?? true,
            timestamp: settings.export.columns?.timestamp ?? false,
            command: settings.export.columns?.command ?? false,
            column_order: settings.export.columnOrder || ['host', 'vehicleId', 'status', 'exitStatus', 'stdout', 'stderr'],
            include_headers: settings.export.includeHeaders,
          }
          
          await invoke('export_to_excel', {
            request: {
              results: exportResults,
              file_path: filePath,
              column_settings: columnSettings,
            },
          })
        } else {
          // Для JSON также фильтруем столбцы, если нужно
          // Но обычно JSON экспортируется полностью, поэтому оставляем как есть
          // Можно добавить опцию для фильтрации JSON в будущем
          const jsonContent = JSON.stringify(exportResults, null, 2)
          await invoke('save_file', {
            filePath,
            content: Array.from(new TextEncoder().encode(jsonContent))
          })
        }
        
        const activity = {
          type: 'export' as const,
          timestamp: new Date().toISOString(),
          success: true,
        }
        const existing = safeJsonParse(localStorage.getItem('ssh-executor-recent-activity'), [], (data): data is any[] => Array.isArray(data))
        existing.unshift(activity)
        localStorage.setItem('ssh-executor-recent-activity', JSON.stringify(existing.slice(0, 50)))
        
        showSuccessToast(`Результаты успешно экспортированы\n\nФайл: ${filePath}`)
        
        if (settings.export.autoOpenAfterExport) {
          const { open } = await import('@tauri-apps/api/shell')
          await open(filePath)
        }
      }
    } catch (error) {
      showErrorToast(humanizeError(error))
    }
  }


  // Динамическая статистика - учитываем только завершенные результаты (не те, что еще выполняются или ожидают повторной попытки)
  // ОПТИМИЗАЦИЯ: используем useMemo для кеширования вычислений при работе с 5000+ хостами
  // Это снижает нагрузку на CPU при частых обновлениях результатов
  const { completedResults, batchSuccessCount, batchErrorCount, batchInProgressCount } = useMemo(() => {
    const completed: BatchCommandResult[] = []
    let successCount = 0
    let errorCount = 0
    let inProgressCount = 0
    
    // Один проход по массиву вместо 4 отдельных filter()
    for (const r of batchResults) {
      const hasError = r.error !== null
      const hasResult = r.result !== null
      const isExecuting = batchExecuting && !hasError && !hasResult
      const isWaitingRetry = retryTimers.has(r.host)
      
      if (isExecuting || isWaitingRetry) {
        inProgressCount++
      } else if (hasResult || hasError) {
        completed.push(r)
        
        if (r.result !== null && r.result!.exit_status === 0) {
          successCount++
        }
        if (hasError || (r.result !== null && r.result!.exit_status !== 0)) {
          errorCount++
        }
      }
    }
    
    return {
      completedResults: completed,
      batchSuccessCount: successCount,
      batchErrorCount: errorCount,
      batchInProgressCount: inProgressCount,
    }
  }, [batchResults, batchExecuting, retryTimers])

  // Вычисляем оценку оставшегося времени для больших партий
  const estimatedTimeRemaining = useMemo(() => {
    if (!executionStartTime || progress.current === 0 || progress.total === 0) {
      return null
    }
    const elapsed = Date.now() - executionStartTime
    const averageTimePerHost = elapsed / progress.current
    const remaining = (progress.total - progress.current) * averageTimePerHost
    
    if (remaining < 1000) return 'менее 1 сек'
    if (remaining < 60000) return `~${Math.ceil(remaining / 1000)} сек`
    if (remaining < 3600000) return `~${Math.ceil(remaining / 60000)} мин`
    return `~${(remaining / 3600000).toFixed(1)} ч`
  }, [executionStartTime, progress.current, progress.total])

  // Скорость выполнения (хостов в секунду)
  const executionSpeed = useMemo(() => {
    if (!executionStartTime || progress.current === 0) return null
    const elapsed = (Date.now() - executionStartTime) / 1000
    return (progress.current / elapsed).toFixed(1)
  }, [executionStartTime, progress.current])

  // Расчёт ожидаемого времени выполнения ДО запуска
  const estimatedExecutionTime = useMemo(() => {
    if (hosts.length === 0) return null
    
    const timeout = batchConfig.timeout || settings.connection.defaultTimeout
    const reconnectAttempts = settings.connection.reconnectAttempts
    const maxConcurrent = batchConfig.max_concurrent || settings.connection.maxConcurrent
    const delayBase = settings.connection.reconnectDelayBase || 1
    
    // Расчёт задержек между retry с учётом базы: base * (1 + 2 + 4 + ...) = base * (2^n - 1)
    const delaySum = reconnectAttempts > 1 ? delayBase * (Math.pow(2, reconnectAttempts - 1) - 1) : 0
    
    // Худший случай: все хосты недоступны (timeout на каждую попытку + delays)
    const worstCasePerHost = timeout * reconnectAttempts + delaySum
    
    // Лучший случай: все хосты доступны (~1-2 сек на подключение + выполнение)
    const bestCasePerHost = 2
    
    // Количество "волн" параллельного выполнения
    const waves = Math.ceil(hosts.length / maxConcurrent)
    
    // Общее время
    const worstTotal = worstCasePerHost * waves
    const bestTotal = bestCasePerHost * waves
    
    // Форматирование времени
    const formatTime = (seconds: number): string => {
      if (seconds < 60) return `${Math.ceil(seconds)} сек`
      if (seconds < 3600) return `${Math.ceil(seconds / 60)} мин`
      return `${(seconds / 3600).toFixed(1)} ч`
    }
    
    return {
      best: formatTime(bestTotal),
      worst: formatTime(worstTotal),
      waves,
      hostsPerWave: Math.min(hosts.length, maxConcurrent),
      timeout,
      reconnectAttempts,
      delayBase,
    }
  }, [hosts.length, batchConfig.timeout, batchConfig.max_concurrent, settings.connection.defaultTimeout, settings.connection.reconnectAttempts, settings.connection.maxConcurrent, settings.connection.reconnectDelayBase])

  // Обработка клавиш для навигации по истории и подсказкам
  const handleCommandKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Навигация по истории
    if (e.key === 'ArrowUp' && commandHistory.length > 0) {
      e.preventDefault()
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setCommand(commandHistory[newIndex])
        setShowSuggestions(false)
      }
      return
    }

    if (e.key === 'ArrowDown' && commandHistory.length > 0) {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setCommand(commandHistory[newIndex])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setCommand('')
      }
      setShowSuggestions(false)
      return
    }

    // Максимальное количество видимых подсказок
    const maxVisibleSuggestions = 4
    const visibleSuggestions = suggestions.slice(0, maxVisibleSuggestions)

    // Навигация по подсказкам
    if (showSuggestions && visibleSuggestions.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const newIndex = selectedSuggestionIndex > 0 
          ? selectedSuggestionIndex - 1 
          : visibleSuggestions.length - 1
        setSelectedSuggestionIndex(newIndex)
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const newIndex = selectedSuggestionIndex < visibleSuggestions.length - 1
          ? selectedSuggestionIndex + 1
          : 0
        setSelectedSuggestionIndex(newIndex)
        return
      }

      // Enter или Tab выбирают подсказку
      if ((e.key === 'Enter' || e.key === 'Tab') && selectedSuggestionIndex >= 0 && selectedSuggestionIndex < visibleSuggestions.length) {
        e.preventDefault()
        setCommand(visibleSuggestions[selectedSuggestionIndex])
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        return
      }
    }

    // Автодополнение по Tab (только если нет открытых подсказок с выбором)
    if (e.key === 'Tab' && settings.commands.autoComplete && command.trim() && !(showSuggestions && selectedSuggestionIndex >= 0)) {
      e.preventDefault()
      const autocompleted = autocompleteCommand(
        command,
        commandHistory,
        settings.commands.favoriteCommands
      )
      if (autocompleted) {
        setCommand(autocompleted)
        setShowSuggestions(false)
      }
      return
    }

    // Сброс индекса истории при вводе
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
      setHistoryIndex(-1)
    }
  }

  // Добавление команды в избранное
  const handleAddToFavorites = () => {
    if (!command.trim()) {
      showErrorToast('Не указана команда\n\nВведите команду в поле "Команда" перед добавлением в избранное')
      return
    }
    
    const currentSettings = loadSettings()
    const favorites = currentSettings.commands.favoriteCommands || []
    
    if (favorites.includes(command.trim())) {
      showInfoToast('Команда уже добавлена в избранное')
      return
    }
    
    const updatedFavorites = [...favorites, command.trim()]
    saveSettings({
      ...currentSettings,
      commands: {
        ...currentSettings.commands,
        favoriteCommands: updatedFavorites,
      },
    })
    window.dispatchEvent(new Event('settings-changed'))
    showSuccessToast('Команда добавлена в избранное')
  }

  // Проверка, находится ли команда в избранном
  const isFavorite = settings.commands.favoriteCommands.includes(command.trim())
  const isBatchMode = mode === 'batch'
  const isSingleMode = mode === 'single'

  return (
    <div className="space-y-3 w-full">
      {/* Header - компактный */}
      <div className="card px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-button border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
            <TerminalIcon className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Рабочая область
          </h1>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            — SSH команды
          </span>
        </div>
      </div>

      {/* Unified Layout */}
      {mode === 'batch' ? (
        <div className="grid grid-cols-4 gap-3">
          {/* Left Column - Commands Section */}
          <div className="col-span-3 space-y-3 min-w-0">
            {/* Unified Configuration and Command Card */}
            <div id="commands-section" className="card p-4">
              {/* Configuration */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-4">
                  <ServerIcon className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                  <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Подключение
                  </h3>
                </div>
              {/* Используем 2 колонки для лучшего распределения */}
              <div className="grid grid-cols-2 gap-4">
                {/* Левая колонка - Основные настройки */}
                <div className="space-y-3">
                  {/* Режим работы */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                        Аутентификация
                      </label>
                      <SegmentedControl
                        options={[
                          { value: 'password', label: 'Пароль', icon: KeyIcon },
                          { value: 'key', label: 'SSH', icon: KeyIcon },
                          { value: 'ppk', label: 'PPK', icon: KeyIcon },
                        ]}
                        value={batchConfig.auth_method}
                        onChange={(value) =>
                          setBatchConfig({
                            ...batchConfig,
                            auth_method: value as 'password' | 'key' | 'ppk',
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                        Режим
                      </label>
                      <SegmentedControl
                        options={[
                          { value: 'single', label: 'Одиночный', icon: UserIcon },
                          { value: 'batch', label: 'Пакетный', icon: UsersIcon },
                        ]}
                        value={mode}
                        onChange={(value) => {
                          modeManuallyChanged.current = true
                          setMode(value as Mode)
                        }}
                      />
                    </div>
                  </div>

                  {/* Учетные данные */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                        Пользователь
                      </label>
                      <input
                        type="text"
                        value={batchConfig.username}
                        onChange={(e) =>
                          setBatchConfig({ ...batchConfig, username: e.target.value })
                        }
                        className="input-modern w-full"
                        placeholder="root"
                      />
                    </div>
                    {batchConfig.auth_method === 'password' ? (
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                          Пароль
                        </label>
                        <input
                          type="password"
                          value={batchConfig.password || ''}
                          onChange={(e) => setBatchConfig({ ...batchConfig, password: e.target.value })}
                          className="input-modern w-full"
                          placeholder="••••••••"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                          Passphrase
                          <HelpTooltip text="Пароль для доступа к зашифрованному ключу." />
                        </label>
                        <input
                          type="password"
                          value={batchConfig.passphrase || ''}
                          onChange={(e) => setBatchConfig({ ...batchConfig, passphrase: e.target.value })}
                          className="input-modern w-full"
                          placeholder="Опционально"
                        />
                      </div>
                    )}
                  </div>

                  {/* SSH ключ (если выбран) */}
                  {batchConfig.auth_method === 'key' && (
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                        SSH ключ
                        <HelpTooltip text="Путь к файлу приватного ключа в формате PEM (OpenSSH)." />
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={batchConfig.key_path || ''}
                          onChange={(e) => setBatchConfig({ ...batchConfig, key_path: e.target.value })}
                          className="flex-1 input-modern"
                          placeholder={settings.connection.defaultKeyPath || "~/.ssh/id_rsa"}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const { open } = await import('@tauri-apps/api/dialog')
                              const filePath = await open({ multiple: false })
                              if (filePath && typeof filePath === 'string') {
                                setBatchConfig({ ...batchConfig, key_path: filePath })
                              }
                            } catch (error) {
                              showErrorToast(humanizeError(error))
                            }
                          }}
                          className="btn-secondary px-3 py-2"
                        >
                          ...
                        </button>
                      </div>
                    </div>
                  )}

                  {/* PPK ключ (если выбран) */}
                  {batchConfig.auth_method === 'ppk' && (
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                        PPK ключ
                        <HelpTooltip text="Путь к файлу приватного ключа в формате PuTTY (PPK)." />
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={batchConfig.ppk_path || ''}
                          onChange={(e) => setBatchConfig({ ...batchConfig, ppk_path: e.target.value })}
                          className="flex-1 input-modern"
                          placeholder="~/.ssh/key.ppk"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const { open } = await import('@tauri-apps/api/dialog')
                              const filePath = await open({ multiple: false })
                              if (filePath && typeof filePath === 'string') {
                                setBatchConfig({ ...batchConfig, ppk_path: filePath })
                              }
                            } catch (error) {
                              showErrorToast(humanizeError(error))
                            }
                          }}
                          className="btn-secondary px-3 py-2"
                        >
                          ...
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Правая колонка - Параметры выполнения */}
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                        Потоков
                        <HelpTooltip text="Сколько команд выполнять одновременно. Рекомендуется 50-100." />
                      </label>
                      <input
                        type="number"
                        value={batchConfig.max_concurrent}
                        onChange={(e) =>
                          setBatchConfig({
                            ...batchConfig,
                            max_concurrent: parseInt(e.target.value) || settings.connection.maxConcurrent,
                          })
                        }
                        className="input-modern w-full"
                        min="1"
                        max="500"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                        Повтор
                        <HelpTooltip text="Повторять попытки для недоступных хостов." />
                      </label>
                      <div className="flex items-center h-[38px]">
                        <ToggleSwitch
                          checked={retryFailedHosts}
                          onChange={(checked) => {
                            const currentSettings = loadSettings()
                            saveSettings({
                              ...currentSettings,
                              connection: {
                                ...currentSettings.connection,
                                retryFailedHosts: checked,
                              },
                            })
                            window.dispatchEvent(new Event('settings-changed'))
                          }}
                        />
                        <span className="ml-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {retryFailedHosts ? 'Вкл' : 'Выкл'}
                        </span>
                      </div>
                    </div>
                    {retryFailedHosts && (
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                          Интервал
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={retryInterval}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || settings.connection.retryInterval
                              const currentSettings = loadSettings()
                              saveSettings({
                                ...currentSettings,
                                connection: {
                                  ...currentSettings.connection,
                                  retryInterval: value,
                                },
                              })
                              window.dispatchEvent(new Event('settings-changed'))
                            }}
                            className="input-modern w-16"
                            min="5"
                            max="300"
                          />
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>с</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Информация о хостах и ожидаемое время */}
                  <div className="px-3 py-2 rounded-button space-y-1.5" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Хостов:</span>
                      <span className="text-sm font-semibold" style={{ color: hosts.length > 0 ? 'var(--accent-primary)' : 'var(--text-tertiary)' }}>
                        {hosts.length}
                      </span>
                    </div>
                    {settings.interface.showExecutionTimeEstimate && estimatedExecutionTime && hosts.length > 0 && !batchExecuting && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                            Время
                            <HelpTooltip text={`Расчёт времени выполнения:\n• Таймаут: ${estimatedExecutionTime.timeout} сек\n• Реконнект: ${estimatedExecutionTime.reconnectAttempts} попыток\n• Задержка: ${estimatedExecutionTime.delayBase}с (×2 каждый раз)\n• Потоков: ${estimatedExecutionTime.hostsPerWave}\n\nЛучший случай: все хосты доступны.\nХудший случай: все хосты недоступны.`} />
                          </span>
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {estimatedExecutionTime.best === estimatedExecutionTime.worst 
                              ? estimatedExecutionTime.best 
                              : `${estimatedExecutionTime.best} – ${estimatedExecutionTime.worst}`}
                          </span>
                        </div>
                        {hosts.length > batchConfig.max_concurrent && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Волн:</span>
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {estimatedExecutionTime.waves} × {estimatedExecutionTime.hostsPerWave}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              </div>

              {/* Divider */}
              <div className="my-4 border-t" style={{ borderColor: 'var(--border-secondary)' }}></div>

              {/* Command Input */}
              <div id="command-input" className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <TerminalIcon className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                  <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Команда</h3>
                  {settings.security.disableCommandValidation && (
                    <span 
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{ 
                        backgroundColor: 'rgba(239, 68, 68, 0.15)', 
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.3)'
                      }}
                      title="Валидация команд отключена в настройках безопасности"
                    >
                      ⚠️ Валидация отключена
                    </span>
                  )}
                </div>
              <div className="relative">
                <textarea
                  ref={commandInputRef}
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={handleCommandKeyDown}
                  onFocus={() => {
                    if (settings.commands.showSuggestions && (command.trim() || settings.commands.favoriteCommands.length > 0)) {
                      setShowSuggestions(true)
                    }
                  }}
                  onBlur={() => {
                    if (blurTimeoutRef.current) {
                      clearTimeout(blurTimeoutRef.current)
                    }
                    blurTimeoutRef.current = setTimeout(() => {
                      setShowSuggestions(false)
                      blurTimeoutRef.current = null
                    }, 200)
                  }}
                  className="w-full px-3 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300/30 font-mono text-sm transition-all duration-200 resize-none"
                  style={{
                    border: '1px solid var(--border-primary)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    minHeight: '80px'
                  }}
                  rows={3}
                  placeholder={`Введите команду для ${hosts.length} хостов...`}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute left-4 flex items-center gap-1.5 flex-wrap pointer-events-auto"
                    style={{
                      bottom: '12px',
                      maxWidth: 'calc(100% - 32px)',
                    }}
                  >
                    {suggestions.slice(0, 4).map((suggestion, idx) => {
                      const isFavorite = settings.commands.favoriteCommands.includes(suggestion)
                      const isSelected = idx === selectedSuggestionIndex
                      return (
                        <div
                          key={idx}
                          className="px-2 py-0.5 cursor-pointer rounded-full font-mono transition-all"
                          style={{
                            backgroundColor: isSelected ? 'var(--bg-hover)' : 'transparent',
                            color: isSelected ? 'var(--text-primary)' : 'var(--text-tertiary)',
                            fontSize: '11px',
                            opacity: isSelected ? 1 : 0.7,
                            border: isSelected ? '1px solid var(--border-secondary)' : '1px dashed var(--border-secondary)',
                          }}
                          onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                          onClick={() => {
                            setCommand(suggestion)
                            setShowSuggestions(false)
                            setSelectedSuggestionIndex(-1)
                            commandInputRef.current?.focus()
                          }}
                        >
                          {suggestion}{isFavorite && ' ★'}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  {command.trim() && !isFavorite && (
                    <button
                      type="button"
                      onClick={handleAddToFavorites}
                      className="px-2 py-1.5 rounded-button text-xs flex items-center gap-1.5"
                      style={{
                        backgroundColor: 'transparent',
                        color: 'var(--text-tertiary)',
                        border: '1px dashed var(--border-secondary)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                        e.currentTarget.style.color = 'var(--text-secondary)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                        e.currentTarget.style.color = 'var(--text-tertiary)'
                      }}
                      title="Добавить в избранное"
                    >
                      <span>★</span>
                      <span>В избранное</span>
                    </button>
                  )}
                  {isFavorite && (
                    <div className="px-2 py-1.5 rounded-button text-xs flex items-center gap-1.5" style={{ color: 'var(--accent-primary)' }}>
                      <span>★</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  {batchExecuting ? (
                    <button
                      onClick={handleCancel}
                      className="px-4 py-2 bg-red-500 text-white rounded-button font-medium shadow-sm hover:bg-red-600 active:scale-[0.98] transition-all flex items-center gap-1.5 text-sm"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                      Стоп
                    </button>
                  ) : (
                    <button
                      onClick={handleBatchExecute}
                      disabled={hosts.length === 0}
                      className="btn-primary px-4 py-2"
                    >
                      <PlayIcon className="w-3.5 h-3.5" />
                      Выполнить
                    </button>
                  )}
                  {batchResults.length > 0 && (
                    <>
                      <button
                        onClick={() => handleExport(batchResults)}
                        className="px-3 py-2 bg-green-600 text-white rounded-button font-medium shadow-sm hover:bg-green-700 active:scale-[0.98] transition-all flex items-center gap-1.5 text-sm"
                      >
                        <DownloadIcon className="w-3.5 h-3.5" />
                        Экспорт
                      </button>
                      <button
                        onClick={handleClearResults}
                        className="px-3 py-2 rounded-button font-medium transition-all flex items-center gap-1.5 text-sm"
                        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }}
                        title="Очистить"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

            {/* Progress + Statistics (Batch only) - компактная строка */}
            {(batchExecuting || batchResults.length > 0) && (
              <div className="card px-4 py-3 flex-shrink-0">
                <div className="flex items-center justify-between gap-4">
                  {/* Левая часть - прогресс-бар */}
                  {batchExecuting && progress.total > 0 && (
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex-1 max-w-xs">
                        <div className="w-full rounded-full h-2 overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                          <div
                            className="h-2 rounded-full transition-all duration-300"
                            style={{ 
                              backgroundColor: 'var(--accent-primary)',
                              width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                        {progress.current}/{progress.total}
                        {estimatedTimeRemaining && progress.total >= 50 && ` • ${estimatedTimeRemaining}`}
                      </span>
                    </div>
                  )}
                  
                  {/* Правая часть - статистика */}
                  {batchResults.length > 0 && (
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Всего:</span>
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{completedResults.length}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Успех:</span>
                        <span className="text-sm font-semibold" style={{ color: '#16a34a' }}>{batchSuccessCount}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Ошибок:</span>
                        <span className="text-sm font-semibold text-red-600">{batchErrorCount}</span>
                      </div>
                      {batchInProgressCount > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>В процессе:</span>
                          <span className="text-sm font-semibold" style={{ color: 'var(--accent-primary)' }}>{batchInProgressCount}</span>
                        </div>
                      )}
                      {retryTimers.size > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs" style={{ color: '#f59e0b' }}>Повтор:</span>
                          <span className="text-sm font-semibold" style={{ color: '#f59e0b' }}>{retryTimers.size}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Batch Results */}
            {batchResults.length > 0 && (
              <div className="card">
                <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-tertiary)' }}>
                  <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Результаты ({batchResults.length})</h3>
                  <button
                    onClick={handleClearResults}
                    className="px-2 py-1 rounded text-xs flex items-center gap-1 transition-all hover:bg-red-500 hover:text-white"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Очистить"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
                <div ref={batchParentRef} className="h-[450px] overflow-auto" style={{ contain: 'layout style', minWidth: 0 }}>
                  <div
                    style={{
                      height: `${batchVirtualizer.getTotalSize()}px`,
                      width: '100%',
                      minWidth: 0,
                      position: 'relative',
                      boxSizing: 'border-box'
                    }}
                  >
                    {batchVirtualizer.getVirtualItems().map((virtualRow) => {
                      const batchResult = batchResults[virtualRow.index]
                      if (!batchResult) return null
                      
                      const hasError = batchResult.error !== null && batchResult.error.trim() !== ''
                      const result = batchResult.result
                      // Проверяем, ожидает ли хост повторной попытки (приоритетнее, чем выполнение)
                      const isWaitingRetry = retryTimers.has(batchResult.host)
                      const retryTimeLeft = retryTimers.get(batchResult.host) || 0
                      // Показываем "выполняется" только если выполнение активно И нет результата И нет ошибки И не ожидается повтор
                      const isExecuting = batchExecuting && !hasError && !result && !isWaitingRetry

                      return (
                        <div
                          key={`${batchResult.host}-${batchResult.timestamp || virtualRow.index}-${virtualRow.index}`}
                          data-index={virtualRow.index}
                          ref={batchVirtualizer.measureElement}
                          className="px-3 py-2.5 border-b transition-all"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                            borderColor: 'var(--border-secondary)',
                            boxSizing: 'border-box',
                            minWidth: 0
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                        >
                          <div className="flex items-start justify-between mb-2" style={{ minWidth: 0, width: '100%' }}>
                            <div className="flex items-center gap-2" style={{ minWidth: 0, flex: '1 1 auto' }}>
                              <div
                                className="p-1.5 rounded"
                                style={{
                                  backgroundColor: isWaitingRetry
                                    ? 'rgba(245, 158, 11, 0.15)'
                                    : hasError 
                                    ? 'rgba(239, 68, 68, 0.15)' 
                                    : isExecuting
                                      ? 'rgba(59, 130, 246, 0.15)'
                                      : result?.exit_status === 0 
                                        ? 'rgba(34, 197, 94, 0.15)' 
                                        : result
                                          ? 'rgba(234, 179, 8, 0.15)'
                                          : 'rgba(156, 163, 175, 0.15)'
                                }}
                              >
                                {isExecuting ? (
                                  <div 
                                    className="w-4 h-4 border-2 rounded-full animate-spin"
                                    style={{
                                      borderColor: '#3b82f6',
                                      borderTopColor: 'transparent'
                                    }}
                                  />
                                ) : isWaitingRetry ? (
                                  <div 
                                    className="w-4 h-4 border-2 rounded-full animate-spin"
                                    style={{
                                      borderColor: '#f59e0b',
                                      borderTopColor: 'transparent'
                                    }}
                                  />
                                ) : (
                                  <ServerIcon
                                    className="w-4 h-4"
                                    style={{
                                      color: hasError 
                                        ? '#dc2626' 
                                        : result?.exit_status === 0 
                                          ? '#16a34a' 
                                          : result
                                            ? '#ca8a04'
                                            : '#9ca3af'
                                    }}
                                  />
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{batchResult.host}</span>
                                {result?.vehicle_id && (
                                  <span className="text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>
                                    #{result.vehicle_id}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isWaitingRetry ? (
                              <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                                {retryTimeLeft}с
                              </span>
                            ) : hasError ? (
                              <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">
                                ✗
                              </span>
                            ) : isExecuting ? (
                              <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                                ...
                              </span>
                            ) : result ? (
                              <span
                                className="px-2 py-1 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: result.exit_status === 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  color: result.exit_status === 0 ? '#16a34a' : '#dc2626'
                                }}
                              >
                                {result.exit_status === 0 ? '✓' : result.exit_status}
                              </span>
                            ) : null}
                          </div>
                          {isWaitingRetry ? (
                            <div className="mt-2 px-2 py-1.5 rounded text-xs" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
                              <span style={{ color: '#f59e0b' }}>Повтор через {retryTimeLeft}с</span>
                              {hasError && (
                                <span className="ml-2" style={{ color: 'var(--text-tertiary)' }}>
                                  — {humanizeError(batchResult.error || '').substring(0, 50)}...
                                </span>
                              )}
                            </div>
                          ) : hasError ? (
                            <div className="mt-2" style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
                              <ErrorMessage error={batchResult.error || ''} />
                            </div>
                          ) : result ? (
                            <>
                              {result.stdout && (
                                <div className="mt-2">
                                  <pre className="px-2 py-1.5 rounded text-xs overflow-x-auto max-h-20 font-mono" style={{ backgroundColor: '#1a1a1a', color: '#4ade80' }}>
                                    {result.stdout}
                                  </pre>
                                </div>
                              )}
                              {result.stderr && (
                                <div className="mt-2">
                                  <pre className="px-2 py-1.5 rounded text-xs overflow-x-auto max-h-16 font-mono" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#dc2626' }}>
                                    {result.stderr}
                                  </pre>
                                </div>
                              )}
                            </>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Loading - показываем только если нет результатов и выполнение идет */}
            {batchExecuting && batchResults.length === 0 && (
              <div className="card p-8 text-center">
                <div 
                  className="inline-block animate-spin rounded-full h-8 w-8 border-4"
                  style={{
                    borderColor: 'var(--bg-tertiary)',
                    borderTopColor: 'var(--accent-primary)'
                  }}
                ></div>
                <p className="mt-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Выполнение команды...</p>
              </div>
            )}
          </div>

          {/* Right Column - Hosts Section */}
          <div className="col-span-1">
            <div className="card p-2 sticky top-3">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-1.5">
                  <ServerIcon className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Хосты
                  </span>
                  {hosts.length > 0 && (
                    <span className="text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
                      {hosts.length}
                    </span>
                  )}
                </div>
                {hosts.length > 0 && (
                  <button
                    onClick={() => {
                      setHosts([])
                      setLastLoadedFilePath(null)
                      localStorage.removeItem('ssh-executor-hosts')
                      localStorage.removeItem('ssh-executor-last-file-path')
                    }}
                    className="p-1 rounded hover:bg-red-100 transition-colors"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </div>

              {hosts.length === 0 ? (
                <div
                  {...getRootProps()}
                  className={`px-3 py-4 text-center cursor-pointer transition-all rounded border-2 border-dashed ${isDragActive ? 'scale-[1.01]' : ''}`}
                  style={isDragActive ? { 
                    borderColor: 'var(--accent-primary)',
                    backgroundColor: 'var(--bg-hover)'
                  } : {
                    borderColor: 'var(--border-secondary)',
                    backgroundColor: 'var(--bg-tertiary)'
                  }}
                >
                  <input {...getInputProps()} />
                  <UploadIcon 
                    className="w-5 h-5 mx-auto mb-1" 
                    style={{ color: isDragActive ? 'var(--accent-primary)' : 'var(--text-tertiary)' }} 
                  />
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {isDragActive ? 'Отпустите' : 'Загрузить хосты'}
                  </p>
                </div>
              ) : (
                <div>
                  <div
                    ref={hostsParentRef}
                    className="h-[calc(100vh-160px)] overflow-auto rounded border"
                    style={{ 
                      contain: 'strict',
                      borderColor: 'var(--border-secondary)',
                      backgroundColor: 'var(--bg-primary)'
                    }}
                  >
                    <div
                      style={{
                        height: `${hostsVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                      }}
                    >
                      {hostsVirtualizer.getVirtualItems().map((virtualRow) => {
                        const { host, groupName } = groupedHosts[virtualRow.index]
                        const hostColor = settings.hosts.showColors ? getHostColor(host, virtualRow.index) : '#16a34a'
                        const showGroup = settings.hosts.groupByTags && groupName

                        return (
                          <div
                            key={`${host.ip}-${host.port || 'default'}-${groupName || 'default'}-${virtualRow.index}`}
                            className="px-2 py-1.5 border-b transition-all"
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: `${virtualRow.size}px`,
                              transform: `translateY(${virtualRow.start}px)`,
                              borderColor: 'var(--border-secondary)',
                              borderLeft: settings.hosts.showColors ? `2px solid ${hostColor}` : undefined
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                {showGroup && (
                                  <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                                    {groupName}
                                  </p>
                                )}
                                <p className="font-medium text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                                  {host.ip}
                                  {host.port && host.port !== 22 && (
                                    <span style={{ color: 'var(--text-tertiary)' }}>:{host.port}</span>
                                  )}
                                </p>
                              </div>
                              {host.hostname && (
                                <span className="text-xs truncate max-w-[60px]" style={{ color: 'var(--text-tertiary)' }}>
                                  {host.hostname}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {loading && (
                    <div className="p-4 text-center">
                      <div 
                        className="inline-block animate-spin rounded-full h-6 w-6 border-3"
                        style={{
                          borderColor: 'var(--bg-tertiary)',
                          borderTopColor: 'var(--accent-primary)'
                        }}
                      ></div>
                      <p className="mt-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Загрузка...</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Unified Configuration and Command Card */}
          <div id="commands-section" className="card p-4">
            {/* Configuration */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-4">
                <ServerIcon className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Подключение
                </h3>
              </div>
            {/* Улучшенная сетка для Single режима */}
            <div className="grid grid-cols-2 gap-4">
              {/* Левая колонка - Подключение */}
              <div className="space-y-3">
                {/* Хост и режим */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                      Хост
                    </label>
                    <input
                      type="text"
                      value={singleConfig.host}
                      onChange={(e) => setSingleConfig({ ...singleConfig, host: e.target.value })}
                      className="input-modern w-full"
                      placeholder="192.168.1.1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                      Режим
                    </label>
                    <SegmentedControl
                      options={[
                        { value: 'single', label: 'Одиночный', icon: UserIcon },
                        { value: 'batch', label: 'Пакетный', icon: UsersIcon },
                      ]}
                      value={mode}
                      onChange={(value) => {
                        modeManuallyChanged.current = true
                        setMode(value as Mode)
                      }}
                    />
                  </div>
                </div>

                {/* Порт, Таймаут и метод аутентификации */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                      Порт
                    </label>
                    <input
                      type="number"
                      value={singleConfig.port}
                      onChange={(e) => setSingleConfig({ ...singleConfig, port: parseInt(e.target.value) || 22 })}
                      className="input-modern w-full"
                      min="1"
                      max="65535"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                      Таймаут
                    </label>
                    <input
                      type="number"
                      value={singleConfig.timeout}
                      onChange={(e) => setSingleConfig({ ...singleConfig, timeout: parseInt(e.target.value) || settings.connection.defaultTimeout })}
                      className="input-modern w-full"
                      min="1"
                      max="300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                      Аутентификация
                    </label>
                    <SegmentedControl
                      options={[
                        { value: 'password', label: 'Пароль', icon: KeyIcon },
                        { value: 'key', label: 'SSH', icon: KeyIcon },
                        { value: 'ppk', label: 'PPK', icon: KeyIcon },
                      ]}
                      value={singleConfig.auth_method}
                      onChange={(value) =>
                        setSingleConfig({
                          ...singleConfig,
                          auth_method: value as 'password' | 'key' | 'ppk',
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Правая колонка - Учетные данные */}
              <div className="space-y-3">
                {/* Имя пользователя и пароль/passphrase */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                      Пользователь
                    </label>
                    <input
                      type="text"
                      value={singleConfig.username}
                      onChange={(e) =>
                        setSingleConfig({ ...singleConfig, username: e.target.value })
                      }
                      className="input-modern w-full"
                      placeholder="root"
                    />
                  </div>
                  {singleConfig.auth_method === 'password' ? (
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                        Пароль
                      </label>
                      <input
                        type="password"
                        value={singleConfig.password || ''}
                        onChange={(e) => setSingleConfig({ ...singleConfig, password: e.target.value })}
                        className="input-modern w-full"
                        placeholder="••••••••"
                        style={{
                          borderColor: singleConfig.password && singleConfig.password.length > 0 && singleConfig.password.length < settings.security.passwordMinLength
                            ? '#ef4444'
                            : undefined
                        }}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                        Passphrase
                        <HelpTooltip text="Пароль для доступа к зашифрованному ключу." />
                      </label>
                      <input
                        type="password"
                        value={singleConfig.passphrase || ''}
                        onChange={(e) => setSingleConfig({ ...singleConfig, passphrase: e.target.value })}
                        className="input-modern w-full"
                        placeholder="Опционально"
                      />
                    </div>
                  )}
                </div>

                {/* SSH ключ (если выбран) */}
                {singleConfig.auth_method === 'key' && (
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      SSH ключ
                      <HelpTooltip text="Путь к файлу приватного ключа в формате PEM." />
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={singleConfig.key_path || ''}
                        onChange={(e) => setSingleConfig({ ...singleConfig, key_path: e.target.value })}
                        className="flex-1 input-modern"
                        placeholder={settings.connection.defaultKeyPath || "~/.ssh/id_rsa"}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const { open } = await import('@tauri-apps/api/dialog')
                            const filePath = await open({ multiple: false })
                            if (filePath && typeof filePath === 'string') {
                              setSingleConfig({ ...singleConfig, key_path: filePath })
                            }
                          } catch (error) {
                            showErrorToast(humanizeError(error))
                          }
                        }}
                        className="btn-secondary px-3 py-2"
                      >
                        ...
                      </button>
                    </div>
                  </div>
                )}

                {/* PPK ключ (если выбран) */}
                {singleConfig.auth_method === 'ppk' && (
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      PPK ключ
                      <HelpTooltip text="Путь к файлу приватного ключа в формате PuTTY." />
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={singleConfig.ppk_path || ''}
                        onChange={(e) => setSingleConfig({ ...singleConfig, ppk_path: e.target.value })}
                        className="flex-1 input-modern"
                        placeholder="~/.ssh/key.ppk"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const { open } = await import('@tauri-apps/api/dialog')
                            const filePath = await open({ multiple: false })
                            if (filePath && typeof filePath === 'string') {
                              setSingleConfig({ ...singleConfig, ppk_path: filePath })
                            }
                          } catch (error) {
                            showErrorToast(humanizeError(error))
                          }
                        }}
                        className="btn-secondary px-3 py-2"
                      >
                        ...
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            </div>

            {/* Divider */}
            <div className="my-4 border-t" style={{ borderColor: 'var(--border-secondary)' }}></div>

            {/* Command Input */}
            <div id="command-input" className="relative">
              <div className="flex items-center gap-2 mb-3">
                <TerminalIcon className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Команда</h3>
                {settings.security.disableCommandValidation && (
                  <span 
                    className="px-2 py-0.5 rounded text-xs font-medium"
                    style={{ 
                      backgroundColor: 'rgba(239, 68, 68, 0.15)', 
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.3)'
                    }}
                    title="Валидация команд отключена в настройках безопасности"
                  >
                    ⚠️ Валидация отключена
                  </span>
                )}
              </div>
            <div className="relative">
              <textarea
                ref={commandInputRef}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleCommandKeyDown}
                onFocus={() => {
                  if (settings.commands.showSuggestions && (command.trim() || settings.commands.favoriteCommands.length > 0)) {
                    setShowSuggestions(true)
                  }
                }}
                onBlur={() => {
                  if (blurTimeoutRef.current) {
                    clearTimeout(blurTimeoutRef.current)
                  }
                  blurTimeoutRef.current = setTimeout(() => {
                    setShowSuggestions(false)
                    blurTimeoutRef.current = null
                  }, 200)
                }}
                className="w-full px-3 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300/30 font-mono text-sm transition-all duration-200 resize-none"
                style={{
                  border: '1px solid var(--border-primary)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  minHeight: '80px'
                }}
                rows={3}
                placeholder="Введите команду..."
              />
              {/* Подсказки */}
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute left-3 flex items-center gap-1.5 flex-wrap pointer-events-auto"
                  style={{
                    bottom: '8px',
                    maxWidth: 'calc(100% - 24px)',
                  }}
                >
                  {suggestions.slice(0, 4).map((suggestion, idx) => {
                    const isFavoriteSuggestion = settings.commands.favoriteCommands.includes(suggestion)
                    const isSelected = idx === selectedSuggestionIndex
                    return (
                      <div
                        key={idx}
                        className="px-2 py-0.5 cursor-pointer rounded-full font-mono transition-all"
                        style={{
                          backgroundColor: isSelected ? 'var(--bg-hover)' : 'transparent',
                          color: isSelected ? 'var(--text-primary)' : 'var(--text-tertiary)',
                          fontSize: '11px',
                          opacity: isSelected ? 1 : 0.7,
                          border: isSelected ? '1px solid var(--border-secondary)' : '1px dashed var(--border-secondary)',
                        }}
                        onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                        onClick={() => {
                          setCommand(suggestion)
                          setShowSuggestions(false)
                          setSelectedSuggestionIndex(-1)
                          commandInputRef.current?.focus()
                        }}
                      >
                        {suggestion}{isFavoriteSuggestion && ' ★'}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                {command.trim() && !isFavorite && (
                  <button
                    type="button"
                    onClick={handleAddToFavorites}
                    className="px-2 py-1.5 rounded-button text-xs flex items-center gap-1.5"
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--text-tertiary)',
                      border: '1px dashed var(--border-secondary)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = 'var(--text-tertiary)'
                    }}
                    title="Добавить в избранное"
                  >
                    <span>★</span>
                    <span>В избранное</span>
                  </button>
                )}
                {isFavorite && (
                  <div className="px-2 py-1.5 rounded-button text-xs flex items-center gap-1.5" style={{ color: 'var(--accent-primary)' }}>
                    <span>★</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 items-center">
                {(isSingleMode ? singleExecuting : batchExecuting) ? (
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 bg-red-500 text-white rounded-button font-medium shadow-sm hover:bg-red-600 active:scale-[0.98] transition-all flex items-center gap-1.5 text-sm"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                    Стоп
                  </button>
                ) : (
                  <button
                    onClick={isSingleMode ? handleSingleExecute : handleBatchExecute}
                    disabled={(isBatchMode && hosts.length === 0)}
                    className="btn-primary px-4 py-2"
                  >
                    <PlayIcon className="w-3.5 h-3.5" />
                    Выполнить
                  </button>
                )}
                {((isSingleMode && singleResults.length > 0) || (isBatchMode && batchResults.length > 0)) && (
                  <>
                    <button
                      onClick={() => handleExport(isSingleMode ? singleResults : batchResults)}
                      className="px-3 py-2 bg-green-600 text-white rounded-button font-medium shadow-sm hover:bg-green-700 active:scale-[0.98] transition-all flex items-center gap-1.5 text-sm"
                    >
                      <DownloadIcon className="w-3.5 h-3.5" />
                      Экспорт
                    </button>
                    <button
                      onClick={handleClearResults}
                      className="px-3 py-2 rounded-button font-medium transition-all flex items-center gap-1.5 text-sm"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }}
                      title="Очистить"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Progress + Statistics (Batch only) - компактная строка */}
          {isBatchMode && (batchExecuting || batchResults.length > 0) && (
            <div className="card px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                {/* Прогресс-бар */}
                {batchExecuting && progress.total > 0 && (
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex-1 max-w-xs">
                      <div className="w-full rounded-full h-2 overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <div
                          className="h-2 rounded-full transition-all duration-300"
                          style={{ 
                            backgroundColor: 'var(--accent-primary)',
                            width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                      {progress.current}/{progress.total}
                    </span>
                  </div>
                )}
                
                {/* Статистика */}
                {batchResults.length > 0 && (
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Всего:</span>
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{completedResults.length}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Успех:</span>
                      <span className="text-sm font-semibold" style={{ color: '#16a34a' }}>{batchSuccessCount}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Ошибок:</span>
                      <span className="text-sm font-semibold text-red-600">{batchErrorCount}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Single Results */}
          {mode === 'single' && singleResults.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Результат</h3>
                <button
                  onClick={handleClearResults}
                  className="px-2 py-1 rounded text-xs flex items-center gap-1 transition-all hover:bg-red-500 hover:text-white"
                  style={{ color: 'var(--text-tertiary)' }}
                  title="Очистить"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-3">
                {singleResults.map((result, idx) => (
                  <div
                    key={idx}
                    className="border rounded-lg p-3"
                    style={{
                      borderColor: 'var(--border-secondary)',
                      backgroundColor: 'var(--bg-primary)'
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{result.host}</span>
                        {result.vehicle_id && (
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>#{result.vehicle_id}</span>
                        )}
                      </div>
                      <span
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{
                          backgroundColor: result.exit_status === 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: result.exit_status === 0 ? '#16a34a' : '#dc2626'
                        }}
                      >
                        {result.exit_status === 0 ? '✓' : result.exit_status}
                      </span>
                    </div>
                    {result.stdout && (
                      <div className="mt-2">
                        <pre className="px-2 py-1.5 rounded text-xs overflow-x-auto font-mono" style={{ backgroundColor: '#1a1a1a', color: '#4ade80' }}>
                          {result.stdout}
                        </pre>
                      </div>
                    )}
                    {result.stderr && (
                      <div className="mt-2">
                        <pre className="px-2 py-1.5 rounded text-xs overflow-x-auto font-mono" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#dc2626' }}>
                          {result.stderr}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Batch Results */}
          {isBatchMode && batchResults.length > 0 && (
            <div className="card">
              <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-tertiary)' }}>
                <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Результаты ({batchResults.length})</h3>
                <button
                  onClick={handleClearResults}
                  className="px-2 py-1 rounded text-xs flex items-center gap-1 transition-all hover:bg-red-500 hover:text-white"
                  style={{ color: 'var(--text-tertiary)' }}
                  title="Очистить результаты"
                >
                  <XIcon className="w-4 h-4" />
                  Очистить
                </button>
              </div>
              <div ref={batchParentRef} className="h-[500px] overflow-auto" style={{ contain: 'layout style', minWidth: 0 }}>
                <div
                  style={{
                    height: `${batchVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    minWidth: 0,
                    position: 'relative',
                    boxSizing: 'border-box'
                  }}
                >
                  {batchVirtualizer.getVirtualItems().map((virtualRow) => {
                    const batchResult = batchResults[virtualRow.index]
                    if (!batchResult) return null
                    
                    const hasError = batchResult.error !== null && batchResult.error.trim() !== ''
                    const result = batchResult.result
                    // Проверяем, ожидает ли хост повторной попытки (приоритетнее, чем выполнение)
                    const isWaitingRetry = retryTimers.has(batchResult.host)
                    const retryTimeLeft = retryTimers.get(batchResult.host) || 0
                    // Показываем "выполняется" только если выполнение активно И нет результата И нет ошибки И не ожидается повтор
                    const isExecuting = batchExecuting && !hasError && !result && !isWaitingRetry

                    return (
                      <div
                        key={`${batchResult.host}-${batchResult.timestamp || virtualRow.index}-${virtualRow.index}`}
                        data-index={virtualRow.index}
                        ref={batchVirtualizer.measureElement}
                        className="px-5 py-4 border-b transition-all"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                          borderColor: 'var(--border-secondary)',
                          boxSizing: 'border-box',
                          minWidth: 0
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }}
                      >
                        <div className="flex items-start justify-between mb-3" style={{ minWidth: 0, width: '100%' }}>
                          <div className="flex items-center gap-3" style={{ minWidth: 0, flex: '1 1 auto' }}>
                            <div
                              className="p-2 rounded-button"
                              style={{
                                backgroundColor: isWaitingRetry
                                  ? 'rgba(245, 158, 11, 0.15)'
                                  : hasError 
                                  ? 'rgba(239, 68, 68, 0.15)' 
                                  : isExecuting
                                    ? 'rgba(59, 130, 246, 0.15)'
                                    : result?.exit_status === 0 
                                      ? 'rgba(34, 197, 94, 0.15)' 
                                      : result
                                        ? 'rgba(234, 179, 8, 0.15)'
                                        : 'rgba(156, 163, 175, 0.15)'
                              }}
                            >
                              {isExecuting ? (
                                <div 
                                  className="w-4 h-4 border-2 rounded-full animate-spin"
                                  style={{
                                    borderColor: '#3b82f6',
                                    borderTopColor: 'transparent'
                                  }}
                                />
                              ) : isWaitingRetry ? (
                                <div 
                                  className="w-4 h-4 border-2 rounded-full animate-spin"
                                  style={{
                                    borderColor: '#f59e0b',
                                    borderTopColor: 'transparent'
                                  }}
                                />
                              ) : (
                                <ServerIcon
                                  className="w-4 h-4"
                                  style={{
                                    color: hasError 
                                      ? '#dc2626' 
                                      : result?.exit_status === 0 
                                        ? '#16a34a' 
                                        : result
                                          ? '#ca8a04'
                                          : '#9ca3af'
                                  }}
                                />
                              )}
                            </div>
                            <div>
                              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{batchResult.host}</span>
                              {result?.vehicle_id && (
                                <span className="text-xs ml-2" style={{ color: 'var(--text-secondary)' }}>
                                  ID ТС: <span className="font-semibold" style={{ color: 'var(--accent-primary)' }}>{result.vehicle_id}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          {isWaitingRetry ? (
                            <span className="px-3 py-1.5 rounded-button text-xs font-semibold" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                              Ожидание повтора: {retryTimeLeft}с
                            </span>
                          ) : hasError ? (
                            <span className="px-3 py-1.5 rounded-button text-xs font-semibold bg-red-100 text-red-700">
                              Ошибка
                            </span>
                          ) : isExecuting ? (
                            <span className="px-3 py-1.5 rounded-button text-xs font-semibold" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                              Выполняется...
                            </span>
                          ) : result ? (
                            <span
                              className="px-3 py-1.5 rounded-button text-xs font-semibold"
                              style={{
                                backgroundColor: result.exit_status === 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: result.exit_status === 0 ? '#16a34a' : '#dc2626'
                              }}
                            >
                              Код: {result.exit_status}
                            </span>
                          ) : null}
                        </div>
                        {isWaitingRetry ? (
                          <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                            <div className="flex items-center gap-2 mb-2">
                              <div 
                                className="w-4 h-4 border-2 rounded-full animate-spin"
                                style={{
                                  borderColor: '#f59e0b',
                                  borderTopColor: 'transparent'
                                }}
                              />
                              <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>
                                Ожидание повторной попытки подключения
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                Повторная попытка через:
                              </span>
                              <span className="text-lg font-bold" style={{ color: '#f59e0b' }}>
                                {retryTimeLeft}
                              </span>
                              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                сек
                              </span>
                            </div>
                            {hasError && (
                              <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                                <p className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: '#dc2626' }}>
                                  Предыдущая ошибка:
                                </p>
                                <p className="text-xs break-words whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                                  {humanizeError(batchResult.error || '')}
                                </p>
                              </div>
                            )}
                          </div>
                        ) : hasError ? (
                          <div 
                            className="mt-3" 
                            style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}
                          >
                            <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#dc2626' }}>
                              Ошибка подключения:
                            </p>
                            <ErrorMessage error={batchResult.error || ''} />
                          </div>
                        ) : result ? (
                          <>
                            {result.stdout && (
                              <div className="mt-3">
                                <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Вывод:</p>
                                <pre className="p-3 rounded-lg text-xs overflow-x-auto max-h-24 font-mono border" style={{ backgroundColor: '#1a1a1a', color: '#4ade80', borderColor: '#2a2a2a' }}>
                                  {result.stdout}
                                </pre>
                              </div>
                            )}
                            {result.stderr && (
                              <div className="mt-3">
                                <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#ef4444' }}>Ошибки:</p>
                                <pre className="border p-3 rounded-lg text-xs overflow-x-auto max-h-24 font-mono" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#dc2626' }}>
                                  {result.stderr}
                                </pre>
                              </div>
                            )}
                          </>
                        ) : isExecuting ? (
                          <div className="mt-3">
                            <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#3b82f6' }}>
                              Выполнение команды...
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
          </div>

          {/* Loading - показываем только если нет результатов и выполнение идет */}
          {((isSingleMode && singleExecuting && singleResults.length === 0) || 
            (isBatchMode && batchExecuting && batchResults.length === 0)) && (
            <div className="card p-8 text-center">
              <div 
                className="inline-block animate-spin rounded-full h-8 w-8 border-4"
                style={{
                  borderColor: 'var(--bg-tertiary)',
                  borderTopColor: 'var(--accent-primary)'
                }}
              ></div>
              <p className="mt-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Выполнение команды...</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
