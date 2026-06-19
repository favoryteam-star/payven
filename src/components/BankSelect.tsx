'use client'

import { useEffect, useRef, useState } from 'react'
import { BANKS } from '@/lib/banks'
import { IcoChevronDown, IcoCheck } from './icons'

/**
 * 은행 선택 — 커스텀 드롭다운(네이티브 select 대신).
 * 네이티브 select는 화살표 위치·열린 메뉴 스타일을 못 건드려서 직접 구현.
 */
export function BankSelect({ value, onChange }: { value: string; onChange: (bank: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 바깥 탭하면 닫기(터치·마우스 모두 pointerdown).
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-transparent px-4 py-3 text-left text-[15px] outline-none focus:border-brand dark:border-neutral-700"
      >
        <span>{value}</span>
        <IcoChevronDown
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        // 바깥: 둥근 모서리 + overflow-hidden(스크롤바가 모서리 밖으로 삐져나오지 않게 클립)
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-xl ring-1 ring-black/5 dark:border-neutral-800 dark:bg-neutral-900 dark:ring-white/10">
          {/* 안쪽: 스크롤 + 얇고 둥근 커스텀 스크롤바 */}
          <ul
            role="listbox"
            className="max-h-64 overflow-y-auto p-1.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-300 [&::-webkit-scrollbar-track]:bg-transparent dark:[&::-webkit-scrollbar-thumb]:bg-neutral-600"
          >
            {BANKS.map((b) => {
              const active = b === value
              return (
                <li key={b}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(b)
                      setOpen(false)
                    }}
                    className={
                      'flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-[15px] transition ' +
                      (active
                        ? 'bg-brand/10 font-semibold text-brand'
                        : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800')
                    }
                  >
                    <span>{b}</span>
                    {active && <IcoCheck className="h-4 w-4 shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
