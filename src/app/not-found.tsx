import Link from 'next/link'
import { Wordmark } from '@/components/Logo'

// 전역 커스텀 404 — 죽은 공유 링크(삭제·수정된 정산, 잘못된 주소)를 받은 사람이 보는 화면.
// Next 기본 영어 404 대신 브랜드 한글 + 홈 CTA. settle page의 notFound()도 여기로 떨어진다.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 pb-safe text-center">
      <div className="w-full max-w-xs">
        <div className="mb-7 flex justify-center">
          <Wordmark />
        </div>
        <h1 className="text-xl font-bold tracking-tight">페이지를 찾을 수 없어요</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          주소가 잘못됐거나, 삭제되거나 수정된 정산일 수 있어요.
        </p>
        <Link
          href="/"
          className="mt-7 block w-full rounded-2xl bg-brand py-4 text-base font-semibold text-white shadow-lg shadow-brand/20 transition active:scale-[0.99]"
        >
          페이븐 홈으로
        </Link>
      </div>
    </main>
  )
}
