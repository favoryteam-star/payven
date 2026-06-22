import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/server/auth'
import { getEditableGroup } from '@/server/queries'
import { SettleForm } from '@/components/SettleForm'

// 사적 화면(로그인+소유자) — 색인 금지.
export const metadata: Metadata = { robots: { index: false, follow: false } }

type Params = { params: Promise<{ slug: string }> }

// 정산 수정 = 만들기 폼(SettleForm)을 기존 값으로 시드. 서버에서 소유자 게이트 후 프리필 전달.
export default async function EditSettlePage({ params }: Params) {
  const { slug } = await params

  const user = await getAuthUser()
  // 어떤 provider로 로그인했는지 모르니 선택 페이지로(강제하면 다른 계정 → 소유자 게이트 막힘).
  if (!user) redirect(`/auth?next=${encodeURIComponent(`/g/${slug}/edit`)}`)

  const g = await getEditableGroup(slug)
  if (!g) notFound()
  // 소유자만 수정. 남의 정산이거나 owner 없는(무로그인 생성) 정산은 보기 화면으로 보냄.
  if (g.ownerId !== user.id) redirect(`/g/${slug}/settle`)

  return (
    <SettleForm
      initial={{
        editSlug: g.slug,
        mode: g.mode,
        title: g.name,
        members: g.members,
        payerIndex: g.payerIndex,
        amount: g.amount,
        winnerIndex: g.winnerIndex,
        rounds: g.rounds,
        eventDate: g.eventDate,
        account: g.account,
        hasSettlements: g.hasSettlements,
      }}
    />
  )
}
