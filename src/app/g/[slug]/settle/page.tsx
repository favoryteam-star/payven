import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatWon } from '@/domain/money'
import { minimizeCashFlow, netBalances } from '@/domain/settle'
import { getGroupBySlug } from '@/server/queries'
import { ShareButton } from '@/components/ShareButton'
import { IcoBack } from '@/components/icons'
import { CopyButton } from './_components/CopyButton'

const loadGroup = cache(getGroupBySlug)

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const snap = await loadGroup(slug)
  return {
    title: snap ? `${snap.group.name} 정산` : '정산',
    description: '페이븐 — 링크로 끝내는 더치페이',
    robots: { index: false, follow: false },
  }
}

export default async function SettlePage({ params }: Params) {
  const { slug } = await params
  const snap = await loadGroup(slug)
  if (!snap) notFound()

  const memberIds = snap.members.map((m) => m.id)
  const nameById = new Map(snap.members.map((m) => [m.id, m.name]))
  const net = netBalances(memberIds, snap.expenses, snap.settlements)
  const transfers = minimizeCashFlow(net)
  const total = snap.expenses.reduce((sum, e) => sum + e.amount, 0)
  const perPerson = memberIds.length > 0 ? Math.floor(total / memberIds.length) : 0

  return (
    <main className="flex min-h-dvh flex-col px-5 pb-8 pt-5">
      <Link
        href="/"
        className="-ml-1 inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
      >
        <IcoBack className="h-5 w-5" /> 새 정산
      </Link>

      {/* 히어로 */}
      <section className="mb-7 mt-5 text-center">
        <p className="text-sm text-neutral-400">
          총 <span className="num font-medium text-neutral-600 dark:text-neutral-300">{formatWon(total)}</span> ·{' '}
          {memberIds.length}명
        </p>
        <div className="num mt-1 text-4xl font-bold tracking-tight">
          1인당 {formatWon(perPerson)}
        </div>
      </section>

      <h2 className="mb-3 text-sm font-medium text-neutral-500">이렇게 보내면 끝나요</h2>
      {transfers.length === 0 ? (
        <p className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-10 text-center text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
          정산 끝! 주고받을 게 없어요 🎉
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {transfers.map((t, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-100 bg-white px-4 py-3.5 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="min-w-0">
                <div className="truncate text-[15px]">
                  <span className="font-semibold">{nameById.get(t.from) ?? '?'}</span>
                  <span className="mx-1.5 text-neutral-300">→</span>
                  <span className="font-semibold">{nameById.get(t.to) ?? '?'}</span>
                </div>
                <div className="num mt-0.5 text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {formatWon(t.amount)}
                </div>
              </div>
              <CopyButton value={String(t.amount)} label="금액 복사" />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-8">
        <ShareButton title={`${snap.group.name} 정산`} />
        <p className="mt-3 text-center text-xs text-neutral-400">
          로그인하면 이 정산을 내역에 저장할 수 있어요 (곧)
        </p>
      </div>
    </main>
  )
}
