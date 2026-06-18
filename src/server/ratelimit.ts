import 'server-only'
import { headers } from 'next/headers'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// 무로그인이라 모든 공개 write 액션은 이 래퍼로 감싼다(CLAUDE.md 하드룰 6).
// Upstash 미설정(개발/M3 전)이면 graceful no-op + 경고. 설정되면 IP 슬라이딩 윈도우로 강제.

const DEFAULT_LIMIT = 10
const DEFAULT_WINDOW_SEC = 10

let ratelimit: Ratelimit | null | undefined // undefined=미초기화, null=비활성
let warned = false

function getRatelimit(): Ratelimit | null {
  if (ratelimit !== undefined) return ratelimit
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    if (!warned) {
      console.warn('[ratelimit] Upstash 미설정 — 레이트리밋 비활성(개발). 프로덕션 전 설정 필요(M3).')
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
