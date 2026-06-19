'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IcoHome, IcoList, IcoUser } from './icons'

const TABS = [
  { href: '/', label: '홈', Icon: IcoHome },
  { href: '/history', label: '내역', Icon: IcoList },
  { href: '/my', label: '마이', Icon: IcoUser },
] as const

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-100 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
      <div className="mx-auto flex max-w-app items-stretch justify-around pb-safe">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={
                'flex flex-1 flex-col items-center gap-0.5 pt-2 text-[11px] font-medium transition-colors ' +
                (active ? 'text-brand' : 'text-neutral-400 dark:text-neutral-500')
              }
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-6 w-6" />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
