# 페이븐 — 다음 세션 핸드오프 (2026-06-20)

> 새 세션은 이 파일 + 메모리(자동 로드)부터 읽고 이어서 진행. 결정: **색=그린 확정**. **정체성·M3 항목별·M4 카카오 인증+만들기 게이트 완료·라이브(2026-06-19)**. **받는 사람 저장 계좌+예금주+토스 버튼 완료(2026-06-20, 작업 3)**. 다음 = **저장계좌 로그인 스모크 → 구글 로그인 또는 M5 내역**.

## 현재 상태 (M0~M3 + M4 카카오 인증·만들기 게이트 완료, 라이브)
- 라이브(공유용): **`payven-hazel.vercel.app`** (에메랄드 그린). `git push origin main` → Vercel 자동배포.
- IDs: Supabase project `gtssqmibfhkyffvrkhzy`(서울 icn1) / Vercel project `prj_yppD4l9aEleBsPUmZ8iA3yqXGoNm`, team `team_SyQ2rJNlnFscaz3yop6KIfLb`. 카카오 앱 `1491200`(비즈앱).
- MCP: **supabase + vercel 둘 다 연결됨**(`.mcp.json`, gitignore). `.env.local`+Vercel env에 URL·service_role·**`SUPABASE_ANON_KEY`(서버전용 anon — NEXT_PUBLIC_ 아님)**.
- 검증: `npm test`(34 green) · `npm run build` · `npm run lint` 통과.
- 코드 지도:
  - `src/domain/` settle(`equalSplit`/`splitByWeights`·netBalances·minimizeCashFlow)·money·rules·types (정산 엔진, 테스트됨)
  - `src/server/` db(service_role)·**`auth.ts`(@supabase/ssr, anon 서버전용·쿠키 세션)**·queries(createQuickSettle·addItemizedBill RPC+owner_id+계좌, getGroupBySlug, **저장계좌 CRUD `listUserAccounts`/`createUserAccount`/`updateUserAccount`/`deleteUserAccount`/`setDefaultUserAccount`**)·ratelimit·validation(+`accountFieldsSchema`/`saveAccountSchema`/`updateAccountSchema`)·database.types
  - `src/app/(tabs)/` 홈(숫자패드+**받을계좌선택**)·내역(빈)·마이(로그인/로그아웃+**내 계좌 관리** `_components/AccountManager`) + `g/[slug]/settle`(+**받는사람 계좌·계좌복사·토스송금** `_components/TossButton`) + `items`(항목별+받을계좌) + `auth/{login,callback,logout}` 라우트 + `actions.ts`(+저장계좌 액션 5종·`getMyAccountsAction`) + `src/middleware.ts`(세션갱신·`?code`→콜백 안전망)
  - `src/components/` Logo·ModeChips·LoginSheet·Numpad·BottomNav·ShareButton·icons·ServiceWorkerRegister·**AccountSelect(`useMyAccounts` 훅+칩)**
  - `supabase/migrations/0001~0008`(init·quick_settle·itemized·group owner_id·rpc owner_id·**user_accounts+members.account_holder**·**rpc 계좌 파라미터**·**기본계좌 원자 RPC `set_default_account`/`delete_account`**)
  - PWA: `app/manifest.ts`·`public/sw.js`(v3, `/auth` 우회)·`public/icon.svg`·`app-icon-{192,256,512}.png`(생성기 `scripts/gen-icon.js`)
- 디자인 토큰: `tailwind.config.ts` brand = 그린 `#0FA177`. Pretendard, `.num`(tabular-nums), `pb-safe`.

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

## ✅ M4 인증 — 카카오 핵심 완료·라이브 (2026-06-19)
- 서버 전용 Supabase Auth(`@supabase/ssr`, anon 키 **서버 전용**·httpOnly 쿠키 → 브라우저 Supabase 키 0개). `src/server/auth.ts`(`getAuthUser` graceful) + `/auth/login·callback·logout` + `src/middleware.ts`(세션 갱신·`/auth/` SW우회·`?code`→`/auth/callback` 안전망). **카카오 로그인 라이브 확인**(나희진, 닉네임+이메일 수집). 마이탭 로그인/로그아웃·프로필.
- **만들기 로그인 게이트(보기는 무로그인)**: 액션이 세션 검증 → 미로그인이면 `needLogin` → 클라가 **안내 시트(`LoginSheet`)** "카카오로 계속하기" → 입력값 sessionStorage 보존 → 카카오 → `?resume=1` 복원 + **자동 제출**(두 번 안 누름) → 정산. `owner_id` 부여(0004 컬럼·0005 RPC, 실DB 검증).
- 카카오 앱 `1491200`(비즈앱): 동의 닉네임/프사=선택·**이메일=필수**(+"값 없으면 입력 요청"). Supabase Kakao **"Allow users without email" ON**. Site URL은 프로덕션 권장(미들웨어 `?code` 안전망이 폴백 커버).
- **남음(M4 잔여)**: 구글 로그인(같은 패턴 — Google Cloud OAuth 클라 + 인앱웹뷰 폴백) · 익명 게스트→`linkIdentity`.

## ✅ 작업 3 — 받는 사람 저장 계좌 + 예금주 + 토스 버튼 연결 (완료 2026-06-20)
택배주소처럼 **내 받을 계좌(은행/계좌번호/예금주)를 로그인 계정에 저장 → 만들기 때 자동 채움**. 상세 근거 [[DECISIONS#ADR-013]].
- **schema 0006**(`user_accounts`: user_id→auth.users·은행/계좌/예금주/별칭/`is_default`, 부분 유니크 `where is_default`, RLS deny-all+REVOKE) + **`members.account_holder`(예금주)**. **0007**: 두 생성 RPC에 `p_acct_{bank,no,holder}` 추가 → **멤버 0('나')에 부착**('내 계좌만'). `database.types.ts` 재생성.
- **server**: 저장계좌 CRUD(전부 `user_id` 스코프; 기본 1개 불변식 = '먼저 끄고 켜기'로 유니크 인덱스 충돌 회피). `getGroupBySlug`에 `account_holder` 추가.
- **actions**: `getMyAccountsAction`(읽기) + `save/update/delete/setDefaultAccountAction`(로그인 필수·withRateLimit·zod).
- **UI**: 마이=`AccountManager`(추가/수정/삭제/기본지정) · 만들기 두 폼=`AccountSelect`(칩, 기본 자동선택, 로그인 왕복 자동제출 시 계좌 로딩 후 제출) · 정산 결과=받는사람 은행/계좌/예금주 + `[계좌 복사]`+`[토스 송금]`(ADR-008 빌더 연결).
- **불변식 하드닝(0008, 적대적 리뷰 32에이전트 반영)**: 기본 1개 전환을 원자적 RPC로(동시요청 제로-기본 창·유니크 충돌 제거) — `set_default_account`(한 트랜잭션 OFF→ON·미존재 no-op)·`delete_account`(삭제+가장 오래된 승격, `created_at,id` 결정적). create는 `is_default=false` 삽입 후 RPC 전환. 계좌번호 검증=숫자 자릿수(6~20). 실DB로 전환·삭제승격·미존재 no-op·항상 dc=1 검증.
- **검증**: RPC 멤버0 부착 실DB e2e · `user_accounts` RLS/정책0/REVOKE/유니크인덱스 카탈로그 확인 · 정산결과 무로그인 렌더 프리뷰(콘솔 0 에러) · 새 기본/삭제 RPC 실DB e2e · build·lint·test(34) green. **잔여(수동)**: 카카오 로그인 후 마이 CRUD·만들기 자동채움 폰 스모크.
- **결정 핀**: 받는 사람 범위='내 계좌만', 저장='여러 개+기본 지정'(사용자 선택).

## ▶ 다음 세션 시작점
1. **저장 계좌 로그인 스모크** — 카카오 로그인 후 마이에서 계좌 추가/기본지정/수정/삭제 + 만들기 자동채움 확인(폰).
2. 남은 UX 미세조정 있으면 반영.
3. 그다음 택1: **구글 로그인 추가**(M4 잔여) 또는 **M5 내역**(내 정산 저장·내역탭 표시·`settlements` 완료기록).

## 이후 마일스톤
M5 저장/내역(정산 저장·내역탭·`settlements` 완료기록) → M6 운영(레이트리밋·리전·정리·키롤).

## 운영 주의
- Vercel 무료 = **동시 빌드 1개**. 빌드 멈추면 큐 막힘 → Deployments에서 멈춘 배포 **Cancel**(또는 빈 커밋 재트리거).
- git push 시 GCM 계정 picker는 remote URL `favoryteam-star@`로 이미 해결됨.
- 배포 확인은 라이브 CSS에서 `rgb(15 161 119)`(그린) 같은 마커 grep, 또는 vercel MCP `get_deployment`.
