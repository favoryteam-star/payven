import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatWon } from '@/domain/money'
import { formatMonthDay } from '@/lib/datetime'
import { minimizeCashFlow, netBalances } from '@/domain/settle'
import { getGroupBySlug } from '@/server/queries'
import { ShareButton } from '@/components/ShareButton'
import { IcoBack } from '@/components/icons'
import { SettleBoard } from './_components/SettleBoard'

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
  // '내 계좌만' 모델 — 계좌는 최대 한 명(보통 '나')에게만 붙음.
  const accountMember = snap.members.find((m) => m.bankName && m.accountNo) ?? null
  // 맥락: 누가 결제했는지 + 언제. 기본 이름은 제목으로 안 보여줌(빠른정산/항목별 정산).
  const payerIds = [...new Set(snap.expenses.map((e) => e.paidBy))]
  const payerLabel = payerIds.length === 1 ? displayName(payerIds[0]) : payerIds.length > 1 ? '여러 명' : null
  const dateLabel = formatMonthDay(snap.group.createdAt)
  const customName = ['빠른정산', '항목별 정산'].includes(snap.group.name) ? null : snap.group.name

  // 보드에 넘길 plain props(이름은 미리 displayName으로 해석). 컴포넌트는 필터·렌더만.
  const boardMembers = snap.members.map((m) => ({ id: m.id, name: displayName(m.id) }))
  const account = accountMember
    ? {
        bankName: accountMember.bankName!,
        accountNo: accountMember.accountNo!,
        holder: accountMember.accountHolder,
      }
    : null

  return (
    <main className="flex min-h-dvh flex-col px-5 pb-8 pt-5">
      <Link
        href="/"
        className="-ml-1 inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
      >
        <IcoBack className="h-5 w-5" /> 새 정산
      </Link>

      {/* 히어로(요약) */}
      <section className="mb-7 mt-5 text-center">
        {customName && (
          <p className="mb-1 text-base font-semibold tracking-tight">{customName}</p>
        )}
        <p className="text-sm text-neutral-400">
          총 <span className="num font-medium text-neutral-600 dark:text-neutral-300">{formatWon(total)}</span> ·{' '}
          {memberIds.length}명
        </p>
        <div className="num mt-1 text-4xl font-bold tracking-tight">1인당 {formatWon(perPerson)}</div>
        {(payerLabel || dateLabel) && (
          <p className="mt-2 text-sm text-neutral-400">
            {payerLabel && `${payerLabel}님이 결제`}
            {payerLabel && dateLabel && ' · '}
            {dateLabel}
          </p>
        )}
      </section>

      {/* 인터랙티브 보드(신원 선택 + 내 차례 + 보냈어요/완료/취소) */}
      <SettleBoard
        slug={slug}
        members={boardMembers}
        pending={transfers}
        done={snap.settledTransfers}
        account={account}
        accountMemberId={accountMember?.id ?? null}
      />

      <div className="mt-auto pt-8">
        <ShareButton title={`${snap.group.name} 정산`} />
        <p className="mt-3 text-center text-xs text-neutral-400">
          로그인하고 만든 정산은 내역에 자동 저장돼요
        </p>
      </div>
    </main>
  )
}
