'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// 정산 방식 전환 — 상단 세그먼트 칩. 1/N(똑같이) ↔ 항목별.
const MODES = [
  { href: '/', label: '1/N', match: (p: string) => p === '/' },
  { href: '/items', label: '항목별', match: (p: string) => p.startsWith('/items') },
] as const

export function ModeChips({ className }: { className?: string }) {
  const pathname = usePathname()
  return (
    <div className={'flex gap-2 ' + (className ?? '')}>
      {MODES.map((m) => {
        const active = m.match(pathname)
        return (
          <Link
            key={m.href}
            href={m.href}
            aria-current={active ? 'page' : undefined}
            className={
              'rounded-full px-4 py-2 text-sm font-medium transition ' +
              (active
                ? 'bg-brand text-white'
                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700')
            }
          >
            {m.label}
          </Link>
        )
      })}
    </div>
  )
}
