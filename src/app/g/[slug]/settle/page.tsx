import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatWon } from '@/domain/money'
import { minimizeCashFlow, netBalances } from '@/domain/settle'
import { getGroupBySlug } from '@/server/queries'
import { CopyButton } from './_components/CopyButton'

// 한 요청 안에서 generateMetadata + 페이지가 같은 조회를 공유하도록 캐시
const loadGroup = cache(getGroupBySlug)

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const snap = await loadGroup(slug)
  return {
    title: snap ? `${snap.group.name} 정산` : '정산',
    description: '페이븐 — 링크로 끝내는 친구 정산',
    robots: { index: false, follow: false }, // 공유 페이지는 noindex
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 py-8">
      <header>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          ← 새 정산
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{snap.group.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          총 <span className="font-semibold text-neutral-700 dark:text-neutral-200">{formatWon(total)}</span> ·{' '}
          {memberIds.length}명 · 1인당 약 {formatWon(perPerson)}
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-600 dark:text-neutral-300">이렇게 보내면 끝나요</h2>
        {transfers.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 px-4 py-6 text-center text-neutral-500 dark:border-neutral-700">
            정산 끝! 주고받을 게 없어요 🎉
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {transfers.map((t, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-700"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm">
                    <span className="font-semibold">{nameById.get(t.from) ?? '?'}</span>
                    <span className="mx-1.5 text-neutral-400">→</span>
                    <span className="font-semibold">{nameById.get(t.to) ?? '?'}</span>
                  </div>
                  <div className="text-lg font-bold tabular-nums">{formatWon(t.amount)}</div>
                </div>
                <CopyButton value={String(t.amount)} label="금액 복사" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-auto text-center text-xs text-neutral-400">
        이 페이지 링크를 공유하면 친구도 정산 결과를 볼 수 있어요.
      </p>
    </main>
  )
}
