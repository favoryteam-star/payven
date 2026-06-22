import 'server-only'
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

// slug = nanoid(21, [A-Za-z0-9_-]). 공개 링크 키. 수정/삭제/송금완료가 대상 그룹을 가리킬 때 공용.
const slugSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{10,40}$/, '잘못된 링크예요')

// 멤버 인덱스 범위 검증(낸 사람·남는 금액 받을 사람). 빠른정산·항목별·수정 공용.
function refineMemberBounds(
  val: { members: string[]; payerIndex: number; absorberIndex?: number | undefined },
  ctx: z.RefinementCtx,
): void {
  const n = val.members.length
  if (val.payerIndex >= n) {
    ctx.addIssue({ code: 'custom', message: '낸 사람 인덱스가 범위를 벗어났습니다', path: ['payerIndex'] })
  }
  if (val.absorberIndex !== undefined && val.absorberIndex >= n) {
    ctx.addIssue({ code: 'custom', message: '남는 금액 받을 사람이 범위를 벗어났습니다', path: ['absorberIndex'] })
  }
}

// 항목별(차수): 남는 금액 받을 사람 범위 + 각 차수의 낸 사람·차수 안 항목 참여자 인덱스 범위.
function refineItemizedBounds(
  val: {
    members: string[]
    absorberIndex?: number | undefined
    rounds: { payerIndex: number; items: { participants: number[] }[] }[]
  },
  ctx: z.RefinementCtx,
): void {
  const n = val.members.length
  if (val.absorberIndex !== undefined && val.absorberIndex >= n) {
    ctx.addIssue({ code: 'custom', message: '남는 금액 받을 사람이 범위를 벗어났습니다', path: ['absorberIndex'] })
  }
  val.rounds.forEach((round, r) => {
    if (round.payerIndex >= n) {
      ctx.addIssue({ code: 'custom', message: '낸 사람 인덱스가 범위를 벗어났습니다', path: ['rounds', r, 'payerIndex'] })
    }
    round.items.forEach((it, i) => {
      it.participants.forEach((p, j) => {
        if (p >= n) {
          ctx.addIssue({
            code: 'custom',
            message: '참여자 인덱스가 범위를 벗어났습니다',
            path: ['rounds', r, 'items', i, 'participants', j],
          })
        }
      })
    })
  })
}

// 빠른정산 입력. 참여자는 새로 만드는 멤버라 이름 중복 허용(각자 다른 id가 됨).
// 금액은 정수 원, 양수. account=받는 사람(=나) 계좌(선택).
const quickSettleObject = z.object({
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

export const quickSettleSchema = quickSettleObject.superRefine(refineMemberBounds)
export type QuickSettleInput = z.infer<typeof quickSettleSchema>

// 빠른정산 수정 = 생성 입력 + 대상 slug. 액션이 로그인·소유자 검증, RPC도 owner 가드.
export const updateQuickSettleSchema = quickSettleObject
  .extend({ slug: slugSchema })
  .superRefine(refineMemberBounds)
export type UpdateQuickSettleInput = z.infer<typeof updateQuickSettleSchema>

// 항목별 정산 입력 = 멤버 + 차수(round) N개. **각 차수에 낸 사람(payerIndex) 한 명**(1차 나·2차 친구),
// 차수 안에 항목(메뉴) M개(각자 participants 다름; 간단한 차수는 항목 1개=총액). 분담은 서버 splitByWeights.
const itemizedBillObject = z.object({
  name: z.string().trim().max(50).optional(),
  members: z
    .array(z.string().trim().min(1, '이름을 입력해 주세요').max(20))
    .min(2, '최소 2명이 필요합니다')
    .max(30),
  rounds: z
    .array(
      z.object({
        payerIndex: z.number().int().min(0), // 이 차수(자리)를 낸 사람
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
          .min(1, '차수에 항목이 최소 1개 필요합니다')
          .max(50),
      }),
    )
    .min(1, '차수가 최소 1개 필요합니다')
    .max(20),
  // 반올림 단위 + 남는 금액 받을 사람(전역 멤버 인덱스). 항목마다 적용, 흡수자 안 낀 항목은 자동.
  unit: roundUnitSchema,
  absorberIndex: z.number().int().min(0).optional(),
  eventDate: eventDateSchema,
  account: accountFieldsSchema.optional(),
  saveAccount: z.boolean().optional(),
})

export const itemizedBillSchema = itemizedBillObject.superRefine(refineItemizedBounds)
export type ItemizedBillInput = z.infer<typeof itemizedBillSchema>

// 항목별 정산 수정 = 생성 입력 + 대상 slug.
export const updateItemizedBillSchema = itemizedBillObject
  .extend({ slug: slugSchema })
  .superRefine(refineItemizedBounds)
export type UpdateItemizedBillInput = z.infer<typeof updateItemizedBillSchema>

// 정산 삭제(내역) — 대상 slug만. 액션이 로그인·소유자 검증.
export const deleteGroupSchema = z.object({ slug: slugSchema })
export type DeleteGroupInput = z.infer<typeof deleteGroupSchema>

// 정산 이름 변경(내역) — 이름 식별이 목적이라 빈 이름은 거부(교체 ADR-022와 달리 비파괴).
export const renameGroupSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1, '이름을 입력해 주세요').max(50),
})
export type RenameGroupInput = z.infer<typeof renameGroupSchema>

// 정산 보관 토글(kind) — kept=true → 'group'(지속, 자동삭제 면제), false → 'quick'(임시).
export const setGroupKeptSchema = z.object({
  slug: slugSchema,
  kept: z.boolean(),
})
export type SetGroupKeptInput = z.infer<typeof setGroupKeptSchema>

// ── 공유 정산 페이지의 송금완료(settlements) — 무로그인 공개 write ──
// from/to는 그 그룹 멤버 uuid(서버에서 멤버십·net 재검증).

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
