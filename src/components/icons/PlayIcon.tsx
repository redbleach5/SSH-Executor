interface PlayIconProps {
  className?: string
  size?: number
}

export default function PlayIcon({ className = '', size = 24 }: PlayIconProps) {
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
        <linearGradient id="playGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      
      <circle cx="12" cy="12" r="10" fill="url(#playGrad)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      <path d="M9 8 L17 12 L9 16 Z" fill="currentColor" opacity="0.8"/>
    </svg>
  )
}
