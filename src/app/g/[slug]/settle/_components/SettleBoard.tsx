'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatWon } from '@/domain/money'
import { formatAccountNo } from '@/lib/account'
import { markSentAction, undoSettlementAction } from '@/app/actions'
import { IcoCheck } from '@/components/icons'
import { CopyButton } from './CopyButton'
import { TossButton } from './TossButton'

// page가 계산한 plain props만 받는다(컴포넌트 안에서 settle/잔액 재계산 금지 — CLAUDE.md).
type Member = { id: string; name: string } // name = 표시 이름(예금주 실명 우선)
type Pending = { from: string; to: string; amount: number }
type Done = { id: string; from: string; to: string; amount: number }
type Account = { bankName: string; accountNo: string; holder: string | null }

/** 받는 계좌 카드(받는 사람으로 등장할 때만 표시 — 내 계좌 오노출 방지). */
function AccountCard({ account }: { account: Account }) {
  return (
    <div className="rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3.5 dark:border-brand/25 dark:bg-brand/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-brand">받는 계좌</p>
          <p className="num mt-1 text-[15px] font-semibold tracking-tight">
            <span className="text-neutral-500">{account.bankName}</span>{' '}
            {formatAccountNo(account.bankName, account.accountNo)}
          </p>
          {account.holder && (
            <p className="mt-0.5 text-xs text-neutral-400">예금주 {account.holder}</p>
          )}
        </div>
        <CopyButton value={account.accountNo} label="계좌 복사" />
      </div>
    </div>
  )
}

// 공유 정산 페이지 보드. 링크를 받은 누구나 전체 현황을 보고 보냈어요/취소(공유 정산이라 협업 — 사용자 결정).
// 신원 선택('내가 콕')·개인화는 없앰: 링크 받으면 사진처럼 바로 버튼 있는 관리 보드를 본다.
// 안전: 서버 net 가드(recordSettlement)가 과다기록·역방향을 차단하므로 누가 눌러도 계산은 안전.
export function SettleBoard({
  slug,
  members,
  pending,
  done,
  account,
  accountMemberId,
}: {
  slug: string
  members: Member[]
  pending: Pending[]
  done: Done[]
  account: Account | null
  accountMemberId: string | null
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? '?'

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fn()
        if (!res.ok) {
          setError(res.error ?? '문제가 생겼어요')
          return
        }
        router.refresh() // 서버 재실행 → pending/done 새로 계산되어 props 갱신
      } catch (e) {
        setError(e instanceof Error ? e.message : '문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
      }
    })
  }

  const markSent = (t: Pending) =>
    run(() => markSentAction({ slug, from: t.from, to: t.to, amount: t.amount }))
  const undo = (d: Done) => run(() => undoSettlementAction({ slug, settlementId: d.id }))

  const allSettled = pending.length === 0
  const accountIsReceiver = !!accountMemberId && pending.some((t) => t.to === accountMemberId)

  return (
    <div>
      <p className="mb-3 text-xs text-neutral-400">받은 송금을 표시하거나 되돌릴 수 있어요</p>

      {allSettled && (
        <div className="mb-4 flex flex-col items-center gap-4 rounded-2xl border border-neutral-100 bg-neutral-50 px-6 py-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <span className="pv-pop flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white">
            <IcoCheck className="h-8 w-8" />
          </span>
          <div>
            <p className="text-lg font-bold tracking-tight">딱 맞췄어요</p>
            <p className="mt-1 text-sm text-neutral-500">더 보낼 것도, 받을 것도 없어요.</p>
          </div>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {accountIsReceiver && account && (
        <div className="mb-4">
          <AccountCard account={account} />
        </div>
      )}

      {!allSettled && (
        <>
          <h2 className="mb-3 text-sm font-medium text-neutral-500">이렇게 보내면 끝나요</h2>
          <ul className="flex flex-col gap-2">
            {pending.map((t, i) => {
              const toAcct = t.to === accountMemberId && account ? account : null
              return (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-100 bg-white px-4 py-3.5 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[15px]">
                      <span className="font-semibold">{nameOf(t.from)}</span>
                      <span className="mx-1.5 text-neutral-300">→</span>
                      <span className="font-semibold">{nameOf(t.to)}</span>
                    </div>
                    <div className="num mt-0.5 text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {formatWon(t.amount)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {toAcct && (
                      <TossButton bankName={toAcct.bankName} accountNo={toAcct.accountNo} amount={t.amount} />
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => markSent(t)}
                      className="shrink-0 rounded-lg border border-brand/30 px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-brand/5 disabled:opacity-50"
                    >
                      보냈어요
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {done.length > 0 && (
        <div className="mt-5">
          <h2 className="mb-3 text-sm font-medium text-neutral-500">보낸 송금 ✓</h2>
          <ul className="flex flex-col gap-2">
            {done.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-100 bg-neutral-50/60 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/50"
              >
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{nameOf(d.from)}</span>
                  <span className="mx-1.5 text-neutral-300">→</span>
                  <span className="font-medium">{nameOf(d.to)}</span>
                  <span className="num ml-2 text-neutral-500">{formatWon(d.amount)}</span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => undo(d)}
                  className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  취소
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
