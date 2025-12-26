import { useState } from 'react'
import HelpIcon from './icons/HelpIcon'
import { useSettings } from '../utils/useSettings'

interface HelpTooltipProps {
  text: string
  className?: string
}

export default function HelpTooltip({ text, className = '' }: HelpTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const settings = useSettings()

  // Если подсказки отключены, не показываем компонент вообще
  if (!settings.interface.showTooltips) {
    return null
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsVisible(true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsVisible(false)
    }
  }

  return (
    <div 
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      <button
        type="button"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1"
        style={{
          color: 'var(--text-tertiary)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
        onKeyDown={handleKeyDown}
        aria-label="Показать подсказку"
        aria-expanded={isVisible}
        aria-describedby={isVisible ? 'help-tooltip-text' : undefined}
      >
        <HelpIcon className="w-4 h-4" size={16} />
      </button>
      {isVisible && (
        <div
          id="help-tooltip-text"
          role="tooltip"
          className="absolute z-50 w-64 p-3 text-sm rounded-lg shadow-lg left-0 top-6 pointer-events-none border"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-lg)'
          }}
        >
          <div 
            className="absolute -top-1.5 left-3 w-3 h-3 border-l border-t transform rotate-45"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-primary)'
            }}
          ></div>
          <p 
            className="leading-relaxed" 
            style={{ 
              fontWeight: 300,
              fontSize: '0.875rem',
              lineHeight: '1.5',
              letterSpacing: '0.01em'
            }}
          >
            {text}
          </p>
        </div>
      )}
    </div>
  )
}
