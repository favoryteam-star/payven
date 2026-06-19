import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '페이븐 — 1초 정산',
    short_name: '페이븐',
    description: '무로그인으로 바로 더치페이. 술값·밥값, 계산기 대신 페이븐.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3182F6',
    lang: 'ko',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  }
}
