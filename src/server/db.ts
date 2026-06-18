import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// 이 모듈은 service_role(또는 sb_secret) 키를 쥔 유일한 파일이다.
// 'server-only'가 1행에 있어 클라이언트가 import하면 빌드 에러가 난다.
// 절대 NEXT_PUBLIC_ 키를 쓰지 말 것.

let client: SupabaseClient<Database> | null = null

/** 어드민(service_role) Supabase 클라이언트. 서버 코드(Server Action·Server Component·cron)에서만 호출. */
export function getAdminClient(): SupabaseClient<Database> {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY(server-only)를 설정하세요.',
    )
  }

  client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}
