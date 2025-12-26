import { useState, useEffect, useRef } from 'react'
import { XIcon } from './icons'

export interface LogEntry {
  id: string
  timestamp: Date
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  message: string
  source?: string
}

interface DebugConsoleProps {
  enabled: boolean
  maxLines?: number
}

export default function DebugConsole({ enabled, maxLines = 100 }: DebugConsoleProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isMinimized, setIsMinimized] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)

  // Перехватываем console.log, console.info, console.warn, console.error
  useEffect(() => {
    if (!enabled) return

    const originalLog = console.log
    const originalInfo = console.info
    const originalWarn = console.warn
    const originalError = console.error
    const originalDebug = console.debug

    const addLog = (level: LogEntry['level'], args: any[]) => {
      const message = args
        .map(arg => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2)
            } catch {
              return String(arg)
            }
          }
          return String(arg)
        })
        .join(' ')

      // Определяем источник по префиксу сообщения
      let source: string | undefined
      if (message.includes('[Batch Execute]')) {
        source = 'Batch Execute'
      } else if (message.includes('[Single Execute]')) {
        source = 'Single Execute'
      } else if (message.includes('[SSH]')) {
        source = 'SSH'
      } else if (message.includes('[Config]')) {
        source = 'Config'
      }

      const logEntry: LogEntry = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        level,
        message,
        source,
      }

      setLogs(prev => {
        const newLogs = [...prev, logEntry]
        // Ограничиваем количество логов
        return newLogs.slice(-maxLines)
      })
    }

    console.log = (...args: any[]) => {
      originalLog.apply(console, args)
      addLog('log', args)
    }

    console.info = (...args: any[]) => {
      originalInfo.apply(console, args)
      addLog('info', args)
    }

    console.warn = (...args: any[]) => {
      originalWarn.apply(console, args)
      addLog('warn', args)
    }

    console.error = (...args: any[]) => {
      originalError.apply(console, args)
      addLog('error', args)
    }

    console.debug = (...args: any[]) => {
      originalDebug.apply(console, args)
      addLog('debug', args)
    }

    return () => {
      console.log = originalLog
      console.info = originalInfo
      console.warn = originalWarn
      console.error = originalError
      console.debug = originalDebug
    }
  }, [enabled, maxLines])

  // Автопрокрутка к последнему логу
  useEffect(() => {
    if (autoScroll && !isMinimized && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll, isMinimized])

  // Обработка скролла для отключения автопрокрутки
  const handleScroll = () => {
    if (!consoleRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = consoleRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isAtBottom)
  }

  const clearLogs = () => {
    setLogs([])
  }

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return '#ef4444'
      case 'warn':
        return '#f59e0b'
      case 'info':
        return '#3b82f6'
      case 'debug':
        return '#8b5cf6'
      default:
        return 'var(--text-secondary)'
    }
  }

  const getLevelIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return '❌'
      case 'warn':
        return '⚠️'
      case 'info':
        return 'ℹ️'
      case 'debug':
        return '🔍'
      default:
        return '📝'
    }
  }

  if (!enabled) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: isMinimized ? 0 : 20,
        right: 20,
        width: isMinimized ? 200 : 500,
        height: isMinimized ? 40 : 300,
        maxHeight: 'calc(100vh - 100px)', // Ограничиваем высоту, чтобы не перекрывать контент
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100, // Снижаем z-index, чтобы не перекрывать основной контент
        transition: 'all 0.3s ease',
        pointerEvents: 'auto', // Убеждаемся, что консоль может получать события
      }}
    >
      {/* Заголовок */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          backgroundColor: 'var(--bg-secondary)',
          borderTopLeftRadius: '8px',
          borderTopRightRadius: '8px',
        }}
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Debug Console
          </span>
          {!isMinimized && (
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
              }}
            >
              {logs.length} logs
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {!isMinimized && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                clearLogs()
              }}
              style={{
                padding: '4px 8px',
                fontSize: '10px',
                border: '1px solid var(--border-primary)',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
              }}
            >
              Clear
            </button>
          )}
          <div
            onClick={(e) => {
              e.stopPropagation()
              setIsMinimized(true)
            }}
            style={{ color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <XIcon className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* Содержимое консоли */}
      {!isMinimized && (
        <div
          ref={consoleRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px',
            fontSize: '11px',
            fontFamily: 'monospace',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          {logs.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                color: 'var(--text-secondary)',
                padding: '20px',
                fontSize: '12px',
              }}
            >
              Нет логов. Логи будут отображаться здесь.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                style={{
                  marginBottom: '4px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: log.level === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                  borderLeft: `3px solid ${getLevelColor(log.level)}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span>{getLevelIcon(log.level)}</span>
                  <span
                    style={{
                      color: getLevelColor(log.level),
                      fontWeight: 600,
                      fontSize: '10px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {log.level}
                  </span>
                  {log.source && (
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-secondary)',
                        backgroundColor: 'var(--bg-tertiary)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      {log.source}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--text-secondary)',
                      marginLeft: 'auto',
                    }}
                  >
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div
                  style={{
                    color: 'var(--text-primary)',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                    marginTop: '4px',
                  }}
                >
                  {log.message}
                </div>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  )
}
