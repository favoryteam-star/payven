import { getAuthUser } from '@/server/auth'
import { listGroupsByOwner } from '@/server/queries'
import { formatWon } from '@/domain/money'
import { formatRelativeDay } from '@/lib/datetime'
import { IcoList } from '@/components/icons'
import { HistoryCard } from './_components/HistoryCard'

// 내역 탭 — 서버 컴포넌트로 세션을 읽어 내가 만든 정산을 최신순으로. 읽기는 queries 직접 호출(ADR-006).
export default async function HistoryPage() {
  const user = await getAuthUser()

  if (!user) {
    return (
      <main className="px-5 pt-6">
        <h1 className="mb-6 text-xl font-bold tracking-tight">내역</h1>
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-neutral-100 bg-neutral-50 px-6 py-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-200 text-neutral-500 dark:bg-neutral-700">
            <IcoList className="h-8 w-8" />
          </div>
          <div>
            <p className="text-[15px] font-medium">로그인하면 정산 내역을 볼 수 있어요</p>
            <p className="mt-1 text-sm text-neutral-400">만든 정산이 자동으로 여기에 모여요</p>
          </div>
          <a
            href="/auth/login?provider=kakao&next=/history"
            className="w-full max-w-xs rounded-2xl bg-[#FEE500] py-3.5 text-center text-sm font-semibold text-[#191600] transition active:scale-[0.99]"
          >
            카카오로 시작하기
          </a>
        </div>
      </main>
    )
  }

  const settlements = await listGroupsByOwner(user.id)
  const now = new Date()

  return (
    <main className="px-5 pt-6">
      <h1 className="mb-6 text-xl font-bold tracking-tight">내역</h1>
      {settlements.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 px-6 py-16 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <IcoList className="h-9 w-9 text-neutral-300" />
          <p className="text-[15px] font-medium">아직 만든 정산이 없어요</p>
          <p className="text-sm text-neutral-400">정산을 만들면 여기에 모여요.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {settlements.map((s) => (
            <HistoryCard
              key={s.slug}
              slug={s.slug}
              name={s.name}
              metaLabel={`${s.memberCount}명 · ${formatRelativeDay(s.createdAt, now)}`}
              totalLabel={formatWon(s.total)}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
