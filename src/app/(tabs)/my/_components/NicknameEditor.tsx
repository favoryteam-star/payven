'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateNicknameAction } from '@/app/actions'

// 마이 탭 프로필 이름 — 표시 + 인라인 수정. 저장하면 user_metadata.display_name 갱신(정산 '내 이름' 기본값에도 반영).
export function NicknameEditor({ initialName }: { initialName: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initialName)
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const save = () => {
    const v = name.trim()
    if (!v) {
      setErr('이름을 입력해 주세요')
      return
    }
    setErr(null)
    startTransition(async () => {
      try {
        const res = await updateNicknameAction({ name: v })
        if (!res.ok) {
          setErr(res.needLogin ? '로그인이 필요해요' : (res.error ?? '바꾸지 못했어요'))
          return
        }
        setEditing(false)
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : '문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
      }
    })
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <p className="truncate text-[15px] font-semibold">{initialName}</p>
        <button
          type="button"
          onClick={() => {
            setName(initialName)
            setErr(null)
            setEditing(true)
          }}
          className="shrink-0 text-xs font-medium text-brand"
        >
          수정
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoFocus
          aria-label="이름"
          className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-transparent px-2 py-1 text-[16px] outline-none focus:border-brand dark:border-neutral-700"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50"
        >
          {pending ? '…' : '저장'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false)
            setErr(null)
          }}
          className="shrink-0 text-xs text-neutral-500"
        >
          취소
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
    </div>
  )
}
