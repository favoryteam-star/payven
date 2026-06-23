'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  deleteMemberGroupAction,
  saveMemberGroupAction,
  updateMemberGroupAction,
} from '@/app/actions'
import type { MemberGroupDTO } from '@/components/memberGroups'
import { IcoPlus } from '@/components/icons'

const inputCls =
  'w-full rounded-xl border border-neutral-200 bg-transparent px-4 py-3 text-[16px] outline-none focus:border-brand dark:border-neutral-700'

function GroupForm({
  initial,
  pending,
  onCancel,
  onSubmit,
}: {
  initial?: MemberGroupDTO
  pending: boolean
  onCancel: () => void
  onSubmit: (f: { label: string; names: string[] }) => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  // 마지막에 빈 칸 하나 둬서 바로 입력 가능(저장 시 빈 칸은 거른다).
  const [names, setNames] = useState<string[]>(initial?.names?.length ? [...initial.names, ''] : [''])
  const [err, setErr] = useState<string | null>(null)

  const setName = (i: number, v: string) => setNames((p) => p.map((n, idx) => (idx === i ? v : n)))
  const addName = () => setNames((p) => [...p, ''])
  const removeName = (i: number) => setNames((p) => (p.length <= 1 ? p : p.filter((_, idx) => idx !== i)))

  const submit = () => {
    const lab = label.trim()
    const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
    if (!lab) return setErr('모임 이름을 입력해 주세요')
    if (clean.length === 0) return setErr('한 명 이상 넣어 주세요')
    setErr(null)
    onSubmit({ label: lab, names: clean })
  }

  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col gap-2.5">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="모임 이름 (예: 회사 점심팟)"
          className={inputCls}
        />
        <div className="flex flex-col gap-2">
          {names.map((n, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={n}
                onChange={(e) => setName(i, e.target.value)}
                placeholder="친구 이름"
                className={inputCls}
              />
              {names.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeName(i)}
                  aria-label="이름 삭제"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base leading-none text-neutral-400 transition active:scale-90 hover:bg-neutral-100 hover:text-neutral-500 dark:hover:bg-neutral-800"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addName}
          className="-mx-1.5 inline-flex items-center gap-1 self-start rounded-lg px-1.5 py-1.5 text-sm font-medium text-neutral-500 transition hover:text-brand-700 dark:hover:text-brand"
        >
          <IcoPlus className="h-4 w-4" /> 사람 추가
        </button>
      </div>

      {err && <p className="mt-2 text-sm text-red-500">{err}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-500 disabled:opacity-50 dark:border-neutral-700"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
        >
          {pending ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  )
}

export function MemberGroupManager({ initial }: { initial: MemberGroupDTO[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (fn: () => Promise<{ ok: boolean; needLogin?: true; error?: string }>) => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fn()
        if (!res.ok) {
          setError(res.needLogin ? '로그인이 필요해요' : (res.error ?? '문제가 생겼어요'))
          return
        }
        setAdding(false)
        setEditing(null)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : '문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
      }
    })
  }

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-500">내 모임</h2>
        {!adding && editing === null && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand"
          >
            <IcoPlus className="h-4 w-4" /> 모임 추가
          </button>
        )}
      </div>

      {initial.length === 0 && !adding && (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
          저장된 모임이 없어요. 자주 정산하는 사람들을 모임으로 묶어두면 만들 때 한 번에 추가돼요.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {initial.map((g) =>
          editing === g.id ? (
            <li key={g.id}>
              <GroupForm
                initial={g}
                pending={pending}
                onCancel={() => {
                  setError(null)
                  setEditing(null)
                }}
                onSubmit={(f) =>
                  run(() => updateMemberGroupAction({ id: g.id, label: f.label, names: f.names }))
                }
              />
            </li>
          ) : (
            <li
              key={g.id}
              className="rounded-2xl border border-neutral-100 bg-white px-4 py-3.5 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="text-[15px] font-semibold">{g.label}</div>
              <div className="mt-0.5 text-sm text-neutral-500">
                {g.names.length ? g.names.join(', ') : '비어 있음'}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setAdding(false)
                    setEditing(g.id)
                  }}
                  disabled={pending}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm('이 모임을 삭제할까요?')) return
                    run(() => deleteMemberGroupAction({ id: g.id }))
                  }}
                  disabled={pending}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-red-500 disabled:opacity-50 dark:border-neutral-700"
                >
                  삭제
                </button>
              </div>
            </li>
          ),
        )}
      </ul>

      {adding && (
        <div className="mt-2">
          <GroupForm
            pending={pending}
            onCancel={() => {
              setError(null)
              setAdding(false)
            }}
            onSubmit={(f) => run(() => saveMemberGroupAction({ label: f.label, names: f.names }))}
          />
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </section>
  )
}
