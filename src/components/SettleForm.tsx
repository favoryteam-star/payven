'use client'

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatWon } from '@/domain/money'
import { equalSplit } from '@/domain/settle'
import {
  addItemizedBillAction,
  getRecentMembersAction,
  quickSettleAction,
  updateItemizedBillAction,
  updateQuickSettleAction,
} from '@/app/actions'
import { Numpad } from '@/components/Numpad'
import { IcoBack, IcoPlus } from '@/components/icons'
import { Wordmark } from '@/components/Logo'
import { ModeChips, type SettleMode } from '@/components/ModeChips'
import { LoginSheet } from '@/components/LoginSheet'
import { AccountField, EMPTY_INLINE, resolveAccount, useMyAccounts, type InlineAcct } from '@/components/AccountSelect'

// 항목(메뉴) 1개. among = 멤버 배열과 같은 길이의 참여 여부(기본 전원).
export type Item = { name: string; amount: number; among: boolean[] }

// 수정 모드 프리필. editSlug가 있으면 '만들기'가 아니라 '교체 수정'으로 동작.
export interface SettleFormInitial {
  editSlug: string
  mode: SettleMode
  title: string
  members: string[]
  payerIndex: number
  amount: number
  items: Item[]
  eventDate: string | null
  account: { bankName: string; accountNo: string; accountHolder: string } | null
  hasSettlements: boolean
}

// 오늘(기기 로컬=KST) YYYY-MM-DD. SSR(UTC) 불일치 피하려 마운트 후 set.
function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 모드별 기본 제목. 정산결과는 이 기본값이면 제목 숨김(직접 바꾸면 표시).
const TITLES: Record<SettleMode, string> = { quick: '빠른정산', items: '항목별 정산' }

// 인라인 계좌 상태로 변환(만들기=빈값, 수정=기존 계좌 시드).
function inlineFrom(account: SettleFormInitial['account']): InlineAcct {
  return account ? { bank: account.bankName, no: account.accountNo, holder: account.accountHolder } : EMPTY_INLINE
}

// 1/N과 항목별을 한 페이지에서 토글로(페이지 이동 X). 헤더·하단탭·공유입력(멤버·낸사람·단위·계좌)은
// 그대로 두고, 맨 위 입력칸만 바뀐다: 1/N = 금액, 항목별 = 항목.
// initial이 있으면 '수정'(교체): 상태를 기존 정산으로 시드하고 교체 액션을 호출한다.
export function SettleForm({ initial }: { initial?: SettleFormInitial }) {
  const router = useRouter()
  const isEdit = !!initial
  const editSlug = initial?.editSlug ?? ''
  const [mode, setMode] = useState<SettleMode>(initial?.mode ?? 'quick')
  // 공유 입력
  const [title, setTitle] = useState<string>(initial?.title ?? TITLES.quick) // 정산 제목(기본=모드명, 수정 가능)
  const [members, setMembers] = useState<string[]>(initial?.members ?? ['나', ''])
  const [payerIndex, setPayerIndex] = useState(initial?.payerIndex ?? 0)
  // 반올림은 저장 안 됨(계산된 분담만 있음) → 수정도 '안 함'으로 시작, 필요하면 다시 고름(ADR-022).
  const [unit, setUnit] = useState(1) // 반올림 단위(1=안 함)
  const [absorberIndex, setAbsorberIndex] = useState<number | null>(null) // 남는 금액 받을 사람(members 인덱스)
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? '') // 정산 날짜(YYYY-MM-DD). 비면 마운트 시 오늘로.
  // 1/N 전용
  const [amount, setAmount] = useState(initial?.amount ?? 0)
  const [padOpen, setPadOpen] = useState(false)
  // 항목별 전용
  const [items, setItems] = useState<Item[]>(initial?.items ?? [])
  const [padItem, setPadItem] = useState<number | null>(null)
  // 공통
  const [error, setError] = useState<string | null>(null)
  const [loginPrompt, setLoginPrompt] = useState(false)
  const [autoSubmit, setAutoSubmit] = useState(false)
  const [pending, startTransition] = useTransition()

  // 멤버 입력에서 엔터 → 다음 칸으로(마지막이면 자동 추가). focusMember가 set되면 해당 칸에 포커스.
  const memberRefs = useRef<(HTMLInputElement | null)[]>([])
  const [focusMember, setFocusMember] = useState<number | null>(null)

  // 과거 정산에서 쓴 참여자 이름(최근순) — 빠른 추가 칩. 미로그인이면 빈 배열.
  const [recentNames, setRecentNames] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    getRecentMembersAction()
      .then((r) => alive && setRecentNames(r))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // 받을 계좌. null=로딩. 저장계좌 있으면 칩(accountId), 없으면 인라인 입력(acct). undefined=미선택(기본 자동).
  const accounts = useMyAccounts()
  const [accountId, setAccountId] = useState<string | undefined>(undefined)
  const [acct, setAcct] = useState<InlineAcct>(inlineFrom(initial?.account ?? null))
  const accountChipValue =
    accountId === undefined
      ? (accounts?.find((a) => a.isDefault)?.id ?? accounts?.[0]?.id ?? '')
      : accountId

  // 수정 모드: 저장계좌가 로드되면 기존 계좌와 같은 칩을 자동 선택(있으면). 없으면 인라인 시드값을 씀.
  useEffect(() => {
    if (!isEdit || !initial?.account || accounts === null || accounts.length === 0) return
    const norm = (s: string) => s.replace(/\D/g, '')
    const match = accounts.find(
      (a) => a.bankName === initial.account!.bankName && norm(a.accountNo) === norm(initial.account!.accountNo),
    )
    if (match) setAccountId(match.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts])

  // 마운트: 날짜 기본=오늘(비었을 때). 만들기는 로그인 왕복 draft 복원도(수정은 복원 없음).
  // ?resume=1은 OAuth 리다이렉트에서 사라질 수 있어 신뢰 못 함 → sessionStorage draft 존재로 복원 신호.
  useEffect(() => {
    if (isEdit) {
      if (!initial?.eventDate) setEventDate(todayYmd())
      return
    }
    setEventDate(todayYmd()) // 기본 = 오늘(클라 로컬). draft 있으면 아래에서 덮어씀.
    const params = new URLSearchParams(window.location.search)
    if (params.get('resume') === '1') window.history.replaceState(null, '', '/')
    const raw = sessionStorage.getItem('payven:draft:create')
    if (!raw) return
    sessionStorage.removeItem('payven:draft:create')
    try {
      const d = JSON.parse(raw)
      if (d.mode === 'quick' || d.mode === 'items') setMode(d.mode)
      if (typeof d.title === 'string') setTitle(d.title)
      if (typeof d.amount === 'number') setAmount(d.amount)
      if (Array.isArray(d.members)) setMembers(d.members)
      if (typeof d.payerIndex === 'number') setPayerIndex(d.payerIndex)
      if (typeof d.unit === 'number') setUnit(d.unit)
      if (typeof d.absorberIndex === 'number') setAbsorberIndex(d.absorberIndex)
      if (typeof d.eventDate === 'string') setEventDate(d.eventDate)
      if (Array.isArray(d.items)) setItems(d.items)
      if (d.acct && typeof d.acct === 'object') setAcct(d.acct)
      setAutoSubmit(true)
    } catch {
      /* 손상된 draft 무시 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      'payven:draft:create',
      JSON.stringify({ mode, title, amount, members, payerIndex, unit, absorberIndex, eventDate, items, acct }),
    )
    window.location.href = `/auth/login?provider=kakao&next=${encodeURIComponent('/?resume=1')}`
  }

  // ── 파생값 ──
  const filled = members.filter((m) => m.trim())
  const filledIdx = members.map((n, i) => (n.trim() ? i : -1)).filter((i) => i >= 0)
  // 결제자가 비워졌거나 범위를 벗어나면 첫 채워진 멤버로 — 표시·계산·제출의 단일 출처.
  const effectivePayer = filledIdx.includes(payerIndex) ? payerIndex : (filledIdx[0] ?? 0)
  // 최근 참여자 빠른 추가: 이미 들어간 이름은 제외.
  const currentNames = new Set(members.map((m) => m.trim()).filter(Boolean))
  const memberSuggestions = recentNames.filter((n) => !currentNames.has(n)).slice(0, 8)

  // 1/N: 균등이라 base는 전원 동일. 단위로 안 떨어지면 남는 금액은 고른 사람이 흡수(안 함의 1~2원 포함).
  const perPerson = amount > 0 && filled.length >= 1 ? Math.floor(amount / filled.length) : 0
  const quickBase = perPerson > 0 ? Math.floor(amount / (filled.length * unit)) * unit : 0
  const quickLeftover = perPerson > 0 ? amount - quickBase * filled.length : 0

  // 항목별: 인별 합계(단위·흡수자 반영, 미리보기=제출과 동일 도메인 호출) + 남는 금액 합.
  const total = items.reduce((s, it) => s + (it.amount > 0 ? it.amount : 0), 0)
  const splitOpts = {
    paidBy: String(effectivePayer),
    unit,
    absorber: absorberIndex !== null ? String(absorberIndex) : undefined,
  }
  const tabs = filledIdx.map(() => 0)
  let itemsLeftover = 0
  for (const it of items) {
    if (it.amount <= 0) continue
    const parts = filledIdx.filter((fi) => it.among[fi])
    if (parts.length === 0) continue
    const shares = equalSplit(it.amount, parts.map(String), splitOpts)
    const byId = new Map(shares.map((s) => [s.memberId, s.amount]))
    for (const oi of parts) tabs[filledIdx.indexOf(oi)] += byId.get(String(oi)) ?? 0
    itemsLeftover += it.amount - Math.floor(it.amount / (parts.length * unit)) * unit * parts.length
  }

  // 모드 공통: 남는 금액 + 단위 섹션 노출 여부.
  const leftover = mode === 'quick' ? quickLeftover : itemsLeftover
  const showUnit = mode === 'quick' ? perPerson > 0 : filledIdx.length >= 2 && total > 0

  // ── 멤버 ──
  const setMember = (i: number, v: string) =>
    setMembers((p) => p.map((m, idx) => (idx === i ? v : m)))
  const addMember = () => {
    setMembers((p) => [...p, ''])
    setItems((p) => p.map((it) => ({ ...it, among: [...it.among, true] })))
  }
  // 최근 칩 탭 → 빈 칸 있으면 채우고, 없으면 새로 추가(항목별 among도 갱신).
  const addNamedMember = (name: string) => {
    const empty = members.findIndex((m) => !m.trim())
    if (empty >= 0) {
      setMembers((p) => p.map((m, i) => (i === empty ? name : m)))
    } else {
      setMembers((p) => [...p, name])
      setItems((p) => p.map((it) => ({ ...it, among: [...it.among, true] })))
    }
  }
  const removeMember = (i: number) => {
    if (members.length <= 2) return
    setMembers((p) => p.filter((_, idx) => idx !== i))
    setItems((p) => p.map((it) => ({ ...it, among: it.among.filter((_, idx) => idx !== i) })))
    setPayerIndex((p) => (p === i ? 0 : p > i ? p - 1 : p))
    setAbsorberIndex((p) => (p === null ? null : p === i ? null : p > i ? p - 1 : p))
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
        return filledIdx.some((fi) => among[fi]) ? { ...it, among } : it // 최소 1명 유지
      }),
    )

  // 모드 전환. 제목이 아직 기본값(또는 빈칸)이면 새 모드 기본값으로 바꾸고, 직접 고친 제목은 유지.
  const switchMode = (m: SettleMode) => {
    setTitle((t) => (t.trim() === '' || t === TITLES.quick || t === TITLES.items ? TITLES[m] : t))
    setMode(m)
  }

  function submit() {
    setError(null)
    const names = filledIdx.map((i) => members[i].trim())
    if (names.length < 2) return setError('최소 2명이 필요해요')

    // 모드별 메인 입력 검증 + 항목별 payload 구성
    const payload: { description?: string; amount: number; participants: number[] }[] = []
    if (mode === 'quick') {
      if (amount <= 0) return setError('금액을 입력해 주세요')
    } else {
      const realItems = items.filter((it) => it.amount > 0)
      if (realItems.length === 0) return setError('항목을 1개 이상 추가해 주세요')
      for (const it of realItems) {
        const participants = filledIdx
          .map((oi, pos) => ({ oi, pos }))
          .filter((x) => it.among[x.oi])
          .map((x) => x.pos)
        if (participants.length === 0) return setError('모든 항목에 참여자가 1명 이상 필요해요')
        payload.push({ description: it.name.trim() || undefined, amount: it.amount, participants })
      }
    }

    const payer = Math.max(0, filledIdx.indexOf(effectivePayer))
    // 안 나눠떨어지면(단위 무관, 안 함의 1~2원 포함) 남는 금액 받을 사람을 골라야. filled 위치로 변환.
    let absorberIdx: number | undefined
    if (leftover > 0) {
      if (absorberIndex === null) return setError('남은 금액 받을 사람을 골라주세요')
      const pos = filledIdx.indexOf(absorberIndex)
      if (pos < 0) return setError('남은 금액 받을 사람을 다시 골라주세요')
      absorberIdx = pos
    }

    const resolved = resolveAccount(accounts, accountId, acct)
    if (resolved.error) return setError(resolved.error)

    startTransition(async () => {
      try {
        const common = {
          name: title.trim() || TITLES[mode],
          members: names,
          payerIndex: payer,
          unit,
          absorberIndex: absorberIdx,
          eventDate: eventDate || undefined,
          account: resolved.account,
          saveAccount: resolved.saveAccount,
        }
        const res = isEdit
          ? mode === 'quick'
            ? await updateQuickSettleAction({ slug: editSlug, amount, ...common })
            : await updateItemizedBillAction({ slug: editSlug, items: payload, ...common })
          : mode === 'quick'
            ? await quickSettleAction({ amount, ...common })
            : await addItemizedBillAction({ items: payload, ...common })
        if ('needLogin' in res) {
          // 만들기 = 안내 시트(입력값 보존). 수정 = 세션 만료 → 로그인 후 수정 화면으로 복귀.
          if (isEdit) {
            window.location.href = `/auth/login?provider=kakao&next=${encodeURIComponent(`/g/${editSlug}/edit`)}`
          } else {
            setLoginPrompt(true)
          }
          return
        }
        router.push(`/g/${res.slug}/settle`)
      } catch (e) {
        setError(e instanceof Error ? e.message : '문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
      }
    })
  }

  const partChip = (active: boolean) =>
    'rounded-full px-3 py-1.5 text-sm font-medium transition ' +
    (active
      ? 'bg-brand text-white'
      : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500')

  return (
    <main
      className={
        isEdit
          ? 'flex min-h-[100dvh] flex-col px-5 pb-10 pt-6'
          : 'flex min-h-[calc(100dvh-5rem)] flex-col px-5 pt-6'
      }
    >
      {isEdit ? (
        <header className="mb-4 flex items-center gap-2">
          <Link
            href={`/g/${editSlug}/settle`}
            aria-label="뒤로"
            className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition active:scale-95 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <IcoBack className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold tracking-tight">정산 수정</h1>
        </header>
      ) : (
        <header className="mb-4">
          <h1>
            <Wordmark />
          </h1>
          <p className="mt-1.5 text-sm text-neutral-400">술값·밥값, 계산기 대신 1초 정산</p>
        </header>
      )}

      {/* 수정은 교체 — 보냈어요 기록이 있으면 초기화됨을 경고. */}
      {isEdit && initial?.hasSettlements && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          이 정산엔 ‘보냈어요’ 기록이 있어요. 수정하면 송금 완료 표시가 초기화돼요.
        </div>
      )}

      <ModeChips value={mode} onChange={switchMode} className="mb-4" />

      {/* 제목 (공유) — 기본=모드명, 수정 가능. 기본값 그대로면 정산결과에서 제목 숨김. */}
      <section className="mb-5">
        <p className="mb-2 text-sm font-medium text-neutral-500">뭐라고 부를까요?</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          maxLength={50}
          className="w-full rounded-xl border border-neutral-200 bg-transparent px-4 py-3 text-[15px] font-medium outline-none focus:border-brand dark:border-neutral-700"
        />
      </section>

      {/* 맨 위 입력 — 1/N은 금액, 항목별은 항목(나머지 섹션은 공유) */}
      {mode === 'quick' ? (
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
      ) : (
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
                      <button key={fi} onClick={() => toggleAmong(idx, fi)} className={partChip(it.among[fi])}>
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
      )}

      {/* 참여자 (공유) */}
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

        {/* 최근 참여자 빠른 추가 — 과거 정산에서 쓴 이름을 탭으로(매번 타이핑 안 하게). */}
        {memberSuggestions.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-neutral-400">최근 같이 정산한 사람</p>
            <div className="flex flex-wrap gap-2">
              {memberSuggestions.map((n) => (
                <button
                  key={n}
                  onClick={() => addNamedMember(n)}
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-brand hover:text-brand dark:border-neutral-700 dark:text-neutral-300"
                >
                  <IcoPlus className="h-3.5 w-3.5" /> {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 낸 사람 (공유) */}
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

      {/* 날짜 (공유) — 기본 오늘, 수정 가능. 정산결과 "{결제자}님이 결제 · {월일}"에 쓰임. */}
      <section className="mb-5">
        <p className="mb-2 text-sm font-medium text-neutral-500">언제 썼어요?</p>
        <input
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          className="num w-full rounded-xl border border-neutral-200 bg-transparent px-4 py-3 text-[15px] outline-none focus:border-brand dark:border-neutral-700 dark:[color-scheme:dark]"
        />
      </section>

      {/* 금액 단위로 맞추기 (공유) — 친구들이 3,333 대신 3,300 같은 깔끔한 금액을 보내게. 남는 건 고른 사람이. */}
      {showUnit && (
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

          {/* 안 떨어지면(안 함의 1~2원 포함) 남는 금액 받을 사람을 직접 고른다(자동 기본값 없음). */}
          {leftover > 0 && (
            <div className="mt-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {mode === 'quick' && (
                  <>
                    각자 <span className="num font-semibold text-brand">{formatWon(quickBase)}</span> ·{' '}
                  </>
                )}
                남은 <span className="num font-semibold">{formatWon(leftover)}</span> 누가 낼까요?
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

      {/* 받을 계좌 (공유). 저장계좌 있으면 칩, 없으면 인라인 입력(선택). */}
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

      {/* 미리보기 — 1/N은 1인당(딱 떨어질 때), 항목별은 합계+인별 */}
      {mode === 'quick'
        ? perPerson > 0 &&
          leftover === 0 && (
            <div className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-center dark:bg-brand-600/15">
              <span className="text-sm text-neutral-500">1인당 </span>
              <span className="num text-lg font-bold text-brand">{formatWon(quickBase)}</span>
            </div>
          )
        : total > 0 && (
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

      {error && <p className="mt-3 text-center text-sm text-red-500">{error}</p>}

      <button
        onClick={submit}
        disabled={pending}
        className="mb-4 mt-auto w-full rounded-2xl bg-brand py-4 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? (isEdit ? '수정 중…' : '정산 중…') : isEdit ? '수정 완료' : '정산하기'}
      </button>

      {/* 1/N 금액 숫자패드 */}
      <Numpad open={padOpen} amount={amount} onChange={setAmount} onClose={() => setPadOpen(false)} />
      {/* 항목별 금액 숫자패드 */}
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
