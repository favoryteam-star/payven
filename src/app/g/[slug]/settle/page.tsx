import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatWon } from '@/domain/money'
import { formatAccountNo } from '@/lib/account'
import { minimizeCashFlow, netBalances } from '@/domain/settle'
import { getGroupBySlug } from '@/server/queries'
import { ShareButton } from '@/components/ShareButton'
import { IcoBack, IcoCheck } from '@/components/icons'
import { CopyButton } from './_components/CopyButton'
import { TossButton } from './_components/TossButton'

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
  const memberById = new Map(snap.members.map((m) => [m.id, m]))
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
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-neutral-100 bg-neutral-50 px-6 py-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <span className="pv-pop flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white">
            <IcoCheck className="h-8 w-8" />
          </span>
          <div>
            <p className="text-lg font-bold tracking-tight">딱 맞췄어요</p>
            <p className="mt-1 text-sm text-neutral-500">더 보낼 것도, 받을 것도 없어요.</p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {transfers.map((t, i) => {
            const receiver = memberById.get(t.to)
            const hasAccount = !!(receiver?.bankName && receiver?.accountNo)
            return (
              <li
                key={i}
                className="flex flex-col gap-2.5 rounded-2xl border border-neutral-100 bg-white px-4 py-3.5 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex items-center justify-between gap-3">
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
                </div>

                {hasAccount && receiver && (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-800/60">
                    <div className="min-w-0 text-sm">
                      <div className="truncate">
                        <span className="text-neutral-500">{receiver.bankName}</span>{' '}
                        <span className="num">{formatAccountNo(receiver.bankName!, receiver.accountNo!)}</span>
                      </div>
                      {receiver.accountHolder && (
                        <div className="truncate text-xs text-neutral-400">
                          예금주 {receiver.accountHolder}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <CopyButton value={receiver.accountNo!} label="계좌 복사" />
                      <TossButton
                        bankName={receiver.bankName!}
                        accountNo={receiver.accountNo!}
                        amount={t.amount}
                      />
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-auto pt-8">
        <ShareButton title={`${snap.group.name} 정산`} />
        <p className="mt-3 text-center text-xs text-neutral-400">
          로그인하고 만든 정산은 내역에 자동 저장돼요
        </p>
      </div>
    </main>
  )
}
