'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { formatWon } from '@/domain/money'

// 후보 중 한 명을 게임으로 공정하게 정하는 범용 모달. 돌림판/사다리 탭.
// 쓰임: ①잔돈 흡수자(남은 N원 누가 낼지) ②쏘기(누가 다 쏠지). 결과(= members 인덱스)만 onPick으로
// 돌려주고 금액 계산은 기존 도메인이 그대로 함. prompt로 부제만 바꿔 재사용.
// 공정성: crypto 균등 추첨(Math.random 금지). 접근성: prefers-reduced-motion이면 애니메이션 생략.

export type GameCandidate = { index: number; name: string }

type Props = {
  candidates: GameCandidate[]
  // 부제(누구를 왜 뽑는지). 없으면 leftover로 잔돈 흡수자 기본 문구.
  prompt?: ReactNode
  leftover?: number
  onPick: (memberIndex: number) => void
  onClose: () => void
}

// 균등 난수 [0,n) — 거부 표본으로 모듈로 편향 제거.
function randomInt(n: number): number {
  if (n <= 1) return 0
  const buf = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / n) * n
  let x = 0
  do {
    crypto.getRandomValues(buf)
    x = buf[0]
  } while (x >= limit)
  return x % n
}

function reduceMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function short(name: string, max: number): string {
  return name.length > max ? name.slice(0, max) + '…' : name
}

const SEG_COLORS = ['#14B488', '#0FA177', '#0B7E5E', '#119C7C']

export function AbsorberGame({ candidates, prompt, leftover, onPick, onClose }: Props) {
  const [tab, setTab] = useState<'wheel' | 'ladder'>('wheel')
  const [winner, setWinner] = useState<GameCandidate | null>(null)

  // 탭 바꾸면 결과 리셋(다시 굴림). key로 게임 컴포넌트를 새로 마운트(사다리 재생성).
  const switchTab = (t: 'wheel' | 'ladder') => {
    if (t === tab) return
    setWinner(null)
    setTab(t)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5"
      role="dialog"
      aria-modal="true"
      aria-label="게임으로 정하기"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight">🎲 게임으로 정하기</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition active:scale-90 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            ✕
          </button>
        </div>
        <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
          {prompt ?? (
            <>
              남은 <span className="num font-semibold text-brand-700 dark:text-brand">{formatWon(leftover ?? 0)}</span> 누가
              낼지!
            </>
          )}
        </p>

        {/* 탭 */}
        <div className="mb-4 flex gap-1 rounded-full bg-neutral-100 p-1 dark:bg-neutral-800">
          {([['wheel', '🎡 돌림판'], ['ladder', '🪜 사다리']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => switchTab(key)}
              aria-pressed={tab === key}
              className={
                'flex-1 rounded-full py-2 text-sm font-semibold transition ' +
                (tab === key ? 'bg-white text-brand shadow-sm dark:bg-neutral-700 dark:text-white' : 'text-neutral-500')
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* 게임 — winner 있으면 다시 굴리기 전까지 고정. key로 탭 전환 시 새 마운트. */}
        <div className="flex flex-col items-center">
          {tab === 'wheel' ? (
            <Wheel candidates={candidates} onResult={setWinner} />
          ) : (
            <Ladder candidates={candidates} onResult={setWinner} />
          )}
        </div>

        {/* 결과 */}
        {winner && (
          <div className="mt-4">
            <p className="pv-pop text-center text-lg font-bold">
              <span className="text-brand-700 dark:text-brand">{winner.name}</span>님 당첨! 🎉
            </p>
            <button
              onClick={() => {
                onPick(winner.index)
                onClose()
              }}
              className="mt-3 w-full rounded-2xl bg-brand py-3.5 text-base font-semibold text-white shadow-lg shadow-brand/20 transition active:scale-[0.99]"
            >
              {winner.name}으로 정하기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 돌림판 ──────────────────────────────────────────────────────
const WHEEL_R = 120
const WHEEL_C = 130

function Wheel({ candidates, onResult }: { candidates: GameCandidate[]; onResult: (c: GameCandidate) => void }) {
  const n = candidates.length
  const [rotation, setRotation] = useState(0)
  const [animMs, setAnimMs] = useState(4000)
  const [spinning, setSpinning] = useState(false)
  const [done, setDone] = useState(false)

  const slices = useMemo(() => {
    const seg = 360 / n
    return candidates.map((c, i) => {
      const a0 = ((i * seg - 90) * Math.PI) / 180
      const a1 = (((i + 1) * seg - 90) * Math.PI) / 180
      const x0 = WHEEL_C + WHEEL_R * Math.cos(a0)
      const y0 = WHEEL_C + WHEEL_R * Math.sin(a0)
      const x1 = WHEEL_C + WHEEL_R * Math.cos(a1)
      const y1 = WHEEL_C + WHEEL_R * Math.sin(a1)
      const large = seg > 180 ? 1 : 0
      const d =
        n === 1
          ? `M${WHEEL_C - WHEEL_R},${WHEEL_C} a${WHEEL_R},${WHEEL_R} 0 1 0 ${WHEEL_R * 2},0 a${WHEEL_R},${WHEEL_R} 0 1 0 ${-WHEEL_R * 2},0`
          : `M${WHEEL_C},${WHEEL_C} L${x0},${y0} A${WHEEL_R},${WHEEL_R} 0 ${large} 1 ${x1},${y1} Z`
      const mid = ((i + 0.5) * seg - 90) * (Math.PI / 180)
      const lx = WHEEL_C + WHEEL_R * 0.62 * Math.cos(mid)
      const ly = WHEEL_C + WHEEL_R * 0.62 * Math.sin(mid)
      return { d, lx, ly, rot: (i + 0.5) * seg, color: SEG_COLORS[i % SEG_COLORS.length], name: c.name }
    })
  }, [candidates, n])

  function spin() {
    if (spinning) return
    const seg = 360 / n
    const w = randomInt(n)
    const reduce = reduceMotion()
    const offset = (360 - (w * seg + seg / 2) + 360) % 360
    const base = rotation - (rotation % 360)
    let target = base + (reduce ? 0 : 5) * 360 + offset
    if (target <= rotation) target += 360
    setAnimMs(reduce ? 0 : 4000)
    setSpinning(true)
    setDone(false)
    setRotation(target)
    window.setTimeout(
      () => {
        setSpinning(false)
        setDone(true)
        onResult(candidates[w])
      },
      reduce ? 60 : 4100,
    )
  }

  return (
    <>
      <div className="relative" style={{ width: 260, height: 272 }}>
        <div
          className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: '11px solid transparent',
            borderRight: '11px solid transparent',
            borderTop: '18px solid #ef4444',
          }}
        />
        <svg viewBox="0 0 260 260" width="260" height="260" style={{ marginTop: 6 }}>
          <g
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: `${WHEEL_C}px ${WHEEL_C}px`,
              transition: `transform ${animMs}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`,
            }}
          >
            {slices.map((s, i) => (
              <g key={i}>
                <path d={s.d} fill={s.color} stroke="#fff" strokeWidth={2} />
                {n > 1 && (
                  <text
                    x={s.lx}
                    y={s.ly}
                    fill="#fff"
                    fontSize={n > 8 ? 11 : 13}
                    fontWeight={700}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${s.rot}, ${s.lx}, ${s.ly})`}
                  >
                    {short(s.name, 5)}
                  </text>
                )}
              </g>
            ))}
            {n === 1 && (
              <text x={WHEEL_C} y={WHEEL_C} fill="#fff" fontSize={15} fontWeight={700} textAnchor="middle" dominantBaseline="middle">
                {candidates[0].name}
              </text>
            )}
          </g>
          <circle cx={WHEEL_C} cy={WHEEL_C} r={16} fill="#fff" stroke="#e5e5e5" strokeWidth={2} />
        </svg>
      </div>
      <button
        onClick={spin}
        disabled={spinning}
        className="mt-1 rounded-full bg-neutral-900 px-7 py-2.5 text-sm font-bold text-white transition active:scale-95 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {spinning ? '돌리는 중…' : done ? '다시 돌리기' : '돌리기'}
      </button>
    </>
  )
}

// ── 사다리타기 ──────────────────────────────────────────────────
const LADDER_W = 260
const LADDER_H = 230
const LADDER_PADX = 26
const LADDER_TOPY = 34
const LADDER_BOTY = 200

function ladderColX(i: number, n: number): number {
  return n === 1 ? LADDER_W / 2 : LADDER_PADX + (i * (LADDER_W - 2 * LADDER_PADX)) / (n - 1)
}

type LadderGame = {
  rowYs: number[]
  bars: number[][]
  paths: { x: number; y: number }[][]
  winBottom: number
  winStart: number
}

// 사다리 1회 생성(crypto). 행마다 인접 기둥 사이 가로대 무작위(같은 행 인접 중복 회피=X자 방지).
function buildLadder(candidates: GameCandidate[], n: number): LadderGame {
  const ROWS = Math.max(4, n + 2)
  const rowYs = Array.from({ length: ROWS }, (_, r) => LADDER_TOPY + ((r + 1) * (LADDER_BOTY - LADDER_TOPY)) / (ROWS + 1))
  const bars: number[][] = []
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = []
    for (let c = 0; c < n - 1; c++) {
      if (row.includes(c - 1)) continue
      if (randomInt(2) === 0) row.push(c)
    }
    bars.push(row)
  }
  const paths: { x: number; y: number }[][] = []
  const endOf: number[] = []
  for (let start = 0; start < n; start++) {
    let pos = start
    const pts: { x: number; y: number }[] = [{ x: ladderColX(pos, n), y: LADDER_TOPY }]
    for (let r = 0; r < ROWS; r++) {
      pts.push({ x: ladderColX(pos, n), y: rowYs[r] })
      if (bars[r].includes(pos)) {
        pos += 1
        pts.push({ x: ladderColX(pos, n), y: rowYs[r] })
      } else if (bars[r].includes(pos - 1)) {
        pos -= 1
        pts.push({ x: ladderColX(pos, n), y: rowYs[r] })
      }
    }
    pts.push({ x: ladderColX(pos, n), y: LADDER_BOTY })
    paths.push(pts)
    endOf[start] = pos
  }
  const winBottom = randomInt(n)
  const winStart = endOf.indexOf(winBottom)
  return { rowYs, bars, paths, winBottom, winStart: winStart < 0 ? 0 : winStart }
}

function Ladder({ candidates, onResult }: { candidates: GameCandidate[]; onResult: (c: GameCandidate) => void }) {
  const n = candidates.length
  // 마운트 시 1회 생성(useState lazy) — 매 렌더 reshuffle 방지. 탭 전환 시 컴포넌트가 새로 마운트됨.
  const [game] = useState<LadderGame>(() => buildLadder(candidates, n))
  const [started, setStarted] = useState(false)
  const [drawn, setDrawn] = useState(false)

  function start() {
    if (started) return
    const reduce = reduceMotion()
    setStarted(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)))
    window.setTimeout(() => onResult(candidates[game.winStart]), reduce ? 60 : 2400)
  }

  // 💸(당첨 칸·아래)에서 이름(위)으로 거꾸로 그린다 — 시작점이 당첨자 이름이면 스포일러라,
  // 아래에서 올라가며 마지막에 누구인지 드러나게(진짜 사다리타기의 긴장감).
  const winPath = [...game.paths[game.winStart]]
    .reverse()
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
    .join(' ')

  return (
    <>
      <svg viewBox={`0 0 ${LADDER_W} ${LADDER_H}`} width={LADDER_W} height={LADDER_H}>
        {candidates.map((c, i) => (
          <g key={i}>
            <line x1={ladderColX(i, n)} y1={LADDER_TOPY} x2={ladderColX(i, n)} y2={LADDER_BOTY} stroke="#d4d4d4" strokeWidth={3} strokeLinecap="round" />
            <text x={ladderColX(i, n)} y={LADDER_TOPY - 12} fontSize={11} fontWeight={700} textAnchor="middle" className="fill-neutral-700 dark:fill-neutral-200">
              {short(c.name, 4)}
            </text>
            <text x={ladderColX(i, n)} y={LADDER_BOTY + 18} fontSize={14} textAnchor="middle">
              {i === game.winBottom ? '💸' : '·'}
            </text>
          </g>
        ))}
        {game.bars.map((row, r) =>
          row.map((c) => (
            <line
              key={`${r}-${c}`}
              x1={ladderColX(c, n)}
              y1={game.rowYs[r]}
              x2={ladderColX(c + 1, n)}
              y2={game.rowYs[r]}
              stroke="#d4d4d4"
              strokeWidth={3}
              strokeLinecap="round"
            />
          )),
        )}
        {started && (
          <path
            d={winPath}
            fill="none"
            stroke="#0FA177"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            style={{ strokeDashoffset: drawn ? 0 : 1, transition: reduceMotion() ? 'none' : 'stroke-dashoffset 2.3s ease-in-out' }}
          />
        )}
      </svg>
      <button
        onClick={start}
        disabled={started}
        className="mt-1 rounded-full bg-neutral-900 px-7 py-2.5 text-sm font-bold text-white transition active:scale-95 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {started ? '내려가는 중…' : '시작'}
      </button>
    </>
  )
}
