// 브라우저 안전 순수 유틸. 한국(Asia/Seoul = UTC+9, DST 없음) 캘린더일 기준 상대 날짜.
// 서버 렌더 시 now를 넘겨 결정적으로 계산(Vercel은 UTC라 KST 보정 필수).

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 86_400_000

/** UTC epoch ms → KST 캘린더일 일련번호(같은 날이면 같은 값). */
function kstEpochDay(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS)
}

/**
 * 내역 카드용 상대 날짜.
 * 오늘 / 어제 / N일 전(2~6) / 그 이전은 `YYYY.MM.DD`(KST).
 * 미래(시계 오차)는 '오늘', 해석 불가한 입력은 빈 문자열.
 */
export function formatRelativeDay(iso: string, now: Date): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const dayDiff = kstEpochDay(now.getTime()) - kstEpochDay(t)
  if (dayDiff <= 0) return '오늘'
  if (dayDiff === 1) return '어제'
  if (dayDiff <= 6) return `${dayDiff}일 전`
  const d = new Date(t + KST_OFFSET_MS)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  return `${y}.${mo}.${da}`
}
