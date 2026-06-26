import type { Metadata } from 'next'
import Link from 'next/link'
import { Wordmark } from '@/components/Logo'

export const metadata: Metadata = {
  title: '개인정보처리방침 — 페이븐',
  description: '페이븐이 수집·이용하는 개인정보와 이용자 권리 안내.',
}

// 정적 법적 고지 페이지. 앱 스토어(Play) 등록 시 필수인 개인정보처리방침 URL용 +
// 웹앱 자체에도 두는 게 맞다. 내용은 앱이 실제로 수집하는 것 기준(과장·허위 없음).
// 문의처: favory.team@gmail.com
export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-10 pb-safe">
      <div className="mb-8">
        <Link href="/" className="text-sm font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
          ← 홈으로
        </Link>
        <div className="mt-6">
          <Wordmark />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">개인정보처리방침</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">시행일: 2026년 6월 26일</p>
      </div>

      <div className="flex flex-col gap-7 text-[15px] leading-relaxed text-neutral-700 dark:text-neutral-300">
        <p>
          페이븐(이하 &ldquo;서비스&rdquo;)은 링크 기반 친구·모임 정산을 돕는 모바일 웹앱입니다. 서비스는
          기능 제공에 필요한 최소한의 정보만 수집하며, 이용자의 개인정보를 광고·마케팅 목적으로 외부에 판매하지 않습니다.
        </p>

        <section>
          <h2 className="mb-2 text-base font-bold text-neutral-900 dark:text-neutral-100">1. 수집하는 정보</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li><strong>로그인 시</strong>(구글 또는 카카오): 이메일 주소, 이름 또는 닉네임, 프로필 이미지.</li>
            <li>
              <strong>정산을 만들 때</strong>: 이용자가 입력한 정산 제목·금액·참여자 이름·받을 계좌(은행/계좌번호/예금주)·날짜.
            </li>
            <li>
              <strong>영수증 사진으로 메뉴를 채울 때</strong>(선택 기능): 이용자가 업로드한 영수증 사진. 메뉴명·금액 자동 인식에만
              사용되며, 인식 처리 후 서버에 저장하지 않습니다.
            </li>
            <li><strong>자동 수집</strong>: 요청 IP 주소(악용 방지·요청 제한 목적), 일반 접속 로그.</li>
            <li>
              <strong>이용 통계(익명)</strong>: 서비스 개선을 위해 페이지 방문·정산 생성 등 집계 이벤트를 수집합니다.
              쿠키를 사용하지 않으며 개인을 식별하는 정보는 포함하지 않습니다.
            </li>
            <li>
              <strong>로그인 없이 공유 링크만 열어 볼 때</strong>는 별도의 개인정보를 수집하지 않습니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold text-neutral-900 dark:text-neutral-100">2. 이용 목적</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>정산 생성·공유·내역 저장 등 핵심 기능 제공</li>
            <li>로그인 이용자 식별 및 본인이 만든 정산 관리</li>
            <li>서비스 악용·과도한 요청 방지(요청 제한)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold text-neutral-900 dark:text-neutral-100">3. 보관 및 파기</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>정산 데이터는 이용자가 <strong>내역 탭에서 직접 삭제</strong>할 수 있으며, 삭제 시 관련 데이터가 함께 삭제됩니다.</li>
            <li>로그인 계정 정보는 회원 탈퇴 또는 삭제 요청 시 파기합니다.</li>
            <li>요청 제한에 사용되는 IP 정보는 짧은 시간만 임시 저장된 뒤 만료됩니다.</li>
            <li>업로드한 영수증 사진은 메뉴 인식 처리 직후 폐기되며 서비스에 저장하지 않습니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold text-neutral-900 dark:text-neutral-100">4. 처리 위탁 및 제3자</h2>
          <p className="mb-2">서비스 제공을 위해 다음 사업자의 인프라를 이용합니다. 이용자 데이터는 기능 제공 범위 내에서만 처리됩니다.</p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li><strong>Supabase</strong> — 데이터베이스 및 로그인 인증(서울 리전)</li>
            <li><strong>Vercel</strong> — 웹 호스팅 및 익명 이용 통계(Web Analytics, 쿠키 미사용)</li>
            <li><strong>Upstash</strong> — 요청 제한(IP 기반)</li>
            <li><strong>Google · Kakao</strong> — 소셜 로그인 인증</li>
            <li>
              <strong>Google(Gemini API)</strong> — 영수증 사진의 메뉴·금액 자동 인식. 전송된 사진은 인식 목적으로 처리되며
              서비스(페이븐)에는 저장하지 않습니다. 사진의 Google 측 처리는 Google의 정책을 따릅니다.
            </li>
          </ul>
          <p className="mt-2">서비스는 이용자의 개인정보를 위 목적 외 제3자에게 판매하거나 광고 목적으로 제공하지 않습니다.</p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold text-neutral-900 dark:text-neutral-100">5. 이용자의 권리</h2>
          <p>
            이용자는 자신의 정보에 대한 열람·삭제를 요청할 수 있습니다. 로그인 후 만든 정산은 내역 탭에서 직접 수정·삭제할 수 있으며,
            계정 및 그 밖의 정보 삭제는 아래 문의처로 요청할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold text-neutral-900 dark:text-neutral-100">6. 보안</h2>
          <p>
            모든 통신은 HTTPS로 암호화되며, 데이터베이스 접근에 쓰이는 비밀 키는 서버에서만 사용되어 브라우저에 노출되지 않습니다.
            데이터베이스는 행 수준 보안(RLS)으로 보호됩니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold text-neutral-900 dark:text-neutral-100">7. 문의처</h2>
          <p>
            개인정보 관련 문의는{' '}
            <a href="mailto:favory.team@gmail.com" className="font-medium text-brand underline">
              favory.team@gmail.com
            </a>
            로 연락해 주세요.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold text-neutral-900 dark:text-neutral-100">8. 변경 고지</h2>
          <p>
            본 방침이 변경되는 경우 본 페이지를 통해 시행일과 함께 공지합니다.
          </p>
        </section>
      </div>
    </main>
  )
}
