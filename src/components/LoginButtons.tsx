'use client'

import { useEffect, useState } from 'react'
import { isInAppBrowser } from '@/lib/ua'

type Provider = 'kakao' | 'google'

// 카카오·구글 로그인 버튼 한 쌍(공용). 마이·내역·로그인 선택 페이지·정산 게이트 시트가 공유.
//  - next(상대 경로)를 주면 <a href="/auth/login?...">로 렌더(서버 컴포넌트에서 그대로 사용 가능)
//  - onSelect를 주면 <button>으로 렌더 — 클릭 시 입력값 보존 등 사전 작업이 필요한 만들기 게이트용
// 인앱 웹뷰(카카오톡·인스타 등)에서는 구글 OAuth가 막히므로 안내를 함께 보여준다.
export function LoginButtons({
  next,
  onSelect,
  className = '',
}: {
  next?: string
  onSelect?: (provider: Provider) => void
  className?: string
}) {
  const [inApp, setInApp] = useState(false)
  // navigator는 클라이언트에만 있으므로 마운트 후 감지(SSR·첫 렌더는 false → 하이드레이션 일치).
  useEffect(() => {
    setInApp(isInAppBrowser(navigator.userAgent))
  }, [])

  const href = (p: Provider) => `/auth/login?provider=${p}&next=${encodeURIComponent(next || '/')}`

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <ProviderButton
        label="카카오로 시작하기"
        icon={<KakaoIcon />}
        className="bg-[#FEE500] text-[#191600]"
        href={onSelect ? undefined : href('kakao')}
        onClick={onSelect ? () => onSelect('kakao') : undefined}
      />
      <ProviderButton
        label="구글로 시작하기"
        icon={<GoogleIcon />}
        className="border border-neutral-300 bg-white text-[#1f1f1f] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-50"
        href={onSelect ? undefined : href('google')}
        onClick={onSelect ? () => onSelect('google') : undefined}
      />
      {inApp && (
        <p className="mt-1 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          카카오톡·인스타 등 앱 안에서 열면 <b>구글 로그인이 막혀요</b>. 오른쪽 위 메뉴에서{' '}
          <b>다른 브라우저로 열기</b>를 눌러 주세요. (카카오 로그인은 그대로 돼요.)
        </p>
      )}
    </div>
  )
}

function ProviderButton({
  label,
  icon,
  className,
  href,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  className: string
  href?: string
  onClick?: () => void
}) {
  const cls = `flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition active:scale-[0.99] ${className}`
  const inner = (
    <>
      <span className="flex h-[18px] w-[18px] items-center justify-center" aria-hidden>
        {icon}
      </span>
      {label}
    </>
  )
  if (href) {
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

function KakaoIcon() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]">
      <path
        fill="#191600"
        d="M9 1.5C4.86 1.5 1.5 4.14 1.5 7.39c0 2.1 1.4 3.95 3.5 5l-.78 2.86c-.07.25.2.45.42.31l3.43-2.27c.3.03.6.04.93.04 4.14 0 7.5-2.64 7.5-5.94S13.14 1.5 9 1.5z"
      />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
