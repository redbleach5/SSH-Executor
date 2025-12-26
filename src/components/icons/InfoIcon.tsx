interface InfoIconProps {
  className?: string
  size?: number
}

export default function InfoIcon({ className = '', size = 24 }: InfoIconProps) {
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
        <linearGradient id="infoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      
      {/* Circle */}
      <circle cx="12" cy="12" r="9" fill="url(#infoGrad)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      
      {/* Info "i" */}
      <circle cx="12" cy="8" r="1.5" fill="currentColor" opacity="0.8"/>
      <path d="M12 11 L12 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.8"/>
    </svg>
  )
}
