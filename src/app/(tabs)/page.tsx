'use client'

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatWon } from '@/domain/money'
import { quickSettleAction } from '@/app/actions'
import { Numpad } from '@/components/Numpad'
import { IcoPlus } from '@/components/icons'
import { Wordmark } from '@/components/Logo'
import { ModeChips } from '@/components/ModeChips'
import { LoginSheet } from '@/components/LoginSheet'
import { AccountField, EMPTY_INLINE, resolveAccount, useMyAccounts, type InlineAcct } from '@/components/AccountSelect'

export default function Home() {
  const router = useRouter()
  const [amount, setAmount] = useState(0)
  const [padOpen, setPadOpen] = useState(false)
  const [members, setMembers] = useState<string[]>(['나', ''])
  const [payerIndex, setPayerIndex] = useState(0)
  // 반올림 단위(1=안 함) + 남는 금액 받을 사람(members 인덱스, null=미선택). 단위 바꾸면 다시 고르게.
  const [unit, setUnit] = useState(1)
  const [absorberIndex, setAbsorberIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loginPrompt, setLoginPrompt] = useState(false)
  const [autoSubmit, setAutoSubmit] = useState(false)
  const [pending, startTransition] = useTransition()

  // 멤버 입력에서 엔터 → 다음 칸으로(마지막이면 자동 추가). focusMember가 set되면 해당 칸에 포커스.
  const memberRefs = useRef<(HTMLInputElement | null)[]>([])
  const [focusMember, setFocusMember] = useState<number | null>(null)

  // 받을 계좌. null=로딩. 저장계좌 있으면 칩(accountId), 없으면 인라인 입력(acct). undefined=미선택(기본 자동).
  const accounts = useMyAccounts()
  const [accountId, setAccountId] = useState<string | undefined>(undefined)
  const [acct, setAcct] = useState<InlineAcct>(EMPTY_INLINE)
  const accountChipValue =
    accountId === undefined
      ? (accounts?.find((a) => a.isDefault)?.id ?? accounts?.[0]?.id ?? '')
      : accountId

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
      if (typeof d.unit === 'number') setUnit(d.unit)
      if (typeof d.absorberIndex === 'number') setAbsorberIndex(d.absorberIndex)
      if (d.acct && typeof d.acct === 'object') setAcct(d.acct)
      setAutoSubmit(true)
    } catch {
      /* 손상된 draft 무시 */
    }
  }, [])

  // 복원된 입력값으로 자동 제출(이제 로그인 상태). 계좌 로딩 완료 후 제출 → 기본 계좌 자동 첨부.
  useEffect(() => {
    if (!autoSubmit) return
    if (accounts === null) return
    setAutoSubmit(false)
    submit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit, accounts])

  // 엔터로 추가/이동 후 해당 멤버 입력에 포커스
  useEffect(() => {
    if (focusMember === null) return
    memberRefs.current[focusMember]?.focus()
    setFocusMember(null)
  }, [focusMember])

  const goLogin = () => {
    sessionStorage.setItem(
      'payven:draft:quick',
      JSON.stringify({ amount, members, payerIndex, unit, absorberIndex, acct }),
    )
    window.location.href = `/auth/login?provider=kakao&next=${encodeURIComponent('/?resume=1')}`
  }

  const filled = members.filter((m) => m.trim())
  const perPerson = amount > 0 && filled.length >= 1 ? Math.floor(amount / filled.length) : 0
  // 단위 반올림 미리보기(균등이라 base는 전원 동일). 남는 금액(leftover)은 고른 사람이 흡수.
  const roundBase = unit > 1 && perPerson > 0 ? Math.floor(amount / (filled.length * unit)) * unit : 0
  const leftover = unit > 1 && perPerson > 0 ? amount - roundBase * filled.length : 0

  const setMember = (i: number, v: string) =>
    setMembers((p) => p.map((m, idx) => (idx === i ? v : m)))
  const addMember = () => setMembers((p) => [...p, ''])
  const removeMember = (i: number) => {
    setMembers((p) => (p.length <= 2 ? p : p.filter((_, idx) => idx !== i)))
    setPayerIndex((p) => (p === i ? 0 : p > i ? p - 1 : p))
  }
  // 엔터 → 빈 칸이면 무시, 마지막 칸이면 새 사람 추가, 그다음 칸으로 포커스 이동
  const onMemberKeyDown = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (!members[i].trim()) return
    if (i === members.length - 1) addMember()
    setFocusMember(i + 1)
  }

  function submit() {
    setError(null)
    const trimmed = members.map((m) => m.trim())
    const names = trimmed.filter(Boolean)
    if (amount <= 0) return setError('금액을 입력해 주세요')
    if (names.length < 2) return setError('최소 2명이 필요해요')
    const payerName = trimmed[payerIndex] || names[0]
    const payerIdx = Math.max(0, names.indexOf(payerName))
    // 단위 반올림 시 남는 금액이 있으면 받을 사람을 골라야(매번 직접 선택). absorberIndex는 names 기준으로 변환.
    const base = unit > 1 ? Math.floor(amount / (names.length * unit)) * unit : 0
    const left = unit > 1 ? amount - base * names.length : 0
    let absorberIdx: number | undefined
    if (left > 0) {
      if (absorberIndex === null) return setError('남은 금액 받을 사람을 골라주세요')
      const absName = trimmed[absorberIndex]
      const pos = absName ? names.indexOf(absName) : -1
      if (pos < 0) return setError('남은 금액 받을 사람을 다시 골라주세요')
      absorberIdx = pos
    }
    const resolved = resolveAccount(accounts, accountId, acct)
    if (resolved.error) return setError(resolved.error)
    startTransition(async () => {
      try {
        const res = await quickSettleAction({
          amount,
          members: names,
          payerIndex: payerIdx,
          unit,
          absorberIndex: absorberIdx,
          account: resolved.account,
          saveAccount: resolved.saveAccount,
        })
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
                ref={(el) => {
                  memberRefs.current[i] = el
                }}
                value={m}
                placeholder={i === 0 ? '나' : `친구 ${i}`}
                onChange={(e) => setMember(i, e.target.value)}
                onKeyDown={(e) => onMemberKeyDown(e, i)}
                enterKeyHint="next"
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

      {/* 금액 단위로 맞추기(선택) — 친구들이 3,333 대신 3,300 같은 깔끔한 금액을 보내게. 남는 건 고른 사람이. */}
      {perPerson > 0 && (
        <section className="mb-5">
          <p className="mb-2 text-sm font-medium text-neutral-500">
            금액 단위로 맞추기 <span className="font-normal text-neutral-400">(선택)</span>
          </p>
          <div className="flex gap-2">
            {[1, 10, 100, 1000].map((u) => (
              <button
                key={u}
                onClick={() => {
                  setUnit(u)
                  setAbsorberIndex(null)
                  setError(null)
                }}
                className={
                  'flex-1 rounded-xl py-2.5 text-sm font-medium transition ' +
                  (unit === u
                    ? 'bg-brand text-white'
                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300')
                }
              >
                {u === 1 ? '안 함' : u === 1000 ? '천원' : `${u}원`}
              </button>
            ))}
          </div>

          {unit > 1 &&
            (leftover > 0 ? (
              <div className="mt-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  각자 <span className="num font-semibold text-brand">{formatWon(roundBase)}</span> · 남은{' '}
                  <span className="num font-semibold">{formatWon(leftover)}</span> 누가 낼까요?
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {members.map((m, i) =>
                    m.trim() ? (
                      <button
                        key={i}
                        onClick={() => {
                          setAbsorberIndex(i)
                          setError(null)
                        }}
                        className={
                          'rounded-full px-4 py-2 text-sm font-medium transition ' +
                          (absorberIndex === i
                            ? 'bg-brand text-white'
                            : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300')
                        }
                      >
                        {m.trim()}
                      </button>
                    ) : null,
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-neutral-400">
                딱 떨어져요 — 각자 {formatWon(roundBase)}씩.
              </p>
            ))}
        </section>
      )}

      {/* 받을 계좌. 저장계좌 있으면 칩, 없으면 인라인 입력(선택). 정산 결과에서 친구들이 이 계좌로 보냄. */}
      {accounts !== null && (
        <section className="mb-5">
          <p className="mb-2 text-sm font-medium text-neutral-500">
            어디로 받을까요? <span className="font-normal text-neutral-400">(선택)</span>
          </p>
          <AccountField
            accounts={accounts}
            accountId={accountChipValue}
            onSelect={setAccountId}
            inline={acct}
            onInline={setAcct}
          />
          {accounts.length === 0 && (
            <p className="mt-1.5 text-xs text-neutral-400">
              입력하면 정산에 표시되고, 다음부턴 자동으로 채워져요. 비워두면 계좌 없이 정산돼요.
            </p>
          )}
        </section>
      )}

      {perPerson > 0 && unit === 1 && (
        <div className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-center dark:bg-brand-600/15">
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
