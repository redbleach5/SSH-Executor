interface UserIconProps {
  className?: string
  size?: number
}

export default function UserIcon({ className = '', size = 24 }: UserIconProps) {
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
        <linearGradient id="userGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* User head */}
      <circle cx="12" cy="8" r="4" fill="url(#userGrad)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      
      {/* User body */}
      <path d="M5 20 C5 16 8 14 12 14 C16 14 19 16 19 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.3"/>
    </svg>
  )
}
