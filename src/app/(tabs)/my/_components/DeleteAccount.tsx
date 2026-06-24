'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteMyAccountAction } from '@/app/actions'

// 마이 탭 위험 구역 — 계정·개인정보 삭제(Play 정책: 계정 생성 앱은 삭제 경로 필수).
// 2단계(열기 → 확인 체크 → 삭제)로 오작동 방지. 삭제되는 것/남는 것을 명확히 고지.
export function DeleteAccount() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [ack, setAck] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const remove = () => {
    setErr(null)
    startTransition(async () => {
      try {
        const res = await deleteMyAccountAction({ confirm: true })
        if (!res.ok) {
          setErr(res.needLogin ? '로그인이 필요해요' : (res.error ?? '삭제하지 못했어요'))
          return
        }
        // 계정 삭제 + 로그아웃 완료 → 홈으로.
        router.replace('/')
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : '문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
      }
    })
  }

  if (!open) {
    return (
      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => {
            setAck(false)
            setErr(null)
            setOpen(true)
          }}
          className="text-xs text-neutral-400 underline-offset-2 hover:text-red-500 hover:underline"
        >
          계정 삭제
        </button>
      </div>
    )
  }

  return (
    <section className="mt-6 rounded-2xl border border-red-200 bg-red-50/50 p-5 dark:border-red-900/50 dark:bg-red-950/20">
      <h2 className="text-sm font-bold text-red-600 dark:text-red-400">계정을 삭제할까요?</h2>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">
        <li>
          <strong>삭제</strong>: 로그인 정보(이메일·이름)·저장한 받을 계좌·내 모임
        </li>
        <li>
          <strong>남음</strong>: 이미 공유한 정산 링크는 친구가 볼 수 있게 유지돼요(내 신원은 분리됨). 정산
          기록은 <strong>내역</strong> 탭에서 따로 삭제할 수 있어요.
        </li>
        <li className="font-medium text-red-600 dark:text-red-400">이 작업은 되돌릴 수 없어요.</li>
      </ul>
      <label className="mt-3 flex items-center gap-2 text-[13px] text-neutral-700 dark:text-neutral-300">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          className="h-4 w-4 accent-red-500"
        />
        위 내용을 확인했어요
      </label>
      {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={!ack || pending}
          className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
        >
          {pending ? '삭제 중…' : '계정 삭제'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-500 disabled:opacity-50 dark:border-neutral-700"
        >
          취소
        </button>
      </div>
    </section>
  )
}
