import { assertWon } from './money'
import type {
  ExpenseRecord,
  MemberId,
  SettlementRecord,
  Share,
  Transfer,
} from './types'

/**
 * 균등 분할 (largest-remainder).
 * 각자 floor(amount/k), 나머지(amount mod k)원을 1원씩 분배해 합이 정확히 amount가 되게 한다.
 * tie-break: 낸 사람(paidBy)이 참여자면 먼저 흡수 → 그다음 멤버 id 오름차순. 결정적.
 * 예) 10,000 ÷ 3 → 3,334 / 3,333 / 3,333
 */
export function equalSplit(
  amount: number,
  participants: MemberId[],
  paidBy?: MemberId,
): Share[] {
  assertWon(amount)
  if (amount < 0) throw new Error(`금액은 음수가 될 수 없습니다: ${amount}`)
  const k = participants.length
  if (k === 0) throw new Error('참여자가 최소 1명 필요합니다')
  // 한 멤버가 두 개의 분담을 갖는 건 유효한 도메인 결과가 아니다 → fail-fast.
  // (M1: addExpenseSchema에도 .refine(uniqueness)를 둘 것.)
  if (new Set(participants).size !== k) {
    throw new Error('참여자 id가 중복되었습니다')
  }

  const base = Math.floor(amount / k)
  const remainder = amount - base * k // 0 .. k-1
  const shares: Share[] = participants.map((memberId) => ({ memberId, amount: base }))

  if (remainder > 0) {
    const order = remainderOrder(participants, paidBy)
    const byId = new Map(shares.map((s) => [s.memberId, s]))
    for (let i = 0; i < remainder; i++) {
      byId.get(order[i])!.amount += 1
    }
  }
  return shares
}

function remainderOrder(participants: MemberId[], paidBy?: MemberId): MemberId[] {
  const sorted = [...participants].sort(compareId)
  if (paidBy && participants.includes(paidBy)) {
    return [paidBy, ...sorted.filter((id) => id !== paidBy)]
  }
  return sorted
}

function compareId(a: MemberId, b: MemberId): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * 순잔액. net > 0 = 받을 사람(채권자), net < 0 = 낼 사람(채무자), 전체 합 = 0.
 */
export function netBalances(
  memberIds: MemberId[],
  expenses: ExpenseRecord[],
  settlements: SettlementRecord[] = [],
): Map<MemberId, number> {
  const net = new Map<MemberId, number>()
  for (const id of memberIds) net.set(id, 0)

  const add = (id: MemberId, delta: number) => net.set(id, (net.get(id) ?? 0) + delta)

  // 돈이 도메인에 들어오는 경계 → 정수 검증(특히 V1 custom 분할은 사용자 입력이 직접 share가 됨).
  for (const e of expenses) {
    assertWon(e.amount)
    add(e.paidBy, e.amount)
    for (const s of e.shares) {
      assertWon(s.amount)
      add(s.memberId, -s.amount)
    }
  }
  for (const st of settlements) {
    assertWon(st.amount)
    add(st.from, st.amount) // 갚았으니 빚↓ (net이 0 방향으로 증가)
    add(st.to, -st.amount) // 받았으니 채권↓
  }
  return net
}

/**
 * 최소 송금 (그리디: 가장 큰 채권자 ↔ 가장 큰 채무자 반복 상계).
 * 최소 거래 횟수를 "보장"하진 않지만(NP-hard) 거래 수 ≤ m−1을 보장한다(m = 잔액 0 아닌 인원).
 */
export function minimizeCashFlow(
  net: Map<MemberId, number> | Record<MemberId, number>,
): Transfer[] {
  const entries = net instanceof Map ? [...net.entries()] : Object.entries(net)

  let sum = 0
  for (const [, v] of entries) {
    assertWon(v)
    sum += v
  }
  if (sum !== 0) throw new Error(`net 합이 0이 아닙니다: ${sum}`)

  const creditors = entries.filter(([, v]) => v > 0).map(([id, v]) => ({ id, amt: v }))
  const debtors = entries.filter(([, v]) => v < 0).map(([id, v]) => ({ id, amt: -v }))

  const cmp = (
    a: { id: MemberId; amt: number },
    b: { id: MemberId; amt: number },
  ) => b.amt - a.amt || compareId(a.id, b.id)

  const transfers: Transfer[] = []
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(cmp)
    debtors.sort(cmp)
    const c = creditors[0]
    const d = debtors[0]
    const t = Math.min(c.amt, d.amt)
    transfers.push({ from: d.id, to: c.id, amount: t })
    c.amt -= t
    d.amt -= t
    if (c.amt === 0) creditors.shift()
    if (d.amt === 0) debtors.shift()
  }
  return transfers
}
