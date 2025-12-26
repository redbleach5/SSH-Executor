interface BellIconProps {
  className?: string
  size?: number
}

export default function BellIcon({ className = '', size = 24 }: BellIconProps) {
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
        <linearGradient id="bellGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* Bell body */}
      <path
        d="M12 3 C9 3 7 5 7 8 C7 10 6 11 5 13 L5 16 C5 17 6 18 7 18 L17 18 C18 18 19 17 19 16 L19 13 C18 11 17 10 17 8 C17 5 15 3 12 3 Z"
        fill="url(#bellGrad)"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.2"
      />
      
      {/* Bell clapper */}
      <line x1="12" y1="18" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      <circle cx="12" cy="21" r="1" fill="currentColor" opacity="0.4"/>
      
      {/* Sound waves */}
      <path d="M3 13 Q5 11 7 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.3"/>
      <path d="M21 13 Q19 11 17 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.3"/>
    </svg>
  )
}
