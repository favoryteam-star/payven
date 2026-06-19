'use server'

import { withRateLimit } from '@/server/ratelimit'
import { itemizedBillSchema, quickSettleSchema } from '@/server/validation'
import { addItemizedBill, createQuickSettle } from '@/server/queries'
import { getAuthUser } from '@/server/auth'

// 무로그인 공개 write 액션 → withRateLimit + zod 필수(CLAUDE.md 하드룰 6).
// 만들기 = 로그인 게이트: 미로그인이면 needLogin 신호(클라가 입력값 보존 후 로그인으로). 보기는 무로그인 유지.
type CreateResult = { slug: string } | { needLogin: true }

export const quickSettleAction = withRateLimit(async (raw: unknown): Promise<CreateResult> => {
  const user = await getAuthUser()
  if (!user) return { needLogin: true }
  const input = quickSettleSchema.parse(raw)
  return createQuickSettle(input, user.id)
})

export const addItemizedBillAction = withRateLimit(async (raw: unknown): Promise<CreateResult> => {
  const user = await getAuthUser()
  if (!user) return { needLogin: true }
  const input = itemizedBillSchema.parse(raw)
  return addItemizedBill(input, user.id)
})
