import { describe, expect, it } from 'vitest'
import { formatAccountNo, onlyDigits } from './account'

describe('onlyDigits', () => {
  it('하이픈·공백·문자를 제거하고 숫자만 남긴다', () => {
    expect(onlyDigits('3333-01-1234567')).toBe('3333011234567')
    expect(onlyDigits('123 456 789')).toBe('123456789')
    expect(onlyDigits('abc12-3d4')).toBe('1234')
    expect(onlyDigits('')).toBe('')
  })
})

describe('formatAccountNo', () => {
  it('은행 규칙대로 하이픈을 넣는다 (카카오뱅크 4-2-7)', () => {
    expect(formatAccountNo('카카오뱅크', '3333011234567')).toBe('3333-01-1234567')
  })

  it('입력에 이미 하이픈이 있어도 숫자만 취해 다시 포맷한다', () => {
    expect(formatAccountNo('국민', '12 34-56789-0 1234')).toBe('123456-78-901234')
  })

  it('패턴보다 자릿수가 적으면 있는 만큼만 끊는다', () => {
    expect(formatAccountNo('카카오뱅크', '333301')).toBe('3333-01')
    expect(formatAccountNo('카카오뱅크', '33')).toBe('33')
  })

  it('패턴을 초과하는 숫자는 그대로 뒤에 붙인다(숫자 손실 없음)', () => {
    expect(onlyDigits(formatAccountNo('신한', '1101234567899999'))).toBe('1101234567899999')
  })

  it('패턴 없는 은행은 숫자 그대로(하이픈 없음)', () => {
    expect(formatAccountNo('없는은행', '12345678')).toBe('12345678')
  })

  it('빈 값은 빈 문자열', () => {
    expect(formatAccountNo('국민', '')).toBe('')
  })
})
