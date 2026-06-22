'use client'

import { LoginButtons } from '@/components/LoginButtons'

// 정산하기 로그인 게이트용 바텀시트. "왜 로그인하나"를 명확히 + 카카오/구글 선택.
// onSelect는 입력값 보존 후 해당 provider로 보낸다(SettleForm.goLogin).
export function LoginSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (provider: 'kakao' | 'google') => void
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-app rounded-t-3xl bg-white px-6 pb-8 pt-3 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-neutral-200 dark:bg-neutral-700" />
        <h2 className="text-lg font-bold tracking-tight">정산을 저장하려면 로그인이 필요해요</h2>
        <p className="mt-1.5 text-sm text-neutral-500">
          로그인하면 입력한 내용 그대로 이어져요.
        </p>
        <LoginButtons onSelect={onSelect} className="mt-5" />
        <button
          onClick={onClose}
          className="mt-1 w-full py-3 text-sm font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          다음에 할게요
        </button>
      </div>
    </div>
  )
}
