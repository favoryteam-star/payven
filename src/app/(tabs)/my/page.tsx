import { IcoUser } from '@/components/icons'

export default function MyPage() {
  return (
    <main className="px-5 pt-6">
      <h1 className="mb-6 text-xl font-bold tracking-tight">마이</h1>
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-neutral-100 bg-neutral-50 px-6 py-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-200 text-neutral-500 dark:bg-neutral-700">
          <IcoUser className="h-8 w-8" />
        </div>
        <div>
          <p className="text-[15px] font-medium">로그인하고 정산을 저장하세요</p>
          <p className="mt-1 text-sm text-neutral-400">카카오·구글·이메일로 곧 로그인할 수 있어요</p>
        </div>
        <button
          disabled
          className="w-full max-w-xs rounded-2xl bg-neutral-200 py-3.5 text-sm font-semibold text-neutral-500 dark:bg-neutral-700"
        >
          로그인 (준비 중)
        </button>
      </div>
    </main>
  )
}
