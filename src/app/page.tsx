'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatWon } from '@/domain/money'
import { quickSettleAction } from './actions'

export default function Home() {
  const router = useRouter()
  const [amountStr, setAmountStr] = useState('')
  const [members, setMembers] = useState<string[]>(['나', ''])
  const [payerIndex, setPayerIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const amount = Number(amountStr.replace(/[^\d]/g, '')) || 0
  const filled = members.filter((m) => m.trim())
  const perPerson = amount > 0 && filled.length >= 1 ? Math.floor(amount / filled.length) : 0

  function setMember(i: number, v: string) {
    setMembers((prev) => prev.map((m, idx) => (idx === i ? v : m)))
  }
  function addMember() {
    setMembers((prev) => [...prev, ''])
  }
  function removeMember(i: number) {
    setMembers((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)))
    setPayerIndex((p) => (p === i ? 0 : p > i ? p - 1 : p))
  }

  function submit() {
    setError(null)
    const trimmed = members.map((m) => m.trim())
    const names = trimmed.filter(Boolean)
    if (amount <= 0) return setError('금액을 입력해 주세요')
    if (names.length < 2) return setError('최소 2명이 필요해요')
    const payerName = trimmed[payerIndex] || names[0]
    const payerIdx = Math.max(0, names.indexOf(payerName))

    startTransition(async () => {
      try {
        const { slug } = await quickSettleAction({ amount, members: names, payerIndex: payerIdx })
        router.push(`/g/${slug}/settle`)
      } catch (e) {
        setError(e instanceof Error ? e.message : '문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
      }
    })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 py-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">페이븐</h1>
        <p className="mt-1 text-sm text-neutral-500">방금 먹은 거, 1초 정산</p>
      </header>

      {/* 금액 */}
      <section>
        <label htmlFor="amount" className="mb-1 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
          얼마 나왔어요?
        </label>
        <div className="flex items-baseline gap-1">
          <input
            id="amount"
            inputMode="numeric"
            placeholder="0"
            value={amountStr ? Number(amountStr.replace(/[^\d]/g, '')).toLocaleString('ko-KR') : ''}
            onChange={(e) => setAmountStr(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-transparent px-4 py-3 text-right text-3xl font-bold tabular-nums outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
          />
          <span className="text-xl font-semibold text-neutral-400">원</span>
        </div>
      </section>

      {/* 참여자 */}
      <section>
        <span className="mb-2 block text-sm font-medium text-neutral-600 dark:text-neutral-300">누가 같이 먹었어요?</span>
        <div className="flex flex-col gap-2">
          {members.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={m}
                placeholder={i === 0 ? '나' : `친구 ${i}`}
                onChange={(e) => setMember(i, e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-transparent px-4 py-2.5 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
              />
              {members.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeMember(i)}
                  aria-label={`${m || `${i}번`} 삭제`}
                  className="shrink-0 rounded-lg px-2 py-2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addMember}
          className="mt-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          + 사람 추가
        </button>
      </section>

      {/* 낸 사람 */}
      {filled.length >= 1 && (
        <section>
          <span className="mb-2 block text-sm font-medium text-neutral-600 dark:text-neutral-300">누가 냈어요?</span>
          <div className="flex flex-wrap gap-2">
            {members.map((m, i) =>
              m.trim() ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPayerIndex(i)}
                  className={
                    'rounded-full border px-4 py-2 text-sm font-medium transition ' +
                    (payerIndex === i
                      ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                      : 'border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300')
                  }
                >
                  {m.trim()}
                </button>
              ) : null,
            )}
          </div>
        </section>
      )}

      {/* 미리보기 */}
      {perPerson > 0 && (
        <p className="text-center text-sm text-neutral-500">
          1인당 약 <span className="font-semibold text-neutral-900 dark:text-neutral-100">{formatWon(perPerson)}</span>
        </p>
      )}

      {error && <p className="text-center text-sm text-red-500">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-auto rounded-xl bg-neutral-900 py-4 text-base font-semibold text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? '정산 중…' : '정산하기'}
      </button>
    </main>
  )
}
