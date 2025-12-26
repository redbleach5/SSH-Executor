interface AlertCircleIconProps {
  className?: string
  size?: number
}

export default function AlertCircleIcon({ className = '', size = 24 }: AlertCircleIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="alertGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      
      {/* Circle */}
      <circle cx="12" cy="12" r="9" fill="url(#alertGrad)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      
      {/* Exclamation mark */}
      <line x1="12" y1="7" x2="12" y2="13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.8"/>
      <circle cx="12" cy="16" r="1.5" fill="currentColor" opacity="0.8"/>
    </svg>
  )
}
