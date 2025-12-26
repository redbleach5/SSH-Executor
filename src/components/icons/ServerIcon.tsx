import type { CSSProperties } from 'react'

interface ServerIconProps {
  className?: string
  size?: number
  style?: CSSProperties
}

export default function ServerIcon({ className = '', size = 24, style }: ServerIconProps) {
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
        <linearGradient id="serverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      
      {/* Server rack */}
      <rect x="5" y="3" width="14" height="18" rx="2" fill="url(#serverGrad)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      
      {/* Server unit 1 */}
      <rect x="6.5" y="5" width="11" height="4" rx="0.8" fill="currentColor" opacity="0.15"/>
      <circle cx="8" cy="7" r="0.6" fill="currentColor" opacity="0.5"/>
      <circle cx="9.5" cy="7" r="0.6" fill="currentColor" opacity="0.5"/>
      <line x1="11.5" y1="7" x2="16" y2="7" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.3"/>
      
      {/* Server unit 2 */}
      <rect x="6.5" y="10" width="11" height="4" rx="0.8" fill="currentColor" opacity="0.15"/>
      <circle cx="8" cy="12" r="0.6" fill="currentColor" opacity="0.5"/>
      <circle cx="9.5" cy="12" r="0.6" fill="currentColor" opacity="0.5"/>
      <line x1="11.5" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.3"/>
      
      {/* Server unit 3 */}
      <rect x="6.5" y="15" width="11" height="4" rx="0.8" fill="currentColor" opacity="0.15"/>
      <circle cx="8" cy="17" r="0.6" fill="currentColor" opacity="0.5"/>
      <circle cx="9.5" cy="17" r="0.6" fill="currentColor" opacity="0.5"/>
      <line x1="11.5" y1="17" x2="16" y2="17" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.3"/>
      
      {/* Connection lines */}
      <path d="M3 7 L5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      <path d="M3 12 L5 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      <path d="M3 17 L5 17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      <path d="M19 7 L21 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      <path d="M19 12 L21 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      <path d="M19 17 L21 17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}
