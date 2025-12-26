import React from 'react'

interface RefreshCwIconProps {
  className?: string
  style?: React.CSSProperties
  size?: number
}

export default function RefreshCwIcon({ className, style, size = 24 }: RefreshCwIconProps) {
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      <path d="M17 12h4" />
      <path d="M21 8v4" />
      <path d="M3 12a9 9 0 1 0 6.219 8.56" />
      <path d="M7 12H3" />
      <path d="M3 16v-4" />
    </svg>
  )
}
