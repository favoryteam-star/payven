'use server'

import { revalidatePath } from 'next/cache'
import { withRateLimit } from '@/server/ratelimit'
import {
  accountIdSchema,
  deleteGroupSchema,
  itemizedBillSchema,
  markSentSchema,
  quickSettleSchema,
  saveAccountSchema,
  undoSettlementSchema,
  updateAccountSchema,
  updateItemizedBillSchema,
  updateQuickSettleSchema,
  type AccountFields,
} from '@/server/validation'
import {
  addItemizedBill,
  createQuickSettle,
  createUserAccount,
  deleteGroup,
  deleteUserAccount,
  listRecentMemberNames,
  listUserAccounts,
  recordSettlement,
  setDefaultUserAccount,
  undoSettlement,
  updateItemizedBill,
  updateQuickSettle,
  updateUserAccount,
  type SavedAccount,
} from '@/server/queries'
import { getAuthUser } from '@/server/auth'

// 무로그인 공개 write 액션 → withRateLimit + zod 필수(CLAUDE.md 하드룰 6).
// 만들기 = 로그인 게이트: 미로그인이면 needLogin 신호(클라가 입력값 보존 후 로그인으로). 보기는 무로그인 유지.
type CreateResult = { slug: string } | { needLogin: true }

// 인라인으로 직접 입력한 계좌면 정산 시 내 저장 계좌에 추가(다음부턴 자동 채움).
// 베스트에포트: 저장 실패해도 정산은 유지. 중복(은행+계좌 숫자)이면 건너뜀.
async function maybeSaveAccount(
  userId: string,
  account: AccountFields | undefined,
  save: boolean | undefined,
): Promise<void> {
  if (!save || !account) return
  try {
    const norm = (s: string) => s.replace(/\D/g, '')
    const existing = await listUserAccounts(userId)
    const dup = existing.some((a) => a.bankName === account.bankName && norm(a.accountNo) === norm(account.accountNo))
    if (!dup) await createUserAccount(userId, account)
  } catch {
    // 저장 실패는 정산을 막지 않음(보조 기능)
  }
}

export const quickSettleAction = withRateLimit(async (raw: unknown): Promise<CreateResult> => {
  const user = await getAuthUser()
  if (!user) return { needLogin: true }
  const input = quickSettleSchema.parse(raw)
  const result = await createQuickSettle(input, user.id)
  await maybeSaveAccount(user.id, input.account, input.saveAccount)
  return result
})

export const addItemizedBillAction = withRateLimit(async (raw: unknown): Promise<CreateResult> => {
  const user = await getAuthUser()
  if (!user) return { needLogin: true }
  const input = itemizedBillSchema.parse(raw)
  const result = await addItemizedBill(input, user.id)
  await maybeSaveAccount(user.id, input.account, input.saveAccount)
  return result
})

// ── 내역 수정/삭제(로그인 필수, 소유자 본인만) ─────────────────────
// 수정=교체 RPC가 owner 가드(p_owner_id ↔ groups.owner_id), 삭제=owner_id 스코프 delete.
// 보기는 무로그인이라 이 액션들도 공개 엔드포인트 → withRateLimit + zod 필수(하드룰 6).
// 성공 시 그 정산 페이지 + 내역 목록 revalidate. 세션 만료 시 needLogin(폼이 로그인으로).
type DeleteResult = { ok: true } | { ok: false; needLogin?: true; error?: string }

export const updateQuickSettleAction = withRateLimit(async (raw: unknown): Promise<CreateResult> => {
  const user = await getAuthUser()
  if (!user) return { needLogin: true }
  const input = updateQuickSettleSchema.parse(raw)
  const result = await updateQuickSettle(input, user.id)
  await maybeSaveAccount(user.id, input.account, input.saveAccount)
  revalidatePath(`/g/${input.slug}/settle`)
  revalidatePath('/history')
  return result
})

export const updateItemizedBillAction = withRateLimit(async (raw: unknown): Promise<CreateResult> => {
  const user = await getAuthUser()
  if (!user) return { needLogin: true }
  const input = updateItemizedBillSchema.parse(raw)
  const result = await updateItemizedBill(input, user.id)
  await maybeSaveAccount(user.id, input.account, input.saveAccount)
  revalidatePath(`/g/${input.slug}/settle`)
  revalidatePath('/history')
  return result
})

export const deleteGroupAction = withRateLimit(async (raw: unknown): Promise<DeleteResult> => {
  const user = await getAuthUser()
  if (!user) return { ok: false, needLogin: true }
  const { slug } = deleteGroupSchema.parse(raw)
  const res = await deleteGroup(user.id, slug)
  if (!res.ok) return { ok: false, error: '삭제하지 못했어요' }
  revalidatePath('/history')
  return { ok: true }
})

// ── 저장 계좌(받는 사람 계좌) ──────────────────────────────────────
// 전부 로그인 필수. 쓰기는 withRateLimit + zod(하드룰 6). 미로그인이면 needLogin.
type AccountResult = { ok: true } | { ok: false; needLogin?: true; error?: string }

/** 만들기 폼·마이가 쓰는 내 저장 계좌 조회(읽기). 미로그인이면 빈 배열. */
export async function getMyAccountsAction(): Promise<SavedAccount[]> {
  const user = await getAuthUser()
  if (!user) return []
  return listUserAccounts(user.id)
}

/** 만들기 폼의 '최근 참여자' 빠른 추가용 이름 목록(읽기). 미로그인이면 빈 배열. */
export async function getRecentMembersAction(): Promise<string[]> {
  const user = await getAuthUser()
  if (!user) return []
  return listRecentMemberNames(user.id)
}

export const saveAccountAction = withRateLimit(async (raw: unknown): Promise<AccountResult> => {
  const user = await getAuthUser()
  if (!user) return { ok: false, needLogin: true }
  const input = saveAccountSchema.parse(raw)
  await createUserAccount(user.id, input)
  return { ok: true }
})

export const updateAccountAction = withRateLimit(async (raw: unknown): Promise<AccountResult> => {
  const user = await getAuthUser()
  if (!user) return { ok: false, needLogin: true }
  const input = updateAccountSchema.parse(raw)
  await updateUserAccount(user.id, input)
  return { ok: true }
})

export const deleteAccountAction = withRateLimit(async (raw: unknown): Promise<AccountResult> => {
  const user = await getAuthUser()
  if (!user) return { ok: false, needLogin: true }
  const { id } = accountIdSchema.parse(raw)
  await deleteUserAccount(user.id, id)
  return { ok: true }
})

export const setDefaultAccountAction = withRateLimit(async (raw: unknown): Promise<AccountResult> => {
  const user = await getAuthUser()
  if (!user) return { ok: false, needLogin: true }
  const { id } = accountIdSchema.parse(raw)
  await setDefaultUserAccount(user.id, id)
  return { ok: true }
})

// ── 공유 정산 페이지 송금완료(무로그인 공개 write) ─────────────────
// 보기는 무로그인이라 이 두 액션도 로그인 없이 호출됨 → withRateLimit + zod 필수(하드룰 6).
// 멤버십·net 가드는 server/queries에서(과다기록·역방향 차단). 성공 시 해당 정산 페이지만 revalidate.
type SettleWriteResult = { ok: true } | { ok: false; error: string }

export const markSentAction = withRateLimit(async (raw: unknown): Promise<SettleWriteResult> => {
  const input = markSentSchema.parse(raw)
  const res = await recordSettlement(input.slug, input.from, input.to, input.amount)
  if (!res.ok) {
    return { ok: false, error: res.reason === 'settled' ? '이미 정산됐어요' : '기록하지 못했어요' }
  }
  revalidatePath(`/g/${input.slug}/settle`)
  return { ok: true }
})

export const undoSettlementAction = withRateLimit(async (raw: unknown): Promise<SettleWriteResult> => {
  const input = undoSettlementSchema.parse(raw)
  const res = await undoSettlement(input.slug, input.settlementId)
  if (!res.ok) return { ok: false, error: '취소하지 못했어요' }
  revalidatePath(`/g/${input.slug}/settle`)
  return { ok: true }
})
