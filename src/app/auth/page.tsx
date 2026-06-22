import type { Metadata } from 'next'
import Link from 'next/link'
import { LoginButtons } from '@/components/LoginButtons'
import { Wordmark } from '@/components/Logo'
import { safeNextPath } from '@/lib/next-path'

// 로그인 선택 페이지 — provider를 강제하지 않는 진입점.
// 수정 화면처럼 세션이 필요한데 어떤 provider로 로그인했는지 모를 때 여기로 보낸다
// (카카오 사용자를 구글로, 또는 그 반대로 강제하면 다른 계정이 돼 소유자 게이트가 막힘).
export const metadata: Metadata = { robots: { index: false, follow: false } }

type Search = { searchParams: Promise<{ next?: string }> }

export default async function AuthPage({ searchParams }: Search) {
  const sp = await searchParams
  const next = safeNextPath(sp.next)

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 pb-safe">
      <div className="w-full max-w-xs text-center">
        <div className="mb-6 flex justify-center">
          <Wordmark />
        </div>
        <h1 className="text-lg font-bold tracking-tight">로그인</h1>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          로그인하면 정산을 저장하고 내역을 볼 수 있어요.
        </p>
        <LoginButtons next={next} className="mt-6" />
        <Link
          href="/"
          className="mt-3 inline-block py-2 text-sm font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          홈으로
        </Link>
      </div>
    </main>
  )
}
