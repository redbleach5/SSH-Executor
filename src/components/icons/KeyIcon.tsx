interface KeyIconProps {
  className?: string
  size?: number
}

export default function KeyIcon({ className = '', size = 24 }: KeyIconProps) {
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
        <linearGradient id="keyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      
      {/* Key body */}
      <circle cx="15" cy="9" r="4" fill="url(#keyGrad)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      
      {/* Key handle */}
      <rect x="3" y="8" width="8" height="2" rx="1" fill="currentColor" opacity="0.5"/>
      
      {/* Key teeth */}
      <rect x="11" y="7" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.4"/>
      <rect x="13" y="6" width="1.5" height="6" rx="0.5" fill="currentColor" opacity="0.4"/>
      
      {/* Keyhole */}
      <circle cx="15" cy="9" r="1.5" fill="currentColor" opacity="0.2"/>
    </svg>
  )
}
