// 금액은 전부 정수 '원'(KRW, 보조단위 없음). 부동소수점 금지.

/** 정수가 아니면 throw. 돈이 시스템에 들어오는 경계에서 호출. */
export function assertWon(n: number): void {
  if (!Number.isInteger(n)) {
    throw new Error(`금액은 정수 원이어야 합니다: ${n}`)
  }
}

/** "10,000원" | "10000" → 10000. 해석 불가 시 throw. */
export function parseWon(input: string): number {
  const cleaned = input.replace(/,/g, '').replace(/원/g, '').trim()
  if (!/^-?\d+$/.test(cleaned)) {
    throw new Error(`금액을 해석할 수 없습니다: "${input}"`)
  }
  return Number(cleaned)
}

/** 12345 → "12,345원" */
export function formatWon(n: number): string {
  assertWon(n)
  const sign = n < 0 ? '-' : ''
  const digits = Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${digits}원`
}
