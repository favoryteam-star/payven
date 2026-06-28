'use client'

import { useState } from 'react'
import { formatWon } from '@/domain/money'

// page가 계산한 plain props만 받는다(이름은 displayName으로 이미 해석됨, 재계산 금지 — CLAUDE.md).
type DetailParticipant = { name: string; amount: number } // 이름 + 그 메뉴에서의 분담액
type DetailItem = { name: string; amount: number; qty: number; participants: DetailParticipant[] } // qty>1이면 단가×수량 표시
type DetailRound = { payerName: string; items: DetailItem[] }
// 단위 맞춤으로 잔돈을 더 떠안은 사람(이름·차액). 없으면 null. page가 분담액에서 역산해 넘김.
type Absorber = { name: string; extra: number }

/** 공유 정산 '누가 뭘 먹었는지' — 차수→메뉴→참여자(이름·분담액). 항목별 정산의 핵심 가치(안 먹은 건 안 냄)라 기본 펼침. */
export function SettleDetails({ rounds, absorber }: { rounds: DetailRound[]; absorber?: Absorber | null }) {
  const [open, setOpen] = useState(true)
  const multi = rounds.length > 1 // 자리가 1개뿐이면 '1차' 라벨 생략(모임 규모 과장 방지)

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-sm font-medium text-neutral-500 underline-offset-2 transition hover:underline dark:text-neutral-400"
      >
        {open ? '접기' : '🧾 누가 뭘 먹었는지 보기'}
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
                      {it.qty > 1 && (
                        <p className="num mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
                          단가 {formatWon(Math.round(it.amount / it.qty))} × {it.qty}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">참여</span>
                        {it.participants.map((p, pi) => (
                          <span
                            key={pi}
                            className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs dark:bg-neutral-800"
                          >
                            <span className="text-neutral-600 dark:text-neutral-300">{p.name}</span>
                            <span className="num text-neutral-500 dark:text-neutral-400">{formatWon(p.amount)}</span>
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          {/* 단위 맞춤 안내 — 금액을 깔끔하게 맞추느라 남은 자투리를 흡수자 한 명이 더 낸 경우(폼 '남은 N원'과 동일). */}
          {absorber && absorber.extra > 0 && (
            <p className="rounded-2xl bg-brand/5 px-4 py-3 text-xs leading-relaxed text-neutral-600 dark:bg-brand/10 dark:text-neutral-300">
              💡 금액을 깔끔하게 맞추느라{' '}
              <span className="font-semibold text-brand-700 dark:text-brand">{absorber.name}</span>님이 남은 금액{' '}
              <span className="num font-semibold text-brand-700 dark:text-brand">{formatWon(absorber.extra)}</span>을 더
              냈어요.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
