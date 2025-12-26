interface ArrowRightIconProps {
  className?: string
  size?: number
}

export default function ArrowRightIcon({ className = '', size = 24 }: ArrowRightIconProps) {
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
        <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* Arrow line */}
      <line x1="5" y1="12" x2="19" y2="12" stroke="url(#arrowGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
      
      {/* Arrow head */}
      <path d="M14 6 L19 12 L14 18" stroke="url(#arrowGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.7"/>
    </svg>
  )
}
