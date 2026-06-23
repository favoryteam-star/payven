import Link from 'next/link'
import { getAuthUser, resolveDisplayName } from '@/server/auth'
import { listMemberGroups, listUserAccounts } from '@/server/queries'
import { IcoUser } from '@/components/icons'
import { LoginButtons } from '@/components/LoginButtons'
import { ThemeSwitch } from '@/components/ThemeToggle'
import { AccountManager } from './_components/AccountManager'
import { MemberGroupManager } from './_components/MemberGroupManager'
import { NicknameEditor } from './_components/NicknameEditor'

// 화면 테마 설정 행(로그인/비로그인 공통). 스위치는 클라이언트(ThemeSwitch).
function ThemeSetting() {
  return (
    <section className="mt-8">
      <p className="mb-2 text-sm font-medium text-neutral-500">화면</p>
      <div className="flex items-center justify-between rounded-2xl border border-neutral-100 bg-neutral-50 px-5 py-4 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="text-[15px] font-medium">다크 모드</span>
        <ThemeSwitch />
      </div>
    </section>
  )
}

// 법적 고지 링크 — 로그인/비로그인 공통 하단. 배포된 /privacy로.
function LegalFooter() {
  return (
    <div className="mt-10 text-center">
      <Link
        href="/privacy"
        className="text-xs text-neutral-400 underline-offset-2 hover:text-neutral-600 hover:underline dark:hover:text-neutral-300"
      >
        개인정보처리방침
      </Link>
    </div>
  )
}

// 마이 탭 — 서버 컴포넌트로 세션을 읽어 로그인 상태 표시. 만들기 게이트는 정산하기 시점(별도).
export default async function MyPage() {
  const user = await getAuthUser()

  if (user) {
    const [accounts, memberGroups] = await Promise.all([
      listUserAccounts(user.id),
      listMemberGroups(user.id),
    ])
    const name = resolveDisplayName(user) ?? '사용자'
    // 로그인 출처 표시 — Supabase가 OAuth 로그인 시 app_metadata.provider에 채운다.
    const provider = user.app_metadata?.provider
    const providerLabel =
      provider === 'google' ? '구글 로그인' : provider === 'kakao' ? '카카오 로그인' : '로그인됨'
    return (
      <main className="px-5 pt-6">
        <h1 className="mb-6 text-xl font-bold tracking-tight">마이</h1>
        <div className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 px-5 py-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
            <IcoUser className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <NicknameEditor initialName={name} />
            <p className="text-sm text-neutral-400">{providerLabel}</p>
          </div>
        </div>
        <AccountManager initial={accounts} />
        <MemberGroupManager initial={memberGroups} />

        <ThemeSetting />

        <form action="/auth/logout" method="post" className="mt-8">
          <button className="w-full rounded-2xl border border-neutral-200 py-3 text-sm font-medium text-neutral-500 transition hover:text-neutral-700 dark:border-neutral-700 dark:hover:text-neutral-300">
            로그아웃
          </button>
        </form>

        <LegalFooter />
      </main>
    )
  }

  return (
    <main className="px-5 pt-6">
      <h1 className="mb-6 text-xl font-bold tracking-tight">마이</h1>
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-neutral-100 bg-neutral-50 px-6 py-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-200 text-neutral-500 dark:bg-neutral-700">
          <IcoUser className="h-8 w-8" />
        </div>
        <div>
          <p className="text-[15px] font-medium">로그인하면 정산을 저장할 수 있어요</p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">카카오·구글로 1초 만에 시작</p>
        </div>
        <LoginButtons next="/my" className="w-full max-w-xs" />
      </div>

      <ThemeSetting />

      <LegalFooter />
    </main>
  )
}
