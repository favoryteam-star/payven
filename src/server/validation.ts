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

// 항목별 정산 입력. 영수증 1개 = 멤버 + 항목 N개. 결제자는 영수증 단위 1명(payerIndex).
// 항목마다 participants(이 항목을 나눠 가질 멤버 인덱스)만 받고, 분담은 서버에서 splitByWeights로 계산.
export const itemizedBillSchema = z
  .object({
    name: z.string().trim().max(50).optional(),
    members: z
      .array(z.string().trim().min(1, '이름을 입력해 주세요').max(20))
      .min(2, '최소 2명이 필요합니다')
      .max(30),
    payerIndex: z.number().int().min(0),
    items: z
      .array(
        z
          .object({
            description: z.string().trim().max(40).optional(),
            amount: z.number().int().positive().max(1_000_000_000),
            participants: z
              .array(z.number().int().min(0))
              .min(1, '항목에 최소 1명이 필요합니다'),
          })
          .refine((it) => new Set(it.participants).size === it.participants.length, {
            message: '항목 참여자가 중복되었습니다',
            path: ['participants'],
          }),
      )
      .min(1, '항목이 최소 1개 필요합니다')
      .max(50),
  })
  .superRefine((val, ctx) => {
    const n = val.members.length
    if (val.payerIndex >= n) {
      ctx.addIssue({ code: 'custom', message: '낸 사람 인덱스가 범위를 벗어났습니다', path: ['payerIndex'] })
    }
    val.items.forEach((it, i) => {
      it.participants.forEach((p, j) => {
        if (p >= n) {
          ctx.addIssue({
            code: 'custom',
            message: '참여자 인덱스가 범위를 벗어났습니다',
            path: ['items', i, 'participants', j],
          })
        }
      })
    })
  })

export type ItemizedBillInput = z.infer<typeof itemizedBillSchema>
