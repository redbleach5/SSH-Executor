import clsx from 'clsx'

interface Option {
  value: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

interface SegmentedControlProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
  size?: 'sm' | 'md' | 'lg'
}

export default function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
}: SegmentedControlProps) {
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  }

  return (
    <div 
      className="inline-flex rounded-button p-1 gap-1"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    >
      {options.map((option) => {
        const Icon = option.icon
        const isSelected = value === option.value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={clsx(
              'relative flex items-center justify-center gap-1.5 rounded-md font-medium',
              'transition-all duration-150 ease-in-out',
              'focus:outline-none focus:ring-2 focus:ring-offset-1',
              'active:scale-[0.98]',
              sizeClasses[size],
              isSelected ? 'shadow-sm' : ''
            )}
            style={{
              backgroundColor: isSelected ? 'var(--bg-primary)' : 'transparent',
              color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
              border: isSelected ? '1px solid var(--border-primary)' : '1px solid transparent'
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.color = 'var(--text-primary)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.color = 'var(--text-secondary)'
              }
            }}
          >
            {Icon && <Icon className="w-4 h-4" />}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
