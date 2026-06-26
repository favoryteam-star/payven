import { track } from '@vercel/analytics'

// Vercel Web Analytics 커스텀 이벤트 — 콜드 전환 퍼널 측정용(쿠키리스·PII 없음).
// 목적(docs/growth-plan.md): 방문 → create_attempted → (login_gate_shown | settlement_created).
//  · 활성화율 = settlement_created / 방문(콜드)
//  · 로그인 게이트 이탈 = login_gate_shown / create_attempted
// 이벤트엔 이름·금액 등 PII를 절대 싣지 않는다(source·mode만).

const SRC_KEY = 'payven:src'

/** 유입 출처(utm_source/ref)를 캡처해 sessionStorage에 보관 — 로그인 왕복·페이지 이동에도 유지. */
export function captureSource(): void {
  if (typeof window === 'undefined') return
  try {
    const p = new URLSearchParams(window.location.search)
    const src = p.get('utm_source') || p.get('ref')
    if (src) sessionStorage.setItem(SRC_KEY, src.slice(0, 40))
  } catch {
    /* 스토리지 차단 무시 */
  }
}

function currentSource(): string {
  if (typeof window === 'undefined') return 'unknown'
  try {
    return sessionStorage.getItem(SRC_KEY) || 'organic'
  } catch {
    return 'unknown'
  }
}

export type FunnelEvent = 'create_attempted' | 'login_gate_shown' | 'settlement_created'

/** 전환 퍼널 이벤트 1건 기록. 실패는 조용히 무시(측정이 UX를 막지 않음). */
export function trackEvent(name: FunnelEvent, props?: Record<string, string>): void {
  try {
    track(name, { source: currentSource(), ...props })
  } catch {
    /* analytics 미가용/실패 무시 */
  }
}
