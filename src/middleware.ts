import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// 매 요청마다 세션 토큰을 갱신해 쿠키를 새로 쓴다(@supabase/ssr 권장 패턴).
// 미들웨어는 next/headers cookies()를 못 쓰므로 req/res 쿠키로 자체 클라이언트를 만든다.
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) return res

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) req.cookies.set(name, value)
        res = NextResponse.next({ request: req })
        for (const { name, value, options } of toSet) res.cookies.set(name, value, options)
      },
    },
  })

  // 토큰 갱신 트리거(결과는 무시 — 쿠키 갱신이 목적).
  await supabase.auth.getUser()
  return res
}

export const config = {
  // 정적/이미지/PWA 자산 제외하고 페이지·라우트에만 적용.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)',
  ],
}
