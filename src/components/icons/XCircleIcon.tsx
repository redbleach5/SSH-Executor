interface XCircleIconProps {
  className?: string
  size?: number
}

export default function XCircleIcon({ className = '', size = 24 }: XCircleIconProps) {
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
        <linearGradient id="xCircleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f87171" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      
      {/* Circle */}
      <circle cx="12" cy="12" r="9" fill="url(#xCircleGrad)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      
      {/* X mark */}
      <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.8"/>
      <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.8"/>
    </svg>
  )
}
