import { describe, expect, it } from 'vitest'
import { assertWon, formatWon, parseWon } from './money'

describe('parseWon', () => {
  it('콤마/원/공백 제거 후 정수', () => {
    expect(parseWon('10,000원')).toBe(10000)
    expect(parseWon('10000')).toBe(10000)
    expect(parseWon('  1,234,567 원 ')).toBe(1234567)
  })
  it('해석 불가 시 throw', () => {
    expect(() => parseWon('abc')).toThrow()
    expect(() => parseWon('')).toThrow()
    expect(() => parseWon('1.5')).toThrow()
  })
})

describe('formatWon', () => {
  it('천 단위 콤마 + 원', () => {
    expect(formatWon(12345)).toBe('12,345원')
    expect(formatWon(0)).toBe('0원')
    expect(formatWon(1000000)).toBe('1,000,000원')
    expect(formatWon(-3000)).toBe('-3,000원')
  })
  it('정수 아니면 throw', () => {
    expect(() => formatWon(1.5)).toThrow()
  })
})

describe('assertWon', () => {
  it('정수만 통과', () => {
    expect(() => assertWon(10000)).not.toThrow()
    expect(() => assertWon(0)).not.toThrow()
    expect(() => assertWon(1.5)).toThrow()
    expect(() => assertWon(Number.NaN)).toThrow()
  })
})
