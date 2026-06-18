import { describe, expect, it } from 'vitest'
import { buildTossIntentUrl, buildTossUrl } from './toss'

describe('buildTossUrl', () => {
  it('한글 은행명 인코딩 + 계좌 숫자만 + 금액', () => {
    expect(buildTossUrl({ bankName: '국민', accountNo: '123-456-789', amount: 10000 })).toBe(
      'supertoss://send?bank=%EA%B5%AD%EB%AF%BC&accountNo=123456789&amount=10000',
    )
  })
})

describe('buildTossIntentUrl', () => {
  it('Android intent + 플레이스토어 fallback 포함', () => {
    const url = buildTossIntentUrl({ bankName: '신한', accountNo: '110 222 333', amount: 5000 })
    expect(url).toContain('intent://send?bank=%EC%8B%A0%ED%95%9C&accountNo=110222333&amount=5000')
    expect(url).toContain('scheme=supertoss')
    expect(url).toContain('package=viva.republica.toss')
    expect(url).toContain('browser_fallback_url=')
  })
})
