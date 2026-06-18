// 토스 송금 딥링크 빌더 (순수, 브라우저 안전).
// best-effort: 모바일 + 토스 앱 설치 시에만 동작. PC는 무반응, 카톡 인앱브라우저는 차단될 수 있음.
// 계좌 복사가 보장된 본진이고, 이건 보조 버튼. (toss.me는 2024.8 종료 — 쓰지 않음)

export interface TossTransfer {
  bankName: string // 한글 짧은 은행명 (예: 국민, 신한, 카카오뱅크)
  accountNo: string // 하이픈 포함 가능 — 숫자만 추출
  amount: number // 정수 원
}

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=viva.republica.toss'

/** supertoss://send?bank=&accountNo=&amount= — 토스 공식 QR/사진송금이 쓰는 스킴 */
export function buildTossUrl({ bankName, accountNo, amount }: TossTransfer): string {
  const bank = encodeURIComponent(bankName)
  const acc = accountNo.replace(/\D/g, '')
  return `supertoss://send?bank=${bank}&accountNo=${acc}&amount=${amount}`
}

/** Android intent:// — 미설치 시 플레이스토어로 fallback */
export function buildTossIntentUrl({ bankName, accountNo, amount }: TossTransfer): string {
  const bank = encodeURIComponent(bankName)
  const acc = accountNo.replace(/\D/g, '')
  const fallback = encodeURIComponent(PLAY_STORE)
  return `intent://send?bank=${bank}&accountNo=${acc}&amount=${amount}#Intent;scheme=supertoss;package=viva.republica.toss;S.browser_fallback_url=${fallback};end`
}
