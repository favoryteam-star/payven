import { IcoList } from '@/components/icons'

export default function HistoryPage() {
  return (
    <main className="px-5 pt-6">
      <h1 className="mb-6 text-xl font-bold tracking-tight">내역</h1>
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 px-6 py-16 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <IcoList className="h-9 w-9 text-neutral-300" />
        <p className="text-[15px] font-medium">아직 저장한 정산이 없어요</p>
        <p className="text-sm text-neutral-400">
          정산을 저장하면 여기에 모여요.
          <br />
          로그인하면 어느 기기에서나 볼 수 있어요. (곧)
        </p>
      </div>
    </main>
  )
}
