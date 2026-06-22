'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { IcoBack } from '@/components/icons'

const CLS =
  '-ml-1 inline-flex items-center gap-1 text-sm text-neutral-400 transition active:opacity-70 hover:text-neutral-700 dark:hover:text-neutral-200'

// 공유 정산 페이지 상단 뒤로.
//  - 앱 안에서 넘어왔으면(내역·홈 → 정산) 진짜 뒤로가기(router.back) → 온 곳으로 복귀
//  - 공유 링크로 바로 들어온 외부 방문자(뒤로 갈 데 없음)에겐 '새 정산' CTA(홈)
// 판정 = window.history.length(외부 새 탭·인앱 브라우저는 1) — 마운트 후 결정(SSR=false 일치).
export function SettleBackLink() {
  const router = useRouter()
  const [internal, setInternal] = useState(false)
  useEffect(() => {
    setInternal(window.history.length > 1)
  }, [])

  if (internal) {
    return (
      <button type="button" onClick={() => router.back()} aria-label="뒤로" className={CLS}>
        <IcoBack className="h-5 w-5" /> 뒤로
      </button>
    )
  }
  return (
    <Link href="/" aria-label="새 정산 만들기" className={CLS}>
      <IcoBack className="h-5 w-5" /> 새 정산
    </Link>
  )
}
