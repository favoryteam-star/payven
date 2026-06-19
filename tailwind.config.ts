import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', 'system-ui', 'sans-serif'],
      },
      colors: {
        // 토스풍 단일 강조 블루
        brand: {
          50: '#EBF2FE',
          100: '#D6E4FD',
          200: '#AFC9FB',
          500: '#3182F6',
          600: '#2272EB',
          700: '#1B64DA',
          DEFAULT: '#3182F6',
        },
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },
      maxWidth: {
        app: '440px', // 모바일 앱 컨테이너
      },
    },
  },
  plugins: [],
} satisfies Config
