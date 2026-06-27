'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { claimGroupAction } from '@/app/actions'
import { LoginButtons } from '@/components/LoginButtons'

// 익명(무로그인 생성) 정산을 만든 사람에게만 '내역에 저장' 유도(ADR-038 후속, 성장 루프 ③).
// "내가 만들었다"는 증거 = 생성 시 심은 localStorage 마커(이 브라우저에만 있음). 서버 claim은
// 'owner null'일 때만 갱신하므로, 남의 정산을 가로채는 건 불가(마커는 UI 노출 게이트일 뿐).
//   미로그인 + 내가 만든 익명 → 로그인 유도(로그인하면 이 페이지로 복귀)
//   로그인 + 내가 만든 익명  → 자동 저장(claim) — 로그인은 저장하려고 한 것
//   이미 소유(저장됨)        → 안 보임
export function ClaimBanner({
  slug,
  isAnon,
  isLoggedIn,
}: {
  slug: string
  isAnon: boolean // 정산 owner가 없음(익명 생성)
  isLoggedIn: boolean
}) {
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  const [mine, setMine] = useState(false)
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')

  // 신원(내가 만듦)은 localStorage에만 → SSR=null로 안정 후 하이드레이트 복원.
  useEffect(() => {
    setHydrated(true)
    try {
      setMine(localStorage.getItem(`payven:mine:${slug}`) === '1')
    } catch {
      /* 스토리지 차단 — 배너 없이 동작 */
    }
  }, [slug])

  // 로그인 + 내가 만든 익명 → 자동 저장(로그인은 이걸 위해 한 것).
  useEffect(() => {
    if (!mine || !isAnon || !isLoggedIn || state !== 'idle') return
    setState('saving')
    claimGroupAction({ slug })
      .then((res) => {
        if (res.ok) {
          try {
            localStorage.removeItem(`payven:mine:${slug}`)
          } catch {
            /* 무시 */
          }
          setState('done')
          router.refresh() // owner 반영 → isAnon=false로 재렌더
        } else {
          setState('error')
        }
      })
      .catch(() => setState('error'))
  }, [mine, isAnon, isLoggedIn, state, slug, router])

  if (!hydrated || !mine) return null // 내가 만든 게 아니면(또는 SSR) 안 보임
  if (!isAnon && state !== 'done') return null // 이미 소유(저장됨)

  if (state === 'done') {
    return (
      <div className="mb-4 rounded-2xl border border-brand/25 bg-brand/5 px-4 py-3 text-sm font-medium text-brand-700 dark:border-brand/30 dark:bg-brand/10 dark:text-brand">
        ✓ 내역에 저장됐어요 — 마이 탭에서 다시 볼 수 있어요.
      </div>
    )
  }

  // 로그인 상태(자동 저장 중/실패)
  if (isLoggedIn) {
    if (state === 'error') {
      return (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-neutral-500">저장하지 못했어요.</span>
          <button
            type="button"
            onClick={() => setState('idle')}
            className="shrink-0 font-medium text-brand-700 dark:text-brand"
          >
            다시 시도
          </button>
        </div>
      )
    }
    return (
      <div className="mb-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
        내역에 저장 중…
      </div>
    )
  }

  // 미로그인 + 내가 만든 익명 → 로그인하면 내 것으로 저장
  return (
    <div className="mb-4 rounded-2xl border border-brand/30 bg-brand/5 p-4 dark:border-brand/25 dark:bg-brand/10">
      <p className="text-[15px] font-bold">이 정산, 내 내역에 저장할까요?</p>
      <p className="mb-3 mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        로그인하면 이 정산을 저장하고 나중에 다시 볼 수 있어요. (안 해도 링크는 그대로 공유돼요.)
      </p>
      <LoginButtons next={`/g/${slug}/settle`} />
    </div>
  )
}
