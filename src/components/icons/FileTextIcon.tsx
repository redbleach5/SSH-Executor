interface FileTextIconProps {
  className?: string
  size?: number
}

export default function FileTextIcon({ className = '', size = 24 }: FileTextIconProps) {
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
        <linearGradient id="fileTextGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* Document shape */}
      <path
        d="M6 2 C5.44772 2 5 2.44772 5 3 L5 21 C5 21.5523 5.44772 22 6 22 L18 22 C18.5523 22 19 21.5523 19 21 L19 8 L14 8 C13.4477 8 13 7.55228 13 7 L13 2 L6 2 Z"
        fill="url(#fileTextGrad)"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.2"
      />
      
      {/* Folded corner */}
      <path
        d="M13 2 L13 7 L19 7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.3"
      />
      
      {/* Text lines */}
      <line x1="8" y1="11" x2="16" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      <line x1="8" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      <line x1="8" y1="17" x2="14" y2="17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
    </svg>
  )
}
