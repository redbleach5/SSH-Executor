interface Loader2IconProps {
  className?: string
  size?: number
}

export default function Loader2Icon({ className = '', size = 24 }: Loader2IconProps) {
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
        <linearGradient id="loaderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      
      {/* Spinning circle */}
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="url(#loaderGrad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="45"
        strokeDashoffset="30"
        fill="none"
        opacity="0.6"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="1s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  )
}
