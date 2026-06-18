// 순수 비즈니스 규칙. DB·프레임워크 의존 없음.

/** 멤버가 어떤 활동에 묶여 있는지. (지출/분담/정산) */
export interface MemberActivity {
  paidAnyExpense: boolean
  hasAnyShare: boolean
  inAnySettlement: boolean
}

/**
 * 멤버 삭제 가능 여부.
 * FK에 cascade가 없으므로, 지출/분담/정산에 한 번도 안 묶인 멤버만 삭제 허용.
 */
export function canDeleteMember(activity: MemberActivity): boolean {
  return (
    !activity.paidAnyExpense &&
    !activity.hasAnyShare &&
    !activity.inAnySettlement
  )
}
