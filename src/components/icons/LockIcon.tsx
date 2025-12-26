interface LockIconProps {
  className?: string
  size?: number
}

export default function LockIcon({ className = '', size = 24 }: LockIconProps) {
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
        <linearGradient id="lockGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#dc2626" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* Lock body */}
      <rect x="7" y="11" width="10" height="9" rx="2" fill="url(#lockGrad)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      
      {/* Lock shackle */}
      <path d="M9 11 L9 8 C9 5.5 10.5 4 12 4 C13.5 4 15 5.5 15 8 L15 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5"/>
      
      {/* Keyhole */}
      <circle cx="12" cy="15.5" r="1.5" fill="currentColor" opacity="0.2"/>
      <rect x="11.5" y="15.5" width="1" height="2" rx="0.5" fill="currentColor" opacity="0.2"/>
    </svg>
  )
}
