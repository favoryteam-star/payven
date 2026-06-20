'use client'

// 정산 방식 전환 — 상단 세그먼트 칩(같은 페이지 내 토글, 페이지 이동 X). 1/N(똑같이) ↔ 항목별.
export type SettleMode = 'quick' | 'items'

const MODES: { value: SettleMode; label: string }[] = [
  { value: 'quick', label: '1/N' },
  { value: 'items', label: '항목별' },
]

export function ModeChips({
  value,
  onChange,
  className,
}: {
  value: SettleMode
  onChange: (m: SettleMode) => void
  className?: string
}) {
  return (
    <div className={'flex gap-2 ' + (className ?? '')}>
      {MODES.map((m) => {
        const active = value === m.value
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            aria-pressed={active}
            className={
              'rounded-full px-4 py-2 text-sm font-medium transition ' +
              (active
                ? 'bg-brand text-white'
                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700')
            }
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
