interface DashboardIconProps {
  className?: string
  size?: number
}

export default function DashboardIcon({ className = '', size = 24 }: DashboardIconProps) {
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
        <linearGradient id="dashboardGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#c084fc" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="dashboardGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f472b6" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#fb7185" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="dashboardGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="dashboardGrad4" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* Grid layout representing dashboard */}
      <rect x="4" y="4" width="7" height="7" rx="1.5" fill="url(#dashboardGrad1)" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
      <rect x="13" y="4" width="7" height="7" rx="1.5" fill="url(#dashboardGrad2)" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
      <rect x="4" y="13" width="7" height="7" rx="1.5" fill="url(#dashboardGrad3)" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
      <rect x="13" y="13" width="7" height="7" rx="1.5" fill="url(#dashboardGrad4)" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
      
      {/* Decorative lines */}
      <line x1="7.5" y1="7.5" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      <line x1="16.5" y1="7.5" x2="18" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      <line x1="7.5" y1="16.5" x2="9" y2="18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      <line x1="16.5" y1="16.5" x2="18" y2="18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}
