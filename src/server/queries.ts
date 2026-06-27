import 'server-only'
import { nanoid } from 'nanoid'
import { getAdminClient } from './db'
import { equalSplit, minimizeCashFlow, netBalances, roundingLeftover, splitByWeights, topAbsorber } from '@/domain/settle'
import type { ExpenseRecord, SettlementRecord } from '@/domain/types'
import type {
  ItemizedBillInput,
  MemberGroupFields,
  QuickSettleInput,
  SaveAccountInput,
  UpdateAccountInput,
  UpdateItemizedBillInput,
  UpdateMemberGroupInput,
  UpdateQuickSettleInput,
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

/** 기록된 송금완료(표시·취소용, settlement id 포함). 도메인 SettlementRecord와 달리 id를 들고 다님. */
export interface SettledTransfer {
  id: string
  from: string
  to: string
  amount: number
}

/** 표시 전용 — 공유 페이지 '상세히 보기'(차수·메뉴·참여자). 도메인 ExpenseRecord와 분리. */
export interface SnapshotRoundItem {
  description: string // 메뉴명. RPC가 빈값을 '항목'으로 저장 → 표시 시 placeholder 폴백.
  amount: number // 라인 총액
  quantity: number // 라인 수량(기본 1). 단가 = amount/quantity. 상세 표시용.
  participants: { id: string; amount: number }[] // 참여 멤버 id + 그 메뉴에서의 분담액
}
export interface SnapshotRound {
  payer: string // 낸 사람 멤버 id
  items: SnapshotRoundItem[]
}

export interface GroupSnapshot {
  group: {
    id: string
    slug: string
    name: string
    kind: string
    createdAt: string
    ownerId: string | null
    eventDate: string | null // 사용자가 고른 정산 날짜(YYYY-MM-DD). 없으면 표시는 createdAt 폴백.
  }
  members: SnapshotMember[]
  expenses: ExpenseRecord[]
  settlements: SettlementRecord[] // 도메인 입력(netBalances) — id 없음(도메인 불변)
  settledTransfers: SettledTransfer[] // 화면 표시·취소용 — id 있음
  isItemized: boolean // 항목별(weighted)이면 상세보기 노출. 빠른정산은 false.
  rounds: SnapshotRound[] // 표시 전용 차수→메뉴→참여자(항목별만 채움)
  // 단위 맞춤 '남은 금액'을 떠안은 흡수자(0015 메타). 없으면 null. extra = 폼에서 본 '남은 N원'.
  absorber: { memberId: string; extra: number } | null
}

/**
 * RPC가 만든/수정한 그룹에 표시용 메타(정산 날짜 + 단위 맞춤 '남은 금액'·흡수자)를 베스트에포트 부착.
 * RPC를 안 건드리는 대신 여기서 한 번 더 UPDATE(실패해도 정산은 유지 — 날짜는 created_at, 잔돈은 안내 생략으로 폴백).
 * absorber_index는 흡수자가 leftover>0일 때만(쏘기·딱 떨어짐이면 null) — 멤버 생성 순서 인덱스(공유 페이지가 멤버 배열로 해석).
 */
async function setGroupMeta(
  slug: string,
  meta: { eventDate?: string; leftover: number; absorberIndex?: number },
): Promise<void> {
  const supa = getAdminClient()
  const patch: { event_date?: string; leftover_amount: number; absorber_index: number | null } = {
    leftover_amount: meta.leftover,
    absorber_index: meta.leftover > 0 ? (meta.absorberIndex ?? null) : null,
  }
  if (meta.eventDate) patch.event_date = meta.eventDate
  const { error } = await supa.from('groups').update(patch).eq('slug', slug)
  if (error) console.error('그룹 메타 설정 실패(무시):', error.message)
}

/** 항목별 차수 묶음에서 단위 맞춤 '남은 금액' 합(흡수자가 떠안음). 폼 itemsLeftover와 동일 공식(roundingLeftover). */
function itemizedLeftover(
  rounds: { items: { amount: number; participants: number[] }[] }[],
  unit: number,
): number {
  return rounds.reduce(
    (s, rd) => s + rd.items.reduce((t, it) => t + roundingLeftover(it.amount, it.participants.length, unit), 0),
    0,
  )
}

/** 빠른정산: 임시그룹+멤버+지출+분담을 RPC로 원자적 생성. 분담은 도메인에서 계산. ownerId=로그인 사용자. */
/** 빠른정산 분담 배열(멤버 순서, 길이=멤버수). winnerIndex 있으면 '한 명이 다 쏘기'(그 사람만 전액,
 *  나머지 0 — unit/absorber 무시). 없으면 균등 분할(단위·흡수자 옵션). 반올림 단일 출처=equalSplit. */
function quickSharesArray(input: {
  amount: number
  members: string[]
  payerIndex: number
  unit: number
  absorberIndex?: number
  winnerIndex?: number
}): number[] {
  if (input.winnerIndex !== undefined) {
    // 단일 참여자(진 사람) 분할 = 그 사람이 전액. 도메인을 거쳐 정수 불변식 유지(나머지 멤버는 0).
    const won = equalSplit(input.amount, [String(input.winnerIndex)], { paidBy: String(input.payerIndex) })
    const arr = Array.from({ length: input.members.length }, () => 0)
    for (const s of won) arr[Number(s.memberId)] = s.amount
    return arr
  }
  // 멤버 순서를 인덱스 id로 써서 equalSplit → 반환 순서 = 멤버 순서
  const shares = equalSplit(
    input.amount,
    input.members.map((_, i) => String(i)),
    {
      paidBy: String(input.payerIndex),
      unit: input.unit,
      absorber: input.absorberIndex !== undefined ? String(input.absorberIndex) : undefined,
    },
  )
  return shares.map((s) => s.amount)
}

export async function createQuickSettle(
  input: QuickSettleInput,
  ownerId: string | null, // 무로그인 생성이면 null(owner_id 컬럼 nullable) — 만들기 마찰 제거
): Promise<{ slug: string }> {
  const supa = getAdminClient()
  const slug = nanoid(21)

  const sharesArr = quickSharesArray(input)

  const { error } = await supa.rpc('create_quick_settle', {
    p_slug: slug,
    p_name: input.name?.trim() || '빠른정산',
    p_member_names: input.members,
    p_amount: input.amount,
    p_paid_by_index: input.payerIndex,
    p_shares: sharesArr,
    p_description: input.description ?? '',
    p_owner_id: ownerId ?? undefined, // null이면 파라미터 생략 → RPC 기본값(null) = 익명 생성
    // 받는 사람(=나, 멤버 0) 계좌(선택). RPC가 멤버 0에 저장.
    p_acct_bank: input.account?.bankName,
    p_acct_no: input.account?.accountNo,
    p_acct_holder: input.account?.accountHolder,
  })
  if (error) throw new Error(`빠른정산 생성 실패: ${error.message}`)
  // 쏘기(winnerIndex)는 한 명 전액이라 잔돈 개념 없음 → leftover 0. 아니면 균등 분할의 남는 금액.
  const leftover = input.winnerIndex !== undefined ? 0 : roundingLeftover(input.amount, input.members.length, input.unit)
  await setGroupMeta(slug, { eventDate: input.eventDate, leftover, absorberIndex: input.absorberIndex })
  return { slug }
}

/** 차수(rounds)를 RPC가 받는 flat 항목 배열로. 항목마다 도메인 분담(paidBy=차수 결제자, 단위·전역 흡수자)
 *  + round 인덱스(RPC가 차수별 bill_id로 묶음). 생성·수정 공용. */
function buildItemizedRpcItems(
  input: {
    rounds: {
      payerIndex: number
      items: { description?: string; amount: number; participants: number[]; qty?: number }[]
    }[]
    unit: number
    absorberIndex?: number
  },
  memberCount: number,
): Json[] {
  const absorber = input.absorberIndex !== undefined ? String(input.absorberIndex) : undefined
  const items: Json[] = []
  input.rounds.forEach((round, r) => {
    round.items.forEach((it) => {
      // 참여자 인덱스를 id로 써서 splitByWeights(weight 1) → 반환 순서 = 참여자 순서.
      const weights = it.participants.map((idx) => ({ memberId: String(idx), weight: 1 }))
      const shares = splitByWeights(it.amount, weights, { paidBy: String(round.payerIndex), unit: input.unit, absorber })
      // 멤버 정렬 정수배열로 펼침(미참여자 0). RPC가 합 == amount 재검증.
      const aligned = Array.from({ length: memberCount }, () => 0)
      for (const s of shares) aligned[Number(s.memberId)] = s.amount
      items.push({
        description: it.description ?? '',
        amount: it.amount,
        paid_by_index: round.payerIndex,
        shares: aligned,
        round: r, // RPC가 같은 round끼리 같은 bill_id(=한 자리)로 묶음
        quantity: it.qty ?? 1, // 라인 수량(표시·복원용). 분담엔 영향 0(amount가 총액).
      })
    })
  })
  return items
}

/**
 * 항목별 정산: 차수(round) 묶음을 RPC로 원자 생성. 차수마다 낸 사람 1명, 차수 안 항목별 참여자.
 * 분담은 도메인(splitByWeights), 차수 묶음은 RPC가 bill_id로(0011).
 */
export async function addItemizedBill(
  input: ItemizedBillInput,
  ownerId: string | null, // 무로그인 생성이면 null(owner_id 컬럼 nullable) — 만들기 마찰 제거
): Promise<{ slug: string }> {
  const supa = getAdminClient()
  const slug = nanoid(21)
  const memberCount = input.members.length

  const items = buildItemizedRpcItems(input, memberCount)
  const name =
    input.name?.trim() ||
    input.rounds[0]?.items.find((it) => it.description?.trim())?.description?.trim() ||
    '항목별 정산'

  const { error } = await supa.rpc('add_itemized_bill', {
    p_slug: slug,
    p_name: name,
    p_member_names: input.members,
    p_items: items,
    p_owner_id: ownerId ?? undefined, // null이면 파라미터 생략 → RPC 기본값(null) = 익명 생성
    // 받는 사람(=나, 멤버 0) 계좌(선택). RPC가 멤버 0에 저장.
    p_acct_bank: input.account?.bankName,
    p_acct_no: input.account?.accountNo,
    p_acct_holder: input.account?.accountHolder,
  })
  if (error) throw new Error(`항목별 정산 생성 실패: ${error.message}`)
  await setGroupMeta(slug, {
    eventDate: input.eventDate,
    leftover: itemizedLeftover(input.rounds, input.unit),
    absorberIndex: input.absorberIndex,
  })
  return { slug }
}

// ── 정산 수정(내역에서 내가 만든 정산을 교체) ───────────────────────
// 교체 RPC가 한 트랜잭션에서 자식(settlements/expense_shares/expenses/members) wipe → 재삽입.
// 분담 계산은 생성과 동일(반올림 단일 출처). 소유자 가드는 RPC가(p_owner_id ↔ groups.owner_id).

/** 빠른정산 수정. createQuickSettle과 같은 분담 계산 + update_quick_settle 호출. */
export async function updateQuickSettle(
  input: UpdateQuickSettleInput,
  ownerId: string,
): Promise<{ slug: string }> {
  const supa = getAdminClient()
  const sharesArr = quickSharesArray(input)

  const { error } = await supa.rpc('update_quick_settle', {
    p_slug: input.slug,
    p_owner_id: ownerId,
    p_name: input.name?.trim() || '빠른정산',
    p_member_names: input.members,
    p_amount: input.amount,
    p_paid_by_index: input.payerIndex,
    p_shares: sharesArr,
    p_description: input.description ?? '',
    p_acct_bank: input.account?.bankName,
    p_acct_no: input.account?.accountNo,
    p_acct_holder: input.account?.accountHolder,
  })
  if (error) throw new Error(`정산 수정 실패: ${error.message}`)
  const leftover = input.winnerIndex !== undefined ? 0 : roundingLeftover(input.amount, input.members.length, input.unit)
  await setGroupMeta(input.slug, { eventDate: input.eventDate, leftover, absorberIndex: input.absorberIndex })
  return { slug: input.slug }
}

/** 항목별 정산 수정. addItemizedBill과 같은 항목별 분담 계산 + update_itemized_bill 호출. */
export async function updateItemizedBill(
  input: UpdateItemizedBillInput,
  ownerId: string,
): Promise<{ slug: string }> {
  const supa = getAdminClient()
  const memberCount = input.members.length

  const items = buildItemizedRpcItems(input, memberCount)
  const name =
    input.name?.trim() ||
    input.rounds[0]?.items.find((it) => it.description?.trim())?.description?.trim() ||
    '항목별 정산'

  const { error } = await supa.rpc('update_itemized_bill', {
    p_slug: input.slug,
    p_owner_id: ownerId,
    p_name: name,
    p_member_names: input.members,
    p_items: items,
    p_acct_bank: input.account?.bankName,
    p_acct_no: input.account?.accountNo,
    p_acct_holder: input.account?.accountHolder,
  })
  if (error) throw new Error(`정산 수정 실패: ${error.message}`)
  await setGroupMeta(input.slug, {
    eventDate: input.eventDate,
    leftover: itemizedLeftover(input.rounds, input.unit),
    absorberIndex: input.absorberIndex,
  })
  return { slug: input.slug }
}

/** 정산 삭제(내역). 본인(owner_id) 것만. 자식은 FK cascade로 정리(0001). count=0이면 남의 것/없음. */
export async function deleteGroup(ownerId: string, slug: string): Promise<{ ok: boolean }> {
  const supa = getAdminClient()
  const { error, count } = await supa
    .from('groups')
    .delete({ count: 'exact' })
    .eq('slug', slug)
    .eq('owner_id', ownerId)
  if (error) throw new Error(error.message)
  return { ok: (count ?? 0) > 0 }
}

/** 정산 이름 변경(내역). 본인 것만(owner_id 스코프). 비파괴 — name만 갱신, 자식·신원 불변. */
export async function renameGroup(ownerId: string, slug: string, name: string): Promise<{ ok: boolean }> {
  const supa = getAdminClient()
  const { error, count } = await supa
    .from('groups')
    .update({ name }, { count: 'exact' })
    .eq('slug', slug)
    .eq('owner_id', ownerId)
  if (error) throw new Error(error.message)
  return { ok: (count ?? 0) > 0 }
}

/** 정산 보관 토글(kind). 'group'=지속(보관) | 'quick'=임시. 본인 것만. count=0이면 남의 것/없음. */
export async function setGroupKept(ownerId: string, slug: string, kept: boolean): Promise<{ ok: boolean }> {
  const supa = getAdminClient()
  const { error, count } = await supa
    .from('groups')
    .update({ kind: kept ? 'group' : 'quick' }, { count: 'exact' })
    .eq('slug', slug)
    .eq('owner_id', ownerId)
  if (error) throw new Error(error.message)
  return { ok: (count ?? 0) > 0 }
}

/** 그룹 전체 스냅샷(멤버/지출+분담/정산)을 도메인 형태로 매핑. 읽기 전용. */
export async function getGroupBySlug(slug: string): Promise<GroupSnapshot | null> {
  const supa = getAdminClient()

  const { data: group, error: gErr } = await supa
    .from('groups')
    .select('id, slug, name, kind, created_at, owner_id, event_date, leftover_amount, absorber_index')
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
    supa
      .from('expenses')
      .select('id, amount, paid_by, description, bill_id, split_type, created_at, quantity')
      .eq('group_id', group.id)
      .order('created_at'),
    supa.from('settlements').select('id, from_member, to_member, amount').eq('group_id', group.id),
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

  // 상세보기(표시 전용): 항목별이면 (bill_id, paid_by)로 차수 묶음 — getEditableGroup과 동일 그룹핑·순서.
  const isItemized = expenses.some((e) => e.split_type === 'weighted')
  const snapshotRounds: SnapshotRound[] = []
  if (isItemized) {
    const byKey = new Map<string, SnapshotRound>()
    const order: string[] = []
    for (const e of expenses) {
      const key = `${e.bill_id ?? ''}|${e.paid_by}`
      let round = byKey.get(key)
      if (!round) {
        round = { payer: e.paid_by, items: [] }
        byKey.set(key, round)
        order.push(key)
      }
      round.items.push({
        description: e.description === '항목' ? '' : (e.description ?? ''),
        amount: e.amount,
        quantity: e.quantity ?? 1,
        participants: (sharesByExpense.get(e.id) ?? []).map((s) => ({ id: s.memberId, amount: s.amount })),
      })
    }
    for (const k of order) snapshotRounds.push(byKey.get(k)!)
  }

  const settledRows = settlementsRes.data ?? []
  const settlementRecords: SettlementRecord[] = settledRows.map((s) => ({
    from: s.from_member,
    to: s.to_member,
    amount: s.amount,
  }))
  const settledTransfers: SettledTransfer[] = settledRows.map((s) => ({
    id: s.id,
    from: s.from_member,
    to: s.to_member,
    amount: s.amount,
  }))

  const memberRows = membersRes.data ?? []
  // 단위 맞춤 '남은 금액' 흡수자. 금액 = 저장된 leftover_amount(폼의 '남은 N원'), 사람 = 분담에서 역산(topAbsorber).
  // 저장한 absorber_index는 안 쓴다 — 멤버를 한 트랜잭션에서 만들어 created_at이 동일 → 읽기 순서가 불안정해
  // positional index가 엉뚱한 멤버를 가리킬 수 있다(중복 표시 이름이면 더). 분담 기반이라 순서·동명에 안 흔들림.
  const absorberId = group.leftover_amount > 0 ? (topAbsorber(expenseRecords)?.memberId ?? null) : null
  const absorber = absorberId ? { memberId: absorberId, extra: group.leftover_amount } : null

  return {
    group: {
      id: group.id,
      slug: group.slug,
      name: group.name,
      kind: group.kind,
      createdAt: group.created_at,
      ownerId: group.owner_id,
      eventDate: group.event_date,
    },
    members: memberRows.map((m) => ({
      id: m.id,
      name: m.name,
      bankName: m.bank_name,
      accountNo: m.account_no,
      accountHolder: m.account_holder,
    })),
    expenses: expenseRecords,
    settlements: settlementRecords,
    settledTransfers,
    isItemized,
    rounds: snapshotRounds,
    absorber,
  }
}

// ── 수정 폼 프리필(내역에서 '수정') ────────────────────────────────
// 정규화된 DB 행을 만들기 폼 모양으로 되살린다. 모드=split_type('weighted'=항목별), 계좌=멤버0.
// unit/absorber는 저장 안 됨(계산된 분담만 있음) → 폼은 '안 함'으로 시작, 사용자가 다시 고름(ADR-022).

/** 항목별 수정 시 항목(메뉴) 1개(이름·금액·참여자 플래그, members 길이). */
export interface EditableItem {
  name: string
  amount: number
  among: boolean[]
  qty?: number // 라인 수량(>1이면). 수정 폼이 단가×수량으로 복원.
}

/** 항목별 수정 시 차수(자리) 1개 — 낸 사람 + 그 안의 항목(메뉴)들. */
export interface EditableRound {
  payer: number // 이 차수 낸 사람의 멤버 인덱스
  items: EditableItem[]
}

/** 수정 폼이 그대로 채울 수 있는 평범한 형태. ownerId로 라우트가 소유자 게이트. */
export interface EditableGroup {
  slug: string
  ownerId: string | null
  name: string
  eventDate: string | null
  mode: 'quick' | 'items'
  members: string[]
  payerIndex: number // quick 낸 사람
  amount: number // quick=단일 지출 금액. items=0(차수로 표현).
  winnerIndex: number | null // '한 명이 다 쏘기'면 그 사람(분담을 혼자 전액). 아니면 null.
  rounds: EditableRound[] // items 모드의 차수 묶음
  account: { bankName: string; accountNo: string; accountHolder: string } | null
  hasSettlements: boolean // '보냈어요' 기록 존재 → 수정 시 초기화 경고.
}

/** 한 그룹을 수정 폼 모양으로 읽음(읽기 전용). 소유자 검증은 호출 라우트가 ownerId로. */
export async function getEditableGroup(slug: string): Promise<EditableGroup | null> {
  const supa = getAdminClient()
  const { data: group, error: gErr } = await supa
    .from('groups')
    .select('id, slug, name, owner_id, event_date')
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
    supa
      .from('expenses')
      .select('id, description, amount, paid_by, split_type, bill_id, quantity')
      .eq('group_id', group.id)
      .order('created_at'),
    supa.from('settlements').select('id').eq('group_id', group.id).limit(1),
  ])
  const members = membersRes.data ?? []
  const expenses = expensesRes.data ?? []
  const memberIds = members.map((m) => m.id)

  // 지출별 참여 멤버(분담 행이 있는 멤버) 집합 — 항목별 among 복원용.
  const expenseIds = expenses.map((e) => e.id)
  const sharesRes = expenseIds.length
    ? await supa.from('expense_shares').select('expense_id, member_id, amount').in('expense_id', expenseIds)
    : { data: [] as { expense_id: string; member_id: string; amount: number }[] }
  const partsByExpense = new Map<string, Set<string>>()
  for (const s of sharesRes.data ?? []) {
    const set = partsByExpense.get(s.expense_id) ?? new Set<string>()
    set.add(s.member_id)
    partsByExpense.set(s.expense_id, set)
  }

  const isItemized = expenses.some((e) => e.split_type === 'weighted')
  const payerIndex = expenses.length ? Math.max(0, memberIds.indexOf(expenses[0].paid_by)) : 0

  let amount = 0
  let winnerIndex: number | null = null
  let rounds: EditableRound[] = []
  if (isItemized) {
    // 차수 재구성: (bill_id, paid_by)로 묶음(같은 자리 = 같은 bill_id + 같은 결제자). 첫 등장 순서 유지.
    // (옛 데이터: 한 bill_id에 결제자 섞여 있어도 결제자별로 갈라져 안전.)
    const byKey = new Map<string, EditableRound>()
    const order: string[] = []
    for (const e of expenses) {
      const key = `${e.bill_id ?? ''}|${e.paid_by}`
      let round = byKey.get(key)
      if (!round) {
        round = { payer: Math.max(0, memberIds.indexOf(e.paid_by)), items: [] }
        byKey.set(key, round)
        order.push(key)
      }
      const set = partsByExpense.get(e.id) ?? new Set<string>()
      round.items.push({
        // RPC가 빈 설명을 '항목'으로 저장 → 폼엔 빈칸으로(placeholder 표시).
        name: e.description === '항목' ? '' : e.description,
        amount: e.amount,
        among: memberIds.map((id) => set.has(id)),
        qty: (e.quantity ?? 1) > 1 ? e.quantity : undefined,
      })
    }
    rounds = order.map((k) => byKey.get(k)!)
  } else {
    amount = expenses.length ? expenses[0].amount : 0
    // 쏘기 감지: 분담이 한 명에게만 전액(나머지 0)이면 그 사람이 '다 쏜' 것 → winnerIndex 복원
    // (안 그러면 수정 시 1/N으로 변질). 비참여 멤버도 0 분담 행이 저장돼 금액으로 판정.
    // 휴리스틱 안전성: 단위 반올림된 극소액 1/N(amount < 인원·단위, 예: 3,000원 미만 천원단위)도
    //   '한 명만 전액'으로 보일 수 있으나, 그 한 명=흡수자라 쏘기로 복원→재저장해도 분담이 동일(무해).
    //   완전 구별은 플래그 저장(스키마 변경)이 필요해 V0에선 이 무해 휴리스틱 채택('winner!=payer' 가드는
    //   오히려 진짜 자기-쏘기를 1/N으로 변질시켜 역효과 — 적용 안 함).
    if (expenses.length) {
      const nz = (sharesRes.data ?? []).filter((s) => s.expense_id === expenses[0].id && s.amount > 0)
      if (nz.length === 1 && nz[0].amount === amount) {
        winnerIndex = Math.max(0, memberIds.indexOf(nz[0].member_id))
      }
    }
  }

  // 계좌는 항상 멤버 0(나). 세 필드 다 있을 때만.
  const m0 = members[0]
  const account =
    m0 && m0.bank_name && m0.account_no && m0.account_holder
      ? { bankName: m0.bank_name, accountNo: m0.account_no, accountHolder: m0.account_holder }
      : null

  return {
    slug: group.slug,
    ownerId: group.owner_id,
    name: group.name,
    eventDate: group.event_date,
    mode: isItemized ? 'items' : 'quick',
    members: members.map((m) => m.name),
    payerIndex,
    amount,
    winnerIndex,
    rounds,
    account,
    hasSettlements: (settlementsRes.data ?? []).length > 0,
  }
}

// ── 송금완료 기록/취소(공유 정산 페이지, 무로그인 공개 write) ──────────
// settlements는 이미 netBalances에 반영됨(낸 빚↓). 표시되는 남은 송금은 minimizeCashFlow가 자동 차감.
// 따라서 여기선 '한 번에 한 송금'만 안전하게 insert/delete 하면 됨(도메인 재계산은 페이지가 함).

/**
 * 송금완료 1건 기록. slug→group, from/to가 그 그룹 멤버인지 + net 가드(과다기록·역방향 방지) 후 insert.
 * net 가드: from이 아직 ≥amount 빚이 있고 to가 아직 ≥amount 받을 게 있어야 함 → 중복/이중 표시(여러 명이
 * 같은 송금을 눌러도) 가 net을 음수로 뒤집어 '역방향 송금'을 만드는 걸 차단. 정산 끝났으면 거부.
 */
export async function recordSettlement(
  slug: string,
  fromId: string,
  toId: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; reason: 'notfound' | 'member' | 'settled' | 'amount' }> {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'amount' }
  if (fromId === toId) return { ok: false, reason: 'member' }

  const snap = await getGroupBySlug(slug)
  if (!snap) return { ok: false, reason: 'notfound' }
  const ids = new Set(snap.members.map((m) => m.id))
  if (!ids.has(fromId) || !ids.has(toId)) return { ok: false, reason: 'member' }

  const net = netBalances(
    snap.members.map((m) => m.id),
    snap.expenses,
    snap.settlements,
  )
  const fromOwes = -(net.get(fromId) ?? 0) // 양수면 아직 낼 빚
  const toOwed = net.get(toId) ?? 0 // 양수면 아직 받을 채권
  if (fromOwes < amount || toOwed < amount) return { ok: false, reason: 'settled' }

  const supa = getAdminClient()
  const { error } = await supa.from('settlements').insert({
    group_id: snap.group.id,
    from_member: fromId,
    to_member: toId,
    amount,
  })
  // 동시 클릭(TOCTOU): net 가드를 둘 다 통과해도 유니크 인덱스(0012 settlements_dedup_uniq)가
  // 두 번째 insert를 거부(23505) → 중복기록 대신 '이미 정산됐어요'로 수렴.
  if (error) {
    if (error.code === '23505') return { ok: false, reason: 'settled' }
    throw new Error(error.message)
  }
  return { ok: true }
}

/** 송금완료 취소. 그 그룹(slug)에 속한 settlement만 삭제(다른 그룹 id로는 못 지움). */
export async function undoSettlement(slug: string, settlementId: string): Promise<{ ok: boolean }> {
  const supa = getAdminClient()
  const { data: group, error: gErr } = await supa
    .from('groups')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (gErr) throw new Error(gErr.message)
  if (!group) return { ok: false }

  const { error, count } = await supa
    .from('settlements')
    .delete({ count: 'exact' })
    .eq('id', settlementId)
    .eq('group_id', group.id)
  if (error) throw new Error(error.message)
  return { ok: (count ?? 0) > 0 }
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
  doneTransfers: number // 완료된 송금(보냈어요) 수
  totalTransfers: number // 전체 송금 수(완료 + 남음). 0이면 정산할 게 없음(딱 맞음/1명).
}

/**
 * 로그인 사용자가 만든 정산 목록(최신순). 내역탭(Server Component)이 직접 호출하는 읽기.
 * owner_id 없는(무로그인 생성) 정산은 제외. N+1 없이 5쿼리(그룹 + 멤버/지출/분담/정산 IN 한 번씩)로
 * 집계 + 그룹별 정산 진행도(도메인 netBalances→minimizeCashFlow로 남은 송금 + 보냈어요 수).
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
  const [membersRes, expensesRes, settlementsRes] = await Promise.all([
    supa.from('members').select('id, group_id').in('group_id', ids),
    supa.from('expenses').select('id, group_id, amount, paid_by').in('group_id', ids),
    supa.from('settlements').select('group_id, from_member, to_member, amount').in('group_id', ids),
  ])
  if (membersRes.error) throw new Error(membersRes.error.message)
  if (expensesRes.error) throw new Error(expensesRes.error.message)
  if (settlementsRes.error) throw new Error(settlementsRes.error.message)

  const expenseRows = expensesRes.data ?? []
  const expenseIds = expenseRows.map((e) => e.id)
  const sharesRes = expenseIds.length
    ? await supa.from('expense_shares').select('expense_id, member_id, amount').in('expense_id', expenseIds)
    : { data: [], error: null }
  if (sharesRes.error) throw new Error(sharesRes.error.message)

  // 그룹별로 묶기(진행도 계산용).
  const membersByGroup = new Map<string, string[]>()
  for (const m of membersRes.data ?? []) {
    const arr = membersByGroup.get(m.group_id) ?? []
    arr.push(m.id)
    membersByGroup.set(m.group_id, arr)
  }
  const sharesByExpense = new Map<string, { memberId: string; amount: number }[]>()
  for (const s of sharesRes.data ?? []) {
    const arr = sharesByExpense.get(s.expense_id) ?? []
    arr.push({ memberId: s.member_id, amount: s.amount })
    sharesByExpense.set(s.expense_id, arr)
  }
  const expensesByGroup = new Map<string, ExpenseRecord[]>()
  const totalByGroup = new Map<string, number>()
  for (const e of expenseRows) {
    totalByGroup.set(e.group_id, (totalByGroup.get(e.group_id) ?? 0) + e.amount)
    const arr = expensesByGroup.get(e.group_id) ?? []
    arr.push({ amount: e.amount, paidBy: e.paid_by, shares: sharesByExpense.get(e.id) ?? [] })
    expensesByGroup.set(e.group_id, arr)
  }
  const settlementsByGroup = new Map<string, SettlementRecord[]>()
  for (const s of settlementsRes.data ?? []) {
    const arr = settlementsByGroup.get(s.group_id) ?? []
    arr.push({ from: s.from_member, to: s.to_member, amount: s.amount })
    settlementsByGroup.set(s.group_id, arr)
  }

  return groups.map((g) => {
    const memberIds = membersByGroup.get(g.id) ?? []
    const settlementRecords = settlementsByGroup.get(g.id) ?? []
    // 진행도: 남은 송금(minimizeCashFlow) + 완료(보냈어요) = 전체. 데이터 불일치 시 생략(0)으로 안전.
    let doneTransfers = 0
    let totalTransfers = 0
    try {
      const pending = minimizeCashFlow(
        netBalances(memberIds, expensesByGroup.get(g.id) ?? [], settlementRecords),
      ).length
      doneTransfers = settlementRecords.length
      totalTransfers = doneTransfers + pending
    } catch {
      doneTransfers = 0
      totalTransfers = 0
    }
    return {
      slug: g.slug,
      name: g.name,
      kind: g.kind,
      createdAt: g.created_at,
      memberCount: memberIds.length,
      total: totalByGroup.get(g.id) ?? 0,
      doneTransfers,
      totalTransfers,
    }
  })
}

/**
 * 로그인 사용자가 과거 정산에서 쓴 참여자 이름(최근순, 중복·'나'·빈 이름 제외). 참여자 빠른 추가용.
 * 내 그룹(owner_id) 최신순으로 멤버를 모아 dedupe. N+1 없이 2쿼리.
 */
export async function listRecentMemberNames(ownerId: string): Promise<string[]> {
  const supa = getAdminClient()
  const { data: groups, error: gErr } = await supa
    .from('groups')
    .select('id')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(40)
  if (gErr) throw new Error(gErr.message)
  const ids = (groups ?? []).map((g) => g.id)
  if (ids.length === 0) return []

  const { data: members, error: mErr } = await supa
    .from('members')
    .select('name, group_id')
    .in('group_id', ids)
  if (mErr) throw new Error(mErr.message)

  // 그룹 최신순 랭크로 정렬 후 dedupe('나'·빈 이름 제외).
  const rank = new Map(ids.map((id, i) => [id, i]))
  const sorted = (members ?? [])
    .map((m) => ({ name: m.name.trim(), r: rank.get(m.group_id) ?? Infinity }))
    .filter((m) => m.name && m.name !== '나')
    .sort((a, b) => a.r - b.r)

  const seen = new Set<string>()
  const names: string[] = []
  for (const m of sorted) {
    if (seen.has(m.name)) continue
    seen.add(m.name)
    names.push(m.name)
    if (names.length >= 12) break
  }
  return names
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

// ── 내 모임(저장 멤버 그룹) ───────────────────────────────────────────
// 전부 user_id로 스코프 → 남의 모임을 못 건드림(service_role여도 방어). 단순 CRUD라 RPC 불필요.

/** 저장된 멤버 그룹(브라우저에 그대로 전달 가능한 평범한 형태). */
export interface MemberGroup {
  id: string
  label: string
  names: string[]
}

function mapMemberGroup(r: { id: string; label: string; names: string[] | null }): MemberGroup {
  return { id: r.id, label: r.label, names: r.names ?? [] }
}

/** 사용자의 모임 목록(만든 순 — 오래된 것 먼저). */
export async function listMemberGroups(userId: string): Promise<MemberGroup[]> {
  const supa = getAdminClient()
  const { data, error } = await supa
    .from('member_groups')
    .select('id, label, names')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapMemberGroup)
}

/** 모임 추가. */
export async function createMemberGroup(userId: string, input: MemberGroupFields): Promise<void> {
  const supa = getAdminClient()
  const { error } = await supa
    .from('member_groups')
    .insert({ user_id: userId, label: input.label, names: input.names })
  if (error) throw new Error(error.message)
}

/** 모임 수정(본인 것만). user_id 스코프라 남의 것엔 0행 영향. */
export async function updateMemberGroup(userId: string, input: UpdateMemberGroupInput): Promise<void> {
  const supa = getAdminClient()
  const { error } = await supa
    .from('member_groups')
    .update({ label: input.label, names: input.names })
    .eq('user_id', userId)
    .eq('id', input.id)
  if (error) throw new Error(error.message)
}

/** 모임 삭제(본인 것만). */
export async function deleteMemberGroup(userId: string, id: string): Promise<void> {
  const supa = getAdminClient()
  const { error } = await supa
    .from('member_groups')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ── 계정 삭제(개인정보 파기) ───────────────────────────────────────────
// auth 유저를 지우면 FK 규칙으로: user_accounts·member_groups = on delete cascade(함께 삭제),
// groups.owner_id = on delete set null(공유 정산은 남되 신원 분리 — 링크 가진 친구는 계속 봄).
// 따라서 개인정보(이메일·이름·프로필·저장계좌·내 모임)만 제거된다. 정산 자체 삭제는 내역 탭에서 건별로.
// admin.deleteUser는 본인 id로만 호출(액션이 세션 user.id 전달) → 남의 계정 삭제 불가.
export async function deleteMyAccount(userId: string): Promise<{ ok: boolean }> {
  const supa = getAdminClient()
  const { error } = await supa.auth.admin.deleteUser(userId)
  return { ok: !error }
}
