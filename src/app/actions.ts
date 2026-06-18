'use server'

import { withRateLimit } from '@/server/ratelimit'
import { quickSettleSchema } from '@/server/validation'
import { createQuickSettle } from '@/server/queries'

// 무로그인 공개 write 액션 → withRateLimit + zod 필수(CLAUDE.md 하드룰 6).
export const quickSettleAction = withRateLimit(async (raw: unknown): Promise<{ slug: string }> => {
  const input = quickSettleSchema.parse(raw)
  return createQuickSettle(input)
})
