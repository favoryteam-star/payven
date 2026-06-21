'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteGroupAction } from '@/app/actions'

// 내역 카드 — 탭하면 정산결과로, ⋯ 메뉴로 수정/삭제. 날짜·금액은 서버에서 포맷해 문자열로 받는다(결정적).
export function HistoryCard({
  slug,
  name,
  metaLabel,
  totalLabel,
}: {
  slug: string
  name: string
  metaLabel: string
  totalLabel: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const close = () => {
    setOpen(false)
    setConfirming(false)
    setError(null)
  }

  const onDelete = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await deleteGroupAction({ slug })
        if (!res.ok) {
          setError(res.error ?? '삭제하지 못했어요')
          return
        }
        close()
        router.refresh() // 서버 컴포넌트 재요청 → 지워진 카드 사라짐
      } catch {
        setError('삭제하지 못했어요')
      }
    })
  }

  return (
    <li className="relative">
      <Link
        href={`/g/${slug}/settle`}
        className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-100 bg-white py-3.5 pl-4 pr-12 transition active:scale-[0.99] dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{name}</p>
          <p className="num mt-0.5 text-sm text-neutral-400">{metaLabel}</p>
        </div>
        <div className="num shrink-0 text-[15px] font-bold tracking-tight">{totalLabel}</div>
      </Link>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="더보기"
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-lg leading-none text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800"
      >
        ⋯
      </button>

      {open && (
        <>
          {/* 바깥 클릭 닫기 */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-2 top-12 z-20 w-44 overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
            {confirming ? (
              <div className="p-3">
                <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-300">정말 삭제할까요?</p>
                {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={pending}
                    className="flex-1 rounded-lg bg-red-500 py-2 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {pending ? '삭제 중…' : '삭제'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(false)
                      setError(null)
                    }}
                    className="flex-1 rounded-lg bg-neutral-100 py-2 text-sm font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-200"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col py-1">
                <Link
                  href={`/g/${slug}/edit`}
                  className="px-4 py-2.5 text-left text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-700/50"
                >
                  수정
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="px-4 py-2.5 text-left text-sm font-medium text-red-500 transition hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </li>
  )
}
