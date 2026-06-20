import { describe, expect, it } from 'vitest'
import { formatMonthDay, formatRelativeDay } from './datetime'

describe('formatRelativeDay', () => {
  // 기준 시각: 2026-06-20T05:00:00Z = KST 2026-06-20 14:00
  const now = new Date('2026-06-20T05:00:00Z')

  it('같은 KST 날이면 오늘', () => {
    expect(formatRelativeDay('2026-06-20T01:00:00Z', now)).toBe('오늘') // KST 10:00
    expect(formatRelativeDay('2026-06-19T20:00:00Z', now)).toBe('오늘') // KST 익일 05:00 → 같은 6/20
  })

  it('하루 전 KST 날은 어제', () => {
    expect(formatRelativeDay('2026-06-19T10:00:00Z', now)).toBe('어제') // KST 6/19 19:00
  })

  it('2~6일 전은 N일 전', () => {
    expect(formatRelativeDay('2026-06-18T05:00:00Z', now)).toBe('2일 전')
    expect(formatRelativeDay('2026-06-14T05:00:00Z', now)).toBe('6일 전')
  })

  it('7일 이상 전은 KST 날짜', () => {
    expect(formatRelativeDay('2026-06-13T05:00:00Z', now)).toBe('2026.06.13')
    expect(formatRelativeDay('2026-01-09T20:00:00Z', now)).toBe('2026.01.10') // KST 보정으로 익일
  })

  it('일 경계는 UTC가 아니라 KST 기준', () => {
    // now = KST 2026-06-21 00:30, iso = KST 2026-06-20 23:00 → UTC로는 둘 다 6/20이지만 KST로는 어제
    const lateNow = new Date('2026-06-20T15:30:00Z')
    expect(formatRelativeDay('2026-06-20T14:00:00Z', lateNow)).toBe('어제')
  })

  it('미래·해석불가 입력 방어', () => {
    expect(formatRelativeDay('2026-06-25T00:00:00Z', now)).toBe('오늘') // 미래는 오늘로
    expect(formatRelativeDay('not-a-date', now)).toBe('')
  })
})

describe('formatMonthDay', () => {
  it('KST 월/일로 표시', () => {
    expect(formatMonthDay('2026-06-20T01:00:00Z')).toBe('6월 20일') // KST 10:00
    expect(formatMonthDay('2026-06-19T20:00:00Z')).toBe('6월 20일') // KST 익일 05:00 보정
    expect(formatMonthDay('2026-01-09T20:00:00Z')).toBe('1월 10일')
  })
  it('해석불가 입력은 빈 문자열', () => {
    expect(formatMonthDay('nope')).toBe('')
  })
})
