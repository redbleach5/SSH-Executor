interface TrendingUpIconProps {
  className?: string
  size?: number
}

export default function TrendingUpIcon({ className = '', size = 24 }: TrendingUpIconProps) {
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
        <linearGradient id="trendGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* Trending line */}
      <polyline
        points="3,17 9,11 13,15 21,7"
        stroke="url(#trendGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.7"
      />
      
      {/* Arrow head */}
      <polyline
        points="18,7 21,7 21,10"
        stroke="url(#trendGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.7"
      />
    </svg>
  )
}
