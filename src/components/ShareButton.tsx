'use client'

import { useState } from 'react'
import { shareUrl } from '@/lib/share'
import { IcoShare, IcoCheck } from './icons'

export function ShareButton({ title }: { title: string }) {
  const [done, setDone] = useState<null | 'shared' | 'copied'>(null)

  async function onClick() {
    const result = await shareUrl({ title, url: window.location.href })
    setDone(result)
    setTimeout(() => setDone(null), 1600)
  }

  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-brand py-3.5 text-sm font-semibold text-white transition active:scale-[0.99]"
    >
      {done ? <IcoCheck className="h-[18px] w-[18px]" /> : <IcoShare className="h-[18px] w-[18px]" />}
      {done === 'copied' ? '링크 복사됨' : done === 'shared' ? '공유됨' : '공유하기'}
    </button>
  )
}
