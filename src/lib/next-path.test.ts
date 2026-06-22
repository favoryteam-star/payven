import { describe, expect, it } from 'vitest'
import { safeNextPath } from './next-path'

describe('safeNextPath', () => {
  it('우리 앱이 만드는 상대 경로는 그대로 통과', () => {
    for (const p of ['/', '/?resume=1', '/my', '/history', '/g/V1StGXR8_Z5jdHi6B-myT/edit']) {
      expect(safeNextPath(p)).toBe(p)
    }
  })

  it('절대 URL은 홈으로 떨군다(오픈 리다이렉트 차단)', () => {
    expect(safeNextPath('https://evil.com')).toBe('/')
    expect(safeNextPath('http://evil.com/path')).toBe('/')
    expect(safeNextPath('javascript:alert(1)')).toBe('/')
  })

  it('프로토콜 상대·백슬래시 트릭 차단', () => {
    expect(safeNextPath('//evil.com')).toBe('/')
    expect(safeNextPath('/\\evil.com')).toBe('/')
    expect(safeNextPath('/\\/evil.com')).toBe('/')
  })

  it('공백·제어문자·상대 경로 아님 차단', () => {
    expect(safeNextPath('/ evil')).toBe('/')
    expect(safeNextPath('/foo\nbar')).toBe('/')
    expect(safeNextPath('relative/path')).toBe('/')
  })

  it('빈 값·null·undefined는 홈', () => {
    expect(safeNextPath('')).toBe('/')
    expect(safeNextPath(null)).toBe('/')
    expect(safeNextPath(undefined)).toBe('/')
  })
})
