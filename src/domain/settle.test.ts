import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { equalSplit, minimizeCashFlow, netBalances, splitByWeights } from './settle'
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
