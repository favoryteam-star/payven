'use server'

import { withRateLimit } from '@/server/ratelimit'
import {
  accountIdSchema,
  itemizedBillSchema,
  quickSettleSchema,
  saveAccountSchema,
  updateAccountSchema,
} from '@/server/validation'
import {
  addItemizedBill,
  createQuickSettle,
  createUserAccount,
  deleteUserAccount,
  listUserAccounts,
  setDefaultUserAccount,
  updateUserAccount,
  type SavedAccount,
} from '@/server/queries'
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

// ── 저장 계좌(받는 사람 계좌) ──────────────────────────────────────
// 전부 로그인 필수. 쓰기는 withRateLimit + zod(하드룰 6). 미로그인이면 needLogin.
type AccountResult = { ok: true } | { ok: false; needLogin?: true; error?: string }

/** 만들기 폼·마이가 쓰는 내 저장 계좌 조회(읽기). 미로그인이면 빈 배열. */
export async function getMyAccountsAction(): Promise<SavedAccount[]> {
  const user = await getAuthUser()
  if (!user) return []
  return listUserAccounts(user.id)
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
