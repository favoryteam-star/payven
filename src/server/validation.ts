import { z } from 'zod'

// 빠른정산 입력. 참여자는 새로 만드는 멤버라 이름 중복 허용(각자 다른 id가 됨).
// 금액은 정수 원, 양수.
export const quickSettleSchema = z.object({
  amount: z.number().int().positive().max(1_000_000_000),
  description: z.string().trim().max(50).optional(),
  members: z
    .array(z.string().trim().min(1, '이름을 입력해 주세요').max(20))
    .min(2, '최소 2명이 필요합니다')
    .max(30),
  payerIndex: z.number().int().min(0),
})

export type QuickSettleInput = z.infer<typeof quickSettleSchema>
