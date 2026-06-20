'use client'

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatWon } from '@/domain/money'
import { equalSplit } from '@/domain/settle'
import { addItemizedBillAction } from '@/app/actions'
import { Numpad } from '@/components/Numpad'
import { IcoPlus } from '@/components/icons'
import { ModeChips } from '@/components/ModeChips'
import { LoginSheet } from '@/components/LoginSheet'
import { AccountField, EMPTY_INLINE, resolveAccount, useMyAccounts, type InlineAcct } from '@/components/AccountSelect'

// 항목(메뉴) 1개. among = 멤버 배열과 같은 길이의 참여 여부(기본 전원).
type Item = { name: string; amount: number; among: boolean[] }

export default function ItemizedPage() {
  const router = useRouter()
  const [members, setMembers] = useState<string[]>(['나', ''])
  const [payerIndex, setPayerIndex] = useState(0)
  // 반올림 단위(1=안 함) + 남는 금액 받을 사람(원본 members 인덱스, null=미선택). 항목마다 적용.
  const [unit, setUnit] = useState(1)
  const [absorberIndex, setAbsorberIndex] = useState<number | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [padItem, setPadItem] = useState<number | null>(null)
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

  // 로그인 왕복 후 복귀 → 저장해둔 입력값 복원 + 자동 제출(두 번 안 누르게).
  // ?resume=1은 OAuth 리다이렉트에서 사라질 수 있어 신뢰 못 함 → sessionStorage draft 존재로 복원.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('resume') === '1') window.history.replaceState(null, '', '/items')
    const raw = sessionStorage.getItem('payven:draft:items')
    if (!raw) return
    sessionStorage.removeItem('payven:draft:items')
    try {
      const d = JSON.parse(raw)
      if (Array.isArray(d.members)) setMembers(d.members)
      if (typeof d.payerIndex === 'number') setPayerIndex(d.payerIndex)
      if (typeof d.unit === 'number') setUnit(d.unit)
      if (typeof d.absorberIndex === 'number') setAbsorberIndex(d.absorberIndex)
      if (Array.isArray(d.items)) setItems(d.items)
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
      'payven:draft:items',
      JSON.stringify({ members, payerIndex, unit, absorberIndex, items, acct }),
    )
    window.location.href = `/auth/login?provider=kakao&next=${encodeURIComponent('/items?resume=1')}`
  }

  // 이름이 채워진 멤버의 원본 인덱스 목록
  const filledIdx = members.map((n, i) => (n.trim() ? i : -1)).filter((i) => i >= 0)
  const total = items.reduce((s, it) => s + (it.amount > 0 ? it.amount : 0), 0)
  // 결제자가 비워졌거나 범위를 벗어나면 첫 채워진 멤버로 — 표시·계산·제출의 단일 출처(타이밍 무관 일치)
  const effectivePayer = filledIdx.includes(payerIndex) ? payerIndex : (filledIdx[0] ?? 0)

  // ── 멤버 ──
  const setMemberName = (i: number, v: string) =>
    setMembers((p) => p.map((m, idx) => (idx === i ? v : m)))
  const addMember = () => {
    setMembers((p) => [...p, ''])
    setItems((p) => p.map((it) => ({ ...it, among: [...it.among, true] })))
  }
  const removeMember = (i: number) => {
    if (members.length <= 2) return
    setMembers((p) => p.filter((_, idx) => idx !== i))
    setItems((p) => p.map((it) => ({ ...it, among: it.among.filter((_, idx) => idx !== i) })))
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

  // ── 항목 ──
  const addItem = () =>
    setItems((p) => {
      // 새 항목은 직전 항목의 참여자를 상속(없으면 전원)
      const base = p.length ? [...p[p.length - 1].among] : members.map(() => true)
      while (base.length < members.length) base.push(true)
      return [...p, { name: '', amount: 0, among: base.slice(0, members.length) }]
    })
  const removeItem = (idx: number) => {
    setItems((p) => p.filter((_, i) => i !== idx))
    // 열려있던 Numpad가 지워진/뒤로 밀린 항목을 가리키지 않도록 보정
    setPadItem((p) => (p === null ? null : p === idx ? null : p > idx ? p - 1 : p))
  }
  const setItemName = (idx: number, v: string) =>
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, name: v } : it)))
  const setItemAmount = (idx: number, amt: number) =>
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, amount: amt } : it)))
  const toggleAmong = (idx: number, mi: number) =>
    setItems((p) =>
      p.map((it, i) => {
        if (i !== idx) return it
        const among = it.among.map((b, k) => (k === mi ? !b : b))
        // 채워진 멤버 기준 최소 1명은 남긴다
        return filledIdx.some((fi) => among[fi]) ? { ...it, among } : it
      }),
    )

  // ── 인별 합계(채워진 멤버 순) — 단위 반올림·흡수자 반영(미리보기=제출과 동일 도메인 호출) ──
  const splitOpts = {
    paidBy: String(effectivePayer),
    unit,
    absorber: absorberIndex !== null ? String(absorberIndex) : undefined,
  }
  const tabs = filledIdx.map(() => 0)
  for (const it of items) {
    if (it.amount <= 0) continue
    const parts = filledIdx.filter((fi) => it.among[fi])
    if (parts.length === 0) continue
    const shares = equalSplit(it.amount, parts.map(String), splitOpts)
    const byId = new Map(shares.map((s) => [s.memberId, s.amount]))
    for (const oi of parts) tabs[filledIdx.indexOf(oi)] += byId.get(String(oi)) ?? 0
  }
  // 안 나눠떨어져 남는 금액(항목별 합). unit=1(안 함)도 항목이 안 떨어지면 생긴다. 0이면 흡수자 선택 불필요.
  let roundLeftover = 0
  for (const it of items) {
    if (it.amount <= 0) continue
    const np = filledIdx.filter((fi) => it.among[fi]).length
    if (np === 0) continue
    roundLeftover += it.amount - Math.floor(it.amount / (np * unit)) * unit * np
  }

  function submit() {
    setError(null)
    const filled = filledIdx.map((i) => members[i].trim())
    if (filled.length < 2) return setError('최소 2명이 필요해요')
    const realItems = items.filter((it) => it.amount > 0)
    if (realItems.length === 0) return setError('항목을 1개 이상 추가해 주세요')

    const payer = Math.max(0, filledIdx.indexOf(effectivePayer))
    const payload: { description?: string; amount: number; participants: number[] }[] = []
    for (const it of realItems) {
      const participants = filledIdx
        .map((oi, pos) => ({ oi, pos }))
        .filter((x) => it.among[x.oi])
        .map((x) => x.pos)
      if (participants.length === 0) return setError('모든 항목에 참여자가 1명 이상 필요해요')
      payload.push({ description: it.name.trim() || undefined, amount: it.amount, participants })
    }

    // 안 나눠떨어져 남는 금액이 있으면(안 함 포함) 받을 사람을 골라야(매번 직접 선택). filled 위치로 변환.
    let absorberIdx: number | undefined
    if (roundLeftover > 0) {
      if (absorberIndex === null) return setError('남은 금액 받을 사람을 골라주세요')
      const pos = filledIdx.indexOf(absorberIndex)
      if (pos < 0) return setError('남은 금액 받을 사람을 다시 골라주세요')
      absorberIdx = pos
    }

    const resolved = resolveAccount(accounts, accountId, acct)
    if (resolved.error) return setError(resolved.error)
    startTransition(async () => {
      try {
        const res = await addItemizedBillAction({
          members: filled,
          payerIndex: payer,
          unit,
          absorberIndex: absorberIdx,
          items: payload,
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

  const chip = (active: boolean) =>
    'rounded-full px-3 py-1.5 text-sm font-medium transition ' +
    (active
      ? 'bg-brand text-white'
      : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500')

  return (
    <main className="flex min-h-dvh flex-col px-5 pb-8 pt-5">
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">항목별로 나누기</h1>
        <p className="mt-0.5 text-sm text-neutral-400">먹은 것만 딱 나눠서 정산</p>
      </header>

      <ModeChips className="mb-6" />

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
                onChange={(e) => setMemberName(i, e.target.value)}
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

      {/* 누가 냈어요? (영수증 1명) */}
      {filledIdx.length >= 1 && (
        <section className="mb-5">
          <p className="mb-2 text-sm font-medium text-neutral-500">누가 냈어요?</p>
          <div className="flex flex-wrap gap-2">
            {filledIdx.map((i) => (
              <button
                key={i}
                onClick={() => setPayerIndex(i)}
                className={
                  'rounded-full px-4 py-2 text-sm font-medium transition ' +
                  (effectivePayer === i
                    ? 'bg-brand text-white'
                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300')
                }
              >
                {members[i].trim()}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 금액 단위로 맞추기(선택) — 항목마다 단위로 내림, 남는 건 고른 사람이 흡수. */}
      {filledIdx.length >= 2 && total > 0 && (
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
          {/* 안 떨어지면(안 함 포함) 남는 금액 받을 사람을 직접 고른다(자동 기본값 없음). */}
          {roundLeftover > 0 && (
            <div className="mt-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                남는 <span className="num font-semibold">{formatWon(roundLeftover)}</span> 누가 낼까요?
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {filledIdx.map((fi) => (
                  <button
                    key={fi}
                    onClick={() => {
                      setAbsorberIndex(fi)
                      setError(null)
                    }}
                    className={
                      'rounded-full px-4 py-2 text-sm font-medium transition ' +
                      (absorberIndex === fi
                        ? 'bg-brand text-white'
                        : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300')
                    }
                  >
                    {members[fi].trim()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 받을 계좌. 저장계좌 있으면 칩, 없으면 인라인 입력(선택). */}
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

      {/* 항목 */}
      <section className="mb-5">
        <p className="mb-2 text-sm font-medium text-neutral-500">뭘 먹었어요?</p>
        <div className="flex flex-col gap-3">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-center gap-2">
                <input
                  value={it.name}
                  placeholder={`항목 ${idx + 1}`}
                  onChange={(e) => setItemName(idx, e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-brand dark:border-neutral-700 dark:bg-neutral-950"
                />
                <button
                  onClick={() => setPadItem(idx)}
                  className="num shrink-0 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[15px] font-semibold tabular-nums dark:border-neutral-700 dark:bg-neutral-950"
                >
                  {it.amount > 0 ? (
                    formatWon(it.amount)
                  ) : (
                    <span className="text-neutral-300 dark:text-neutral-600">금액</span>
                  )}
                </button>
                <button
                  onClick={() => removeItem(idx)}
                  aria-label="항목 삭제"
                  className="shrink-0 px-1 text-neutral-300 hover:text-neutral-500"
                >
                  ✕
                </button>
              </div>
              {filledIdx.length >= 1 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {filledIdx.map((fi) => (
                    <button key={fi} onClick={() => toggleAmong(idx, fi)} className={chip(it.among[fi])}>
                      {members[fi].trim()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addItem}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-2xl border border-dashed border-neutral-300 py-3 text-sm font-medium text-neutral-500 hover:border-brand hover:text-brand dark:border-neutral-700"
        >
          <IcoPlus className="h-4 w-4" /> 항목 추가
        </button>
      </section>

      {/* 실시간 합계 + 인별 */}
      {total > 0 && (
        <section className="mb-5 rounded-2xl bg-brand-50 px-4 py-3 dark:bg-brand-600/15">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-neutral-500">합계</span>
            <span className="num text-lg font-bold text-brand">{formatWon(total)}</span>
          </div>
          {tabs.some((t) => t > 0) && (
            <div className="mt-2 flex flex-col gap-1 border-t border-brand-100 pt-2 dark:border-brand-600/20">
              {filledIdx.map((fi, pos) => (
                <div key={fi} className="flex items-baseline justify-between text-sm">
                  <span className="text-neutral-600 dark:text-neutral-300">{members[fi].trim()}</span>
                  <span className="num font-semibold">{formatWon(tabs[pos])}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {error && <p className="mb-3 text-center text-sm text-red-500">{error}</p>}

      <button
        onClick={submit}
        disabled={pending}
        className="mb-4 mt-auto w-full rounded-2xl bg-brand py-4 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? '정산 중…' : '정산하기'}
      </button>

      <Numpad
        open={padItem !== null}
        amount={padItem !== null ? (items[padItem]?.amount ?? 0) : 0}
        onChange={(amt) => {
          if (padItem !== null) setItemAmount(padItem, amt)
        }}
        onClose={() => setPadItem(null)}
      />
      <LoginSheet open={loginPrompt} onClose={() => setLoginPrompt(false)} onKakao={goLogin} />
    </main>
  )
}
