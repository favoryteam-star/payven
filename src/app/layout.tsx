import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'

export const metadata: Metadata = {
  // og:image 등 상대경로를 절대 URL로 — 카카오/슬랙 등 스크래퍼가 정확히 가져가게.
  metadataBase: new URL('https://payven.kr'),
  title: '페이븐 — 1초 정산',
  description: '무로그인으로 바로 더치페이. 술값·밥값, 계산기 대신 페이븐.',
  // 공유 링크 미리보기(OG). 정산 페이지는 generateMetadata가 제목·설명을 덮어씀.
  openGraph: {
    type: 'website',
    siteName: '페이븐',
    locale: 'ko_KR',
    title: '페이븐 — 1초 정산',
    description: '무로그인으로 바로 더치페이. 술값·밥값, 계산기 대신 페이븐.',
    images: ['/og.png'],
  },
  twitter: { card: 'summary_large_image' },
  // 계좌번호를 iOS Safari가 전화번호로 오인해 밑줄 링크로 만드는 것 방지.
  formatDetection: { telephone: false },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '페이븐',
  },
  icons: {
    // SVG 파비콘(모던 브라우저) + PNG 폴백. iOS는 apple-touch-icon에 SVG를 무시하므로 PNG 필수.
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/app-icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/app-icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a', // 기본 다크 — 토글 시 ThemeToggle이 meta theme-color도 갱신
  width: 'device-width',
  initialScale: 1,
  // maximumScale 고정 안 함 — 저시력 사용자가 계좌번호·금액을 핀치 줌으로 키워 볼 수 있게(WCAG 1.4.4).
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className="dark" suppressHydrationWarning>
      <body className="bg-neutral-50 font-sans text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-50">
        {/* 페인트 전 테마 적용(FOUC 방지). 기본 다크 — 저장값이 'light'일 때만 라이트로. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('payven:theme');document.documentElement.classList.toggle('dark',t!=='light')}catch(e){}})()",
          }}
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendard-variable.min.css"
        />
        {/* 모바일 앱 컨테이너 — 데스크톱에서도 가운데 좁게 */}
        <div className="mx-auto min-h-dvh w-full max-w-app bg-white dark:bg-neutral-950">
          {children}
        </div>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
