'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteGroupAction, renameGroupAction, setGroupKeptAction } from '@/app/actions'
import { IcoBookmark } from '@/components/icons'

// 내역 카드 — 탭하면 정산결과로, ⋯ 메뉴로 이름 변경·보관·수정·삭제.
// 이름 변경/보관은 비파괴(name·kind만), 수정은 교체(ADR-022). 날짜·금액은 서버 포맷 문자열.
export function HistoryCard({
  slug,
  name,
  kind,
  metaLabel,
  totalLabel,
}: {
  slug: string
  name: string
  kind: string
  metaLabel: string
  totalLabel: string
}) {
  const router = useRouter()
  const kept = kind === 'group'
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete'>('menu')
  const [nameInput, setNameInput] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const close = () => {
    setOpen(false)
    setMode('menu')
    setError(null)
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, fallback: string) => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fn()
        if (!res.ok) {
          setError(res.error ?? fallback)
          return
        }
        close()
        router.refresh() // 서버 컴포넌트 재요청 → 변경 반영
      } catch {
        setError(fallback)
      }
    })
  }

  const onDelete = () => run(() => deleteGroupAction({ slug }), '삭제하지 못했어요')
  const onToggleKept = () => run(() => setGroupKeptAction({ slug, kept: !kept }), '바꾸지 못했어요')
  const onRename = () => {
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === name) {
      close()
      return
    }
    run(() => renameGroupAction({ slug, name: trimmed }), '이름을 바꾸지 못했어요')
  }

  return (
    <li className="relative">
      <Link
        href={`/g/${slug}/settle`}
        className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-100 bg-white py-3.5 pl-4 pr-12 transition active:scale-[0.99] dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[15px] font-semibold">
            {kept && <IcoBookmark className="h-3.5 w-3.5 shrink-0 text-brand" />}
            <span className="truncate">{name}</span>
          </p>
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
          <div className="absolute right-2 top-12 z-20 w-48 overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
            {mode === 'rename' ? (
              <div className="p-3">
                <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">이름 변경</p>
                <input
                  autoFocus
                  value={nameInput}
                  maxLength={50}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onRename()
                    if (e.key === 'Escape') close()
                  }}
                  aria-label="정산 이름"
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus-visible:border-brand dark:border-neutral-600 dark:bg-neutral-900"
                />
                {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={onRename}
                    disabled={pending}
                    className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {pending ? '저장 중…' : '저장'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('menu')
                      setError(null)
                    }}
                    className="flex-1 rounded-lg bg-neutral-100 py-2 text-sm font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-200"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : mode === 'delete' ? (
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
                      setMode('menu')
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
                <button
                  type="button"
                  onClick={() => {
                    setNameInput(name)
                    setMode('rename')
                  }}
                  className="px-4 py-2.5 text-left text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-700/50"
                >
                  이름 변경
                </button>
                <button
                  type="button"
                  onClick={onToggleKept}
                  disabled={pending}
                  className="px-4 py-2.5 text-left text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-neutral-700/50"
                >
                  {kept ? '보관 해제' : '보관'}
                </button>
                <div className="my-1 border-t border-neutral-100 dark:border-neutral-700" />
                <Link
                  href={`/g/${slug}/edit`}
                  className="px-4 py-2.5 text-left text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-700/50"
                >
                  수정
                </Link>
                <button
                  type="button"
                  onClick={() => setMode('delete')}
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
