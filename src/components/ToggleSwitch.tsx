import { useState } from 'react'
import clsx from 'clsx'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

export default function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  size = 'md',
}: ToggleSwitchProps) {
  const [isPressed, setIsPressed] = useState(false)

  const sizeClasses = {
    sm: 'w-9 h-5',
    md: 'w-11 h-6',
    lg: 'w-14 h-7',
  }

  const thumbSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  const translateClasses = {
    sm: 'translate-x-4',
    md: 'translate-x-5',
    lg: 'translate-x-7',
  }

  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      {label && (
        <span className="text-sm font-medium select-none" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
        className={clsx(
          'relative inline-flex items-center rounded-full transition-all duration-200 ease-in-out',
          'focus:outline-none focus:ring-2 focus:ring-offset-2',
          sizeClasses[size],
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'hover:opacity-80',
          isPressed && 'scale-95'
        )}
        style={{
          backgroundColor: checked ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
          boxShadow: checked ? 'var(--shadow-sm)' : 'none'
        }}
      >
        <span
          className={clsx(
            'inline-block rounded-full shadow-sm transform transition-transform duration-200 ease-in-out',
            thumbSizeClasses[size],
            checked ? translateClasses[size] : 'translate-x-0.5'
          )}
          style={{
            backgroundColor: 'var(--bg-primary)'
          }}
        />
      </button>
    </label>
  )
}
