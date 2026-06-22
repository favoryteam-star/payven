import 'server-only'
import { headers } from 'next/headers'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// 무로그인이라 모든 공개 write 액션은 이 래퍼로 감싼다(CLAUDE.md 하드룰 6).
// Upstash 미설정이면 개발에선 graceful no-op + 경고, 프로덕션에선 fail-closed로 throw
// (공개 write가 무방비로 열리는 배포 실수 방지). 설정되면 IP 슬라이딩 윈도우로 강제.

const DEFAULT_LIMIT = 10
const DEFAULT_WINDOW_SEC = 10

let ratelimit: Ratelimit | null | undefined // undefined=미초기화, null=비활성
let warned = false

function getRatelimit(): Ratelimit | null {
  if (ratelimit !== undefined) return ratelimit
  // Vercel의 Upstash 통합은 KV_REST_API_URL/TOKEN으로 주입(REST 주소+토큰).
  // 수동 설정(.env.example)은 UPSTASH_REDIS_REST_* — 둘 다 받는다.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    // 프로덕션에서 미설정 = 배포 실수. 무로그인 공개 write가 무방비로 열리므로 fail-closed.
    // (요청 시점에 던져 빌드는 안 깨지고, 배포 직후 첫 write에서 바로 드러남.)
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[ratelimit] Upstash env(KV_REST_API_URL/TOKEN 또는 UPSTASH_REDIS_REST_*) 미설정 — 프로덕션에선 레이트리밋이 필수입니다. Vercel 환경변수(Production·Preview)에 추가하세요.',
      )
    }
    if (!warned) {
      console.warn('[ratelimit] Upstash 미설정 — 레이트리밋 비활성(개발 전용).')
      warned = true
    }
    ratelimit = null
    return null
  }
  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(DEFAULT_LIMIT, `${DEFAULT_WINDOW_SEC} s`),
    prefix: 'payven',
  })
  return ratelimit
}

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1'
}

/** 공개 write 액션 래퍼. 한도 초과 시 throw. */
export function withRateLimit<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  bucket = 'write',
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const rl = getRatelimit()
    if (rl) {
      const ip = await clientIp()
      const { success } = await rl.limit(`${bucket}:${ip}`)
      if (!success) {
        throw new Error('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.')
      }
    }
    return fn(...args)
  }
}
