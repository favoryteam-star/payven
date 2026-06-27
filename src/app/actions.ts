'use server'

import { revalidatePath } from 'next/cache'
import { withRateLimit } from '@/server/ratelimit'
import {
  accountIdSchema,
  deleteGroupSchema,
  deleteMyAccountSchema,
  itemizedBillSchema,
  markSentSchema,
  memberGroupFieldsSchema,
  memberGroupIdSchema,
  ocrReceiptSchema,
  quickSettleSchema,
  renameGroupSchema,
  saveAccountSchema,
  setGroupKeptSchema,
  undoSettlementSchema,
  updateAccountSchema,
  updateItemizedBillSchema,
  updateMemberGroupSchema,
  updateNicknameSchema,
  updateQuickSettleSchema,
  type AccountFields,
} from '@/server/validation'
import {
  addItemizedBill,
  createMemberGroup,
  createQuickSettle,
  createUserAccount,
  deleteGroup,
  deleteMemberGroup,
  deleteMyAccount,
  deleteUserAccount,
  listMemberGroups,
  listRecentMemberNames,
  listUserAccounts,
  recordSettlement,
  renameGroup,
  setDefaultUserAccount,
  setGroupKept,
  undoSettlement,
  updateItemizedBill,
  updateMemberGroup,
  updateQuickSettle,
  updateUserAccount,
  type MemberGroup,
  type SavedAccount,
} from '@/server/queries'
import { getAuthUser, getSupabaseAuth, resolveDisplayName } from '@/server/auth'
import { parseReceiptImage } from '@/server/ocr'

// 무로그인 공개 write 액션 → withRateLimit + zod 필수(CLAUDE.md 하드룰 6).
// 만들기 = 무로그인 허용(마찰 제거 = 성장 루프, ADR-038). 미로그인이면 익명 생성(owner_id null) →
// 결과·공유 바로. 저장/내역/계좌는 로그인에서만. (needLogin은 이제 '수정' 액션 전용 — 소유자 가드.)
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
  const user = await getAuthUser() // 미로그인 OK — 익명 생성(owner_id null)
  const input = quickSettleSchema.parse(raw)
  const result = await createQuickSettle(input, user?.id ?? null)
  if (user) await maybeSaveAccount(user.id, input.account, input.saveAccount) // 계좌 저장은 로그인만
  return result
})

export const addItemizedBillAction = withRateLimit(async (raw: unknown): Promise<CreateResult> => {
  const user = await getAuthUser() // 미로그인 OK — 익명 생성(owner_id null)
  const input = itemizedBillSchema.parse(raw)
  const result = await addItemizedBill(input, user?.id ?? null)
  if (user) await maybeSaveAccount(user.id, input.account, input.saveAccount) // 계좌 저장은 로그인만
  return result
})

// ── 영수증 OCR(로그인 필수 — 유료 비전 API 비용 통제). 사진 → 메뉴+금액. ──
// 이미지는 저장 안 함(호출 후 버림). 일반 write와 분리된 'ocr' 버킷으로 레이트리밋.
type OcrResult =
  | { lines: { name: string; qty: number; amount: number }[]; total: number }
  | { needLogin: true }
  | { ok: false; error: string }

export const ocrReceiptAction = withRateLimit(async (raw: unknown): Promise<OcrResult> => {
  const user = await getAuthUser()
  if (!user) return { needLogin: true }
  const input = ocrReceiptSchema.parse(raw)
  try {
    const { lines, total } = await parseReceiptImage(input.imageBase64, input.mediaType)
    if (lines.length === 0) {
      return { ok: false, error: '영수증에서 메뉴를 못 읽었어요. 더 밝게·반듯하게 찍어 주세요.' }
    }
    return { lines, total }
  } catch (e) {
    console.error('[ocr] 인식 실패:', e instanceof Error ? e.message : e)
    return { ok: false, error: '영수증 인식에 실패했어요. 잠시 후 다시 시도해 주세요.' }
  }
}, 'ocr')

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

// 이름 변경 = 비파괴(name만). 정산결과 히어로도 커스텀 제목을 보여주므로 그 페이지도 revalidate.
export const renameGroupAction = withRateLimit(async (raw: unknown): Promise<DeleteResult> => {
  const user = await getAuthUser()
  if (!user) return { ok: false, needLogin: true }
  const { slug, name } = renameGroupSchema.parse(raw)
  const res = await renameGroup(user.id, slug, name)
  if (!res.ok) return { ok: false, error: '이름을 바꾸지 못했어요' }
  revalidatePath('/history')
  revalidatePath(`/g/${slug}/settle`)
  return { ok: true }
})

// 보관 토글 = kind('group'↔'quick'). 자동삭제(M6 cleanup) 면제 표시. 내역 목록만 갱신.
export const setGroupKeptAction = withRateLimit(async (raw: unknown): Promise<DeleteResult> => {
  const user = await getAuthUser()
  if (!user) return { ok: false, needLogin: true }
  const { slug, kept } = setGroupKeptSchema.parse(raw)
  const res = await setGroupKept(user.id, slug, kept)
  if (!res.ok) return { ok: false, error: '바꾸지 못했어요' }
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

/** 만들기 폼의 '최근 참여자' 빠른 추가용 이름 목록(읽기). 미로그인이면 빈 배열.
 *  본인 표시 이름은 제외 — 멤버 0이 '나' 대신 닉네임일 수 있어 자기 자신이 친구 칩으로 뜨는 것 방지. */
export async function getRecentMembersAction(): Promise<string[]> {
  const user = await getAuthUser()
  if (!user) return []
  const names = await listRecentMemberNames(user.id)
  const me = resolveDisplayName(user)
  return me ? names.filter((n) => n !== me) : names
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

// ── 내 모임(저장 멤버 그룹) ──────────────────────────────────────────
// 읽기는 로그인 시 목록, 쓰기는 withRateLimit + zod + 로그인(하드룰 6).
type MemberGroupResult = { ok: true } | { ok: false; needLogin?: true; error?: string }

/** 만들기 폼·마이가 쓰는 내 모임 조회(읽기). 미로그인이면 빈 배열. */
export async function getMyMemberGroupsAction(): Promise<MemberGroup[]> {
  const user = await getAuthUser()
  if (!user) return []
  return listMemberGroups(user.id)
}

export const saveMemberGroupAction = withRateLimit(async (raw: unknown): Promise<MemberGroupResult> => {
  const user = await getAuthUser()
  if (!user) return { ok: false, needLogin: true }
  const input = memberGroupFieldsSchema.parse(raw)
  await createMemberGroup(user.id, input)
  return { ok: true }
})

export const updateMemberGroupAction = withRateLimit(async (raw: unknown): Promise<MemberGroupResult> => {
  const user = await getAuthUser()
  if (!user) return { ok: false, needLogin: true }
  const input = updateMemberGroupSchema.parse(raw)
  await updateMemberGroup(user.id, input)
  return { ok: true }
})

export const deleteMemberGroupAction = withRateLimit(async (raw: unknown): Promise<MemberGroupResult> => {
  const user = await getAuthUser()
  if (!user) return { ok: false, needLogin: true }
  const { id } = memberGroupIdSchema.parse(raw)
  await deleteMemberGroup(user.id, id)
  return { ok: true }
})

// ── 프로필 닉네임(표시 이름) ─────────────────────────────────────────
// user_metadata.display_name에 저장(provider가 안 건드리는 커스텀 키). 인증 세션 클라로 본인 것만 변경.
// 데이터(service_role)가 아니라 auth 경계(getSupabaseAuth)를 통해 쓴다 — 세션 쿠키로 인증.
export const updateNicknameAction = withRateLimit(
  async (raw: unknown): Promise<{ ok: true } | { ok: false; needLogin?: true; error?: string }> => {
    const user = await getAuthUser()
    if (!user) return { ok: false, needLogin: true }
    const { name } = updateNicknameSchema.parse(raw)
    const supa = await getSupabaseAuth()
    const { error } = await supa.auth.updateUser({ data: { display_name: name } })
    if (error) return { ok: false, error: '이름을 바꾸지 못했어요' }
    revalidatePath('/my')
    return { ok: true }
  },
)

// ── 계정·데이터 삭제 (로그인 필수, 본인만) ───────────────────────────
// 개인정보 파기: auth 유저 삭제 → 저장계좌·내 모임 cascade, 공유 정산은 owner null(비식별화).
// 세션 user.id만 삭제 → 남의 계정 못 지움. 삭제 후 세션 쿠키 정리(베스트에포트). 공개 write라 하드룰 6 적용.
export const deleteMyAccountAction = withRateLimit(
  async (raw: unknown): Promise<{ ok: true } | { ok: false; needLogin?: true; error?: string }> => {
    const user = await getAuthUser()
    if (!user) return { ok: false, needLogin: true }
    deleteMyAccountSchema.parse(raw)
    const res = await deleteMyAccount(user.id)
    if (!res.ok) return { ok: false, error: '계정을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.' }
    // 유저가 이미 삭제됐으므로 토큰은 무효 — 쿠키만 비운다(실패해도 무시).
    try {
      const supa = await getSupabaseAuth()
      await supa.auth.signOut()
    } catch {
      // 세션 정리 실패는 삭제 결과에 영향 없음
    }
    revalidatePath('/my')
    return { ok: true }
  },
)

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
