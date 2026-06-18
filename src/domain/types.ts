// 도메인 타입. DB 행과 분리. 금액은 전부 정수 '원'(number, 안전 정수 범위 내).

export type MemberId = string

export interface Share {
  memberId: MemberId
  amount: number // 정수 원
}

export interface ExpenseRecord {
  amount: number // 정수 원, 총액
  paidBy: MemberId
  shares: Share[]
}

export interface SettlementRecord {
  from: MemberId
  to: MemberId
  amount: number // 정수 원, 양수
}

export interface Transfer {
  from: MemberId
  to: MemberId
  amount: number // 정수 원, 양수
}
