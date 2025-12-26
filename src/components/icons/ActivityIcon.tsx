interface ActivityIconProps {
  className?: string
  size?: number
}

export default function ActivityIcon({ className = '', size = 24 }: ActivityIconProps) {
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
        <linearGradient id="activityGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* Activity pulse line */}
      <polyline
        points="3,12 7,8 11,14 15,10 21,16"
        stroke="url(#activityGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.7"
      />
      
      {/* Pulse dots */}
      <circle cx="3" cy="12" r="1.5" fill="currentColor" opacity="0.6"/>
      <circle cx="7" cy="8" r="1.5" fill="currentColor" opacity="0.6"/>
      <circle cx="11" cy="14" r="1.5" fill="currentColor" opacity="0.6"/>
      <circle cx="15" cy="10" r="1.5" fill="currentColor" opacity="0.6"/>
      <circle cx="21" cy="16" r="1.5" fill="currentColor" opacity="0.6"/>
    </svg>
  )
}
