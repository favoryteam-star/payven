'use client'

import { useEffect, useState, useTransition } from 'react'
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
  const storageKey = `payven:me:${slug}`
  const [meId, setMeId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // 신원은 localStorage에만(서버 모름). SSR/첫 페인트는 meId=null로 안정 → 하이드레이트 후 복원.
  useEffect(() => {
    try {
      setMeId(localStorage.getItem(storageKey))
    } catch {
      /* 스토리지 차단 — 신원 없이 동작 */
    }
  }, [storageKey])

  const me = members.find((m) => m.id === meId) ?? null // 저장된 id가 멤버에 없으면 무시
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? '?'

  const pick = (id: string | null) => {
    setError(null)
    setMeId(id)
    try {
      if (id) localStorage.setItem(storageKey, id)
      else localStorage.removeItem(storageKey)
    } catch {
      /* 무시 */
    }
  }

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

  // 내 관점 분해(개인화)
  const myOut = me ? pending.filter((t) => t.from === me.id) : []
  const myIn = me ? pending.filter((t) => t.to === me.id) : []
  const iReceived = me ? done.filter((d) => d.to === me.id) : []
  const inSum = myIn.reduce((s, t) => s + t.amount, 0)
  const receivedSum = iReceived.reduce((s, d) => s + d.amount, 0)

  // ── 조각들 ──────────────────────────────────────────────────────
  const identityPrompt = (
    <div className="mb-5 rounded-2xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 text-sm font-semibold">이 정산에서 당신은 누구예요?</p>
      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => pick(m.id)}
            className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium transition hover:border-brand hover:text-brand dark:border-neutral-700"
          >
            {m.name}
          </button>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-neutral-400">고르면 내가 보낼(받을) 것만 콕 집어 보여줘요</p>
    </div>
  )

  const identityBar = me && (
    <div className="mb-4 flex items-center justify-between">
      <p className="text-sm text-neutral-500">
        나: <span className="font-semibold text-neutral-800 dark:text-neutral-100">{me.name}</span>
      </p>
      <button
        type="button"
        onClick={() => pick(null)}
        className="text-xs text-neutral-400 underline-offset-2 hover:underline"
      >
        내가 아니에요
      </button>
    </div>
  )

  const checkCard = (
    <div className="mb-4 flex flex-col items-center gap-4 rounded-2xl border border-neutral-100 bg-neutral-50 px-6 py-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
      <span className="pv-pop flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white">
        <IcoCheck className="h-8 w-8" />
      </span>
      <div>
        <p className="text-lg font-bold tracking-tight">딱 맞췄어요</p>
        <p className="mt-1 text-sm text-neutral-500">더 보낼 것도, 받을 것도 없어요.</p>
      </div>
    </div>
  )

  // 내가 채무자: 보낼 송금 큰 카드(보통 1건) + 토스/복사 + 보냈어요
  const debtorHero = (
    <div className="mb-4 flex flex-col gap-4">
      {myOut.map((t, i) => {
        const toAcct = t.to === accountMemberId && account ? account : null
        return (
          <div
            key={i}
            className="rounded-3xl border border-brand/25 bg-brand/5 p-5 dark:border-brand/30 dark:bg-brand/10"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">내 차례</p>
            <p className="mt-2 text-[17px]">
              <span className="font-bold">{nameOf(t.to)}</span>님에게
            </p>
            <p className="num text-4xl font-extrabold tracking-tight">{formatWon(t.amount)}</p>
            <p className="mt-0.5 text-sm text-neutral-500">보내면 끝나요</p>

            {toAcct && (
              <div className="mt-3 rounded-2xl bg-white/70 px-4 py-3 dark:bg-neutral-900/50">
                <p className="num text-[15px] font-semibold tracking-tight">
                  <span className="text-neutral-500">{toAcct.bankName}</span>{' '}
                  {formatAccountNo(toAcct.bankName, toAcct.accountNo)}
                </p>
                {toAcct.holder && (
                  <p className="mt-0.5 text-xs text-neutral-400">예금주 {toAcct.holder}</p>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              {toAcct && (
                <div className="flex gap-2">
                  <CopyButton value={toAcct.accountNo} label="계좌 복사" />
                  <TossButton
                    bankName={toAcct.bankName}
                    accountNo={toAcct.accountNo}
                    amount={t.amount}
                  />
                </div>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => markSent(t)}
                className="w-full rounded-2xl bg-brand py-3.5 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
              >
                {busy ? '기록 중…' : '보냈어요'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )

  // 내가 받는 사람: 받을 합계 + 누가 보냈는지(대기/받음)
  const creditorHero = (
    <div className="mb-4 rounded-3xl border border-brand/25 bg-brand/5 p-5 dark:border-brand/30 dark:bg-brand/10">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">받을 차례</p>
      <p className="num mt-2 text-4xl font-extrabold tracking-tight">{formatWon(inSum)}</p>
      <p className="mt-0.5 text-sm text-neutral-500">
        받을 금액{receivedSum > 0 ? ` · ${formatWon(receivedSum)} 받음` : ''}
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {myIn.map((t, i) => (
          <li key={`p${i}`} className="flex items-center justify-between text-sm">
            <span className="font-medium">{nameOf(t.from)}</span>
            <span className="num text-neutral-500">{formatWon(t.amount)} · 대기</span>
          </li>
        ))}
        {iReceived.map((d) => (
          <li key={d.id} className="flex items-center justify-between text-sm text-neutral-400">
            <span>{nameOf(d.from)}</span>
            <span className="num">{formatWon(d.amount)} · 받음 ✓</span>
          </li>
        ))}
      </ul>
    </div>
  )

  const nothingHero = me && (
    <div className="mb-4 rounded-2xl border border-neutral-100 bg-neutral-50 p-5 text-center dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-[15px] font-semibold">정산할 게 없어요</p>
      <p className="mt-1 text-sm text-neutral-500">{me.name}님은 보낼 것도 받을 것도 없어요.</p>
    </div>
  )

  const hero = myOut.length > 0 ? debtorHero : myIn.length > 0 ? creditorHero : nothingHero

  // 전체 보기: 받는 계좌 배너 + 남은 송금 + 보낸 송금(취소)
  const fullList = (
    <>
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
                      <TossButton
                        bankName={toAcct.bankName}
                        accountNo={toAcct.accountNo}
                        amount={t.amount}
                      />
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
    </>
  )

  return (
    <div>
      {me ? identityBar : !allSettled && identityPrompt}

      {allSettled && checkCard}
      {me && !allSettled && hero}

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {me && !allSettled ? (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-sm font-medium text-neutral-400 underline-offset-2 hover:underline"
          >
            {showAll ? '전체 닫기' : '전체 보기'}
          </button>
          {showAll && <div className="mt-3">{fullList}</div>}
        </div>
      ) : (
        fullList
      )}
    </div>
  )
}
