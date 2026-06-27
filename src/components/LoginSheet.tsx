'use client'

import { LoginButtons } from '@/components/LoginButtons'

// 로그인 안내 바텀시트. "왜 로그인하나"를 혜택으로 명확히 + 카카오/구글 선택.
// title/description은 호출처가 상황별로(영수증 스캔 등) 넘김(기본=저장 안내).
// onSelect는 입력값 보존 후 해당 provider로 보낸다(SettleForm.goLogin).
export function LoginSheet({
  open,
  onClose,
  onSelect,
  title = '정산을 저장하려면 로그인이 필요해요',
  description = '로그인하면 입력한 내용 그대로 이어져요.',
}: {
  open: boolean
  onClose: () => void
  onSelect: (provider: 'kakao' | 'google') => void
  title?: string
  description?: string
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
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="mt-1.5 text-sm text-neutral-500">{description}</p>
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
