interface UsersIconProps {
  className?: string
  size?: number
}

export default function UsersIcon({ className = '', size = 24 }: UsersIconProps) {
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
        <linearGradient id="usersGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="usersGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="usersGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f472b6" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ec4899" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* User 1 */}
      <circle cx="9" cy="7" r="3" fill="url(#usersGrad1)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      <path d="M5 20 C5 16 7 14 9 14 C11 14 13 16 13 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.3"/>
      
      {/* User 2 */}
      <circle cx="17" cy="7" r="3" fill="url(#usersGrad2)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      <path d="M13 20 C13 16 15 14 17 14 C19 14 21 16 21 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.3"/>
      
      {/* User 3 (smaller, in background) */}
      <circle cx="3" cy="10" r="2" fill="url(#usersGrad3)" stroke="currentColor" strokeWidth="1" opacity="0.15"/>
    </svg>
  )
}
