'use client'

import { buildTossIntentUrl, buildTossUrl } from '@/lib/toss'

// 토스 송금 딥링크 버튼(보조 수단). 안드로이드는 intent://(미설치 시 스토어), 그 외 supertoss://.
// best-effort: 모바일 + 토스 앱에서만 동작. 본진은 계좌 복사.
export function TossButton({
  bankName,
  accountNo,
  amount,
}: {
  bankName: string
  accountNo: string
  amount: number
}) {
  const onClick = () => {
    const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
    const url = isAndroid
      ? buildTossIntentUrl({ bankName, accountNo, amount })
      : buildTossUrl({ bankName, accountNo, amount })
    window.location.href = url
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-lg bg-[#0064FF] px-3.5 py-2.5 text-[13px] font-semibold text-white transition active:scale-[0.98]"
    >
      토스 송금
    </button>
  )
}
