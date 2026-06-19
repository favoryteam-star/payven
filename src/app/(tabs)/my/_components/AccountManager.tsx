'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BANKS } from '@/lib/banks'
import {
  deleteAccountAction,
  saveAccountAction,
  setDefaultAccountAction,
  updateAccountAction,
} from '@/app/actions'
import type { SavedAccountDTO } from '@/components/AccountSelect'
import { IcoPlus } from '@/components/icons'

type FormState = {
  bankName: string
  accountNo: string
  accountHolder: string
  label: string
  makeDefault: boolean
}

const inputCls =
  'w-full rounded-xl border border-neutral-200 bg-transparent px-4 py-3 text-[15px] outline-none focus:border-brand dark:border-neutral-700'

// 클라 1차 검증(서버 zod와 동일 규칙). 통과 못 하면 메시지 반환.
function validate(f: FormState): string | null {
  if (!BANKS.includes(f.bankName as (typeof BANKS)[number])) return '은행을 선택해 주세요'
  const holder = f.accountHolder.trim()
  if (holder.length < 1 || holder.length > 20) return '예금주를 확인해 주세요'
  const no = f.accountNo.trim()
  const digits = no.replace(/\D/g, '').length
  if (no.length > 30 || !/^[0-9][0-9-]*[0-9]$/.test(no) || digits < 6 || digits > 20)
    return '계좌번호를 확인해 주세요(숫자 6~20자리)'
  return null
}

function AccountForm({
  initial,
  pending,
  onCancel,
  onSubmit,
}: {
  initial?: SavedAccountDTO
  pending: boolean
  onCancel: () => void
  onSubmit: (f: FormState) => void
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          bankName: initial.bankName,
          accountNo: initial.accountNo,
          accountHolder: initial.accountHolder,
          label: initial.label ?? '',
          makeDefault: initial.isDefault,
        }
      : { bankName: BANKS[0], accountNo: '', accountHolder: '', label: '', makeDefault: false },
  )
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }))

  const submit = () => {
    const msg = validate(form)
    if (msg) return setErr(msg)
    setErr(null)
    onSubmit({
      ...form,
      accountNo: form.accountNo.trim(),
      accountHolder: form.accountHolder.trim(),
      label: form.label.trim(),
    })
  }

  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col gap-2.5">
        <select
          value={form.bankName}
          onChange={(e) => set('bankName', e.target.value)}
          className={inputCls}
          aria-label="은행"
        >
          {BANKS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <input
          value={form.accountNo}
          onChange={(e) => set('accountNo', e.target.value)}
          placeholder="계좌번호 (숫자·하이픈)"
          inputMode="numeric"
          className={`num ${inputCls}`}
        />
        <input
          value={form.accountHolder}
          onChange={(e) => set('accountHolder', e.target.value)}
          placeholder="예금주"
          className={inputCls}
        />
        <input
          value={form.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="별칭 (선택, 예: 월급통장)"
          className={inputCls}
        />
        {!initial?.isDefault && (
          <label className="flex items-center gap-2 px-1 text-sm text-neutral-500">
            <input
              type="checkbox"
              checked={form.makeDefault}
              onChange={(e) => set('makeDefault', e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            기본 계좌로 설정
          </label>
        )}
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

export function AccountManager({ initial }: { initial: SavedAccountDTO[] }) {
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
        <h2 className="text-sm font-medium text-neutral-500">내 계좌</h2>
        {!adding && editing === null && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand"
          >
            <IcoPlus className="h-4 w-4" /> 계좌 추가
          </button>
        )}
      </div>

      {initial.length === 0 && !adding && (
        <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
          저장된 계좌가 없어요. 추가해두면 정산 만들 때 자동으로 채워져요.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {initial.map((a) =>
          editing === a.id ? (
            <li key={a.id}>
              <AccountForm
                initial={a}
                pending={pending}
                onCancel={() => {
                  setError(null)
                  setEditing(null)
                }}
                onSubmit={(f) =>
                  run(() =>
                    updateAccountAction({
                      id: a.id,
                      bankName: f.bankName as (typeof BANKS)[number],
                      accountNo: f.accountNo,
                      accountHolder: f.accountHolder,
                      label: f.label || undefined,
                      makeDefault: f.makeDefault,
                    }),
                  )
                }
              />
            </li>
          ) : (
            <li
              key={a.id}
              className="rounded-2xl border border-neutral-100 bg-white px-4 py-3.5 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold">{a.bankName}</span>
                    {a.isDefault && (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                        기본
                      </span>
                    )}
                  </div>
                  <div className="num mt-0.5 truncate text-sm text-neutral-500">{a.accountNo}</div>
                  <div className="mt-0.5 truncate text-sm text-neutral-400">
                    예금주 {a.accountHolder}
                    {a.label?.trim() ? ` · ${a.label.trim()}` : ''}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {!a.isDefault && (
                  <button
                    type="button"
                    onClick={() => run(() => setDefaultAccountAction({ id: a.id }))}
                    disabled={pending}
                    className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    기본으로
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setAdding(false)
                    setEditing(a.id)
                  }}
                  disabled={pending}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm('이 계좌를 삭제할까요?')) return
                    run(() => deleteAccountAction({ id: a.id }))
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
          <AccountForm
            pending={pending}
            onCancel={() => {
              setError(null)
              setAdding(false)
            }}
            onSubmit={(f) =>
              run(() =>
                saveAccountAction({
                  bankName: f.bankName as (typeof BANKS)[number],
                  accountNo: f.accountNo,
                  accountHolder: f.accountHolder,
                  label: f.label || undefined,
                  makeDefault: f.makeDefault,
                }),
              )
            }
          />
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </section>
  )
}
