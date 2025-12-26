interface ClockIconProps {
  className?: string
  size?: number
}

export default function ClockIcon({ className = '', size = 24 }: ClockIconProps) {
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
        <linearGradient id="clockGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#64748b" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* Clock face */}
      <circle cx="12" cy="12" r="9" fill="url(#clockGrad)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      
      {/* Clock hands */}
      <line x1="12" y1="12" x2="12" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
      <line x1="12" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      
      {/* Hour markers */}
      <line x1="12" y1="3" x2="12" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      <line x1="21" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      <line x1="12" y1="21" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      <line x1="3" y1="12" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      
      {/* Center dot */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.5"/>
    </svg>
  )
}
