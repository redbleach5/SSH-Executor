interface SaveIconProps {
  className?: string
  size?: number
}

export default function SaveIcon({ className = '', size = 24 }: SaveIconProps) {
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
        <linearGradient id="saveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* Floppy disk */}
      <rect x="5" y="5" width="14" height="16" rx="1.5" fill="url(#saveGrad)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      
      {/* Metal slider */}
      <rect x="6" y="6" width="12" height="2" rx="0.5" fill="currentColor" opacity="0.3"/>
      
      {/* Center hole */}
      <rect x="9" y="9" width="6" height="6" rx="0.5" fill="currentColor" stroke="currentColor" strokeWidth="0.8" opacity="0.3"/>
      
      {/* Save indicator */}
      <path d="M11 11 L12 13 L13 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5"/>
    </svg>
  )
}
