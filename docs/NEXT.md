# 페이븐 — 다음 세션 핸드오프 (2026-06-19)

> 새 세션은 이 파일 + 메모리(자동 로드)부터 읽고 이어서 진행. 결정: **색=그린 확정**. **정체성 터치 + M3 항목별 정산 완료(2026-06-19)**. 다음 = **M4 인증** 또는 캐리오버.

## 현재 상태 (M0~M3 완료, 라이브)
- 라이브(공유용): **`payven-hazel.vercel.app`** (에메랄드 그린). `git push origin main` → Vercel 자동배포.
- IDs: Supabase project `gtssqmibfhkyffvrkhzy`(서울 icn1) / Vercel project `prj_yppD4l9aEleBsPUmZ8iA3yqXGoNm`, team `team_SyQ2rJNlnFscaz3yop6KIfLb`.
- MCP: **supabase + vercel 둘 다 연결됨**(`.mcp.json`, gitignore). `.env.local`에 URL+service_role 키.
- 검증: `npm test`(34 green) · `npm run build` · `npm run lint` 통과.
- 코드 지도:
  - `src/domain/` settle(`equalSplit`/`splitByWeights`·netBalances·minimizeCashFlow)·money·rules·types (정산 엔진, 테스트됨)
  - `src/server/` db(service_role)·queries(createQuickSettle·addItemizedBill RPC, getGroupBySlug)·ratelimit(graceful)·validation(quickSettle·itemizedBill zod)·database.types
  - `src/app/(tabs)/` 홈(숫자패드)·내역(빈)·마이(빈) + `g/[slug]/settle` + `items`(항목별 에디터) + `actions.ts`
  - `src/components/` Logo(BrandMark/Wordmark)·Numpad·BottomNav·ShareButton·icons(무의존)·ServiceWorkerRegister
  - `supabase/migrations/0001_init.sql`·`0002_create_quick_settle.sql`·`0003_itemized_bill.sql`
  - PWA: `app/manifest.ts`·`public/sw.js`·`public/icon.svg`
- 디자인 토큰: `tailwind.config.ts` brand = 그린 `#0FA177`(Tailwind는 rgb로 컴파일). Pretendard, `.num`(tabular-nums), `pb-safe`.

## ✅ 작업 1 — 정체성 터치 (완료 2026-06-19)
÷ → "=" 균형 모티프 전환. 색·구조 그대로.
- **로고 = 이븐바(=)**: 동일한 흰 막대 2개(pay+even). 후보 5종 생성→비평 후 A안 채택. `public/icon.svg` 풀블리드 그린+그라데이션(마스커블 세이프존 OK), 인라인 `src/components/Logo.tsx`(`BrandMark`/`Wordmark`, brand 토큰=currentColor). 홈 헤더에 워드마크.
- **완료 모먼트**: settle `transfers===0` → 체크 배지 + "딱 맞췄어요 / 더 보낼 것도, 받을 것도 없어요." 강조 한 곳(`.pv-pop`, `prefers-reduced-motion` 존중 — globals.css 미디어쿼리로 무력화).
- **카피**: my "저장하세요"→"저장할 수 있어요"(해요체 통일). 톤 감사 잔여(‘(곧)’ 표기 3화면 통일·settle 푸터 워딩)는 선택 — 미적용.
- 검증: `npm test` 27 green · `npm run build` · `npm run lint` 통과.

## ✅ 작업 2 — M3 항목별 정산 (완료 2026-06-19)
영수증(여러 항목)별 정산. 엔진 재사용, 변경 최소.
- **domain**: `splitByWeights(amount, [{memberId,weight}], paidBy)` 추가(가중 largest-remainder, **정수만**, tie-break: rem 큰 순→낸 사람→id 오름차순). `equalSplit`은 weight=1 위임(반올림 단일 출처). 테스트 +7(불변식·등가·tie-break·검증) → `npm test` **34 green**.
- **schema 0003**(원격 적용+로컬 파일): `expenses.bill_id uuid null`(영수증 묶음)+idx, `split_type` check에 `'weighted'`, `add_itemized_bill(jsonb)` 원자 RPC(N항목+분담 한 트랜잭션 / 항목별 합==amount·원소 타입 가드 / SECURITY INVOKER+service_role grant). `database.types.ts` 재생성 반영.
- **server**: `addItemizedBill()`(participants→`splitByWeights`→멤버정렬 정수배열), `addItemizedBillAction`(withRateLimit+zod `itemizedBillSchema`; 참여자 유니크·인덱스 refine).
- **에디터 `/items`**(`'use client'`, 도메인만 import): 멤버→결제자 1명→항목(이름+금액 Numpad)→항목별 멤버칩 토글(기본 전원, 새 항목은 이전 참여자 상속)→실시간 인별 합계. `effectivePayer` 파생값으로 표시=제출 일치(결제자 비면 첫 멤버 자동). 홈에 "항목별로 나누기" 진입점.
- **V0 단순화**: 결제자 = 영수증 단위 1명(스키마는 항목별 결제자 지원). 부가세/봉사료·수량(parts) 가중 UI는 숨김.
- **검증**: RPC·전체 흐름(에디터→액션→settle) 실제 DB e2e(net 합 0, 최소송금, 빈 멤버 슬롯·결제자 자동보정 포함). 적대적 리뷰(28 에이전트)→확정 4건 수정, RAISE `%` 오탐 2건은 실호출로 기각. build·lint 통과.
- **주의**: dev에서 PWA 서비스워커(`payven-shell-v1`)가 `/_next/static` cache-first라 코드 변경이 안 보일 수 있음 → 캐시 버전 `v2`로 올림. 검증 시 SW 해제+캐시 삭제 후 새로고침.

## 캐리오버 TODO
- M3 후속: 항목별 결제자(현재 영수증 1명) · 부가세/봉사료 옵션(별도 expense로 subtotal 가중) · 수량(parts) 가중 입력 · 영수증 이름 필드
- `NEXT_PUBLIC_SITE_URL=https://payven-hazel.vercel.app` (OG 절대경로)
- Upstash 레이트리밋 활성(현재 no-op, **프로덕션 미설정 시 fail-fast 가드도 함께** — 리뷰 지적) · Vercel 함수 리전 icn1(`vercel.json`) · PNG/apple-touch 아이콘 · 카카오 리치 공유카드
- 노출된 service_role 키·MCP 토큰 **프로덕션 전 롤**
- repo 문서(CLAUDE/PLAN/ARCHITECTURE/DECISIONS)는 아직 무로그인 V0/V1 기준 → **V2(인증·항목별·PWA)로 갱신 필요**(M4 인증 때 함께)

## 이후 마일스톤
M4 인증(카카오+구글+이메일+익명게스트→linkIdentity, owner_id, 마이탭) → M5 저장/내역 → M6 운영(레이트리밋·리전·정리·키롤).

## 운영 주의
- Vercel 무료 = **동시 빌드 1개**. 빌드 멈추면 큐 막힘 → Deployments에서 멈춘 배포 **Cancel**(또는 빈 커밋 재트리거).
- git push 시 GCM 계정 picker는 remote URL `favoryteam-star@`로 이미 해결됨.
- 배포 확인은 라이브 CSS에서 `rgb(15 161 119)`(그린) 같은 마커 grep, 또는 vercel MCP `get_deployment`.
