import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { formatWon } from '@/domain/money'
import { formatMonthDay } from '@/lib/datetime'
import { minimizeCashFlow, netBalances } from '@/domain/settle'
import { getGroupBySlug } from '@/server/queries'
import { getAuthUser } from '@/server/auth'
import { resolveDisplayNames } from '@/lib/displayNames'
import { ShareButton } from '@/components/ShareButton'
import { SettleBoard } from './_components/SettleBoard'
import { SettleDetails } from './_components/SettleDetails'
import { SettleBackLink } from './_components/SettleBackLink'

const loadGroup = cache(getGroupBySlug)

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const snap = await loadGroup(slug)
  if (!snap) return { title: '정산', robots: { index: false, follow: false } }

  // 기본 모드명('빠른정산'/'항목별 정산')이면 제목에 ' 정산'을 안 붙임(중복 "빠른정산 정산" 방지).
  const customName = ['빠른정산', '항목별 정산'].includes(snap.group.name) ? null : snap.group.name
  const title = customName ? `${customName} 정산` : snap.group.name
  // 설명 = 맥락 한 줄: "{낸 사람}님이 결제 · 총 N원 · N명". 받는 사람은 예금주 실명 우선(동명은 구분자).
  const metaNames = resolveDisplayNames(snap.members)
  const dispName = (id: string) => metaNames.get(id) ?? '?'
  const total = snap.expenses.reduce((sum, e) => sum + e.amount, 0)
  const payerIds = [...new Set(snap.expenses.map((e) => e.paidBy))]
  const payerText =
    payerIds.length === 1 ? `${dispName(payerIds[0])}님이 결제` : payerIds.length > 1 ? '여러 명이 결제' : null
  const description = `${payerText ? payerText + ' · ' : ''}총 ${formatWon(total)} · ${snap.members.length}명`

  return {
    title,
    description,
    robots: { index: false, follow: false },
    // openGraph는 부모(layout) 것을 통째로 덮으므로 image·siteName까지 여기서 다시 명시.
    openGraph: {
      title,
      description,
      siteName: '페이븐',
      type: 'website',
      locale: 'ko_KR',
      images: ['/og.png'],
    },
  }
}

export default async function SettlePage({ params }: Params) {
  const { slug } = await params
  const snap = await loadGroup(slug)
  if (!snap) notFound()

  // 전체 관리(누구의 보냈어요/취소든)는 '정산을 연 사람'만 — 로그인 + owner_id 일치로 확인.
  // 친구(링크 공유받은 사람)는 신원만 고르고 자기 것만 관리. owner 없는 옛 정산은 막을 대상이 없어 누구나(현행).
  const user = await getAuthUser()
  const canManageAll = !snap.group.ownerId || (!!user && user.id === snap.group.ownerId)

  const memberIds = snap.members.map((m) => m.id)
  // 공유 페이지는 친구가 읽음 — 받는 사람은 예금주 실명으로 보여줌(멤버명이 '나'여도 누군지 명확, ADR-015).
  // 단, 예금주명이 다른 멤버의 멤버명과 같으면 '나희진 → 나희진' 자기송금처럼 보임 → 동명일 때만 구분자(lib/displayNames).
  const nameMap = resolveDisplayNames(snap.members)
  const displayName = (id: string) => nameMap.get(id) ?? '?'
  const net = netBalances(memberIds, snap.expenses, snap.settlements)
  const transfers = minimizeCashFlow(net)
  const total = snap.expenses.reduce((sum, e) => sum + e.amount, 0)
  // '내 계좌만' 모델 — 계좌는 최대 한 명(보통 '나')에게만 붙음.
  const accountMember = snap.members.find((m) => m.bankName && m.accountNo) ?? null
  // 맥락: 누가 결제했는지 + 언제. 기본 이름은 제목으로 안 보여줌(빠른정산/항목별 정산).
  const payerIds = [...new Set(snap.expenses.map((e) => e.paidBy))]
  // 결제자 맥락 문구. 1명이면 "{실명}님이 결제", 여러 명(1차·2차 등 항목별 다른 결제자)이면 "여러 명이 결제".
  const payerText =
    payerIds.length === 1
      ? `${displayName(payerIds[0])}님이 결제`
      : payerIds.length > 1
        ? '여러 명이 결제'
        : null
  // 사용자가 고른 정산 날짜(있으면) → 없으면 생성 시각으로 폴백. formatMonthDay는 'YYYY-MM-DD'도 처리.
  const dateLabel = formatMonthDay(snap.group.eventDate ?? snap.group.createdAt)
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

  // 상세보기(항목별만): 차수→메뉴→참여자 이름을 displayName(예금주 실명 우선)으로 해석한 plain props.
  const detailRounds = snap.rounds.map((r) => ({
    payerName: displayName(r.payer),
    items: r.items.map((it) => ({
      name: it.description,
      amount: it.amount,
      qty: it.quantity,
      participants: it.participants.map((p) => ({ name: displayName(p.id), amount: p.amount })),
    })),
  }))
  const showDetails = snap.isItemized && detailRounds.length > 0

  // 단위 맞춤 '남은 금액'을 떠안은 흡수자(저장된 leftover/absorber_index → 멤버). 없으면 null.
  const absorber = snap.absorber ? { name: displayName(snap.absorber.memberId), extra: snap.absorber.extra } : null

  return (
    <main className="flex min-h-dvh flex-col px-5 pb-8 pt-5">
      <SettleBackLink />

      {/* 히어로(요약) — 1인당은 표시 안 함(반올림·흡수자로 사람마다 다를 수 있어 오해 소지). */}
      <section className="mb-7 mt-5 text-center">
        {/* 제목 있으면 제목이 히어로(총액은 요약 줄로), 없으면 총액이 히어로 */}
        {customName ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight">{customName}</h1>
            <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
              총 <span className="num font-medium text-neutral-600 dark:text-neutral-300">{formatWon(total)}</span> ·{' '}
              {memberIds.length}명
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{memberIds.length}명</p>
            <h1 className="num mt-1 text-4xl font-bold tracking-tight">총 {formatWon(total)}</h1>
          </>
        )}
        {(payerText || dateLabel) && (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {payerText}
            {payerText && dateLabel && ' · '}
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
        canManageAll={canManageAll}
      />

      {showDetails && <SettleDetails rounds={detailRounds} absorber={absorber} />}

      <div className="mt-auto pt-8">
        <ShareButton title={`${snap.group.name} 정산`} />
        <p className="mt-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
          로그인하고 만든 정산은 내역에 자동 저장돼요
        </p>
      </div>
    </main>
  )
}
