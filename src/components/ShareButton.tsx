'use client'

import { useState } from 'react'
import { shareUrl } from '@/lib/share'
import { IcoShare, IcoCheck } from './icons'

export function ShareButton({ title }: { title: string }) {
  const [done, setDone] = useState<null | 'shared' | 'copied'>(null)

  async function onClick() {
    if (done) return // 1.6초 피드백 윈도우 중 중복 공유 방지
    const result = await shareUrl({ title, url: window.location.href })
    setDone(result)
    setTimeout(() => setDone(null), 1600)
  }

  return (
    <button
      onClick={onClick}
      disabled={done !== null}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-[15px] font-semibold text-white shadow-sm transition active:scale-[0.99]"
    >
      {done ? <IcoCheck className="h-[18px] w-[18px]" /> : <IcoShare className="h-[18px] w-[18px]" />}
      {done === 'copied' ? '링크 복사됨' : done === 'shared' ? '공유됨' : '공유하기'}
    </button>
  )
}
