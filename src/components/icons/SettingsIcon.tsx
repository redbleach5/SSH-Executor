interface SettingsIconProps {
  className?: string
  size?: number
}

export default function SettingsIcon({ className = '', size = 24 }: SettingsIconProps) {
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
        <linearGradient id="settingsGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#64748b" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* Gear outer ring */}
      <circle cx="12" cy="12" r="8" fill="url(#settingsGrad)" stroke="currentColor" strokeWidth="1.2" opacity="0.2"/>
      
      {/* Gear teeth */}
      <rect x="11" y="3" width="2" height="2.5" rx="0.5" fill="currentColor" opacity="0.4"/>
      <rect x="11" y="18.5" width="2" height="2.5" rx="0.5" fill="currentColor" opacity="0.4"/>
      <rect x="3" y="11" width="2.5" height="2" rx="0.5" fill="currentColor" opacity="0.4"/>
      <rect x="18.5" y="11" width="2.5" height="2" rx="0.5" fill="currentColor" opacity="0.4"/>
      
      {/* Diagonal teeth */}
      <rect x="5.5" y="5.5" width="2" height="1.5" rx="0.5" fill="currentColor" opacity="0.4" transform="rotate(-45 6.5 6.25)"/>
      <rect x="16.5" y="5.5" width="2" height="1.5" rx="0.5" fill="currentColor" opacity="0.4" transform="rotate(45 17.5 6.25)"/>
      <rect x="5.5" y="17.5" width="2" height="1.5" rx="0.5" fill="currentColor" opacity="0.4" transform="rotate(45 6.5 18.25)"/>
      <rect x="16.5" y="17.5" width="2" height="1.5" rx="0.5" fill="currentColor" opacity="0.4" transform="rotate(-45 17.5 18.25)"/>
      
      {/* Center circle */}
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
    </svg>
  )
}
