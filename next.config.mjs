/** @type {import('next').NextConfig} */
const nextConfig = {
  // 전 경로 공통 보안 헤더. 무로그인 공유 페이지가 외부 iframe에 임베드되는 클릭재킹 방지(DENY),
  // MIME 스니핑·리퍼러 누출 차단, HTTPS 강제(HSTS). 카카오/슬랙 OG 스크래퍼는 헤더 영향 없음.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

export default nextConfig
