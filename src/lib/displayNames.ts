// 공유 정산 화면의 멤버 '표시 이름' 해석(브라우저 안전·순수).
//
// 기본 규칙(ADR-015): 받는 사람 등 멤버명이 '나'여도 친구가 누군지 알 수 있게
// **예금주 실명을 우선**으로 보여준다(`accountHolder ?? name`).
// 함정: 그 예금주명이 다른 멤버의 멤버명과 똑같아지면(예: 계좌주 '나희진' + 참여자
// '나희진') 송금 행이 `나희진 → 나희진`이 되어 **자기송금처럼** 보인다.
//
// 그래서 **동명 충돌이 있을 때만** 구분자를 붙여 서로 다른 사람임을 드러낸다.
// 구분자 우선순위(방향 무관·정보성):
//   ① 계좌 주인 → 은행명(`나희진 (카카오뱅크)`) — 채무/채권 어느 방향이든 옳음
//   ② 예금주명이 멤버명을 덮어 충돌 → 원래 멤버명 복원(`나희진 (나)`)
//   ③ 그래도 같은 글자(진짜 동명) → 순번(`나희진 (1)` / `나희진 (2)`)
// 충돌이 없으면(거의 모든 정산) 기존과 글자 그대로 동일하다.

export type DisplayMember = {
  id: string
  name: string
  accountHolder?: string | null
  bankName?: string | null
}

const trim = (s: string | null | undefined) => (s ?? '').trim()
const baseNameOf = (m: DisplayMember) => trim(m.accountHolder) || trim(m.name) || '?'

/** 멤버 id → 표시 이름(동명 충돌은 구분자로 풀어 유일하게). */
export function resolveDisplayNames(members: DisplayMember[]): Map<string, string> {
  const base = new Map(members.map((m) => [m.id, baseNameOf(m)]))
  const baseCount = new Map<string, number>()
  for (const b of base.values()) baseCount.set(b, (baseCount.get(b) ?? 0) + 1)

  // 1차: 충돌 없으면 base 그대로, 충돌이면 ①은행 ②멤버명으로 구분 시도.
  const label = new Map<string, string>()
  for (const m of members) {
    const b = base.get(m.id)!
    if ((baseCount.get(b) ?? 0) <= 1) {
      label.set(m.id, b)
      continue
    }
    const bank = trim(m.bankName)
    const typed = trim(m.name)
    if (bank) label.set(m.id, `${b} (${bank})`)
    else if (typed && typed !== b) label.set(m.id, `${b} (${typed})`)
    else label.set(m.id, b) // 진짜 동명 — 2차 순번에서 유일화
  }

  // 2차: 1차로도 같은 글자가 남으면 순번을 붙여 유일하게.
  const labelCount = new Map<string, number>()
  for (const v of label.values()) labelCount.set(v, (labelCount.get(v) ?? 0) + 1)
  const seq = new Map<string, number>()
  for (const m of members) {
    const v = label.get(m.id)!
    if ((labelCount.get(v) ?? 0) <= 1) continue
    const n = (seq.get(v) ?? 0) + 1
    seq.set(v, n)
    label.set(m.id, `${v} (${n})`)
  }
  return label
}

/** 한 멤버만 해석할 때 쓰는 편의 함수(목록 전체를 넘겨 충돌을 같이 판단). */
export function displayNameOf(members: DisplayMember[], id: string): string {
  return resolveDisplayNames(members).get(id) ?? '?'
}
