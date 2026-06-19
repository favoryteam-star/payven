import { type NextRequest, NextResponse } from 'next/server'
import { getSupabaseAuth } from '@/server/auth'

// 로그아웃 — POST(폼)로만. 세션 종료 후 마이탭으로.
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseAuth()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/my', req.nextUrl.origin), { status: 303 })
}
