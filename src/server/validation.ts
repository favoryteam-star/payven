import { z } from 'zod'
import { BANKS } from '@/lib/banks'

// 받는 사람 계좌(은행/계좌번호/예금주). 만들기 자동 채움 + 저장 계좌 공용.
// bank_name은 banks.ts 화이트리스트(토스 딥링크 호환), account_no는 숫자·하이픈 허용(토스는 숫자만 사용).
export const accountFieldsSchema = z.object({
  bankName: z.enum(BANKS),
  // 숫자만 저장(하이픈은 화면 표시용). 들어온 값에 하이픈 등이 있어도 서버에서 제거 후 검증.
  accountNo: z
    .string()
    .trim()
    .max(40)
    .transform((s) => s.replace(/\D/g, ''))
    .refine((d) => d.length >= 6 && d.length <= 20, '계좌번호를 확인해 주세요(숫자 6~20자리)'),
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

// 반올림 단위(보조단위 없는 정수 원). 1=현행(자동), 10/100/1000=단위로 내림 후 남는 금액 흡수자에게.
export const roundUnitSchema = z
  .union([z.literal(1), z.literal(10), z.literal(100), z.literal(1000)])
  .default(1)

// 정산 날짜(사용자가 고르는 '쓴 날'). YYYY-MM-DD(date 컬럼). 선택 — 없으면 created_at으로 폴백.
export const eventDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않아요')
  .optional()

// 빠른정산 입력. 참여자는 새로 만드는 멤버라 이름 중복 허용(각자 다른 id가 됨).
// 금액은 정수 원, 양수. account=받는 사람(=나) 계좌(선택).
export const quickSettleSchema = z
  .object({
    amount: z.number().int().positive().max(1_000_000_000),
    name: z.string().trim().max(50).optional(), // 정산 제목(그룹명). 없으면 '빠른정산'.
    description: z.string().trim().max(50).optional(),
    members: z
      .array(z.string().trim().min(1, '이름을 입력해 주세요').max(20))
      .min(2, '최소 2명이 필요합니다')
      .max(30),
    payerIndex: z.number().int().min(0),
    // 반올림 단위 + 남는 금액 받을 사람(멤버 인덱스). unit>1인데 absorber 없으면 도메인이 자동 분배.
    unit: roundUnitSchema,
    absorberIndex: z.number().int().min(0).optional(),
    eventDate: eventDateSchema,
    account: accountFieldsSchema.optional(),
    // 인라인으로 직접 입력한 계좌면 정산 시 내 저장 계좌에 추가(저장 계좌에서 고른 거면 false).
    saveAccount: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    const n = val.members.length
    if (val.payerIndex >= n) {
      ctx.addIssue({ code: 'custom', message: '낸 사람 인덱스가 범위를 벗어났습니다', path: ['payerIndex'] })
    }
    if (val.absorberIndex !== undefined && val.absorberIndex >= n) {
      ctx.addIssue({ code: 'custom', message: '남는 금액 받을 사람이 범위를 벗어났습니다', path: ['absorberIndex'] })
    }
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
    // 반올림 단위 + 남는 금액 받을 사람(전역 멤버 인덱스). 항목마다 적용, 흡수자 안 낀 항목은 자동.
    unit: roundUnitSchema,
    absorberIndex: z.number().int().min(0).optional(),
    eventDate: eventDateSchema,
    account: accountFieldsSchema.optional(),
    saveAccount: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    const n = val.members.length
    if (val.payerIndex >= n) {
      ctx.addIssue({ code: 'custom', message: '낸 사람 인덱스가 범위를 벗어났습니다', path: ['payerIndex'] })
    }
    if (val.absorberIndex !== undefined && val.absorberIndex >= n) {
      ctx.addIssue({ code: 'custom', message: '남는 금액 받을 사람이 범위를 벗어났습니다', path: ['absorberIndex'] })
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

// ── 공유 정산 페이지의 송금완료(settlements) — 무로그인 공개 write ──
// slug = nanoid(21, [A-Za-z0-9_-]). from/to는 그 그룹 멤버 uuid(서버에서 멤버십·net 재검증).
const slugSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{10,40}$/, '잘못된 링크예요')

// "보냈어요": 특정 송금(from→to, amount)을 완료로 기록.
export const markSentSchema = z
  .object({
    slug: slugSchema,
    from: z.string().uuid(),
    to: z.string().uuid(),
    amount: z.number().int().positive().max(1_000_000_000),
  })
  .refine((v) => v.from !== v.to, { message: '보내는/받는 사람이 같아요', path: ['to'] })

export type MarkSentInput = z.infer<typeof markSentSchema>

// "취소": 기록한 송금완료를 되돌림(settlement id).
export const undoSettlementSchema = z.object({
  slug: slugSchema,
  settlementId: z.string().uuid(),
})

export type UndoSettlementInput = z.infer<typeof undoSettlementSchema>
