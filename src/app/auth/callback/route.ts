import { type NextRequest, NextResponse } from 'next/server'
import { getSupabaseAuth } from '@/server/auth'

// provider 인증 후 돌아오는 곳. code를 세션으로 교환하고 쿠키를 심은 뒤 next로 보낸다.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const next = req.nextUrl.searchParams.get('next') || '/'

  if (code) {
    const supabase = await getSupabaseAuth()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, req.nextUrl.origin))
    }
  }
  return NextResponse.redirect(new URL('/?login_error=1', req.nextUrl.origin))
}
