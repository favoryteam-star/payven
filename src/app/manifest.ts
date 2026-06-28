import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '페이븐 — 복잡한 정산도 링크 하나로',
    short_name: '페이븐',
    description: '안 마신 술값은 빼고, 메뉴별·차수별 복잡한 정산도 링크 하나로. 카톡에 붙여넣으면 끝.',
    id: '/',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0FA177',
    lang: 'ko',
    // PNG만 — PWABuilder/안드로이드 TWA가 SVG 아이콘을 'fetchable image'로 인식 못 해 packaging critical 발생
    // (라이브 200이어도). 웹 탭 favicon은 layout의 metadata가 따로 담당, 설치/스토어 아이콘은 PNG로 충분.
    icons: [
      { src: '/app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
