import { assertWon } from './money'
import type {
  ExpenseRecord,
  MemberId,
  SettlementRecord,
  Share,
  Transfer,
  Weight,
} from './types'

/**
 * 가중 분할 (largest-remainder / Hamilton).
 * 각자 floor(amount·weight/W), 남는 단위는 정수 나머지 numerator(= amount·weight mod W)가 큰 순으로 1원씩.
 * tie-break(나머지 동률): 낸 사람(paidBy)이 참여자면 먼저 → 멤버 id 오름차순. 결정적, 정수만(부동소수점 0).
 * weight가 전부 1이면 균등(= equalSplit). 예) 10,000 ÷ 3 → 3,334 / 3,333 / 3,333
 */
export function splitByWeights(
  amount: number,
  weights: Weight[],
  paidBy?: MemberId,
): Share[] {
  assertWon(amount)
  if (amount < 0) throw new Error(`금액은 음수가 될 수 없습니다: ${amount}`)
  const k = weights.length
  if (k === 0) throw new Error('참여자가 최소 1명 필요합니다')
  // 한 멤버가 두 개의 분담을 갖는 건 유효한 도메인 결과가 아니다 → fail-fast.
  if (new Set(weights.map((w) => w.memberId)).size !== k) {
    throw new Error('참여자 id가 중복되었습니다')
  }
  for (const w of weights) {
    if (!Number.isInteger(w.weight) || w.weight < 1) {
      throw new Error(`가중치는 1 이상의 정수여야 합니다: ${w.weight}`)
    }
  }

  const totalWeight = weights.reduce((s, w) => s + w.weight, 0)
  // 정수 몫·나머지만으로 비교(부동소수점 금지). 같은 분모 W에서 분수부 비교 = rem 비교.
  const rows = weights.map((w) => {
    const product = amount * w.weight
    return { memberId: w.memberId, base: Math.floor(product / totalWeight), rem: product % totalWeight }
  })
  const shares: Share[] = rows.map((r) => ({ memberId: r.memberId, amount: r.base }))

  let leftover = amount - shares.reduce((s, x) => s + x.amount, 0) // 0 .. k-1 단위
  if (leftover > 0) {
    const order = [...rows].sort((a, b) => {
      if (b.rem !== a.rem) return b.rem - a.rem // 분수부 큰 순
      const aPaid = a.memberId === paidBy ? 0 : 1
      const bPaid = b.memberId === paidBy ? 0 : 1
      if (aPaid !== bPaid) return aPaid - bPaid // 낸 사람 먼저
      return compareId(a.memberId, b.memberId) // 그다음 id 오름차순
    })
    const byId = new Map(shares.map((s) => [s.memberId, s]))
    for (let i = 0; leftover > 0; i++, leftover--) {
      byId.get(order[i].memberId)!.amount += 1
    }
  }
  return shares
}

/**
 * 균등 분할 = 모든 weight가 1인 splitByWeights. 반올림 규칙 단일 출처.
 * 예) 10,000 ÷ 3 → 3,334 / 3,333 / 3,333 (낸 사람이 나머지 우선 흡수)
 */
export function equalSplit(
  amount: number,
  participants: MemberId[],
  paidBy?: MemberId,
): Share[] {
  return splitByWeights(
    amount,
    participants.map((memberId) => ({ memberId, weight: 1 })),
    paidBy,
  )
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
