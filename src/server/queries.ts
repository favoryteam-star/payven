import 'server-only'
import { nanoid } from 'nanoid'
import { getAdminClient } from './db'
import { equalSplit, splitByWeights } from '@/domain/settle'
import type { ExpenseRecord, SettlementRecord } from '@/domain/types'
import type {
  ItemizedBillInput,
  QuickSettleInput,
  SaveAccountInput,
  UpdateAccountInput,
} from './validation'
import type { Json } from './database.types'

export interface SnapshotMember {
  id: string
  name: string
  bankName: string | null
  accountNo: string | null
  accountHolder: string | null
}

/** 로그인 사용자에 저장된 받는 사람 계좌(브라우저에 그대로 전달 가능한 평범한 형태). */
export interface SavedAccount {
  id: string
  bankName: string
  accountNo: string
  accountHolder: string
  label: string | null
  isDefault: boolean
}

export interface GroupSnapshot {
  group: { id: string; slug: string; name: string; kind: string; createdAt: string }
  members: SnapshotMember[]
  expenses: ExpenseRecord[]
  settlements: SettlementRecord[]
}

/** 빠른정산: 임시그룹+멤버+지출+분담을 RPC로 원자적 생성. 분담은 도메인에서 계산. ownerId=로그인 사용자. */
export async function createQuickSettle(
  input: QuickSettleInput,
  ownerId: string,
): Promise<{ slug: string }> {
  const supa = getAdminClient()
  const slug = nanoid(21)

  // 멤버 순서를 인덱스 id로 써서 equalSplit → 반환 순서 = 멤버 순서
  const indexIds = input.members.map((_, i) => String(i))
  const shares = equalSplit(input.amount, indexIds, String(input.payerIndex))
  const sharesArr = shares.map((s) => s.amount)

  const { error } = await supa.rpc('create_quick_settle', {
    p_slug: slug,
    p_name: '빠른정산',
    p_member_names: input.members,
    p_amount: input.amount,
    p_paid_by_index: input.payerIndex,
    p_shares: sharesArr,
    p_description: input.description ?? '',
    p_owner_id: ownerId,
    // 받는 사람(=나, 멤버 0) 계좌(선택). RPC가 멤버 0에 저장.
    p_acct_bank: input.account?.bankName,
    p_acct_no: input.account?.accountNo,
    p_acct_holder: input.account?.accountHolder,
  })
  if (error) throw new Error(`빠른정산 생성 실패: ${error.message}`)
  return { slug }
}

/**
 * 항목별 정산: 영수증(여러 항목)을 RPC로 원자 생성. 항목별 분담은 도메인(splitByWeights)에서 계산.
 * 결제자는 영수증 단위 1명(payerIndex). 각 항목은 참여자만 균등 분담(미참여자 0).
 */
export async function addItemizedBill(
  input: ItemizedBillInput,
  ownerId: string,
): Promise<{ slug: string }> {
  const supa = getAdminClient()
  const slug = nanoid(21)
  const memberCount = input.members.length

  const items = input.items.map((it): Json => {
    // 참여자 인덱스를 id로 써서 splitByWeights(weight 1) → 반환 순서 = 참여자 순서
    const weights = it.participants.map((idx) => ({ memberId: String(idx), weight: 1 }))
    const shares = splitByWeights(it.amount, weights, String(input.payerIndex))
    // 멤버 정렬 정수배열로 펼침(미참여자 0). RPC가 합 == amount 재검증.
    const aligned = Array.from({ length: memberCount }, () => 0)
    for (const s of shares) aligned[Number(s.memberId)] = s.amount
    return {
      description: it.description ?? '',
      amount: it.amount,
      paid_by_index: input.payerIndex,
      shares: aligned,
    }
  })

  const name =
    input.name?.trim() ||
    input.items.find((it) => it.description?.trim())?.description?.trim() ||
    '항목별 정산'

  const { error } = await supa.rpc('add_itemized_bill', {
    p_slug: slug,
    p_name: name,
    p_member_names: input.members,
    p_items: items,
    p_owner_id: ownerId,
    // 받는 사람(=나, 멤버 0) 계좌(선택). RPC가 멤버 0에 저장.
    p_acct_bank: input.account?.bankName,
    p_acct_no: input.account?.accountNo,
    p_acct_holder: input.account?.accountHolder,
  })
  if (error) throw new Error(`항목별 정산 생성 실패: ${error.message}`)
  return { slug }
}

/** 그룹 전체 스냅샷(멤버/지출+분담/정산)을 도메인 형태로 매핑. 읽기 전용. */
export async function getGroupBySlug(slug: string): Promise<GroupSnapshot | null> {
  const supa = getAdminClient()

  const { data: group, error: gErr } = await supa
    .from('groups')
    .select('id, slug, name, kind, created_at')
    .eq('slug', slug)
    .maybeSingle()
  if (gErr) throw new Error(gErr.message)
  if (!group) return null

  const [membersRes, expensesRes, settlementsRes] = await Promise.all([
    supa
      .from('members')
      .select('id, name, bank_name, account_no, account_holder')
      .eq('group_id', group.id)
      .order('created_at'),
    supa.from('expenses').select('id, amount, paid_by').eq('group_id', group.id),
    supa.from('settlements').select('from_member, to_member, amount').eq('group_id', group.id),
  ])

  const expenses = expensesRes.data ?? []
  const expenseIds = expenses.map((e) => e.id)
  const sharesRes = expenseIds.length
    ? await supa.from('expense_shares').select('expense_id, member_id, amount').in('expense_id', expenseIds)
    : { data: [] }
  const shares = sharesRes.data ?? []

  const sharesByExpense = new Map<string, { memberId: string; amount: number }[]>()
  for (const s of shares) {
    const arr = sharesByExpense.get(s.expense_id) ?? []
    arr.push({ memberId: s.member_id, amount: s.amount })
    sharesByExpense.set(s.expense_id, arr)
  }

  const expenseRecords: ExpenseRecord[] = expenses.map((e) => ({
    amount: e.amount,
    paidBy: e.paid_by,
    shares: sharesByExpense.get(e.id) ?? [],
  }))

  const settlementRecords: SettlementRecord[] = (settlementsRes.data ?? []).map((s) => ({
    from: s.from_member,
    to: s.to_member,
    amount: s.amount,
  }))

  return {
    group: { id: group.id, slug: group.slug, name: group.name, kind: group.kind, createdAt: group.created_at },
    members: (membersRes.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      bankName: m.bank_name,
      accountNo: m.account_no,
      accountHolder: m.account_holder,
    })),
    expenses: expenseRecords,
    settlements: settlementRecords,
  }
}

// ── 내역(내가 만든 정산) ───────────────────────────────────────────

/** 내역탭 카드 요약(브라우저에 그대로 전달 가능한 평범한 형태). */
export interface SettlementSummary {
  slug: string
  name: string
  kind: string
  createdAt: string
  memberCount: number
  total: number // 정수 원
}

/**
 * 로그인 사용자가 만든 정산 목록(최신순). 내역탭(Server Component)이 직접 호출하는 읽기.
 * owner_id 없는(무로그인 생성) 정산은 제외. N+1 없이 3쿼리(그룹→멤버/지출 한 번씩)로 집계.
 */
export async function listGroupsByOwner(ownerId: string): Promise<SettlementSummary[]> {
  const supa = getAdminClient()
  const { data: groups, error } = await supa
    .from('groups')
    .select('id, slug, name, kind, created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  if (!groups || groups.length === 0) return []

  const ids = groups.map((g) => g.id)
  const [membersRes, expensesRes] = await Promise.all([
    supa.from('members').select('group_id').in('group_id', ids),
    supa.from('expenses').select('group_id, amount').in('group_id', ids),
  ])
  if (membersRes.error) throw new Error(membersRes.error.message)
  if (expensesRes.error) throw new Error(expensesRes.error.message)

  const memberCount = new Map<string, number>()
  for (const m of membersRes.data ?? []) {
    memberCount.set(m.group_id, (memberCount.get(m.group_id) ?? 0) + 1)
  }
  const totalByGroup = new Map<string, number>()
  for (const e of expensesRes.data ?? []) {
    totalByGroup.set(e.group_id, (totalByGroup.get(e.group_id) ?? 0) + e.amount)
  }

  return groups.map((g) => ({
    slug: g.slug,
    name: g.name,
    kind: g.kind,
    createdAt: g.created_at,
    memberCount: memberCount.get(g.id) ?? 0,
    total: totalByGroup.get(g.id) ?? 0,
  }))
}

// ── 저장 계좌(받는 사람 계좌) ──────────────────────────────────────
// 전부 user_id로 스코프 → 한 사용자가 남의 계좌를 건드릴 수 없음(service_role여도 방어).
// '유저당 기본 1개' 부분 유니크 인덱스(0006) 충돌을 피하려고 기본 전환은 항상 '먼저 끄고 켜기' 순서.

function mapAccount(r: {
  id: string
  bank_name: string
  account_no: string
  account_holder: string
  label: string | null
  is_default: boolean
}): SavedAccount {
  return {
    id: r.id,
    bankName: r.bank_name,
    accountNo: r.account_no,
    accountHolder: r.account_holder,
    label: r.label,
    isDefault: r.is_default,
  }
}

/** 사용자의 저장 계좌 목록(기본 먼저, 그다음 오래된 순). */
export async function listUserAccounts(userId: string): Promise<SavedAccount[]> {
  const supa = getAdminClient()
  const { data, error } = await supa
    .from('user_accounts')
    .select('id, bank_name, account_no, account_holder, label, is_default')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapAccount)
}

/** 기본 계좌를 id 하나로 전환. OFF→ON을 한 트랜잭션(RPC)으로 처리 → 제로-기본 창 없음(0008).
 *  대상이 본인 소유로 존재할 때만 전환(RPC가 검증; 없으면 no-op → 기존 기본 유지). */
async function setOnlyDefault(userId: string, id: string): Promise<void> {
  const supa = getAdminClient()
  const { error } = await supa.rpc('set_default_account', { p_user: userId, p_id: id })
  if (error) throw new Error(error.message)
}

/** 계좌 추가. 첫 계좌이거나 makeDefault면 기본으로.
 *  is_default=false로 삽입(유니크 충돌 원천 차단) 후, 기본이어야 하면 원자적 RPC로 전환. */
export async function createUserAccount(userId: string, input: SaveAccountInput): Promise<void> {
  const supa = getAdminClient()
  const existing = await listUserAccounts(userId)
  const shouldDefault = input.makeDefault === true || existing.length === 0
  const { data, error } = await supa
    .from('user_accounts')
    .insert({
      user_id: userId,
      bank_name: input.bankName,
      account_no: input.accountNo,
      account_holder: input.accountHolder,
      label: input.label?.trim() ? input.label.trim() : null,
      is_default: false,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  if (shouldDefault) await setOnlyDefault(userId, data.id)
}

/** 계좌 수정(본인 것만). makeDefault면 기본 전환(원자적). */
export async function updateUserAccount(userId: string, input: UpdateAccountInput): Promise<void> {
  const supa = getAdminClient()
  const { error } = await supa
    .from('user_accounts')
    .update({
      bank_name: input.bankName,
      account_no: input.accountNo,
      account_holder: input.accountHolder,
      label: input.label?.trim() ? input.label.trim() : null,
    })
    .eq('user_id', userId)
    .eq('id', input.id)
  if (error) throw new Error(error.message)
  if (input.makeDefault === true) await setOnlyDefault(userId, input.id)
}

/** 계좌 삭제(본인 것만). 기본을 지웠으면 가장 오래된 남은 계좌를 기본으로 승격 — 한 트랜잭션(RPC, 0008). */
export async function deleteUserAccount(userId: string, id: string): Promise<void> {
  const supa = getAdminClient()
  const { error } = await supa.rpc('delete_account', { p_user: userId, p_id: id })
  if (error) throw new Error(error.message)
}

/** 기본 계좌 지정(본인 것만). RPC가 소유·존재 확인 + 원자 전환(없으면 no-op). */
export async function setDefaultUserAccount(userId: string, id: string): Promise<void> {
  await setOnlyDefault(userId, id)
}
