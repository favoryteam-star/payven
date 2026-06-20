import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatWon } from '@/domain/money'
import { formatAccountNo } from '@/lib/account'
import { formatMonthDay } from '@/lib/datetime'
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
  const memberById = new Map(snap.members.map((m) => [m.id, m]))
  // 공유 페이지는 친구가 읽음 — 받는 사람은 예금주 실명으로 보여줌(멤버명이 '나'여도 누군지 명확).
  const displayName = (id: string) => {
    const m = memberById.get(id)
    return m?.accountHolder || m?.name || '?'
  }
  const net = netBalances(memberIds, snap.expenses, snap.settlements)
  const transfers = minimizeCashFlow(net)
  const total = snap.expenses.reduce((sum, e) => sum + e.amount, 0)
  const perPerson = memberIds.length > 0 ? Math.floor(total / memberIds.length) : 0
  // '내 계좌만' 모델 — 계좌는 최대 한 명(보통 '나')에게만 붙음. 받는 사람으로 등장하면 위에 한 번만 표시.
  const accountMember = snap.members.find((m) => m.bankName && m.accountNo) ?? null
  const showAccount = !!accountMember && transfers.some((t) => t.to === accountMember.id)
  // 맥락: 누가 결제했는지 + 언제. 기본 이름은 제목으로 안 보여줌(빠른정산/항목별 정산).
  const payerIds = [...new Set(snap.expenses.map((e) => e.paidBy))]
  const payerLabel = payerIds.length === 1 ? displayName(payerIds[0]) : payerIds.length > 1 ? '여러 명' : null
  const dateLabel = formatMonthDay(snap.group.createdAt)
  const customName = ['빠른정산', '항목별 정산'].includes(snap.group.name) ? null : snap.group.name

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
        {customName && (
          <p className="mb-1 text-base font-semibold tracking-tight">{customName}</p>
        )}
        <p className="text-sm text-neutral-400">
          총 <span className="num font-medium text-neutral-600 dark:text-neutral-300">{formatWon(total)}</span> ·{' '}
          {memberIds.length}명
        </p>
        <div className="num mt-1 text-4xl font-bold tracking-tight">
          1인당 {formatWon(perPerson)}
        </div>
        {(payerLabel || dateLabel) && (
          <p className="mt-2 text-sm text-neutral-400">
            {payerLabel && `${payerLabel}님이 결제`}
            {payerLabel && dateLabel && ' · '}
            {dateLabel}
          </p>
        )}
      </section>

      {showAccount && accountMember && (
        <div className="mb-5 rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3.5 dark:border-brand/25 dark:bg-brand/10">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-brand">받는 계좌</p>
              <p className="num mt-1 text-[15px] font-semibold tracking-tight">
                <span className="text-neutral-500">{accountMember.bankName}</span>{' '}
                {formatAccountNo(accountMember.bankName!, accountMember.accountNo!)}
              </p>
              {accountMember.accountHolder && (
                <p className="mt-0.5 text-xs text-neutral-400">예금주 {accountMember.accountHolder}</p>
              )}
            </div>
            <CopyButton value={accountMember.accountNo!} label="계좌 복사" />
          </div>
        </div>
      )}

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
            const toAccount = !!accountMember && t.to === accountMember.id
            return (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-100 bg-white px-4 py-3.5 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="min-w-0">
                  <div className="truncate text-[15px]">
                    <span className="font-semibold">{displayName(t.from)}</span>
                    <span className="mx-1.5 text-neutral-300">→</span>
                    <span className="font-semibold">{displayName(t.to)}</span>
                  </div>
                  <div className="num mt-0.5 text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {formatWon(t.amount)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <CopyButton value={String(t.amount)} label="금액 복사" />
                  {toAccount && accountMember && (
                    <TossButton
                      bankName={accountMember.bankName!}
                      accountNo={accountMember.accountNo!}
                      amount={t.amount}
                    />
                  )}
                </div>
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
