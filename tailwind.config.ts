import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class', // html.dark 클래스로 제어(토글) — 기본 다크는 layout이 깔아줌
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', 'system-ui', 'sans-serif'],
      },
      colors: {
        // 페이븐 단일 강조 — 에메랄드 그린 ("even/맞춘다·돈"). 토스블루·네이버형광초록 회피.
        brand: {
          50: '#E9F8F1',
          100: '#C6EEDC',
          200: '#92DFBF',
          500: '#14B488',
          600: '#0FA177',
          700: '#0B7E5E',
          DEFAULT: '#0FA177',
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
