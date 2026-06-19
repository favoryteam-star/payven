'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatWon } from '@/domain/money'
import { quickSettleAction } from '@/app/actions'
import { Numpad } from '@/components/Numpad'
import { IcoPlus } from '@/components/icons'
import { Wordmark } from '@/components/Logo'
import { ModeChips } from '@/components/ModeChips'
import { LoginSheet } from '@/components/LoginSheet'

export default function Home() {
  const router = useRouter()
  const [amount, setAmount] = useState(0)
  const [padOpen, setPadOpen] = useState(false)
  const [members, setMembers] = useState<string[]>(['나', ''])
  const [payerIndex, setPayerIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loginPrompt, setLoginPrompt] = useState(false)
  const [autoSubmit, setAutoSubmit] = useState(false)
  const [pending, startTransition] = useTransition()

  // 로그인 왕복 후 복귀(?resume=1) → 저장해둔 입력값 복원 + 자동 제출(두 번 안 누르게)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('resume') !== '1') return
    window.history.replaceState(null, '', '/')
    const raw = sessionStorage.getItem('payven:draft:quick')
    if (!raw) return
    sessionStorage.removeItem('payven:draft:quick')
    try {
      const d = JSON.parse(raw)
      if (typeof d.amount === 'number') setAmount(d.amount)
      if (Array.isArray(d.members)) setMembers(d.members)
      if (typeof d.payerIndex === 'number') setPayerIndex(d.payerIndex)
      setAutoSubmit(true)
    } catch {
      /* 손상된 draft 무시 */
    }
  }, [])

  // 복원된 입력값으로 자동 제출(이제 로그인 상태)
  useEffect(() => {
    if (!autoSubmit) return
    setAutoSubmit(false)
    submit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit])

  const goLogin = () => {
    sessionStorage.setItem('payven:draft:quick', JSON.stringify({ amount, members, payerIndex }))
    window.location.href = `/auth/login?provider=kakao&next=${encodeURIComponent('/?resume=1')}`
  }

  const filled = members.filter((m) => m.trim())
  const perPerson = amount > 0 && filled.length >= 1 ? Math.floor(amount / filled.length) : 0

  const setMember = (i: number, v: string) =>
    setMembers((p) => p.map((m, idx) => (idx === i ? v : m)))
  const addMember = () => setMembers((p) => [...p, ''])
  const removeMember = (i: number) => {
    setMembers((p) => (p.length <= 2 ? p : p.filter((_, idx) => idx !== i)))
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
        const res = await quickSettleAction({ amount, members: names, payerIndex: payerIdx })
        if ('needLogin' in res) {
          setLoginPrompt(true) // 로그인 안내 시트 → 카카오로 계속하기
          return
        }
        router.push(`/g/${res.slug}/settle`)
      } catch (e) {
        setError(e instanceof Error ? e.message : '문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
      }
    })
  }

  return (
    <main className="flex min-h-[calc(100dvh-5rem)] flex-col px-5 pt-6">
      <header className="mb-4">
        <h1>
          <Wordmark />
        </h1>
        <p className="mt-1.5 text-sm text-neutral-400">술값·밥값, 계산기 대신 1초 정산</p>
      </header>

      <ModeChips className="mb-6" />

      {/* 금액 — 탭하면 숫자패드 */}
      <button
        onClick={() => setPadOpen(true)}
        className="mb-6 w-full rounded-2xl border border-neutral-100 bg-neutral-50 px-5 py-5 text-left dark:border-neutral-800 dark:bg-neutral-900"
      >
        <span className="text-sm text-neutral-400">얼마 나왔어요?</span>
        <div className="num mt-1 text-4xl font-bold tracking-tight">
          {amount > 0 ? (
            formatWon(amount)
          ) : (
            <span className="text-neutral-300 dark:text-neutral-600">0원</span>
          )}
        </div>
      </button>

      {/* 참여자 */}
      <section className="mb-5">
        <p className="mb-2 text-sm font-medium text-neutral-500">누구랑 나눠요?</p>
        <div className="flex flex-col gap-2">
          {members.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={m}
                placeholder={i === 0 ? '나' : `친구 ${i}`}
                onChange={(e) => setMember(i, e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-transparent px-4 py-3 text-[15px] outline-none focus:border-brand dark:border-neutral-700"
              />
              {members.length > 2 && (
                <button
                  onClick={() => removeMember(i)}
                  aria-label="삭제"
                  className="shrink-0 px-2 text-neutral-300 hover:text-neutral-500"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addMember}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-brand"
        >
          <IcoPlus className="h-4 w-4" /> 사람 추가
        </button>
      </section>

      {/* 낸 사람 */}
      {filled.length >= 1 && (
        <section className="mb-5">
          <p className="mb-2 text-sm font-medium text-neutral-500">누가 냈어요?</p>
          <div className="flex flex-wrap gap-2">
            {members.map((m, i) =>
              m.trim() ? (
                <button
                  key={i}
                  onClick={() => setPayerIndex(i)}
                  className={
                    'rounded-full px-4 py-2 text-sm font-medium transition ' +
                    (payerIndex === i
                      ? 'bg-brand text-white'
                      : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300')
                  }
                >
                  {m.trim()}
                </button>
              ) : null,
            )}
          </div>
        </section>
      )}

      {perPerson > 0 && (
        <div className="rounded-2xl bg-brand-50 px-4 py-3 text-center dark:bg-brand-600/15">
          <span className="text-sm text-neutral-500">1인당 </span>
          <span className="num text-lg font-bold text-brand">{formatWon(perPerson)}</span>
        </div>
      )}

      {error && <p className="mt-3 text-center text-sm text-red-500">{error}</p>}

      <button
        onClick={submit}
        disabled={pending}
        className="mb-4 mt-auto w-full rounded-2xl bg-brand py-4 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? '정산 중…' : '정산하기'}
      </button>

      <Numpad open={padOpen} amount={amount} onChange={setAmount} onClose={() => setPadOpen(false)} />
      <LoginSheet open={loginPrompt} onClose={() => setLoginPrompt(false)} onKakao={goLogin} />
    </main>
  )
}
