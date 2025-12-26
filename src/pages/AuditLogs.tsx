import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/tauri'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { showSuccessToast, showErrorToast } from '../utils/toast'
import { formatDateTime24h } from '../utils/date'
import { useSettings } from '../utils/useSettings'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  FileTextIcon,
  InfoIcon,
  AlertCircleIcon,
  XCircleIcon,
  XIcon
} from '../components/icons'

interface AuditLog {
  timestamp: string
  level: string
  action: string
  details: string
  user?: string
}

export default function AuditLogs() {
  const settings = useSettings()
  const parentRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [isClearing, setIsClearing] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const { data: logs = [] } = useQuery<AuditLog[]>({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      return await invoke('get_audit_logs', { limit: settings.performance.maxResultsInMemory })
    },
    refetchInterval: 5000,
  })

  const handleClearLogs = () => {
    setShowClearConfirm(true)
  }

  const confirmClearLogs = async () => {
    setShowClearConfirm(false)
    setIsClearing(true)
    try {
      await invoke('clear_audit_logs')
      // Инвалидируем кэш запросов, чтобы обновить список логов
      await queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
      showSuccessToast('Журнал аудита успешно очищен')
    } catch (error) {
      showErrorToast(`Ошибка очистки журнала: ${String(error)}`)
    } finally {
      setIsClearing(false)
    }
  }

  // Функция для оценки размера записи
  const estimateSize = (index: number) => {
    const log = logs[index]
    if (!log) return 80
    
    // Если есть команда, запись будет выше
    if (log.details.includes('Команда:')) {
      const commandIndex = log.details.indexOf('Команда:')
      const commandText = log.details.substring(commandIndex + 'Команда:'.length).trim()
      // Учитываем длину команды для расчета высоты
      const commandLines = Math.ceil(commandText.length / 80) // Примерно 80 символов на строку
      return 100 + (commandLines * 20) // Базовая высота + высота команды
    }
    
    // Для обычных записей учитываем длину текста
    const textLines = Math.ceil(log.details.length / 100)
    return Math.max(60, 60 + (textLines * 20))
  }

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: settings.performance.virtualizationBuffer,
  })

  const getLevelIcon = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return <XCircleIcon className="w-5 h-5 text-red-500" />
      case 'WARN':
        return <AlertCircleIcon className="w-5 h-5 text-yellow-500" />
      default:
        return <InfoIcon className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-button border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-primary)' }}>
            <FileTextIcon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>
              Журнал аудита
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              История всех действий и событий в системе
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-tertiary)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Записи журнала ({logs.length})
            </h2>
            <button
              onClick={handleClearLogs}
              disabled={isClearing || logs.length === 0}
              className="btn-secondary text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XIcon className="w-4 h-4" />
              {isClearing ? 'Очистка...' : 'Очистить журнал'}
            </button>
          </div>
        </div>
        <div
          ref={parentRef}
          className="h-[600px] overflow-auto"
          style={{ contain: 'strict' }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const log = logs[virtualRow.index]
              return (
                <div
                  key={`${log.timestamp}-${log.action}-${virtualRow.index}`}
                    className="px-4 py-3 border-b transition-all"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    borderColor: 'var(--border-secondary)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <div className="flex items-start gap-3" style={{ width: '100%', overflow: 'hidden' }}>
                    <div className="p-1.5 rounded mt-0.5 flex-shrink-0" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      {getLevelIcon(log.level)}
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <span className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {log.action}
                        </span>
                        <span className="text-xs font-medium px-2 py-1 rounded flex-shrink-0" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>
                          {formatDateTime24h(log.timestamp)}
                        </span>
                      </div>
                      {/* Выделяем команды в логах */}
                      {(() => {
                        // Ищем "Команда:" в тексте
                        const commandIndex = log.details.indexOf('Команда:')
                        if (commandIndex === -1) {
                          // Нет команды - просто отображаем текст
                          return (
                            <p className="text-sm break-words" style={{ color: 'var(--text-secondary)' }}>
                              {log.details}
                            </p>
                          )
                        }
                        
                        // Есть команда - разделяем на описание и команду
                        const description = log.details.substring(0, commandIndex).trim()
                        let commandText = log.details.substring(commandIndex + 'Команда:'.length).trim()
                        
                        // Убираем лишние пробелы и переносы строк в начале команды
                        commandText = commandText.replace(/^\s+/, '')
                        
                        // Если команда пустая, не показываем блок команды
                        if (!commandText) {
                          return (
                            <p className="text-sm break-words" style={{ color: 'var(--text-secondary)' }}>
                              {log.details}
                            </p>
                          )
                        }
                        
                        // Если описание пустое, значит вся строка - это команда
                        // В этом случае не показываем описание отдельно
                        const hasDescription = description.length > 0
                        
                        return (
                          <div className="space-y-2">
                            {hasDescription && (
                              <p className="text-sm break-words" style={{ color: 'var(--text-secondary)' }}>
                                {description}
                              </p>
                            )}
                            <div className={`p-2.5 rounded ${hasDescription ? 'mt-2' : ''}`} style={{ backgroundColor: 'var(--bg-tertiary)', borderLeft: '3px solid var(--accent-primary)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                              <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                                Выполняемая команда:
                              </p>
                              <p className="text-xs font-mono break-words whitespace-pre-wrap" style={{ color: 'var(--text-primary)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                {commandText}
                              </p>
                            </div>
                          </div>
                        )
                      })()}
                      {log.user && (
                        <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                          Пользователь: <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{log.user}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="Очистить журнал аудита"
        message="Вы уверены, что хотите очистить журнал аудита? Это действие нельзя отменить."
        confirmText="Очистить"
        cancelText="Отмена"
        type="danger"
        onConfirm={confirmClearLogs}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  )
}
