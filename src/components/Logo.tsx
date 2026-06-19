// 페이븐 브랜드 마크 — pay + even = "=" (균형). 색은 brand 토큰(currentColor)에서.
// 프레젠테이션 전용, 서버 import 없음(브라우저 안전).
type Props = { className?: string }

// 인라인 둥근-사각 타일 (워드마크/헤더용). 작게 쓰므로 그라데이션 없이 단색.
export function BrandMark({ className }: Props) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={'text-brand ' + (className ?? '')}
      role="img"
      aria-label="페이븐"
    >
      <rect width="512" height="512" rx="116" fill="currentColor" />
      <rect x="148" y="190" width="216" height="46" rx="23" fill="#fff" />
      <rect x="148" y="276" width="216" height="46" rx="23" fill="#fff" />
    </svg>
  )
}

// 마크 + 워드 락업.
export function Wordmark({ className }: Props) {
  return (
    <span className={'inline-flex items-center gap-2 ' + (className ?? '')}>
      <BrandMark className="h-7 w-7" />
      <span className="text-xl font-bold tracking-tight">페이븐</span>
    </span>
  )
}
