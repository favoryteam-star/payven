import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '페이븐 — 1초 정산',
    short_name: '페이븐',
    description: '무로그인으로 바로 더치페이. 술값·밥값, 계산기 대신 페이븐.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0FA177',
    lang: 'ko',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      // 라스터 PNG(설치 프롬프트·홈 화면 — 런처들이 SVG보다 안정적으로 씀). 풀블리드라 maskable 세이프존 OK.
      { src: '/app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
