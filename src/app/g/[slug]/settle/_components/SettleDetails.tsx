'use client'

import { useState } from 'react'
import { formatWon } from '@/domain/money'

// page가 계산한 plain props만 받는다(이름은 displayName으로 이미 해석됨, 재계산 금지 — CLAUDE.md).
type DetailItem = { name: string; amount: number; participants: string[] } // participants = 표시 이름
type DetailRound = { payerName: string; items: DetailItem[] }

/** 공유 정산 페이지 '상세히 보기' — 차수→메뉴→참여자(어떤 정산이었는지 맥락). 기본 접힘. */
export function SettleDetails({ rounds, memberCount }: { rounds: DetailRound[]; memberCount: number }) {
  const [open, setOpen] = useState(false)
  const multi = rounds.length > 1 // 자리가 1개뿐이면 '1차' 라벨 생략(모임 규모 과장 방지)

  const chip = 'rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-sm font-medium text-neutral-500 underline-offset-2 transition hover:underline dark:text-neutral-400"
      >
        {open ? '접기' : '상세히 보기'}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {rounds.map((rd, ri) => {
            const total = rd.items.reduce((s, it) => s + it.amount, 0)
            return (
              <div
                key={ri}
                className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3.5 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px] font-semibold">
                    {multi ? `${ri + 1}차` : `${rd.payerName}님이 결제`}
                  </span>
                  <span className="num shrink-0 text-sm font-bold">{formatWon(total)}</span>
                </div>
                {multi && (
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {rd.payerName}님이 결제
                  </p>
                )}

                <ul className="mt-2.5 flex flex-col gap-2.5">
                  {rd.items.map((it, ii) => (
                    <li key={ii}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[15px]">{it.name || '항목'}</span>
                        <span className="num shrink-0 text-neutral-500 dark:text-neutral-400">
                          {formatWon(it.amount)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">참여</span>
                        {it.participants.length >= memberCount ? (
                          <span className={chip}>전원</span>
                        ) : (
                          it.participants.map((name, pi) => (
                            <span key={pi} className={chip}>
                              {name}
                            </span>
                          ))
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
