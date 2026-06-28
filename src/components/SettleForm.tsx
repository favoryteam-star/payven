'use client'

import { useEffect, useRef, useState, useTransition, type ChangeEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatWon } from '@/domain/money'
import { equalSplit, roundingLeftover } from '@/domain/settle'
import {
  addItemizedBillAction,
  getRecentMembersAction,
  ocrReceiptAction,
  quickSettleAction,
  saveMemberGroupAction,
  updateItemizedBillAction,
  updateQuickSettleAction,
} from '@/app/actions'
import { Numpad } from '@/components/Numpad'
import { IcoBack, IcoPlus } from '@/components/icons'
import { Wordmark } from '@/components/Logo'
import { ModeChips, type SettleMode } from '@/components/ModeChips'
import { LoginSheet } from '@/components/LoginSheet'
import { captureSource, trackEvent } from '@/lib/analytics'
import { ThemeToggle } from '@/components/ThemeToggle'
import { AccountField, EMPTY_INLINE, NEW_ACCOUNT, resolveAccount, useMyAccounts, type InlineAcct } from '@/components/AccountSelect'
import { AbsorberGame } from '@/components/AbsorberGame'
import { useMyMemberGroups } from '@/components/memberGroups'
import { isAndroid } from '@/lib/ua'

// 메뉴(항목) 1개. among = 멤버 길이의 참여 여부(기본 전원).
// amount = 라인 총액(분담·미리보기·제출의 단일 출처). qty = 라인 수량(선택, 입력 편의) — 단가=amount/qty.
export type RoundItem = { name: string; amount: number; among: boolean[]; qty?: number }
// 차수(=한 자리: 1차·2차) 1개. payer=그 자리 낸 사람 멤버 인덱스. split=메뉴별로 나눴는지.
// split=false면 items=[총액 1개], split=true면 items=메뉴 여러 개.
export type Round = { payer: number; split: boolean; items: RoundItem[] }

// 수정 모드 프리필. editSlug가 있으면 '만들기'가 아니라 '교체 수정'으로 동작.
// rounds는 split 없이 들어옴(폼이 items.length로 판정).
export interface SettleFormInitial {
  editSlug: string
  mode: SettleMode
  title: string
  members: string[]
  payerIndex: number
  amount: number
  winnerIndex?: number | null // '한 명이 다 쏘기'면 그 사람(분담을 혼자 전액). 아니면 null/undefined.
  rounds: { payer: number; items: RoundItem[] }[]
  eventDate: string | null
  account: { bankName: string; accountNo: string; accountHolder: string } | null
  hasSettlements: boolean
}

// 오늘(기기 로컬=KST) YYYY-MM-DD. SSR(UTC) 불일치 피하려 마운트 후 set.
function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 'YYYY-MM-DD' → 'YYYY. M. D.'. 네이티브 date 값 렌더(iOS에서 크기·정렬 제멋대로)를 안 쓰고 직접 그림.
function formatDateDisplay(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${y}. ${Number(m)}. ${Number(d)}.`
}

// 작성 중 초안(이어서 작성) 로컬 키. 로그인 왕복 draft(sessionStorage·일회성)와 달리 localStorage(영속).
const WIP_KEY = 'payven:draft:wip'

// 초안 저장 시각 → 'N분/시간/일 전'(이어서 작성 배너용).
function savedAgo(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.floor(hr / 24)}일 전`
}

// 영수증 스캔 버튼(촬영/앨범 공용) pill 스타일. 투명 input 오버레이를 담으려 relative+overflow-hidden.
const OCR_PILL =
  'relative inline-flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg border border-brand/30 bg-brand/5 px-2.5 py-1.5 text-sm font-medium text-brand-700 transition active:scale-95 hover:border-brand dark:border-brand/40 dark:text-brand'

// 모드별 기본 제목. 정산결과는 이 기본값이면 제목 숨김(직접 바꾸면 표시).
const TITLES: Record<SettleMode, string> = { quick: '빠른정산', items: '항목별 정산', shoot: '한 명이 쏘기' }

// 인라인 계좌 상태로 변환(만들기=빈값, 수정=기존 계좌 시드).
function inlineFrom(account: SettleFormInitial['account']): InlineAcct {
  return account ? { bank: account.bankName, no: account.accountNo, holder: account.accountHolder } : EMPTY_INLINE
}

// 1/N과 항목별을 한 페이지에서 토글로. 항목별 = 차수(round) 묶음, 차수마다 낸 사람 + 메뉴(간단=총액 1줄).
// initial이 있으면 '수정'(교체): 상태를 기존 정산으로 시드하고 교체 액션을 호출한다.
export function SettleForm({
  initial,
  isLoggedIn = false,
  myName,
}: {
  initial?: SettleFormInitial
  isLoggedIn?: boolean
  myName?: string
}) {
  const router = useRouter()
  const isEdit = !!initial
  const editSlug = initial?.editSlug ?? ''
  // 수정 대상이 '쏘기'(winnerIndex 존재)면 쏘기 모드로 복원(아니면 저장된 모드/기본 quick).
  const initShoot = initial?.winnerIndex != null
  const [mode, setMode] = useState<SettleMode>(initShoot ? 'shoot' : (initial?.mode ?? 'quick'))
  // 공유 입력
  const [title, setTitle] = useState<string>(initial?.title ?? TITLES.quick) // 정산 제목(기본=모드명, 수정 가능)
  // '내 이름' 기본값 = 로그인 표시 이름(닉네임). 멤버 길이 한도(20) 넘으면 '나'로 안전 폴백.
  const selfDefault = myName && myName.trim() && myName.trim().length <= 20 ? myName.trim() : '나'
  const [members, setMembers] = useState<string[]>(initial?.members ?? [selfDefault, ''])
  const [payerIndex, setPayerIndex] = useState(initial?.payerIndex ?? 0)
  const [winnerIndex, setWinnerIndex] = useState<number | null>(initial?.winnerIndex ?? null) // 다 쏠 사람(members 인덱스)
  // 반올림은 저장 안 됨(계산된 분담만 있음) → 수정도 '안 함'으로 시작, 필요하면 다시 고름(ADR-022).
  const [unit, setUnit] = useState(1) // 반올림 단위(1=안 함)
  const [absorberIndex, setAbsorberIndex] = useState<number | null>(null) // 남는 금액 받을 사람(members 인덱스)
  const [gameOpen, setGameOpen] = useState(false) // '게임으로 정하기' 모달(돌림판/사다리, 흡수자·쏘기 공용)
  const [itemGame, setItemGame] = useState<{ r: number; ii: number } | null>(null) // 항목별 '한 명이 쏘기' 게임 대상(차수 r·메뉴 ii)
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? '') // 정산 날짜(YYYY-MM-DD). 비면 마운트 시 오늘로.
  // 1/N 전용
  const [amount, setAmount] = useState(initial?.amount ?? 0)
  const [padOpen, setPadOpen] = useState(false)
  // 항목별 전용 — 차수 묶음. split은 items.length>1로 시드.
  const [rounds, setRounds] = useState<Round[]>(
    initial?.rounds?.map((r) => ({ payer: r.payer, split: r.items.length > 1, items: r.items })) ?? [],
  )
  const [padTarget, setPadTarget] = useState<{ r: number; i: number } | null>(null) // 메뉴 금액 패드 대상
  const [ocrRound, setOcrRound] = useState<number | null>(null) // 영수증 인식 중인 차수(로딩 표시)
  const [ocrMenuRound, setOcrMenuRound] = useState<number | null>(null) // (안드로이드만) 촬영/앨범 선택지 열린 차수
  const [onAndroid, setOnAndroid] = useState(false) // 안드로이드면 스캔 시 촬영/앨범 선택지를 직접 띄움(SSR=false)
  useEffect(() => setOnAndroid(isAndroid(navigator.userAgent)), [])
  // 공통
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null) // 에러 소속 섹션(인라인 표시·자동 스크롤)
  // 섹션 ref — 검증 실패 시 해당 입력으로 자동 스크롤. 콜백 ref라 button/section 혼용도 타입 안전.
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const refFor = (key: string) => (el: HTMLElement | null) => {
    sectionRefs.current[key] = el
  }
  const [loginPrompt, setLoginPrompt] = useState(false)
  // 로그인 안내를 연 이유. 'submit'=정산하기(복원 후 자동제출) / 'scan'=영수증 스캔(복원만, 자동제출 X).
  const loginReason = useRef<'submit' | 'scan'>('submit')
  const [autoSubmit, setAutoSubmit] = useState(false)
  const [wip, setWip] = useState<{ savedAt: number } | null>(null) // 이어서 작성 중(자동 복원) 표시
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

  // 저장된 모임(자주 함께 정산하는 사람 묶음) — 탭 한 번에 전원 추가. 미로그인이면 빈 배열.
  const { groups: memberGroups, refresh: refreshMemberGroups } = useMyMemberGroups()
  const [groupSaveOpen, setGroupSaveOpen] = useState(false)
  const [groupLabel, setGroupLabel] = useState('')
  const [groupSaved, setGroupSaved] = useState(false)
  const [groupSaving, setGroupSaving] = useState(false)

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
    // 저장 계좌에 같은 게 있으면 그 칩, 없으면 '새 계좌'로 — 시드된 인라인 계좌가 그대로 표시·사용되게(옛 일회성 계좌 보존).
    setAccountId(match ? match.id : NEW_ACCOUNT)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts])

  // draft(로그인 왕복·이어서 작성) 공용 복원 — 필드만 채운다(자동제출 여부는 호출부에서).
  const applyDraft = (d: Record<string, unknown>) => {
    const m = d.mode
    if (m === 'quick' || m === 'items' || m === 'shoot') setMode(m)
    if (typeof d.title === 'string') setTitle(d.title)
    if (typeof d.amount === 'number') setAmount(d.amount)
    if (Array.isArray(d.members)) setMembers(d.members as string[])
    if (typeof d.payerIndex === 'number') setPayerIndex(d.payerIndex)
    if (typeof d.winnerIndex === 'number') setWinnerIndex(d.winnerIndex)
    if (typeof d.unit === 'number') setUnit(d.unit)
    if (typeof d.absorberIndex === 'number') setAbsorberIndex(d.absorberIndex)
    if (typeof d.eventDate === 'string') setEventDate(d.eventDate)
    if (Array.isArray(d.rounds)) setRounds(d.rounds as Round[])
    if (d.acct && typeof d.acct === 'object') setAcct(d.acct as InlineAcct)
  }

  // 마운트: 날짜 기본=오늘. 만들기는 ①로그인 왕복 draft(즉시 복원+자동제출) ②작성 중 초안(이어서 작성 배너).
  // ?resume=1은 OAuth 리다이렉트에서 사라질 수 있어 신뢰 못 함 → sessionStorage draft 존재로 복원 신호.
  useEffect(() => {
    captureSource() // 유입 출처(utm) 보관 — 콜드 전환 측정용(로그인 왕복에도 유지)
    if (isEdit) {
      if (!initial?.eventDate) setEventDate(todayYmd())
      return
    }
    setEventDate(todayYmd()) // 기본 = 오늘(클라 로컬). draft 있으면 아래에서 덮어씀.
    const params = new URLSearchParams(window.location.search)
    if (params.get('resume') === '1') window.history.replaceState(null, '', '/')
    // ① 로그인 왕복 draft(sessionStorage·이 탭 한정·일회성) — 있으면 복원하고 끝(이어서 배너는 건너뜀).
    const raw = sessionStorage.getItem('payven:draft:create')
    if (raw) {
      sessionStorage.removeItem('payven:draft:create')
      try {
        const d = JSON.parse(raw)
        applyDraft(d)
        // 스캔 때문에 로그인한 거면 자동제출 X(입력만 복원). 그 외(정산하기)는 자동제출.
        if (d.reason !== 'scan') setAutoSubmit(true)
      } catch {
        /* 손상된 draft 무시 */
      }
      return
    }
    // ② 작성 중 초안(localStorage·폰 닫았다 열어도 유지) — 다시 열면 자동 복원(빈 폼 X) + '이어서 작성 중' 표시. 7일 지나면 폐기.
    try {
      const rawWip = localStorage.getItem(WIP_KEY)
      if (rawWip) {
        const d = JSON.parse(rawWip)
        const savedAt = typeof d?.savedAt === 'number' ? d.savedAt : 0
        if (Date.now() - savedAt < 7 * 24 * 3600 * 1000) {
          applyDraft(d) // 자동 복원 — 1차가 그대로 채워져 있게(reset처럼 보이지 않게)
          setWip({ savedAt })
        } else localStorage.removeItem(WIP_KEY)
      }
    } catch {
      /* 손상 무시 */
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

  // 작성 중 입력을 로컬에 자동 저장 → 1차·2차가 시간차로 진행돼도 폰을 닫았다 열면 자동 복원.
  // 만들기에서만, 금액/메뉴가 실제 들어갔을 때만. 빈 폼일 땐 삭제 안 함(마운트 직후 빈 상태가 초안 지우는 레이스 방지).
  // 비우기는 생성 성공·새 정산 시작·7일 만료가 담당.
  useEffect(() => {
    if (isEdit) return
    const hasContent = amount > 0 || rounds.some((rd) => rd.items.some((it) => it.amount > 0 || it.name.trim()))
    try {
      if (hasContent)
        localStorage.setItem(
          WIP_KEY,
          JSON.stringify({ savedAt: Date.now(), mode, title, amount, members, payerIndex, winnerIndex, unit, absorberIndex, eventDate, rounds, acct }),
        )
    } catch {
      /* 스토리지 차단 무시 */
    }
  }, [isEdit, mode, title, amount, members, payerIndex, winnerIndex, unit, absorberIndex, eventDate, rounds, acct])

  // 새 정산 시작 — 자동 복원된 초안을 버리고 빈 폼으로(리로드로 확실히 초기화).
  const startFresh = () => {
    try {
      localStorage.removeItem(WIP_KEY)
    } catch {
      /* 무시 */
    }
    window.location.href = '/'
  }

  // 엔터로 추가/이동 후 해당 멤버 입력에 포커스
  useEffect(() => {
    if (focusMember === null) return
    memberRefs.current[focusMember]?.focus()
    setFocusMember(null)
  }, [focusMember])

  const goLogin = (provider: 'kakao' | 'google') => {
    sessionStorage.setItem(
      'payven:draft:create',
      JSON.stringify({ mode, title, amount, members, payerIndex, winnerIndex, unit, absorberIndex, eventDate, rounds, acct, reason: loginReason.current }),
    )
    window.location.href = `/auth/login?provider=${provider}&next=${encodeURIComponent('/?resume=1')}`
  }

  // ── 파생값 ──
  const filled = members.filter((m) => m.trim())
  const filledIdx = members.map((n, i) => (n.trim() ? i : -1)).filter((i) => i >= 0)
  // 결제자가 비워졌거나 범위를 벗어나면 첫 채워진 멤버로 — 표시·계산·제출의 단일 출처.
  const effectivePayer = filledIdx.includes(payerIndex) ? payerIndex : (filledIdx[0] ?? 0)
  const effRoundPayer = (rd: Round) => (filledIdx.includes(rd.payer) ? rd.payer : (filledIdx[0] ?? 0))
  // 쏘기 = 별도 모드(🎲 쏘기 칩). 1/N과 같은 입력(금액·멤버·낸 사람)을 공유하되 분담 대신 한 명이 전액.
  const isShoot = mode === 'shoot'
  // 1/N처럼 금액 한 칸을 쓰는 모드(쏘기 포함) — 항목별만 차수 묶음.
  const isAmountMode = mode === 'quick' || mode === 'shoot'
  // 다 쏠 사람: 명시 선택이 유효하면 그 사람, 아니면 null(미선택 → 제출 막힘).
  const effectiveWinner = winnerIndex !== null && filledIdx.includes(winnerIndex) ? winnerIndex : null
  // 최근 참여자 빠른 추가: 이미 들어간 이름은 제외.
  const currentNames = new Set(members.map((m) => m.trim()).filter(Boolean))
  const memberSuggestions = recentNames.filter((n) => !currentNames.has(n)).slice(0, 8)
  // 저장된 모임 칩 — 멤버가 이미 다 들어간 모임은 숨김(최근 칩과 동일한 동작).
  const groupSuggestions = (memberGroups ?? []).filter((g) =>
    g.names.some((n) => !currentNames.has(n)),
  )

  // 남는 금액 흡수자 기본값 = 낸 사람(헛탭 방지). 미선택이면 이 사람이 흡수하되, 칩에 표시되고 바꿀 수 있다.
  const firstPaidRound = rounds.find((rd) => rd.items.some((it) => it.amount > 0))
  const defaultAbsorber =
    mode === 'quick' ? effectivePayer : firstPaidRound ? effRoundPayer(firstPaidRound) : (filledIdx[0] ?? 0)
  const effectiveAbsorber =
    absorberIndex !== null && filledIdx.includes(absorberIndex) ? absorberIndex : defaultAbsorber

  // 1/N: 균등이라 base는 전원 동일. 단위로 안 떨어지면 남는 금액은 고른 사람이 흡수(안 함의 1~2원 포함).
  const perPerson = amount > 0 && filled.length >= 1 ? Math.floor(amount / filled.length) : 0
  const quickBase = perPerson > 0 ? Math.floor(amount / (filled.length * unit)) * unit : 0
  const quickLeftover = roundingLeftover(amount, filled.length, unit) // 폼·서버·공유 상세 단일 출처

  // 항목별: 모든 차수의 메뉴를 펼쳐(낸 사람=그 차수) 인별 합계·남는 금액. 미리보기=제출과 동일 도메인 호출.
  const allItems = rounds.flatMap((rd) => rd.items.map((it) => ({ it, payer: effRoundPayer(rd) })))
  const total = allItems.reduce((s, { it }) => s + (it.amount > 0 ? it.amount : 0), 0)
  const tabs = filledIdx.map(() => 0)
  let itemsLeftover = 0
  for (const { it, payer } of allItems) {
    if (it.amount <= 0) continue
    const parts = filledIdx.filter((fi) => it.among[fi])
    if (parts.length === 0) continue
    const shares = equalSplit(it.amount, parts.map(String), {
      paidBy: String(payer),
      unit,
      absorber: String(effectiveAbsorber),
    })
    const byId = new Map(shares.map((s) => [s.memberId, s.amount]))
    for (const oi of parts) tabs[filledIdx.indexOf(oi)] += byId.get(String(oi)) ?? 0
    itemsLeftover += roundingLeftover(it.amount, parts.length, unit) // 폼·서버·공유 상세 단일 출처
  }

  // 모드 공통: 남는 금액 + 단위 섹션 노출 여부.
  const leftover = mode === 'quick' ? quickLeftover : itemsLeftover
  // 쏘기는 한 명이 전액이라 단위/흡수자 개념 없음 → 섹션 숨김(흡수자 게임도 함께 숨음).
  const showUnit = isShoot ? false : mode === 'quick' ? perPerson > 0 : filledIdx.length >= 2 && total > 0

  const allAmong = () => members.map(() => true)

  // ── 멤버 ── (추가/삭제 시 모든 차수의 메뉴 among + 차수 payer 인덱스도 갱신)
  const setMember = (i: number, v: string) =>
    setMembers((p) => p.map((m, idx) => (idx === i ? v : m)))
  const addAmong = (rs: Round[]) =>
    rs.map((rd) => ({ ...rd, items: rd.items.map((it) => ({ ...it, among: [...it.among, true] })) }))
  const addMember = () => {
    setMembers((p) => [...p, ''])
    setRounds(addAmong)
  }
  const addNamedMember = (name: string) => {
    const empty = members.findIndex((m) => !m.trim())
    if (empty >= 0) {
      setMembers((p) => p.map((m, i) => (i === empty ? name : m)))
    } else {
      setMembers((p) => [...p, name])
      setRounds(addAmong)
    }
  }
  // 모임 칩 → 멤버 전원 추가(이미 있는 이름은 건너뜀). 빈 칸 먼저 채우고 모자라면 덧붙임 + among 동기화.
  const addMemberNames = (names: string[]) => {
    const present = new Set(members.map((m) => m.trim()).filter(Boolean))
    const fresh: string[] = []
    for (const raw of names) {
      const name = raw.trim()
      if (!name || present.has(name)) continue
      present.add(name)
      fresh.push(name)
    }
    if (fresh.length === 0) return
    const result = [...members]
    let appended = 0
    for (const name of fresh) {
      const empty = result.findIndex((m) => !m.trim())
      if (empty >= 0) result[empty] = name
      else {
        result.push(name)
        appended++
      }
    }
    setMembers(result)
    if (appended > 0) {
      setRounds((rs) => {
        let next = rs
        for (let k = 0; k < appended; k++) next = addAmong(next)
        return next
      })
    }
  }

  // '현재 멤버를 모임으로 저장' — '나'(0번) 빼고 채워진 친구 이름만. 로그인 필요(베스트에포트).
  const friendNames = [...new Set(members.slice(1).map((m) => m.trim()).filter(Boolean))]
  const saveCurrentAsGroup = async () => {
    const label = groupLabel.trim()
    if (!label || friendNames.length === 0 || groupSaving) return
    setGroupSaving(true)
    try {
      const res = await saveMemberGroupAction({ label, names: friendNames })
      if (res.ok) {
        setGroupSaved(true)
        setGroupSaveOpen(false)
        setGroupLabel('')
        refreshMemberGroups()
      }
    } catch {
      // 저장 실패해도 정산 흐름엔 영향 0.
    } finally {
      setGroupSaving(false)
    }
  }
  const removeMember = (i: number) => {
    if (i === 0 || members.length <= 2) return // 멤버 0(나)은 삭제 불가 — 받는 계좌가 항상 '나'에 남게(이름만 변경)
    setMembers((p) => p.filter((_, idx) => idx !== i))
    setRounds((p) =>
      p.map((rd) => ({
        payer: rd.payer === i ? 0 : rd.payer > i ? rd.payer - 1 : rd.payer,
        split: rd.split,
        items: rd.items.map((it) => ({ ...it, among: it.among.filter((_, idx) => idx !== i) })),
      })),
    )
    setPayerIndex((p) => (p === i ? 0 : p > i ? p - 1 : p))
    setAbsorberIndex((p) => (p === null ? null : p === i ? null : p > i ? p - 1 : p))
    setWinnerIndex((p) => (p === null ? null : p === i ? null : p > i ? p - 1 : p))
  }
  const onMemberKeyDown = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (!members[i].trim()) return
    if (i === members.length - 1) addMember()
    setFocusMember(i + 1)
  }

  // ── 차수(round) ──
  const addRound = () =>
    setRounds((p) => {
      const payer = p.length ? p[p.length - 1].payer : 0 // 직전 차수 낸 사람 상속
      // split: true = 메뉴 입력칸을 펼친 채 시작('간단히'로 총액 한 줄로 접을 수 있음)
      return [...p, { payer, split: true, items: [{ name: '', amount: 0, among: allAmong() }] }]
    })
  const removeRound = (r: number) => {
    setRounds((p) => p.filter((_, i) => i !== r))
    setPadTarget((t) => (t === null ? null : t.r === r ? null : t.r > r ? { ...t, r: t.r - 1 } : t))
  }
  const setRoundPayer = (r: number, mi: number) =>
    setRounds((p) => p.map((rd, i) => (i === r ? { ...rd, payer: mi } : rd)))
  const toggleRoundSplit = (r: number) =>
    setRounds((p) =>
      p.map((rd, i) => {
        if (i !== r) return rd
        if (!rd.split) return { ...rd, split: true } // 펼치기: 기존 한 줄이 첫 메뉴가 됨
        // 접기: 메뉴 합쳐 한 줄로(금액 합·참여 합집합)
        const amt = rd.items.reduce((s, it) => s + (it.amount > 0 ? it.amount : 0), 0)
        const among = members.map((_, k) => rd.items.some((it) => it.among[k]))
        return { ...rd, split: false, items: [{ name: '', amount: amt, among }] }
      }),
    )

  // ── 메뉴(차수 안 항목) ──
  const patchItem = (r: number, ii: number, patch: Partial<RoundItem>) =>
    setRounds((p) =>
      p.map((rd, i) => (i === r ? { ...rd, items: rd.items.map((it, k) => (k === ii ? { ...it, ...patch } : it)) } : rd)),
    )
  const addItemToRound = (r: number) =>
    setRounds((p) =>
      p.map((rd, i) => {
        if (i !== r) return rd
        const base = rd.items.length ? [...rd.items[rd.items.length - 1].among] : allAmong()
        while (base.length < members.length) base.push(true)
        return { ...rd, items: [...rd.items, { name: '', amount: 0, among: base.slice(0, members.length) }] }
      }),
    )
  // ── 영수증 OCR ── 사진 → (서버) Gemini → {메뉴, 금액} → 차수 r의 메뉴로 채움.
  // 사진은 1280px JPEG로 축소해 보냄(업로드·입력 토큰 절감 → 인식 속도↑). 참여자는 전원 기본(사용자가 조정).
  // 영수증 글자 인식에 1280px면 충분(원래 1568). 정확도 떨어지면 maxEdge를 1568로 되돌릴 것.
  const downscaleToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const maxEdge = 1280
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas'))
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        resolve(dataUrl.split(',')[1] ?? '')
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('image-load'))
      }
      img.src = url
    })

  const applyOcrLines = (r: number, lines: { name: string; qty: number; amount: number }[]) => {
    if (lines.length === 0) return
    setRounds((p) =>
      p.map((rd, i) => {
        if (i !== r) return rd
        // amount=줄 합계(분담 단일 출처) 그대로. qty>1이면 단가=합계/수량으로 영수증처럼 표시.
        const ocrItems: RoundItem[] = lines.map((l) => ({
          name: l.name,
          amount: l.amount,
          qty: l.qty > 1 ? l.qty : undefined,
          among: allAmong(),
        }))
        // 차수가 '빈 시드 한 줄'뿐이면 교체, 아니면 기존 메뉴 뒤에 덧붙임. split은 항상 펼침.
        const it0 = rd.items[0]
        const onlySeed = rd.items.length === 1 && it0.amount === 0 && !it0.name.trim()
        return { ...rd, split: true, items: onlySeed ? ocrItems : [...rd.items, ...ocrItems] }
      }),
    )
  }

  const handleReceipt = async (r: number, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 허용
    setOcrMenuRound(null) // (안드로이드) 선택지 닫기
    if (!file) return
    setError(null)
    setErrorField(null)
    setOcrRound(r)
    try {
      const imageBase64 = await downscaleToBase64(file)
      const res = await ocrReceiptAction({ imageBase64, mediaType: 'image/jpeg' })
      if ('needLogin' in res) {
        // 세션 만료 등으로 서버가 막은 경우(클릭 게이트가 미로그인을 이미 거르지만 방어). 복원만, 자동제출 X.
        loginReason.current = 'scan'
        setLoginPrompt(true)
        return
      }
      if ('ok' in res && !res.ok) {
        setError(res.error)
        setErrorField('rounds')
        return
      }
      if ('lines' in res) applyOcrLines(r, res.lines)
    } catch {
      setError('영수증을 처리하지 못했어요. 다시 시도해 주세요.')
      setErrorField('rounds')
    } finally {
      setOcrRound(null)
    }
  }

  const removeItemFromRound = (r: number, ii: number) => {
    setRounds((p) =>
      p.map((rd, i) => (i === r && rd.items.length > 1 ? { ...rd, items: rd.items.filter((_, k) => k !== ii) } : rd)),
    )
    setPadTarget((t) => (t && t.r === r && t.i === ii ? null : t))
  }
  const toggleItemAmong = (r: number, ii: number, mi: number) =>
    setRounds((p) =>
      p.map((rd, i) => {
        if (i !== r) return rd
        return {
          ...rd,
          items: rd.items.map((it, k) => {
            if (k !== ii) return it
            const among = it.among.map((b, j) => (j === mi ? !b : b))
            return filledIdx.some((fi) => among[fi]) ? { ...it, among } : it // 최소 1명 유지
          }),
        }
      }),
    )

  // ── 라인 수량(단가×수량) ── 메뉴별 항목에만. it.amount는 항상 '라인 총액'(분담·제출 단일 출처) — 수량은 입력 편의일 뿐.
  // 입력값(단가)=amount/qty, 총액=단가×qty로 유지. qty 미지정/1이면 amount가 곧 단가=총액(기존과 동일).
  // 서버는 amount만 저장 → 수정 화면에선 총액만 복원되고 단가×수량 분해는 사라짐(의도된 V1).
  const itemQty = (it: RoundItem) => (it.qty && it.qty > 1 ? it.qty : 1)
  const unitOf = (it: RoundItem) => Math.round(it.amount / itemQty(it))
  const changeItemQty = (r: number, ii: number, nextQty: number) =>
    setRounds((p) =>
      p.map((rd, i) =>
        i !== r
          ? rd
          : {
              ...rd,
              items: rd.items.map((it, k) => {
                if (k !== ii) return it
                const unit = unitOf(it) // 현재 단가 보존(수량만 바꿀 때 총액 재계산)
                const q = Math.min(99, Math.max(1, nextQty))
                return { ...it, qty: q > 1 ? q : undefined, amount: unit * q }
              }),
            },
      ),
    )

  // 모드 전환. 제목 따라가기 + 항목별 첫 진입이면 차수 1개 자동 생성(메뉴 펼친 채 바로 입력하게).
  const switchMode = (m: SettleMode) => {
    const isDefaultTitle = Object.values(TITLES).includes(title.trim())
    setTitle((t) => (t.trim() === '' || isDefaultTitle ? TITLES[m] : t))
    if (m === 'items')
      setRounds((p) => (p.length ? p : [{ payer: 0, split: true, items: [{ name: '', amount: 0, among: allAmong() }] }]))
    setGameOpen(false)
    setItemGame(null)
    setMode(m)
  }

  function submit() {
    setError(null)
    setErrorField(null)
    // 검증 실패: 메시지 + 소속 섹션 기록 + 그 입력으로 부드럽게 스크롤(긴 폼에서 어디가 막혔는지 바로 보이게).
    const fail = (field: string, msg: string) => {
      setError(msg)
      setErrorField(field)
      const key = field === 'amount' || field === 'rounds' ? 'main' : field
      requestAnimationFrame(() =>
        sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      )
    }
    const names = filledIdx.map((i) => members[i].trim())
    if (names.length < 2) return fail('members', '최소 2명이 필요해요')

    // 모드별 메인 입력 검증 + 항목별 payload(차수→메뉴) 구성
    const payload: {
      payerIndex: number
      items: { description?: string; amount: number; participants: number[]; qty?: number }[]
    }[] = []
    if (isAmountMode) {
      if (amount <= 0) return fail('amount', '금액을 입력해 주세요')
      if (isShoot && effectiveWinner === null) return fail('winner', '누가 다 쏠지 골라 주세요')
    } else {
      for (const rd of rounds) {
        const realItems = rd.items.filter((it) => it.amount > 0)
        if (realItems.length === 0) continue // 금액 없는 차수는 건너뜀
        const payerPos = Math.max(0, filledIdx.indexOf(effRoundPayer(rd)))
        const items: { description?: string; amount: number; participants: number[]; qty?: number }[] = []
        for (const it of realItems) {
          const participants = filledIdx
            .map((oi, pos) => ({ oi, pos }))
            .filter((x) => it.among[x.oi])
            .map((x) => x.pos)
          if (participants.length === 0) return fail('rounds', '모든 항목에 참여자가 1명 이상 필요해요')
          items.push({
            description: it.name.trim() || undefined,
            amount: it.amount,
            participants,
            qty: itemQty(it) > 1 ? itemQty(it) : undefined, // 라인 수량(>1일 때만 전송)
          })
        }
        payload.push({ payerIndex: payerPos, items })
      }
      if (payload.length === 0) return fail('rounds', '금액이 있는 자리를 1개 이상 넣어 주세요')
    }

    const payer = Math.max(0, filledIdx.indexOf(effectivePayer)) // 1/N·쏘기 낸 사람
    // 쏘기: 다 쏠 사람(filled 위치). 있으면 서버가 단일 승자 분담으로(unit/absorber 무시).
    const winner = isShoot && effectiveWinner !== null ? Math.max(0, filledIdx.indexOf(effectiveWinner)) : undefined
    // 안 나눠떨어지면(단위 무관, 안 함의 1~2원 포함) 남는 금액 받을 사람을 골라야. filled 위치로 변환.
    let absorberIdx: number | undefined
    // 흡수자 = 명시 선택 없으면 낸 사람(effectiveAbsorber)이 기본 — 강제 탭 없음. 항상 유효한 채워진 멤버.
    if (!isShoot && leftover > 0) absorberIdx = Math.max(0, filledIdx.indexOf(effectiveAbsorber))

    const resolved = resolveAccount(accounts, accountId, acct)
    if (resolved.error) return fail('account', resolved.error)

    if (!isEdit) trackEvent('create_attempted', { mode }) // 콜드 전환 퍼널: 만들기 시도(검증 통과)
    startTransition(async () => {
      try {
        // 공유 필드. 낸 사람은 1/N=전체 1명(payerIndex), 항목별=차수마다(payload에 포함)라 여기 없음.
        const common = {
          name: title.trim() || TITLES[mode],
          members: names,
          unit,
          absorberIndex: absorberIdx,
          eventDate: eventDate || undefined,
          account: resolved.account,
          saveAccount: resolved.saveAccount,
        }
        const res = isEdit
          ? isAmountMode
            ? await updateQuickSettleAction({ slug: editSlug, amount, payerIndex: payer, winnerIndex: winner, ...common })
            : await updateItemizedBillAction({ slug: editSlug, rounds: payload, ...common })
          : isAmountMode
            ? await quickSettleAction({ amount, payerIndex: payer, winnerIndex: winner, ...common })
            : await addItemizedBillAction({ rounds: payload, ...common })
        if ('needLogin' in res) {
          // 만들기 = 안내 시트(입력값 보존). 수정 = 세션 만료 → 로그인 후 수정 화면으로 복귀.
          if (isEdit) {
            // 어떤 provider로 로그인했는지 모르니 선택 페이지로(강제하면 다른 계정 → 소유자 게이트 막힘).
            window.location.href = `/auth?next=${encodeURIComponent(`/g/${editSlug}/edit`)}`
          } else {
            trackEvent('login_gate_shown', { mode }) // 콜드 이탈 진단: 만들기→로그인 게이트 노출
            loginReason.current = 'submit' // 정산하기 → 로그인 후 자동제출(복원+제출)
            setLoginPrompt(true)
          }
          return
        }
        if (!isEdit) {
          trackEvent('settlement_created', { mode }) // 콜드 전환 퍼널: 생성 성공(=활성화)
          // 내가 만든 정산 표시 → 익명 생성이면 결과 페이지가 '내역에 저장(claim)' 유도(ADR-038 후속).
          try {
            localStorage.setItem(`payven:mine:${res.slug}`, '1')
            localStorage.removeItem(WIP_KEY) // 작성 완료 → '이어서 작성' 초안 비움
          } catch {
            /* 스토리지 차단 무시 */
          }
        }
        router.push(`/g/${res.slug}/settle`)
      } catch (e) {
        setError(e instanceof Error ? e.message : '문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
      }
    })
  }

  const partChip = (active: boolean) =>
    'rounded-full px-3 py-2 text-sm font-medium transition active:scale-95 ' +
    (active
      ? 'bg-brand text-white'
      : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300')
  // 단일 선택(차수 낸 사람)은 미선택도 안 흐리게(참여 토글과 구분).
  const payerChip = (active: boolean) =>
    'rounded-full px-3 py-2 text-sm font-medium transition active:scale-95 ' +
    (active
      ? 'bg-brand text-white'
      : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300')
  const amountBtnCls =
    'num shrink-0 min-w-[88px] rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-center text-[15px] font-semibold tabular-nums dark:border-neutral-700 dark:bg-neutral-950'

  // 참여 칩 한 줄(메뉴/총액 공용) + '한 명이 쏘기'(참여자 중 한 명이 그 항목 전액 — 게임/직접).
  // 참여자를 한 명만 두면 그 사람이 전액 = 쏘기(엔진 그대로). 단순 차수=자리별 쏘기(#1), 메뉴=메뉴별 쏘기(#3) 둘 다 커버.
  const amongRow = (r: number, ii: number, it: RoundItem) => {
    if (filledIdx.length < 1) return null
    const participants = filledIdx.filter((fi) => it.among[fi])
    return (
      <div className="mt-2.5">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="참여 인원">
          <span className="w-10 shrink-0 text-xs text-neutral-500 dark:text-neutral-400">참여</span>
          {filledIdx.map((fi) => (
            <button
              key={fi}
              onClick={() => toggleItemAmong(r, ii, fi)}
              aria-pressed={it.among[fi]}
              className={partChip(it.among[fi])}
            >
              {members[fi].trim()}
            </button>
          ))}
        </div>
        {/* '한 명이 쏘기'는 멤버가 2명 이상일 때만(혼자면 나눌 대상이 없어 노이즈). */}
        {filledIdx.length >= 2 &&
          (participants.length === 1 ? (
            <p className="mt-1.5 pl-12 text-xs font-medium text-brand-700 dark:text-brand">
              {members[participants[0]].trim()}님이 이거 다 쏴요 💸{' '}
              <span className="font-normal text-neutral-400 dark:text-neutral-500">(참여 다시 누르면 나눠 내기)</span>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setItemGame({ r, ii })}
              className="ml-12 mt-1.5 text-xs font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand"
            >
              🎲 한 명이 쏘기
            </button>
          ))}
        {itemGame?.r === r && itemGame?.ii === ii && (
          <AbsorberGame
            candidates={participants.map((fi) => ({ index: fi, name: members[fi].trim() }))}
            prompt={
              <>
                {it.amount > 0 ? (
                  <span className="num font-semibold text-brand-700 dark:text-brand">{formatWon(it.amount)}</span>
                ) : (
                  '이거'
                )}{' '}
                누가 쏠지! 💸
              </>
            }
            onPick={(idx) => patchItem(r, ii, { among: members.map((_, k) => k === idx) })}
            onClose={() => setItemGame(null)}
          />
        )}
      </div>
    )
  }

  // 참여자(공유) — 항목별은 차수 위에, 1/N·쏘기는 금액 아래에 위치(아래 렌더 순서로 분기). 한 번만 렌더됨.
  const membersSection = (
    <section ref={refFor('members')} className="mb-5">
      <p className="mb-2 text-sm font-medium text-neutral-500">누구랑 나눠요?</p>
      <div className="flex flex-col gap-2">
        {members.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              ref={(el) => {
                memberRefs.current[i] = el
              }}
              value={m}
              placeholder={i === 0 ? '내 이름' : '친구 이름'}
              aria-label={i === 0 ? '내 이름' : `친구 ${i} 이름`}
              onChange={(e) => setMember(i, e.target.value)}
              onKeyDown={(e) => onMemberKeyDown(e, i)}
              enterKeyHint="next"
              className="w-full rounded-xl border border-neutral-200 bg-transparent px-4 py-3 text-[16px] outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 dark:border-neutral-700"
            />
            {/* 첫 칸 = '나'(받는 계좌가 항상 여기 붙음) → 삭제 불가·이름만 변경. 친구만 ✕. 빈 칸은 정렬용. */}
            {i === 0 ? (
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center text-xs font-medium text-neutral-400 dark:text-neutral-500"
                aria-hidden="true"
              >
                나
              </span>
            ) : members.length > 2 ? (
              <button
                onClick={() => removeMember(i)}
                aria-label={`친구 ${i} 삭제`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base leading-none text-neutral-400 transition active:scale-90 hover:bg-neutral-100 hover:text-neutral-500 dark:hover:bg-neutral-800"
              >
                ✕
              </button>
            ) : (
              <span className="h-11 w-11 shrink-0" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
      <button
        onClick={addMember}
        className="-mx-1.5 mt-1 inline-flex items-center gap-1 rounded-lg px-1.5 py-2 text-sm font-medium text-neutral-500 transition hover:text-brand-700 dark:hover:text-brand"
      >
        <IcoPlus className="h-4 w-4" /> 사람 추가
      </button>

      {/* 내 모임 — 저장한 사람 묶음을 탭 한 번에 전원 추가 + '현재 멤버 저장'(로그인 시). */}
      {(groupSuggestions.length > 0 || (isLoggedIn && friendNames.length > 0)) && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">내 모임</p>
            {isLoggedIn && friendNames.length > 0 && !groupSaveOpen && (
              <button
                type="button"
                onClick={() => {
                  setGroupSaved(false)
                  setGroupSaveOpen(true)
                }}
                className="text-xs font-medium text-brand"
              >
                현재 멤버 저장
              </button>
            )}
          </div>
          {groupSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {groupSuggestions.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => addMemberNames(g.names)}
                  className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/5 px-3 py-2 text-sm font-medium text-brand-700 transition active:scale-95 hover:border-brand dark:border-brand/40 dark:text-brand"
                >
                  <IcoPlus className="h-3.5 w-3.5" /> {g.label}
                </button>
              ))}
            </div>
          )}
          {groupSaveOpen && (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={groupLabel}
                onChange={(e) => setGroupLabel(e.target.value)}
                placeholder="모임 이름 (예: 회사 점심팟)"
                maxLength={20}
                className="w-full rounded-xl border border-neutral-200 bg-transparent px-3 py-2 text-[16px] outline-none focus:border-brand dark:border-neutral-700"
              />
              <button
                type="button"
                onClick={() => void saveCurrentAsGroup()}
                disabled={!groupLabel.trim() || groupSaving}
                className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
              >
                {groupSaving ? '저장 중…' : '저장'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setGroupSaveOpen(false)
                  setGroupLabel('')
                }}
                className="shrink-0 rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-700"
              >
                취소
              </button>
            </div>
          )}
          {groupSaved && !groupSaveOpen && (
            <p className="mt-1.5 text-xs text-brand">모임으로 저장했어요</p>
          )}
        </div>
      )}

      {/* 최근 참여자 빠른 추가 — 과거 정산에서 쓴 이름을 탭으로(매번 타이핑 안 하게). */}
      {memberSuggestions.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-neutral-500 dark:text-neutral-400">최근 같이 정산한 사람</p>
          <div className="flex flex-wrap gap-2">
            {memberSuggestions.map((n) => (
              <button
                key={n}
                onClick={() => addNamedMember(n)}
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-2 text-sm text-neutral-600 transition active:scale-95 hover:border-brand hover:text-brand-700 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-brand"
              >
                <IcoPlus className="h-3.5 w-3.5" /> {n}
              </button>
            ))}
          </div>
        </div>
      )}
      {errorField === 'members' && error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </section>
  )

  return (
    <main
      className={
        isEdit
          ? 'flex min-h-[100dvh] flex-col px-5 pb-10 pt-6'
          // 하단 예약 = 탭바 높이(safe-area 포함) → sticky CTA가 탭바 바로 위에 붙음(전엔 5rem=80px라 떠 있었음).
          : 'flex min-h-[calc(100dvh_-_4rem_-_env(safe-area-inset-bottom))] flex-col px-5 pt-6'
      }
    >
      {isEdit ? (
        <header className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              window.history.length > 1 ? router.back() : router.push(`/g/${editSlug}/settle`)
            }
            aria-label="뒤로"
            className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition active:scale-95 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <IcoBack className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold tracking-tight">정산 수정</h1>
        </header>
      ) : (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1>
              <Wordmark />
            </h1>
            <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">안 마신 술값 빼고, 누가 뭐 먹었는지까지 딱 나눠요</p>
          </div>
          <ThemeToggle />
        </header>
      )}

      {/* 이어서 작성 중 — 닫았다 다시 열면 초안이 자동 복원됨(빈 폼 X). 새로 만들려면 '새 정산 시작'. */}
      {wip && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-brand/30 bg-brand/5 px-4 py-2.5 dark:border-brand/40 dark:bg-brand/10">
          <p className="min-w-0 truncate text-sm">
            <span className="font-semibold text-brand-700 dark:text-brand">이어서 작성 중</span>
            <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">{savedAgo(wip.savedAt)} 저장</span>
          </p>
          <button
            type="button"
            onClick={startFresh}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-500 transition active:scale-95 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            새 정산 시작
          </button>
        </div>
      )}

      {/* 수정은 교체 — 보냈어요 기록이 있으면 초기화됨을 경고. */}
      {isEdit && initial?.hasSettlements && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          이 정산엔 ‘보냈어요’ 기록이 있어요. 수정하면 송금 완료 표시가 초기화돼요.
        </div>
      )}

      <ModeChips
        value={mode}
        onChange={switchMode}
        modes={['quick', 'items', 'shoot']}
        className="mb-4"
      />

      {/* 제목 (공유) — 기본=모드명, 수정 가능. 기본값 그대로면 정산결과에서 제목 숨김. */}
      <section className="mb-5">
        <p className="mb-2 text-sm font-medium text-neutral-500">뭐라고 부를까요?</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 제주 여행"
          aria-label="정산 제목"
          maxLength={50}
          className="w-full rounded-xl border border-neutral-200 bg-transparent px-4 py-3 text-[16px] font-medium outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 dark:border-neutral-700"
        />
      </section>

      {/* 항목별은 멤버를 먼저(차수의 참여·낸사람 칩이 멤버에 의존). 1/N·쏘기는 금액 아래에 렌더. */}
      {mode === 'items' && membersSection}

      {/* 맨 위 입력 — 1/N·쏘기는 금액 한 칸, 항목별은 차수 묶음 */}
      {isAmountMode ? (
        <button
          ref={refFor('main')}
          onClick={() => setPadOpen(true)}
          className="mb-6 w-full rounded-2xl border border-neutral-100 bg-neutral-50 px-5 py-5 text-left dark:border-neutral-800 dark:bg-neutral-900"
        >
          <span className="text-sm text-neutral-500 dark:text-neutral-400">얼마 나왔어요?</span>
          <div className="num mt-1 text-4xl font-bold tracking-tight">
            {amount > 0 ? (
              formatWon(amount)
            ) : (
              <span className="text-neutral-400 dark:text-neutral-500">0원</span>
            )}
          </div>
        </button>
      ) : (
        <section ref={refFor('main')} className="mb-5">
          <p className="mb-2 text-sm font-medium text-neutral-500">어디어디 갔어요?</p>
          <div className="flex flex-col gap-3">
            {rounds.map((rd, r) => (
              <div
                key={r}
                className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900"
              >
                {/* 차수 라벨·삭제는 자리가 2개 이상일 때만(1개뿐이면 '1차'가 모임 규모 과장). */}
                {rounds.length > 1 && (
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="text-[15px] font-semibold">{r + 1}차</span>
                    <button
                      onClick={() => removeRound(r)}
                      aria-label="차수 삭제"
                      className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base leading-none text-neutral-400 transition active:scale-90 hover:bg-neutral-100 hover:text-neutral-500 dark:hover:bg-neutral-800"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* 차수 낸 사람 */}
                {filledIdx.length >= 1 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="낸 사람">
                    <span className="w-10 shrink-0 text-xs text-neutral-500 dark:text-neutral-400">낸 사람</span>
                    {filledIdx.map((fi) => (
                      <button
                        key={fi}
                        onClick={() => setRoundPayer(r, fi)}
                        aria-pressed={effRoundPayer(rd) === fi}
                        className={payerChip(effRoundPayer(rd) === fi)}
                      >
                        {members[fi].trim()}
                      </button>
                    ))}
                  </div>
                )}

                {!rd.split ? (
                  /* 간단: 총액 + 참여 + 메뉴별로 나누기 */
                  <>
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="text-sm text-neutral-500 dark:text-neutral-400">얼마 나왔어요?</span>
                      <button onClick={() => setPadTarget({ r, i: 0 })} className={amountBtnCls}>
                        {rd.items[0].amount > 0 ? (
                          formatWon(rd.items[0].amount)
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-500">금액</span>
                        )}
                      </button>
                    </div>
                    {amongRow(r, 0, rd.items[0])}
                    <button
                      onClick={() => toggleRoundSplit(r)}
                      className="-mx-1.5 mt-2 inline-flex items-center gap-1 rounded-lg px-1.5 py-2 text-sm font-medium text-neutral-500 transition hover:text-brand-700 dark:hover:text-brand"
                    >
                      <IcoPlus className="h-3.5 w-3.5" /> 메뉴별로 나누기
                    </button>
                  </>
                ) : (
                  /* 메뉴별로 나눔: 영수증 카드 리스트(각 메뉴=카드) + 메뉴 추가 + 간단히 */
                  <div className="mt-2.5 flex flex-col gap-2.5">
                    {rd.items.map((it, ii) => (
                      <div
                        key={ii}
                        className="rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950"
                      >
                        {/* 메뉴 이름 = 카드 제목(테두리 없는 입력) + 삭제 */}
                        <div className="flex items-center gap-1">
                          <input
                            value={it.name}
                            placeholder={`메뉴 ${ii + 1}`}
                            aria-label={`메뉴 ${ii + 1} 이름`}
                            onChange={(e) => patchItem(r, ii, { name: e.target.value })}
                            className="min-w-0 flex-1 rounded-lg bg-neutral-100 px-2.5 py-2 text-[16px] font-semibold text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-400 focus:ring-2 focus:ring-brand/40 dark:bg-neutral-800/70 dark:text-neutral-50 dark:placeholder:text-neutral-500"
                          />
                          {rd.items.length > 1 && (
                            <button
                              onClick={() => removeItemFromRound(r, ii)}
                              aria-label="메뉴 삭제"
                              className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base leading-none text-neutral-400 transition active:scale-90 hover:bg-neutral-100 hover:text-neutral-500 dark:hover:bg-neutral-800"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        {/* 한 줄 영수증: 단가[탭] × 수량 ····· 합계(항상 표시 → 높이 안정, 수량 1이면 단가=합계라 라벨만 숨김) */}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPadTarget({ r, i: ii })}
                              aria-label="단가 입력"
                              className="num shrink-0 rounded-lg border border-neutral-200 bg-neutral-100 px-2.5 py-1.5 text-sm font-medium tabular-nums text-neutral-700 transition active:scale-95 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                            >
                              {it.amount > 0 ? (
                                formatWon(unitOf(it))
                              ) : (
                                <span className="text-neutral-400 dark:text-neutral-500">금액</span>
                              )}
                            </button>
                            <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">×</span>
                            <div className="inline-flex shrink-0 items-center rounded-lg border border-neutral-200 dark:border-neutral-700">
                              <button
                                type="button"
                                onClick={() => changeItemQty(r, ii, itemQty(it) - 1)}
                                disabled={itemQty(it) <= 1}
                                aria-label="수량 줄이기"
                                className="flex h-8 w-8 items-center justify-center text-base leading-none text-neutral-500 transition active:scale-90 hover:text-brand-700 disabled:opacity-30 dark:hover:text-brand"
                              >
                                −
                              </button>
                              <span className="num min-w-[1.5rem] text-center text-sm font-semibold tabular-nums text-neutral-700 dark:text-neutral-200">
                                {itemQty(it)}
                              </span>
                              <button
                                type="button"
                                onClick={() => changeItemQty(r, ii, itemQty(it) + 1)}
                                aria-label="수량 늘리기"
                                className="flex h-8 w-8 items-center justify-center text-base leading-none text-neutral-500 transition active:scale-90 hover:text-brand-700 dark:hover:text-brand"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end leading-tight">
                            {itemQty(it) > 1 && (
                              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">합계</span>
                            )}
                            {it.amount > 0 ? (
                              <span className="num text-base font-bold tabular-nums text-brand-700 dark:text-brand">
                                {formatWon(it.amount)}
                              </span>
                            ) : (
                              <span className="num text-base font-bold tabular-nums text-neutral-300 dark:text-neutral-700">
                                0원
                              </span>
                            )}
                          </div>
                        </div>
                        {amongRow(r, ii, it)}
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-3 px-1">
                      <button
                        onClick={() => addItemToRound(r)}
                        className="-mx-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-2 text-sm font-medium text-neutral-500 transition hover:text-brand-700 dark:hover:text-brand"
                      >
                        <IcoPlus className="h-3.5 w-3.5" /> 메뉴 추가
                      </button>
                      <button
                        onClick={() => toggleRoundSplit(r)}
                        className="-mx-1.5 rounded-lg px-1.5 py-2 text-sm text-neutral-500 underline-offset-2 transition hover:underline dark:text-neutral-400"
                      >
                        메뉴 합치기
                      </button>
                    </div>
                    {/* 영수증 스캔(메뉴 추가/합치기 아래).
                        미로그인: 클릭하면 파일 선택을 열지 않고 로그인 안내(서버도 Gemini 호출 전 차단해 토큰 0 —
                        여기선 사진 선택·업로드 자체를 막아 헛수고·남용 방지). 로그인 후 입력만 복원(자동제출 X).
                        iOS·데스크톱: 누르면 OS 기본 선택(촬영/보관함/파일) 바로 열림.
                        안드로이드(갤럭시): accept만으론 갤러리(포토피커)로 직행해 카메라가 없음 → 누르면
                        '촬영/앨범' 드롭다운을 직접 띄워 카메라 선택을 보장. 옵션 input은 투명 오버레이. */}
                    <div className="relative mt-2 px-1">
                      {ocrRound === r ? (
                        <span className={OCR_PILL + ' pointer-events-none opacity-60'}>📷 인식 중…</span>
                      ) : !isLoggedIn ? (
                        <button
                          type="button"
                          onClick={() => {
                            loginReason.current = 'scan'
                            setLoginPrompt(true)
                          }}
                          className={OCR_PILL}
                        >
                          📷 영수증 스캔
                        </button>
                      ) : onAndroid ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setOcrMenuRound(ocrMenuRound === r ? null : r)}
                            aria-expanded={ocrMenuRound === r}
                            className={OCR_PILL}
                          >
                            📷 영수증 스캔
                          </button>
                          {ocrMenuRound === r && (
                            <>
                              <button
                                type="button"
                                aria-label="닫기"
                                onClick={() => setOcrMenuRound(null)}
                                className="fixed inset-0 z-10 cursor-default"
                              />
                              <div className="absolute left-1 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                                {/* 드롭다운은 onChange(handleReceipt)가 닫는다. 옵션 클릭 시 닫으면(setTimeout)
                                    카메라가 열려 있는 동안 input이 언마운트돼 촬영 결과가 onChange를 못 발화함
                                    (갤럭시 '촬영=무반응' 버그). 취소 시엔 열린 채 → 바깥(백드롭) 탭으로 닫음.
                                    setTimeout 닫기를 다시 넣지 말 것. */}
                                <label className="relative flex cursor-pointer items-center gap-2 overflow-hidden px-3.5 py-2.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
                                  📷 사진 촬영
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    onChange={(e) => handleReceipt(r, e)}
                                  />
                                </label>
                                <label className="relative flex cursor-pointer items-center gap-2 overflow-hidden px-3.5 py-2.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
                                  🖼 앨범에서 가져오기
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    onChange={(e) => handleReceipt(r, e)}
                                  />
                                </label>
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <label className={OCR_PILL}>
                          📷 영수증 스캔
                          <input
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            onChange={(e) => handleReceipt(r, e)}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addRound}
            className="mt-3 flex w-full items-center justify-center gap-1 rounded-2xl border border-dashed border-neutral-300 py-3 text-sm font-medium text-neutral-500 transition hover:border-brand hover:text-brand-700 dark:border-neutral-700 dark:hover:text-brand"
          >
            <IcoPlus className="h-4 w-4" /> {rounds.length + 1}차 추가
          </button>
        </section>
      )}

      {(errorField === 'amount' || errorField === 'rounds') && error && (
        <p className="-mt-2 mb-4 text-sm text-red-500">{error}</p>
      )}

      {/* 참여자 — 1/N·쏘기는 금액 아래(여기), 항목별은 차수 위(맨 위 입력 앞)에 렌더 */}
      {mode !== 'items' && membersSection}

      {/* 낸 사람 — 1/N·쏘기(항목별은 차수마다 '낸 사람'을 따로 고름). 쏘기는 먼저 결제한 사람(진 사람이 갚을 대상). */}
      {isAmountMode && filledIdx.length >= 1 && (
        <section className="mb-5">
          <p className="mb-2 text-sm font-medium text-neutral-500">{isShoot ? '누가 먼저 냈어요?' : '누가 냈어요?'}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="낸 사람">
            {filledIdx.map((i) => (
              <button
                key={i}
                onClick={() => setPayerIndex(i)}
                aria-pressed={effectivePayer === i}
                className={
                  'rounded-full px-4 py-2.5 text-sm font-medium transition active:scale-95 ' +
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

      {/* 쏘기: 누가 다 쏠지 — 멤버 칩(직접) 또는 게임. 한 명이 전액 부담 → 낸 사람에게 송금. */}
      {isShoot && filledIdx.length >= 1 && (
        <section ref={refFor('winner')} className="mb-5">
          <p className="mb-2 text-sm font-medium text-neutral-500">누가 다 쏠까요?</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="다 쏠 사람">
            {filledIdx.map((fi) => (
              <button
                key={fi}
                onClick={() => {
                  setWinnerIndex(fi)
                  setError(null)
                  setErrorField(null)
                }}
                aria-pressed={effectiveWinner === fi}
                className={
                  'rounded-full px-4 py-2.5 text-sm font-medium transition active:scale-95 ' +
                  (effectiveWinner === fi
                    ? 'bg-brand text-white'
                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300')
                }
              >
                {members[fi].trim()}
              </button>
            ))}
          </div>
          {filledIdx.length > 1 && (
            <button
              type="button"
              onClick={() => setGameOpen(true)}
              className="mt-2.5 text-sm font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand"
            >
              🎲 게임으로 정하기
            </button>
          )}
          {gameOpen && (
            <AbsorberGame
              candidates={filledIdx.map((fi) => ({ index: fi, name: members[fi].trim() }))}
              prompt={
                <>
                  {amount > 0 ? (
                    <span className="num font-semibold text-brand-700 dark:text-brand">{formatWon(amount)}</span>
                  ) : (
                    '전액'
                  )}{' '}
                  누가 다 쏠지! 💸
                </>
              }
              onPick={(idx) => {
                setWinnerIndex(idx)
                setError(null)
                setErrorField(null)
              }}
              onClose={() => setGameOpen(false)}
            />
          )}
          {/* 결과 미리보기 — 진 사람=낸 사람이면 정산할 게 없음. */}
          {effectiveWinner !== null && amount > 0 && (
            <p className="mt-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm dark:bg-brand-600/15">
              {effectiveWinner === effectivePayer ? (
                <>
                  <span className="font-semibold text-brand-700 dark:text-brand">{members[effectiveWinner].trim()}</span>
                  님이 다 쏴요 — 본인이 냈으니 정산할 게 없어요.
                </>
              ) : (
                <>
                  <span className="font-semibold text-brand-700 dark:text-brand">{members[effectiveWinner].trim()}</span>
                  님이 <span className="num font-semibold">{formatWon(amount)}</span> 다 쏴요 →{' '}
                  {members[effectivePayer].trim()}님에게 보내요.
                </>
              )}
            </p>
          )}
          {errorField === 'winner' && error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </section>
      )}

      {/* 날짜 (공유) — 기본 오늘, 수정 가능. 네이티브 date 값 렌더는 iOS에서 크기·정렬이 제멋대로라,
          값은 우리가 직접 그리고 투명 input을 위에 겹쳐 피커만 담당시킨다(데스크톱·iOS 동일). */}
      <section className="mb-5">
        <p className="mb-2 text-sm font-medium text-neutral-500">언제 썼어요?</p>
        <div className="relative">
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            aria-label="정산 날짜"
            className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 dark:[color-scheme:dark]"
          />
          <div className="num w-full rounded-xl border border-neutral-200 bg-transparent px-4 py-3 text-[15px] peer-focus:border-brand dark:border-neutral-700">
            {eventDate ? (
              formatDateDisplay(eventDate)
            ) : (
              <span className="text-neutral-400">날짜 선택</span>
            )}
          </div>
        </div>
      </section>

      {/* 금액 단위로 맞추기 (공유) — 친구들이 3,333 대신 3,300 같은 깔끔한 금액을 보내게. 남는 건 고른 사람이. */}
      {showUnit && (
        <section className="mb-5">
          <p className="mb-2 text-sm font-medium text-neutral-500">
            금액 단위로 맞추기 <span className="font-normal text-neutral-500 dark:text-neutral-400">(선택)</span>
          </p>
          <div className="flex gap-2">
            {[1, 10, 100, 1000].map((u) => (
              <button
                key={u}
                onClick={() => {
                  setUnit(u)
                  setAbsorberIndex(null)
                  setError(null)
                  setErrorField(null)
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
            <div
              ref={refFor('absorber')}
              className="mt-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {mode === 'quick' && (
                  <>
                    각자 <span className="num font-semibold text-brand-700 dark:text-brand">{formatWon(quickBase)}</span> ·{' '}
                  </>
                )}
                남은 <span className="num font-semibold">{formatWon(leftover)}</span> 누가 낼까요?
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="남은 금액 받을 사람">
                {filledIdx.map((fi) => (
                  <button
                    key={fi}
                    onClick={() => {
                      setAbsorberIndex(fi)
                      setError(null)
                      setErrorField(null)
                    }}
                    aria-pressed={effectiveAbsorber === fi}
                    className={
                      'rounded-full px-4 py-2.5 text-sm font-medium transition active:scale-95 ' +
                      (effectiveAbsorber === fi
                        ? 'bg-brand text-white'
                        : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300')
                    }
                  >
                    {members[fi].trim()}
                  </button>
                ))}
              </div>
              {filledIdx.length > 1 && (
                <button
                  type="button"
                  onClick={() => setGameOpen(true)}
                  className="mt-2.5 text-sm font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand"
                >
                  🎲 게임으로 정하기
                </button>
              )}
              {gameOpen && (
                <AbsorberGame
                  candidates={filledIdx.map((fi) => ({ index: fi, name: members[fi].trim() }))}
                  leftover={leftover}
                  onPick={(idx) => {
                    setAbsorberIndex(idx)
                    setError(null)
                    setErrorField(null)
                  }}
                  onClose={() => setGameOpen(false)}
                />
              )}
            </div>
          )}
        </section>
      )}

      {/* 미리보기 — 돈 관련 입력(금액·참여·낸 사람·단위) 바로 뒤, 날짜·계좌 앞에서 결과 먼저 확인.
          쏘기는 위 picker에 결과 미리보기가 따로 있어 여기선 숨김. */}
      {!isShoot &&
        (mode === 'quick' ? (
          perPerson > 0 &&
          leftover === 0 && (
            <div className="mb-5 rounded-2xl bg-brand-50 px-4 py-3 text-center dark:bg-brand-600/15">
              <span className="text-sm text-neutral-500">1인당 </span>
              <span className="num text-lg font-bold text-brand-700 dark:text-brand">{formatWon(quickBase)}</span>
            </div>
          )
        ) : (
          total > 0 && (
            <section className="mb-5 rounded-2xl bg-brand-50 px-4 py-3 dark:bg-brand-600/15">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-neutral-500">합계</span>
                <span className="num text-lg font-bold text-brand-700 dark:text-brand">{formatWon(total)}</span>
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
          )
        ))}

      {/* 받을 계좌 (공유). 저장계좌 있으면 칩+'새 계좌', 없으면 인라인 입력(선택). */}
      {accounts !== null && (
        <section ref={refFor('account')} className="mb-5">
          <p className="mb-2 text-sm font-medium text-neutral-500">
            어디로 받을까요? <span className="font-normal text-neutral-500 dark:text-neutral-400">(선택)</span>
          </p>
          <AccountField
            accounts={accounts}
            accountId={accountChipValue}
            onSelect={setAccountId}
            inline={acct}
            onInline={setAcct}
          />
          {(accounts.length === 0 || accountChipValue === NEW_ACCOUNT) && (
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              입력하면 정산에 표시되고, 다음부턴 자동으로 채워져요. 비워두면 계좌 없이 정산돼요.
            </p>
          )}
          {errorField === 'account' && error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
        </section>
      )}

      {error && !errorField && <p className="mt-3 text-center text-sm text-red-500">{error}</p>}

      {/* 1차 액션 — 입력하다 매번 끝까지 스크롤 안 하게 하단 sticky(홈은 탭바 위, 수정은 맨 아래). */}
      <div
        className={
          // 스크림 없이 버튼만 그림자로 떠 있게(사용자 선호). bottom = 탭바 높이(safe 포함)라 탭바 바로 위에 붙음.
          'sticky z-30 -mx-5 mt-auto px-5 pt-3 pb-2 ' +
          (isEdit ? 'bottom-0' : 'bottom-[calc(4rem_+_env(safe-area-inset-bottom))]')
        }
      >
        <button
          onClick={submit}
          disabled={pending}
          className="w-full rounded-2xl bg-brand py-4 text-base font-semibold text-white shadow-lg shadow-brand/20 transition active:scale-[0.99] disabled:opacity-50"
        >
          {pending ? (isEdit ? '저장 중…' : '만드는 중…') : isEdit ? '수정 완료' : '정산하기'}
        </button>
      </div>

      {/* 1/N 금액 숫자패드 */}
      <Numpad open={padOpen} amount={amount} onChange={setAmount} onClose={() => setPadOpen(false)} />
      {/* 항목별 메뉴 금액 숫자패드 — 수량 쓰면 '단가'를 입력받고 금액=단가×수량으로 저장(평소엔 총액 그대로). */}
      <Numpad
        open={padTarget !== null}
        amount={(() => {
          const it = padTarget ? rounds[padTarget.r]?.items[padTarget.i] : null
          return it ? unitOf(it) : 0
        })()}
        onChange={(amt) => {
          if (!padTarget) return
          const it = rounds[padTarget.r]?.items[padTarget.i]
          patchItem(padTarget.r, padTarget.i, { amount: amt * (it ? itemQty(it) : 1) })
        }}
        onClose={() => setPadTarget(null)}
      />
      <LoginSheet
        open={loginPrompt}
        onClose={() => setLoginPrompt(false)}
        onSelect={goLogin}
        // 만들기는 무로그인(게이트 제거, ADR-038) → 이 시트는 영수증 스캔 전용. 혜택을 파는 카피.
        title={loginReason.current === 'scan' ? '영수증 스캔은 로그인 후 쓸 수 있어요' : '정산을 저장하려면 로그인이 필요해요'}
        description={
          loginReason.current === 'scan'
            ? '로그인하면 사진 한 장으로 메뉴·금액이 자동 입력돼요. 입력한 내용은 그대로 이어져요.'
            : '로그인하면 입력한 내용 그대로 이어져요.'
        }
      />
    </main>
  )
}
