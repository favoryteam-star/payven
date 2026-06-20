// 도메인 타입. DB 행과 분리. 금액은 전부 정수 '원'(number, 안전 정수 범위 내).

export type MemberId = string

export interface Share {
  memberId: MemberId
  amount: number // 정수 원
}

export interface Weight {
  memberId: MemberId
  weight: number // 정수 ≥ 1 (지분/parts). 전부 1이면 균등.
}

/**
 * 분할 옵션. 보조단위 없는 정수 원 그대로.
 * - unit: 각 분담을 이 단위의 배수로 내림(1·10·100·1000…). 기본 1 = 현행 largest-remainder.
 * - absorber: 내림으로 생긴 남는 금액을 한 명이 흡수(weights에 있을 때만 적용). 없으면 자동 분배.
 * - paidBy: 자동 분배 시 나머지 우선권(낸 사람 먼저). absorber가 있으면 무시됨.
 */
export interface SplitOptions {
  paidBy?: MemberId
  unit?: number
  absorber?: MemberId
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
