import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// 인증 경계. service_role(db.ts)과 분리 — 여기선 anon 키만 쓴다.
// anon 키는 RLS(deny-all)로 보호되지만, 페이븐 규율상 NEXT_PUBLIC_ 아닌 '서버 전용' 변수로 둔다.
// → OAuth/세션을 전부 서버 라우트·미들웨어·액션에서만 처리 → 브라우저엔 Supabase 키·supabase-js 0개.

function authEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase 인증 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL 및 SUPABASE_ANON_KEY(서버 전용)를 설정하세요.',
    )
  }
  return { url, key }
}

/**
 * 요청 컨텍스트(쿠키)에 묶인 인증용 Supabase 클라이언트.
 * Server Component/Action/Route Handler에서 호출. service_role 아님(anon 키).
 */
export async function getSupabaseAuth() {
  const { url, key } = authEnv()
  const store = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options)
        } catch {
          // Server Component 렌더 중엔 쿠키 set 불가 — 토큰 갱신은 미들웨어가 담당.
        }
      },
    },
  })
}

/**
 * 현재 로그인 사용자(검증됨) 또는 null. getUser()는 GoTrue에 토큰을 재검증한다(getSession보다 안전).
 * 환경변수 미설정/네트워크 오류 등 어떤 실패에도 null로 떨어진다 → 무로그인(보기)은 항상 동작.
 */
export async function getAuthUser() {
  try {
    const supa = await getSupabaseAuth()
    const { data, error } = await supa.auth.getUser()
    if (error) return null
    return data.user ?? null
  } catch {
    return null
  }
}

/**
 * 표시 이름 해석: 사용자가 정한 닉네임(display_name) 우선, 없으면 OAuth 제공 이름. 없으면 null.
 * display_name은 provider가 안 채우는 커스텀 키라 재로그인에도 보존된다(name/full_name은 매 로그인 갱신).
 */
export function resolveDisplayName(
  user: { user_metadata?: Record<string, unknown> | null } | null,
): string | null {
  const m = user?.user_metadata
  if (!m) return null
  const pick = (k: string) => {
    const v = m[k]
    return typeof v === 'string' && v.trim() ? v.trim() : null
  }
  return pick('display_name') || pick('name') || pick('full_name') || pick('user_name') || pick('nickname')
}
