import { describe, expect, it } from 'vitest'
import { canDeleteMember } from './rules'

describe('canDeleteMember', () => {
  it('활동이 전혀 없으면 삭제 가능', () => {
    expect(
      canDeleteMember({
        paidAnyExpense: false,
        hasAnyShare: false,
        inAnySettlement: false,
      }),
    ).toBe(true)
  })

  it('어떤 활동이라도 있으면 삭제 불가', () => {
    expect(
      canDeleteMember({ paidAnyExpense: true, hasAnyShare: false, inAnySettlement: false }),
    ).toBe(false)
    expect(
      canDeleteMember({ paidAnyExpense: false, hasAnyShare: true, inAnySettlement: false }),
    ).toBe(false)
    expect(
      canDeleteMember({ paidAnyExpense: false, hasAnyShare: false, inAnySettlement: true }),
    ).toBe(false)
  })
})
