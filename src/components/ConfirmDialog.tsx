import { XIcon } from './icons'
import { AlertCircleIcon } from './icons'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  type?: 'danger' | 'warning' | 'info'
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  onConfirm,
  onCancel,
  type = 'info',
}: ConfirmDialogProps) {
  if (!isOpen) return null

  const getTypeStyles = () => {
    switch (type) {
      case 'danger':
        return {
          iconColor: '#dc2626',
          iconBg: 'rgba(239, 68, 68, 0.1)',
          confirmBg: '#dc2626',
          confirmHover: '#b91c1c',
        }
      case 'warning':
        return {
          iconColor: '#f59e0b',
          iconBg: 'rgba(245, 158, 11, 0.1)',
          confirmBg: '#f59e0b',
          confirmHover: '#d97706',
        }
      default:
        return {
          iconColor: 'var(--accent-primary)',
          iconBg: 'rgba(0, 122, 255, 0.1)',
          confirmBg: 'var(--accent-primary)',
          confirmHover: 'var(--accent-primary-hover)',
        }
    }
  }

  const styles = getTypeStyles()

  // Обработка нажатия Escape
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  // Обработка клика по overlay
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <div
        className="max-w-md w-full rounded-lg border shadow-lg"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: 'var(--border-secondary)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: styles.iconBg }}
            >
              <AlertCircleIcon
                className="w-5 h-5"
                style={{ color: styles.iconColor }}
              />
            </div>
            <h2
              id="confirm-dialog-title"
              className="text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg transition-colors"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            aria-label="Закрыть"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          <p
            id="confirm-dialog-message"
            className="text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {message}
          </p>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 p-4 border-t"
          style={{ borderColor: 'var(--border-secondary)' }}
        >
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-button font-medium transition-all duration-150 border"
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
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-button font-medium text-white transition-all duration-150"
            style={{
              backgroundColor: styles.confirmBg,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = styles.confirmHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = styles.confirmBg
            }}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
