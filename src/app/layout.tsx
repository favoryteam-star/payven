import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'

export const metadata: Metadata = {
  title: '페이븐 — 1초 정산',
  description: '무로그인으로 바로 더치페이. 술값·밥값, 계산기 대신 페이븐.',
  // 계좌번호를 iOS Safari가 전화번호로 오인해 밑줄 링크로 만드는 것 방지.
  formatDetection: { telephone: false },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '페이븐',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
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
    <html lang="ko">
      <body className="bg-neutral-50 font-sans text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-50">
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
