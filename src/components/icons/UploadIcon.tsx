import type { CSSProperties } from 'react'

interface UploadIconProps {
  className?: string
  size?: number
  style?: CSSProperties
}

export default function UploadIcon({ className = '', size = 24, style }: UploadIconProps) {
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
        <linearGradient id="uploadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f472b6" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ec4899" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* Arrow up */}
      <path d="M12 20 L12 8 M12 8 L8 12 M12 8 L16 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
      
      {/* Base line */}
      <line x1="5" y1="4" x2="19" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
      
      {/* Decorative circle */}
      <circle cx="12" cy="12" r="8" fill="url(#uploadGrad)" opacity="0.1"/>
      
      {/* Cloud shape */}
      <path d="M8 16 C6.5 16 5 14.5 5 13 C5 11.5 6.5 10 8 10 C8.5 8.5 10 7.5 11.5 8 C12.5 6.5 14.5 6.5 16 8 C17.5 8 19 9.5 19 11 C19 12.5 17.5 14 16 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.3"/>
    </svg>
  )
}
