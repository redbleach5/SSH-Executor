import React, { Component, ErrorInfo, ReactNode } from 'react'
import { XCircleIcon } from './icons'
import RefreshCwIcon from './icons/RefreshCwIcon'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Логируем ошибку для отладки
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    this.setState({
      error,
      errorInfo,
    })

    // Можно отправить ошибку в систему мониторинга
    // reportErrorToService(error, errorInfo)
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      // Если предоставлен кастомный fallback, используем его
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Стандартный UI для ошибки
      return (
        <div
          className="flex items-center justify-center min-h-screen"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          <div
            className="max-w-2xl w-full mx-4 p-8 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-primary)',
            }}
          >
            <div className="flex items-center gap-4 mb-6">
              <div
                className="p-3 rounded-lg"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
              >
                <XCircleIcon
                  className="w-8 h-8"
                  style={{ color: '#dc2626' }}
                />
              </div>
              <div>
                <h1
                  className="text-2xl font-bold mb-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Произошла ошибка
                </h1>
                <p
                  className="text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Приложение столкнулось с неожиданной ошибкой
                </p>
              </div>
            </div>

            {this.state.error && (
              <div
                className="mb-6 p-4 rounded-lg border"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-secondary)',
                }}
              >
                <p
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Сообщение об ошибке:
                </p>
                <pre
                  className="text-xs font-mono overflow-auto p-3 rounded"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    color: '#dc2626',
                    maxHeight: '200px',
                  }}
                >
                  {this.state.error.toString()}
                </pre>
              </div>
            )}

            {this.state.errorInfo && process.env.NODE_ENV === 'development' && (
              <div
                className="mb-6 p-4 rounded-lg border"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-secondary)',
                }}
              >
                <p
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Стек вызовов (только в режиме разработки):
                </p>
                <pre
                  className="text-xs font-mono overflow-auto p-3 rounded"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    maxHeight: '300px',
                  }}
                >
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="px-5 py-2.5 rounded-button font-semibold flex items-center gap-2 transition-all duration-150"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: '#ffffff',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--accent-primary-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--accent-primary)'
                }}
              >
                <RefreshCwIcon className="w-4 h-4" />
                Попробовать снова
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-button font-semibold border transition-all duration-150"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: 'var(--border-primary)',
                  color: 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                Перезагрузить страницу
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
