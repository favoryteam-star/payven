'use client'

import { useEffect } from 'react'
import { formatWon } from '@/domain/money'

const MAX = 1_000_000_000

export function Numpad({
  open,
  amount,
  onChange,
  onClose,
}: {
  open: boolean
  amount: number
  onChange: (next: number) => void
  onClose: () => void
}) {
  const press = (d: number) => onChange(Math.min(MAX, amount * 10 + d))
  const back = () => onChange(Math.floor(amount / 10))
  const add = (n: number) => onChange(Math.min(MAX, amount + n))

  // 물리 키보드도 받는다(데스크톱·외장키보드): 숫자=입력, Backspace=지움, Enter/Esc=닫기.
  // 다른 입력칸(멤버 이름 등)에 포커스가 있으면 가로채지 않음. 훅은 early-return 앞.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        onChange(Math.min(MAX, amount * 10 + Number(e.key)))
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        onChange(Math.floor(amount / 10))
      } else if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, amount, onChange, onClose])

  if (!open) return null

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9]

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-label="금액 입력">
      <button aria-label="닫기" className="flex-1 bg-black/30" onClick={onClose} />
      <div className="mx-auto w-full max-w-app rounded-t-3xl bg-white px-4 pb-safe pt-4 dark:bg-neutral-900">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <span className="num text-2xl font-bold">{formatWon(amount)}</span>
          <button onClick={onClose} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white">
            확인
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          {[
            { label: '+1만', n: 10000 },
            { label: '+5천', n: 5000 },
            { label: '+1천', n: 1000 },
          ].map((c) => (
            <button
              key={c.label}
              onClick={() => add(c.n)}
              className="num flex-1 rounded-full border border-neutral-200 py-2 text-sm font-medium text-neutral-600 active:scale-95 dark:border-neutral-700 dark:text-neutral-300"
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="num rounded-xl py-4 text-xl font-semibold active:bg-neutral-100 dark:active:bg-neutral-800"
            >
              {k}
            </button>
          ))}
          <button onClick={() => onChange(Math.min(MAX, amount * 100))} className="num rounded-xl py-4 text-xl font-semibold active:bg-neutral-100 dark:active:bg-neutral-800">
            00
          </button>
          <button onClick={() => press(0)} className="num rounded-xl py-4 text-xl font-semibold active:bg-neutral-100 dark:active:bg-neutral-800">
            0
          </button>
          <button onClick={back} aria-label="지우기" className="rounded-xl py-4 text-xl font-semibold active:bg-neutral-100 dark:active:bg-neutral-800">
            ⌫
          </button>
        </div>
      </div>
    </div>
  )
}
