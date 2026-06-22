// 로그인 왕복 후 돌아갈 경로(`next`)를 정화한다 — 오픈 리다이렉트 방지.
// 같은 출처의 상대 경로(슬래시로 시작)만 허용하고, 그 외(절대 URL `https://evil.com`,
// 프로토콜 상대 `//evil.com`, 백슬래시 트릭, 공백·제어문자)는 '/'로 떨군다.
// 콜백이 `new URL(next, origin)`을 리다이렉트 대상으로 쓰므로 외부 URL이 새면 외부 사이트로 튄다.
// 우리 앱이 만드는 next는 `/`, `/?resume=1`, `/g/<slug>/edit`, `/my`, `/history`뿐이라
// 경로/쿼리에 쓰는 안전 문자만 화이트리스트로 통과시킨다.
const SAFE_NEXT = /^\/[A-Za-z0-9\-._~/?=&%]*$/

export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '/'
  if (raw.startsWith('//')) return '/' // 프로토콜 상대 → 외부 호스트
  if (!SAFE_NEXT.test(raw)) return '/'
  return raw
}
