'use client'

import { useState } from 'react'
import { copyText } from '@/lib/share'

export function CopyButton({ value, label = '복사' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await copyText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          /* 클립보드 미지원 — 무시 */
        }
      }}
      className={
        'shrink-0 rounded-lg border px-3.5 py-2.5 text-[13px] font-medium transition active:scale-[0.98] ' +
        (copied
          ? 'border-brand/40 text-brand'
          : 'border-neutral-200 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300')
      }
    >
      {copied ? '복사됨 ✓' : label}
    </button>
  )
}
