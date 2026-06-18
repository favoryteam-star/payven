import 'server-only'
import { nanoid } from 'nanoid'
import { getAdminClient } from './db'
import { equalSplit } from '@/domain/settle'
import type { ExpenseRecord, SettlementRecord } from '@/domain/types'
import type { QuickSettleInput } from './validation'

export interface SnapshotMember {
  id: string
  name: string
  bankName: string | null
  accountNo: string | null
}

export interface GroupSnapshot {
  group: { id: string; slug: string; name: string; kind: string }
  members: SnapshotMember[]
  expenses: ExpenseRecord[]
  settlements: SettlementRecord[]
}

/** 빠른정산: 임시그룹+멤버+지출+분담을 RPC로 원자적 생성. 분담은 도메인에서 계산. */
export async function createQuickSettle(input: QuickSettleInput): Promise<{ slug: string }> {
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
  })
  if (error) throw new Error(`빠른정산 생성 실패: ${error.message}`)
  return { slug }
}

/** 그룹 전체 스냅샷(멤버/지출+분담/정산)을 도메인 형태로 매핑. 읽기 전용. */
export async function getGroupBySlug(slug: string): Promise<GroupSnapshot | null> {
  const supa = getAdminClient()

  const { data: group, error: gErr } = await supa
    .from('groups')
    .select('id, slug, name, kind')
    .eq('slug', slug)
    .maybeSingle()
  if (gErr) throw new Error(gErr.message)
  if (!group) return null

  const [membersRes, expensesRes, settlementsRes] = await Promise.all([
    supa.from('members').select('id, name, bank_name, account_no').eq('group_id', group.id).order('created_at'),
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
    group,
    members: (membersRes.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      bankName: m.bank_name,
      accountNo: m.account_no,
    })),
    expenses: expenseRecords,
    settlements: settlementRecords,
  }
}
