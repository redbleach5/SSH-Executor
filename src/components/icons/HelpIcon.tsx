interface HelpIconProps {
  className?: string
  size?: number
}

export default function HelpIcon({ className = '', size = 20 }: HelpIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.3"/>
      <path 
        d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        opacity="1"
      />
      <circle cx="12" cy="17" r="1" fill="currentColor" opacity="1"/>
    </svg>
  )
}
