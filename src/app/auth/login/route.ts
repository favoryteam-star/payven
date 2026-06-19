import { type NextRequest, NextResponse } from 'next/server'
import { getSupabaseAuth } from '@/server/auth'

// 로그인 시작 — 서버가 provider 인증 URL을 받아 브라우저를 리다이렉트.
// 브라우저는 supabase-js 없이 그냥 이 라우트로 이동만 한다.
// /auth/login?provider=kakao&next=/items
export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get('provider')
  const next = req.nextUrl.searchParams.get('next') || '/'
  if (provider !== 'kakao' && provider !== 'google') {
    return NextResponse.redirect(new URL('/', req.nextUrl.origin))
  }

  const supabase = await getSupabaseAuth()
  const callback = new URL('/auth/callback', req.nextUrl.origin)
  callback.searchParams.set('next', next)

  // 카카오는 닉네임만 요청 → 이메일/프로필사진 동의항목 설정 불필요(KOE205 회피). 구글은 기본 스코프.
  const options =
    provider === 'kakao'
      ? { redirectTo: callback.toString(), scopes: 'profile_nickname' }
      : { redirectTo: callback.toString() }

  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options })
  if (error || !data?.url) {
    return NextResponse.redirect(new URL('/?login_error=1', req.nextUrl.origin))
  }
  return NextResponse.redirect(data.url)
}
