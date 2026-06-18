// 공유/복사 유틸 (브라우저 전용, 'use client'에서 사용). navigator.share → clipboard fallback.

/** OS 공유시트 열기. 미지원/취소 시 링크를 클립보드에 복사. */
export async function shareUrl(data: {
  title: string
  text?: string
  url: string
}): Promise<'shared' | 'copied'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(data)
      return 'shared'
    } catch {
      // 사용자가 취소했거나 실패 — 복사로 폴백
    }
  }
  await copyText(data.url)
  return 'copied'
}

/** 텍스트 클립보드 복사. */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }
  throw new Error('클립보드를 사용할 수 없습니다')
}
