interface DownloadIconProps {
  className?: string
  size?: number
}

export default function DownloadIcon({ className = '', size = 24 }: DownloadIconProps) {
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
        <linearGradient id="downloadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* Arrow down */}
      <path d="M12 4 L12 16 M12 16 L8 12 M12 16 L16 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
      
      {/* Base line */}
      <line x1="5" y1="20" x2="19" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
      
      {/* Decorative circle */}
      <circle cx="12" cy="12" r="8" fill="url(#downloadGrad)" opacity="0.1"/>
    </svg>
  )
}
