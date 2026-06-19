import { z } from 'zod'
import { BANKS } from '@/lib/banks'

// 받는 사람 계좌(은행/계좌번호/예금주). 만들기 자동 채움 + 저장 계좌 공용.
// bank_name은 banks.ts 화이트리스트(토스 딥링크 호환), account_no는 숫자·하이픈 허용(토스는 숫자만 사용).
export const accountFieldsSchema = z.object({
  bankName: z.enum(BANKS),
  accountNo: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9][0-9-]*[0-9]$/, '계좌번호는 숫자와 하이픈만 입력해 주세요')
    // 문자열 길이가 아니라 숫자 자릿수로 검증('12-3' 같은 3자리 통과 방지). 토스는 숫자만 사용.
    .refine((s) => {
      const digits = s.replace(/\D/g, '').length
      return digits >= 6 && digits <= 20
    }, '계좌번호 자릿수를 확인해 주세요(숫자 6~20자리)'),
  accountHolder: z.string().trim().min(1, '예금주를 입력해 주세요').max(20),
})

export type AccountFields = z.infer<typeof accountFieldsSchema>

// 저장 계좌 추가(마이). 별칭·기본여부 포함.
export const saveAccountSchema = accountFieldsSchema.extend({
  label: z.string().trim().max(20).optional(),
  makeDefault: z.boolean().optional(),
})

export type SaveAccountInput = z.infer<typeof saveAccountSchema>

// 저장 계좌 수정(id 포함).
export const updateAccountSchema = saveAccountSchema.extend({
  id: z.string().uuid(),
})

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>

// 삭제/기본지정 등 id만 받는 액션.
export const accountIdSchema = z.object({ id: z.string().uuid() })

// 빠른정산 입력. 참여자는 새로 만드는 멤버라 이름 중복 허용(각자 다른 id가 됨).
// 금액은 정수 원, 양수. account=받는 사람(=나) 계좌(선택).
export const quickSettleSchema = z.object({
  amount: z.number().int().positive().max(1_000_000_000),
  description: z.string().trim().max(50).optional(),
  members: z
    .array(z.string().trim().min(1, '이름을 입력해 주세요').max(20))
    .min(2, '최소 2명이 필요합니다')
    .max(30),
  payerIndex: z.number().int().min(0),
  account: accountFieldsSchema.optional(),
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
    account: accountFieldsSchema.optional(),
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
