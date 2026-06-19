'use client'

// 정산하기 로그인 게이트용 바텀시트. "왜 로그인하나"를 명확히 + 카카오 한 번.
export function LoginSheet({
  open,
  onClose,
  onKakao,
}: {
  open: boolean
  onClose: () => void
  onKakao: () => void
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
          카카오로 1초면 끝 — 입력한 내용은 그대로 이어져요.
        </p>
        <button
          onClick={onKakao}
          className="mt-5 w-full rounded-2xl bg-[#FEE500] py-3.5 text-sm font-semibold text-[#191600] transition active:scale-[0.99]"
        >
          카카오로 계속하기
        </button>
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
