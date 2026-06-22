'use client'

// 정산 방식 전환 — 상단 세그먼트 칩(같은 페이지 내 토글, 페이지 이동 X). 1/N(똑같이) ↔ 항목별 ↔ 쏘기.
export type SettleMode = 'quick' | 'items' | 'shoot'

const LABELS: Record<SettleMode, string> = {
  quick: '1/N',
  items: '항목별',
  shoot: '🎲 쏘기',
}
const DEFAULT_MODES: SettleMode[] = ['quick', 'items']

export function ModeChips({
  value,
  onChange,
  modes = DEFAULT_MODES,
  className,
}: {
  value: SettleMode
  onChange: (m: SettleMode) => void
  modes?: SettleMode[] // 노출할 모드(쏘기 진입을 칩으로 둘 때 ['quick','items','shoot'])
  className?: string
}) {
  return (
    <div className={'flex gap-2 ' + (className ?? '')}>
      {modes.map((value0) => {
        const m = { value: value0, label: LABELS[value0] }
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
