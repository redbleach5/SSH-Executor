/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Шлифованный алюминий - светло-серый с прозрачностью
        primary: {
          50: '#f5f5f5',   // Очень светлый серый
          100: '#e8e8e8',  // Светло-серый (основной для фонов)
          200: '#d8d8d8',  // Светло-серый средний
          300: '#c8c8c8',  // Средний серый
          400: '#b8b8b8',  // Средне-темный серый
          500: '#a8a8a8',  // Основной цвет (шлифованный алюминий)
          600: '#989898',  // Темнее для hover
          700: '#888888',  // Еще темнее
          800: '#787878',  // Темный серый
          900: '#686868',  // Очень темный серый
        },
        // Modern light theme grays
        gray: {
          50: '#fafafa',   // Almost white for main editor
          100: '#f5f5f7',  // Very light gray
          200: '#e8e8eb',  // Light gray for borders
          300: '#d1d1d6',  // Medium light gray
          400: '#b8b8bc',  // Medium gray
          500: '#9e9ea3',  // Medium dark gray
          600: '#8e8e93',  // Dark gray
          700: '#636366',  // Darker gray
          800: '#48484a',  // Very dark gray
          900: '#1d1d1f',  // Almost black text
        },
        // Sidebar background
        sidebar: '#f0f0f2', // Slightly darker gray for sidebars
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          'system-ui',
          'sans-serif',
        ],
      },
      boxShadow: {
        // Modern minimal shadows
        'soft': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'medium': '0 2px 4px 0 rgba(0, 0, 0, 0.06), 0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'large': '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04)',
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px 0 rgba(0, 0, 0, 0.04)',
      },
      borderRadius: {
        'card': '8px',
        'button': '6px',
        'input': '6px',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        // Dynamic spacing with density scale
        'd-0': 'calc(0 * var(--density-scale, 1))',
        'd-0.5': 'calc(0.125rem * var(--density-scale, 1))',
        'd-1': 'calc(0.25rem * var(--density-scale, 1))',
        'd-1.5': 'calc(0.375rem * var(--density-scale, 1))',
        'd-2': 'calc(0.5rem * var(--density-scale, 1))',
        'd-2.5': 'calc(0.625rem * var(--density-scale, 1))',
        'd-3': 'calc(0.75rem * var(--density-scale, 1))',
        'd-3.5': 'calc(0.875rem * var(--density-scale, 1))',
        'd-4': 'calc(1rem * var(--density-scale, 1))',
        'd-5': 'calc(1.25rem * var(--density-scale, 1))',
        'd-6': 'calc(1.5rem * var(--density-scale, 1))',
        'd-8': 'calc(2rem * var(--density-scale, 1))',
        'd-10': 'calc(2.5rem * var(--density-scale, 1))',
        'd-12': 'calc(3rem * var(--density-scale, 1))',
        'd-16': 'calc(4rem * var(--density-scale, 1))',
        'd-20': 'calc(5rem * var(--density-scale, 1))',
        'd-24': 'calc(6rem * var(--density-scale, 1))',
      },
      fontSize: {
        // Apple typography scale
        'xs': ['11px', { lineHeight: '1.36364', letterSpacing: '0.006em' }],
        'sm': ['13px', { lineHeight: '1.38462', letterSpacing: '-0.009em' }],
        'base': ['15px', { lineHeight: '1.47059', letterSpacing: '-0.022em' }],
        'lg': ['17px', { lineHeight: '1.47059', letterSpacing: '-0.022em' }],
        'xl': ['20px', { lineHeight: '1.3', letterSpacing: '0.019em' }],
        '2xl': ['22px', { lineHeight: '1.27273', letterSpacing: '0.016em' }],
        '3xl': ['28px', { lineHeight: '1.21429', letterSpacing: '0.013em' }],
        '4xl': ['34px', { lineHeight: '1.17647', letterSpacing: '0.011em' }],
      },
    },
  },
  plugins: [],
}
