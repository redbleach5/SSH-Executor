import type { CSSProperties } from 'react'

interface TerminalIconProps {
  className?: string
  size?: number
  style?: CSSProperties
}

export default function TerminalIcon({ className = '', size = 24, style }: TerminalIconProps) {
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
        <linearGradient id="terminalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      
      {/* Terminal window frame */}
      <rect x="3" y="4" width="18" height="16" rx="2.5" fill="url(#terminalGrad)" stroke="currentColor" strokeWidth="1.2" opacity="0.15"/>
      
      {/* Terminal header bar */}
      <rect x="3" y="4" width="18" height="4" rx="2.5" fill="currentColor" opacity="0.2"/>
      
      {/* Window control dots */}
      <circle cx="5.5" cy="6" r="0.8" fill="currentColor" opacity="0.4"/>
      <circle cx="7.5" cy="6" r="0.8" fill="currentColor" opacity="0.4"/>
      <circle cx="9.5" cy="6" r="0.8" fill="currentColor" opacity="0.4"/>
      
      {/* Command prompt */}
      <path
        d="M6 12 L8 14 L6 16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.7"
      />
      
      {/* Command text */}
      <line x1="10" y1="14" x2="18" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
      
      {/* Cursor blink */}
      <rect x="18" y="12.5" width="1.5" height="3" rx="0.5" fill="currentColor" opacity="0.8"/>
    </svg>
  )
}
