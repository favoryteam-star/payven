import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  equalSplit,
  minimizeCashFlow,
  netBalances,
  roundingExtras,
  roundingLeftover,
  splitByWeights,
  topAbsorber,
} from './settle'
import type { ExpenseRecord, MemberId, SettlementRecord, Weight } from './types'

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)

describe('equalSplit', () => {
  it('10,000 ÷ 3 → 3,334 / 3,333 / 3,333, 낸 사람이 나머지 흡수', () => {
    const shares = equalSplit(10000, ['a', 'b', 'c'], 'a')
    expect(shares.map((s) => s.amount)).toEqual([3334, 3333, 3333])
    expect(sum(shares.map((s) => s.amount))).toBe(10000)
  })

  it('paidBy가 참여자 아니면 id 오름차순으로 나머지 분배', () => {
    const shares = equalSplit(10000, ['c', 'b', 'a'], 'z')
    const byId = Object.fromEntries(shares.map((s) => [s.memberId, s.amount]))
    expect(byId).toEqual({ a: 3334, b: 3333, c: 3333 })
  })

  // 나머지 ≥ 2 — tie-break 순서(낸 사람 우선 → id 오름차순)를 정확히 핀
  it('나머지 2: 낸 사람 먼저 + 그다음 id 오름차순', () => {
    const shares = equalSplit(10000, ['a', 'b', 'c', 'd'], 'a') // 10000/4 = 2500, r=0
    expect(shares.map((s) => s.amount)).toEqual([2500, 2500, 2500, 2500])
    const r2 = equalSplit(10002, ['a', 'b', 'c', 'd'], 'a') // base 2500, r=2 → a, b
    const m2 = Object.fromEntries(r2.map((s) => [s.memberId, s.amount]))
    expect(m2).toEqual({ a: 2501, b: 2501, c: 2500, d: 2500 })
  })

  it('나머지 2: 낸 사람이 참여자 아니면 가장 작은 id 2개', () => {
    const shares = equalSplit(10001, ['c', 'b', 'a'], 'z') // base 3333, r=2 → a, b
    const byId = Object.fromEntries(shares.map((s) => [s.memberId, s.amount]))
    expect(byId).toEqual({ a: 3334, b: 3334, c: 3333 })
  })

  it('낸 사람이 첫 번째가 아닌 id여도 먼저 흡수', () => {
    const shares = equalSplit(7, ['a', 'b', 'c'], 'b') // base 2, r=1 → b
    const byId = Object.fromEntries(shares.map((s) => [s.memberId, s.amount]))
    expect(byId).toEqual({ a: 2, b: 3, c: 2 })
  })

  it('나누어떨어지면 균등', () => {
    const shares = equalSplit(9000, ['a', 'b', 'c'])
    expect(shares.every((s) => s.amount === 3000)).toBe(true)
  })

  it('금액 0이면 전원 0', () => {
    const shares = equalSplit(0, ['a', 'b'])
    expect(shares.every((s) => s.amount === 0)).toBe(true)
  })

  it('음수 금액 / 참여자 0명 / 중복 참여자는 throw', () => {
    expect(() => equalSplit(-1, ['a'])).toThrow()
    expect(() => equalSplit(100, [])).toThrow()
    expect(() => equalSplit(7, ['a', 'a', 'b'], 'a')).toThrow(/중복/)
    expect(() => equalSplit(2, ['a', 'a', 'a'])).toThrow(/중복/)
  })

  it('큰 금액도 정확히 분할(합 = amount, 편차 ≤ 1)', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `m${i}`)
    const amount = 1_000_000_007
    const shares = equalSplit(amount, ids, 'm0')
    const amounts = shares.map((s) => s.amount)
    expect(sum(amounts)).toBe(amount)
    expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1)
  })
})

// '한 명이 다 쏘기' = 진 사람만 참여자로 둔 분할(서버 quickSharesArray). 도메인 변경 0으로 표현.
describe('한 명이 다 쏘기(단일 승자 정산)', () => {
  it('단일 참여자는 전액을 부담', () => {
    expect(equalSplit(30000, ['2'], { paidBy: '0' })).toEqual([{ memberId: '2', amount: 30000 }])
  })

  it('진 사람 ≠ 낸 사람 → 진 사람이 낸 사람에게 전액', () => {
    // 낸 사람 0이 30000 결제, 진 사람 2가 전액 부담(나머지 0 분담).
    const expenses: ExpenseRecord[] = [{ amount: 30000, paidBy: '0', shares: [{ memberId: '2', amount: 30000 }] }]
    const net = netBalances(['0', '1', '2'], expenses)
    expect(net.get('0')).toBe(30000) // 낸 사람 = 받을 돈
    expect(net.get('1')).toBe(0) // 안 낀 사람
    expect(net.get('2')).toBe(-30000) // 진 사람 = 갚을 돈
    expect(minimizeCashFlow(net)).toEqual([{ from: '2', to: '0', amount: 30000 }])
  })

  it('진 사람 = 낸 사람 → 정산할 게 없음(딱 맞춤)', () => {
    const expenses: ExpenseRecord[] = [{ amount: 30000, paidBy: '0', shares: [{ memberId: '0', amount: 30000 }] }]
    const net = netBalances(['0', '1', '2'], expenses)
    expect([...net.values()].every((v) => v === 0)).toBe(true)
    expect(minimizeCashFlow(net)).toEqual([])
  })
})

describe('splitByWeights', () => {
  const w = (memberId: MemberId, weight: number): Weight => ({ memberId, weight })

  it('가중 비례: 100을 1:3 → 25 / 75', () => {
    const shares = splitByWeights(100, [w('a', 1), w('b', 3)])
    expect(Object.fromEntries(shares.map((s) => [s.memberId, s.amount]))).toEqual({ a: 25, b: 75 })
  })

  it('나머지는 분수부(rem) 큰 순으로 1원씩', () => {
    // a: 7*2/3 = base4 rem2, b: 7*1/3 = base2 rem1 → leftover 1 → a
    const shares = splitByWeights(7, [w('a', 2), w('b', 1)], 'z')
    expect(Object.fromEntries(shares.map((s) => [s.memberId, s.amount]))).toEqual({ a: 5, b: 2 })
    expect(sum(shares.map((s) => s.amount))).toBe(7)
  })

  it('분수부 동률이면 낸 사람 먼저, 그다음 id 오름차순', () => {
    // a,b 모두 rem 동률 → paidBy가 가른다
    const paidB = splitByWeights(8, [w('a', 3), w('b', 3), w('c', 1)], 'b')
    expect(Object.fromEntries(paidB.map((s) => [s.memberId, s.amount]))).toEqual({ a: 3, b: 4, c: 1 })
    const paidNone = splitByWeights(8, [w('a', 3), w('b', 3), w('c', 1)], 'z')
    expect(Object.fromEntries(paidNone.map((s) => [s.memberId, s.amount]))).toEqual({ a: 4, b: 3, c: 1 })
  })

  it('출력 멤버 = 입력 멤버 그대로(제외 멤버는 애초에 목록에 없음)', () => {
    const shares = splitByWeights(1000, [w('a', 1), w('c', 2)], 'a')
    expect(shares.map((s) => s.memberId)).toEqual(['a', 'c'])
  })

  it('weight 1이면 equalSplit과 항상 동일 (300 runs)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 2, max: 12 }),
        fc.integer({ min: 0, max: 11 }),
        (amount, m, payIdx) => {
          const ids = Array.from({ length: m }, (_, i) => `m${i}`)
          const paidBy = ids[payIdx % m]
          const a = equalSplit(amount, ids, paidBy)
          const b = splitByWeights(amount, ids.map((id) => w(id, 1)), paidBy)
          expect(b).toEqual(a)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('불변식: Σshares == amount, 정수·비음수 (가중 무작위, 300 runs)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 12 }),
        fc.integer({ min: 0, max: 11 }),
        (amount, weightVals, payIdx) => {
          const weights = weightVals.map((wt, i) => w(`m${i}`, wt))
          const paidBy = weights[payIdx % weights.length].memberId
          const shares = splitByWeights(amount, weights, paidBy)
          expect(sum(shares.map((s) => s.amount))).toBe(amount)
          for (const s of shares) {
            expect(Number.isInteger(s.amount)).toBe(true)
            expect(s.amount).toBeGreaterThanOrEqual(0)
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('잘못된 입력은 throw (가중치 <1·비정수·빈 목록·중복)', () => {
    expect(() => splitByWeights(100, [w('a', 0), w('b', 1)])).toThrow(/가중치/)
    expect(() => splitByWeights(100, [w('a', 1.5), w('b', 1)])).toThrow(/가중치/)
    expect(() => splitByWeights(100, [])).toThrow()
    expect(() => splitByWeights(100, [w('a', 1), w('a', 2)])).toThrow(/중복/)
  })
})

describe('단위(unit) 반올림 + 남는 금액 흡수자', () => {
  const w = (memberId: MemberId, weight: number): Weight => ({ memberId, weight })

  it('10,000 ÷ 3, 단위 100 → 각 3,300 + 남은 100(자동: 낸 사람)', () => {
    const shares = equalSplit(10000, ['a', 'b', 'c'], { unit: 100, paidBy: 'a' })
    expect(shares.map((s) => s.amount)).toEqual([3400, 3300, 3300])
    expect(sum(shares.map((s) => s.amount))).toBe(10000)
  })

  it('10,000 ÷ 3, 단위 1,000 → 각 3,000 + 남은 1,000', () => {
    const shares = equalSplit(10000, ['a', 'b', 'c'], { unit: 1000, paidBy: 'a' })
    expect(shares.map((s) => s.amount)).toEqual([4000, 3000, 3000])
  })

  it('흡수자 지정: 남은 금액 전부 그 사람에게, 나머지는 깔끔', () => {
    const shares = equalSplit(10000, ['a', 'b', 'c'], { unit: 100, absorber: 'c' })
    expect(Object.fromEntries(shares.map((s) => [s.memberId, s.amount]))).toEqual({
      a: 3300,
      b: 3300,
      c: 3400,
    })
  })

  it('총액이 단위로 안 떨어져도 합 정확 + 비흡수자는 단위 배수(흡수자가 sub-unit 흡수)', () => {
    const shares = equalSplit(10001, ['a', 'b', 'c'], { unit: 100, absorber: 'c' })
    const m = Object.fromEntries(shares.map((s) => [s.memberId, s.amount]))
    expect(m).toEqual({ a: 3300, b: 3300, c: 3401 })
    expect(sum(shares.map((s) => s.amount))).toBe(10001)
  })

  it('자동 + 총액이 단위로 안 떨어짐: sub-unit은 최우선자에게', () => {
    const shares = equalSplit(10001, ['a', 'b', 'c'], { unit: 100, paidBy: 'a' })
    expect(shares.map((s) => s.amount)).toEqual([3401, 3300, 3300])
    expect(sum(shares.map((s) => s.amount))).toBe(10001)
  })

  it('가중 + 단위 + 흡수자: 비흡수자는 단위 배수', () => {
    const shares = splitByWeights(10000, [w('a', 1), w('b', 2)], { unit: 100, absorber: 'a' })
    expect(Object.fromEntries(shares.map((s) => [s.memberId, s.amount]))).toEqual({ a: 3400, b: 6600 })
  })

  it('단위가 총액을 나누면 흡수자도 깔끔(남는 금액 0)', () => {
    const shares = equalSplit(9000, ['a', 'b', 'c'], { unit: 100, absorber: 'a' })
    expect(shares.every((s) => s.amount === 3000)).toBe(true)
  })

  it('잘못된 단위는 throw', () => {
    expect(() => equalSplit(100, ['a', 'b'], { unit: 0 })).toThrow(/단위/)
    expect(() => equalSplit(100, ['a', 'b'], { unit: 10.5 })).toThrow(/단위/)
  })

  it('불변식(흡수자, 300 runs): 합 = amount · 정수·비음수 · 비흡수자는 모두 unit 배수', () => {
    const UNITS = [1, 10, 100, 1000]
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 3 }),
        (amount, mCount, absIdx, unitIdx) => {
          const ids = Array.from({ length: mCount }, (_, i) => `m${i}`)
          const unit = UNITS[unitIdx]
          const absorber = ids[absIdx % mCount]
          const shares = equalSplit(amount, ids, { unit, absorber })
          expect(sum(shares.map((s) => s.amount))).toBe(amount)
          for (const s of shares) {
            expect(Number.isInteger(s.amount)).toBe(true)
            expect(s.amount).toBeGreaterThanOrEqual(0)
            // 흡수자만 sub-unit을 가질 수 있고, 나머지는 전부 unit 배수
            if (s.memberId !== absorber) expect(s.amount % unit).toBe(0)
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('netBalances', () => {
  it('a가 9000 내고 셋이 나눔', () => {
    const expenses: ExpenseRecord[] = [
      { amount: 9000, paidBy: 'a', shares: equalSplit(9000, ['a', 'b', 'c'], 'a') },
    ]
    const net = netBalances(['a', 'b', 'c'], expenses)
    expect(net.get('a')).toBe(6000)
    expect(net.get('b')).toBe(-3000)
    expect(net.get('c')).toBe(-3000)
  })

  it('정산 기록이 잔액을 정확히 이동시킴', () => {
    const expenses: ExpenseRecord[] = [
      { amount: 9000, paidBy: 'a', shares: equalSplit(9000, ['a', 'b', 'c'], 'a') },
    ]
    const net = netBalances(['a', 'b', 'c'], expenses, [
      { from: 'b', to: 'a', amount: 3000 },
    ])
    expect(net.get('a')).toBe(3000) // 받을 돈 6000 → 3000
    expect(net.get('b')).toBe(0) // 빚 3000 → 0
    expect(net.get('c')).toBe(-3000)
  })

  it('정수 아닌 금액은 경계에서 throw', () => {
    expect(() =>
      netBalances(['a', 'b'], [
        { amount: 100.5, paidBy: 'a', shares: [{ memberId: 'b', amount: 100.5 }] },
      ]),
    ).toThrow()
  })
})

describe('minimizeCashFlow', () => {
  it('정확한 송금 목록 + 순서(큰 채무자 먼저)', () => {
    expect(minimizeCashFlow({ a: 5000, b: -3000, c: -2000 })).toEqual([
      { from: 'b', to: 'a', amount: 3000 },
      { from: 'c', to: 'a', amount: 2000 },
    ])
  })

  it('동률 채무자는 id 오름차순(결정적)', () => {
    expect(minimizeCashFlow({ a: 4000, b: -2000, c: -2000 })).toEqual([
      { from: 'b', to: 'a', amount: 2000 },
      { from: 'c', to: 'a', amount: 2000 },
    ])
  })

  it('net 합이 0이 아니면 throw', () => {
    expect(() => minimizeCashFlow({ a: 100, b: -50 })).toThrow()
  })

  it('전부 0이면 송금 없음', () => {
    expect(minimizeCashFlow({ a: 0, b: 0 })).toEqual([])
  })

  it('m−1 경계: 채권자 1 + 채무자 9 → 정확히 9건', () => {
    const net = {
      a: 4500,
      b: -900, c: -800, d: -700, e: -600, f: -500,
      g: -400, h: -300, i: -200, j: -100,
    }
    const transfers = minimizeCashFlow(net)
    expect(transfers).toHaveLength(9) // m=10 nonzero → ≤ 9
    expect(transfers.every((t) => t.to === 'a')).toBe(true)
  })
})

// 단위 내림으로 생기는 '남는 금액'(흡수자 몫) — 폼 '남은 N원'·공유 상세 안내 공용 값.
describe('roundingLeftover', () => {
  it('10,000 ÷ 3, 천원 → 남은 1,000', () => {
    expect(roundingLeftover(10000, 3, 1000)).toBe(1000) // base 3000×3=9000
  })

  it('10,000 ÷ 3, 안 함(1) → 남은 1원(1~2원 자투리)', () => {
    expect(roundingLeftover(10000, 3, 1)).toBe(1) // 10000 mod 3
  })

  it('딱 떨어지면 0', () => {
    expect(roundingLeftover(9000, 3, 100)).toBe(0)
    expect(roundingLeftover(9000, 3, 1)).toBe(0)
  })

  it('항목별 합산: 폼 itemsLeftover와 동일 공식', () => {
    // 10,000(3명)·5,000(2명) 천원 → 1,000 + 1,000 = 2,000
    expect(roundingLeftover(10000, 3, 1000) + roundingLeftover(5000, 2, 1000)).toBe(2000)
  })

  it('가드: 금액 0·참여자 0·단위 0이면 0', () => {
    expect(roundingLeftover(0, 3, 1000)).toBe(0)
    expect(roundingLeftover(10000, 0, 1000)).toBe(0)
    expect(roundingLeftover(10000, 3, 0)).toBe(0)
  })

  it('비흡수자 base 합 + leftover = amount (불변식, 300 runs)', () => {
    const UNITS = [1, 10, 100, 1000]
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 0, max: 3 }),
        (amount, n, unitIdx) => {
          const unit = UNITS[unitIdx]
          const leftover = roundingLeftover(amount, n, unit)
          expect(leftover).toBeGreaterThanOrEqual(0)
          expect(Number.isInteger(leftover)).toBe(true)
          // 균등분할의 흡수자 몫 = base + leftover, 합 = amount
          const shares = equalSplit(amount, Array.from({ length: n }, (_, i) => `m${i}`), { unit, absorber: 'm0' })
          expect(sum(shares.map((s) => s.amount))).toBe(amount)
          if (amount > 0) {
            const base = Math.floor(amount / (n * unit)) * unit
            expect(amount - base * n).toBe(leftover)
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})

// 흡수자가 '누구인지'를 분담에서 역산(멤버 정렬·동명에 안 흔들림). 공유 페이지가 이걸로 사람을 찾는다.
describe('topAbsorber / roundingExtras', () => {
  it('잔돈을 더 받은 멤버를 정확히 찾음 (멤버 순서 무관, 분담 기반)', () => {
    // 실제 버그 재현: 음식 20,000(균등 10,000/10,000) + 커피 3,702(나희진 1,000·민태욱 2,702=잔돈 흡수).
    // → 흡수자는 '민태욱'이어야 함(나희진 아님). id 기반이라 멤버 순서·동명 영향 0.
    const expenses: ExpenseRecord[] = [
      { amount: 20000, paidBy: 'na', shares: [{ memberId: 'na', amount: 10000 }, { memberId: 'min', amount: 10000 }] },
      { amount: 3702, paidBy: 'na', shares: [{ memberId: 'na', amount: 1000 }, { memberId: 'min', amount: 2702 }] },
    ]
    const top = topAbsorber(expenses)
    expect(top?.memberId).toBe('min') // 커피 자연분할 1,851/1,851 → min +851
    expect(top?.extra).toBe(851)
    expect(sum([...roundingExtras(expenses).values()])).toBe(0) // 더 낸 만큼 남이 덜 냄
  })

  it('반올림 없으면(딱 떨어짐) null', () => {
    const expenses: ExpenseRecord[] = [
      { amount: 9000, paidBy: 'a', shares: equalSplit(9000, ['a', 'b', 'c'], 'a') },
    ]
    expect(topAbsorber(expenses)).toBeNull()
  })

  it('참여자 1명짜리 항목은 무시', () => {
    expect(topAbsorber([{ amount: 30000, paidBy: '0', shares: [{ memberId: '2', amount: 30000 }] }])).toBeNull()
  })

  it('여러 항목에 걸쳐 흡수자 차액 누적', () => {
    // 두 항목 모두 c가 천원 잔돈 흡수 → c가 최대 양수.
    const mk = (amount: number, ids: MemberId[]): ExpenseRecord => ({
      amount,
      paidBy: 'a',
      shares: splitByWeights(amount, ids.map((id) => ({ memberId: id, weight: 1 })), {
        paidBy: 'a',
        unit: 1000,
        absorber: 'c',
      }).filter((s) => s.amount > 0),
    })
    expect(topAbsorber([mk(10000, ['a', 'b', 'c']), mk(5000, ['a', 'c'])])?.memberId).toBe('c')
  })
})

describe('불변식 (property-based, 300 runs · 멤버 2~12 · 정산 포함)', () => {
  it('모든 무작위 그룹에서 6개 불변식이 성립', () => {
    const scenario = fc.integer({ min: 2, max: 12 }).chain((m) => {
      const ids: MemberId[] = Array.from({ length: m }, (_, i) => `m${i}`)
      const expenseArb = fc.record({
        amount: fc.integer({ min: 1, max: 1_000_000_000 }),
        paidByIdx: fc.integer({ min: 0, max: m - 1 }),
        mask: fc.array(fc.boolean(), { minLength: m, maxLength: m }),
      })
      const settlementArb = fc.record({
        fromIdx: fc.integer({ min: 0, max: m - 1 }),
        toIdx: fc.integer({ min: 0, max: m - 1 }),
        amount: fc.integer({ min: 1, max: 1_000_000 }),
      })
      return fc.record({
        ids: fc.constant(ids),
        raw: fc.array(expenseArb, { minLength: 1, maxLength: 8 }),
        rawSettlements: fc.array(settlementArb, { maxLength: 5 }),
      })
    })

    fc.assert(
      fc.property(scenario, ({ ids, raw, rawSettlements }) => {
        const expenses: ExpenseRecord[] = raw.map((e) => {
          let participants = ids.filter((_, i) => e.mask[i])
          if (participants.length === 0) participants = [ids[0]]
          const paidBy = ids[e.paidByIdx]
          const shares = equalSplit(e.amount, participants, paidBy)
          // ② 분담 합 == 지출 amount
          expect(sum(shares.map((s) => s.amount))).toBe(e.amount)
          // ③ 분담 정수·음수 없음
          for (const s of shares) {
            expect(Number.isInteger(s.amount)).toBe(true)
            expect(s.amount).toBeGreaterThanOrEqual(0)
          }
          return { amount: e.amount, paidBy, shares }
        })

        const settlements: SettlementRecord[] = rawSettlements
          .map((s) => ({ from: ids[s.fromIdx], to: ids[s.toIdx], amount: s.amount }))
          .filter((s) => s.from !== s.to)

        const net = netBalances(ids, expenses, settlements)
        // ① net 합 == 0 (정산을 섞어도 유지)
        expect(sum([...net.values()])).toBe(0)

        const transfers = minimizeCashFlow(net)
        const nonZero = [...net.values()].filter((v) => v !== 0).length
        // 비공허성: 잔액이 남아있으면 송금이 실제로 생긴다
        if (nonZero > 0) expect(transfers.length).toBeGreaterThan(0)

        for (const t of transfers) {
          // ④ 송금 amount > 0(정수), 자기송금 없음
          expect(Number.isInteger(t.amount)).toBe(true)
          expect(t.amount).toBeGreaterThan(0)
          expect(t.from).not.toBe(t.to)
        }
        // ⑤ 송금 적용 시 net 전부 0
        const after = new Map(net)
        for (const t of transfers) {
          after.set(t.from, (after.get(t.from) ?? 0) + t.amount)
          after.set(t.to, (after.get(t.to) ?? 0) - t.amount)
        }
        expect([...after.values()].every((v) => v === 0)).toBe(true)
        // ⑥ 송금 수 ≤ m−1 (m = 잔액 0 아닌 인원)
        expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1))
      }),
      { numRuns: 300 },
    )
  })
})
