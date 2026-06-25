import { assertWon } from './money'
import type {
  ExpenseRecord,
  MemberId,
  SettlementRecord,
  Share,
  SplitOptions,
  Transfer,
  Weight,
} from './types'

// 3번째 인자는 과거 호환을 위해 paidBy 문자열 또는 SplitOptions 둘 다 받는다.
type SplitArg = MemberId | SplitOptions
function toOptions(arg?: SplitArg): SplitOptions {
  return typeof arg === 'string' ? { paidBy: arg } : (arg ?? {})
}

/**
 * 가중 분할 (largest-remainder / Hamilton), 단위·흡수자 옵션 지원.
 * 각자 base = unit의 배수로 내림(amount·weight/(W·unit) 내림 × unit). 남는 금액(leftover)은:
 *  - absorber가 지정되고 참여자면 → 그 한 명이 전부 흡수(나머지는 전부 unit 배수 = '깔끔한 금액').
 *  - 아니면 자동: unit 청크를 분수부(rem) 큰 순으로 1개씩(tie: 낸 사람 먼저 → id 오름차순),
 *    총액이 unit로 안 떨어져 남는 sub-unit(< unit)은 최우선자에게.
 * 결정적, 정수만(부동소수점 0). unit=1·absorber 없음이면 기존 largest-remainder와 동일.
 * 예) 10,000 ÷ 3: unit 1 → 3,334/3,333/3,333 · unit 100 → 3,400/3,300/3,300(낸 사람 흡수)
 */
export function splitByWeights(
  amount: number,
  weights: Weight[],
  arg?: SplitArg,
): Share[] {
  const opts = toOptions(arg)
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
  const unit = opts.unit ?? 1
  if (!Number.isInteger(unit) || unit < 1) {
    throw new Error(`단위는 1 이상의 정수여야 합니다: ${unit}`)
  }

  const totalWeight = weights.reduce((s, w) => s + w.weight, 0)
  // 정수 몫·나머지만으로 비교(부동소수점 금지). 분모 = W·unit, base = unit의 배수로 내림.
  const denom = totalWeight * unit
  const rows = weights.map((w) => {
    const product = amount * w.weight
    const rem = product % denom // 다음 unit까지의 분수부(분모 동일하므로 rem만 비교)
    return { memberId: w.memberId, base: (product - rem) / totalWeight, rem } // base = floor(product/denom)*unit
  })
  const shares: Share[] = rows.map((r) => ({ memberId: r.memberId, amount: r.base }))

  let leftover = amount - shares.reduce((s, x) => s + x.amount, 0) // 0 .. < k·unit
  if (leftover <= 0) return shares

  const byId = new Map(shares.map((s) => [s.memberId, s]))

  // absorber 지정(+ 참여자) → 전부 흡수. 나머지는 모두 unit 배수로 깔끔.
  if (opts.absorber !== undefined && byId.has(opts.absorber)) {
    byId.get(opts.absorber)!.amount += leftover
    return shares
  }

  // 자동: unit 청크를 분수부 큰 순으로 분배. tie-break = 낸 사람 먼저 → id 오름차순.
  const order = [...rows].sort((a, b) => {
    if (b.rem !== a.rem) return b.rem - a.rem
    const aPaid = a.memberId === opts.paidBy ? 0 : 1
    const bPaid = b.memberId === opts.paidBy ? 0 : 1
    if (aPaid !== bPaid) return aPaid - bPaid
    return compareId(a.memberId, b.memberId)
  })
  for (let i = 0; leftover >= unit; i++, leftover -= unit) {
    byId.get(order[i].memberId)!.amount += unit
  }
  // 총액이 unit로 안 떨어질 때 남는 sub-unit(< unit) → 최우선자(없으면 첫 참여자)
  if (leftover > 0) byId.get(order[0].memberId)!.amount += leftover
  return shares
}

/**
 * 균등 분할 = 모든 weight가 1인 splitByWeights. 반올림 규칙 단일 출처.
 * 예) 10,000 ÷ 3 → 3,334 / 3,333 / 3,333 (낸 사람이 나머지 우선 흡수)
 */
export function equalSplit(
  amount: number,
  participants: MemberId[],
  arg?: SplitArg,
): Share[] {
  return splitByWeights(
    amount,
    participants.map((memberId) => ({ memberId, weight: 1 })),
    arg,
  )
}

function compareId(a: MemberId, b: MemberId): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * 단위 내림으로 생기는 '남는 금액'(흡수자가 떠안는 양) — 균등(weight 1) 한 항목 기준. 폼·서버 공용(표시·저장 단일 출처).
 * base = floor(amount/(n·unit))·unit, leftover = amount − base·n. unit=1이면 amount mod n(1~2원).
 * 흡수자 칩의 "남은 N원"·공유 상세 안내가 모두 이 값을 쓴다. 항목별은 항목마다 구해 합산.
 */
export function roundingLeftover(amount: number, n: number, unit = 1): number {
  if (n < 1 || amount <= 0 || unit < 1) return 0
  const base = Math.floor(amount / (n * unit)) * unit
  return amount - base * n
}

/**
 * 표시 전용: 저장된 분담을 '단위 없는 자연 균등분할'과 비교해, 멤버별 (실제 − 공정몫) 차액. 양수 = 잔돈을 더 떠안음.
 * 흡수자가 '누구인지'를 멤버 정렬이 아니라 분담(멤버 id)에서 역산하기 위함 — 트랜잭션 동시생성이라 멤버 created_at이
 * 동일해 읽기 순서(positional index)는 불안정하다. 분담 기반이라 순서·중복 이름에 흔들리지 않는다.
 */
export function roundingExtras(expenses: ExpenseRecord[]): Map<MemberId, number> {
  const extra = new Map<MemberId, number>()
  for (const e of expenses) {
    const parts = e.shares
    if (parts.length < 2) continue
    const natural = splitByWeights(
      e.amount,
      parts.map((p) => ({ memberId: p.memberId, weight: 1 })),
      { paidBy: e.paidBy },
    )
    const fair = new Map(natural.map((s) => [s.memberId, s.amount]))
    for (const p of parts) {
      extra.set(p.memberId, (extra.get(p.memberId) ?? 0) + (p.amount - (fair.get(p.memberId) ?? 0)))
    }
  }
  return extra
}

/** 잔돈을 가장 많이 떠안은 1명(흡수자). 양수가 없으면 null. tie-break = id 오름차순(결정적). */
export function topAbsorber(expenses: ExpenseRecord[]): { memberId: MemberId; extra: number } | null {
  let best: { memberId: MemberId; extra: number } | null = null
  for (const [memberId, extra] of roundingExtras(expenses)) {
    if (extra > 0 && (!best || extra > best.extra || (extra === best.extra && compareId(memberId, best.memberId) < 0))) {
      best = { memberId, extra }
    }
  }
  return best
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
