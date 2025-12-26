import type { CSSProperties } from 'react'

interface CheckCircleIconProps {
  className?: string
  size?: number
  style?: CSSProperties
}

export default function CheckCircleIcon({ className = '', size = 24, style }: CheckCircleIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <defs>
        <linearGradient id="checkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      
      {/* Circle */}
      <circle cx="12" cy="12" r="9" fill="url(#checkGrad)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      
      {/* Checkmark */}
      <path d="M8 12 L11 15 L16 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
    </svg>
  )
}
