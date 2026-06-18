import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '페이븐 — 1초 정산',
  description: '무로그인 링크로 친구·모임 정산. 내고 똑같이 맞춘다.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-50">
        {children}
      </body>
    </html>
  )
}
