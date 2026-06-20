# 페이븐 — 다음 세션 핸드오프 (2026-06-20)

> 새 세션은 이 파일 + 메모리(자동 로드)부터 읽고 이어서 진행. 결정: **색=그린 확정**. **정체성·M3 항목별·M4 카카오 인증+만들기 게이트 완료·라이브(2026-06-19)**. **받는 사람 저장 계좌(은행/계좌번호/예금주)+토스 버튼+계좌입력 UX 완료·라이브(2026-06-20, 작업 3)** — 인라인 입력·은행 커스텀 드롭다운·숫자만+은행별 하이픈 자동·멤버 엔터 추가. **M5 내역 목록(내가 만든 정산·`owner_id` 재사용) 완료·검증(2026-06-20, 증분 A)** — 내역탭=카드 목록(이름·인원·상대날짜·총액→settle). 다음 = **로그인 스모크(폰: 저장계좌+내역) → 송금완료 기록(증분 B) 또는 구글 로그인**.

## 현재 상태 (M0~M3 + M4 카카오 인증·만들기 게이트 완료, 라이브)
- 라이브(공유용): **`payven-hazel.vercel.app`** (에메랄드 그린). `git push origin main` → Vercel 자동배포.
- IDs: Supabase project `gtssqmibfhkyffvrkhzy`(서울 icn1) / Vercel project `prj_yppD4l9aEleBsPUmZ8iA3yqXGoNm`, team `team_SyQ2rJNlnFscaz3yop6KIfLb`. 카카오 앱 `1491200`(비즈앱).
- MCP: **supabase + vercel 둘 다 연결됨**(`.mcp.json`, gitignore). `.env.local`+Vercel env에 URL·service_role·**`SUPABASE_ANON_KEY`(서버전용 anon — NEXT_PUBLIC_ 아님)**.
- 검증: `npm test`(**41 green**) · `npm run build` · `npm run lint` 통과.
- 코드 지도:
  - `src/domain/` settle(`equalSplit`/`splitByWeights`·netBalances·minimizeCashFlow)·money·rules·types (정산 엔진, 테스트됨)
  - `src/server/` db(service_role)·**`auth.ts`(@supabase/ssr, anon 서버전용·쿠키 세션)**·queries(createQuickSettle·addItemizedBill RPC+owner_id+계좌, getGroupBySlug, **저장계좌 CRUD `listUserAccounts`/`createUserAccount`/`updateUserAccount`/`deleteUserAccount`/`setDefaultUserAccount`**)·ratelimit·validation(+`accountFieldsSchema`/`saveAccountSchema`/`updateAccountSchema`)·database.types
  - `src/app/(tabs)/` 홈(숫자패드+**받을계좌선택**)·내역(빈)·마이(로그인/로그아웃+**내 계좌 관리** `_components/AccountManager`) + `g/[slug]/settle`(+**받는사람 계좌·계좌복사·토스송금** `_components/TossButton`) + `items`(항목별+받을계좌) + `auth/{login,callback,logout}` 라우트 + `actions.ts`(+저장계좌 액션 5종·`getMyAccountsAction`) + `src/middleware.ts`(세션갱신·`?code`→콜백 안전망)
  - `src/components/` Logo·ModeChips·LoginSheet·Numpad·BottomNav·ShareButton·icons·ServiceWorkerRegister·**AccountSelect(`useMyAccounts`훅+`AccountField`[칩/인라인]+`resolveAccount`)**·**BankSelect(커스텀 드롭다운, flip)**
  - `src/lib/` toss(딥링크)·share·banks·**account(`onlyDigits`/`formatAccountNo` 은행별 하이픈, +test)**
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
- Upstash 레이트리밋 활성(현재 no-op, **프로덕션 미설정 시 fail-fast 가드도 함께** — 리뷰 지적) · ✅ Vercel 함수 리전 icn1(`vercel.json`, 2026-06-20 — DB와 동일 리전) · PNG/apple-touch 아이콘 · 카카오 리치 공유카드
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
- **UI**: 마이=`AccountManager`(추가/수정/삭제/기본지정) · 만들기 두 폼=`AccountField`(저장계좌 있으면 **칩**+기본 자동선택 / 없으면 **인라인 입력**[은행·계좌·예금주, 선택] → 입력하면 정산 시 저장돼 다음부턴 자동채움, `resolveAccount`/`saveAccount`; 로그인 왕복에 입력값 보존) · 정산 결과=받는사람 은행/계좌/예금주 + `[계좌 복사]`+`[토스 송금]`(ADR-008 빌더 연결).
- **UX 피드백 반영(2026-06-20)**: "저장계좌 없을 때 안내 링크만 뜨는 게 별로" → **인라인 입력란**으로 교체(입력→정산→자동 저장, 비우면 계좌 없이). 액션이 인라인 입력 계좌를 베스트에포트로 저장(중복 시 건너뜀). 브라우저로 렌더·컨트롤드 입력 확인.
- **불변식 하드닝(0008, 적대적 리뷰 32에이전트 반영)**: 기본 1개 전환을 원자적 RPC로(동시요청 제로-기본 창·유니크 충돌 제거) — `set_default_account`(한 트랜잭션 OFF→ON·미존재 no-op)·`delete_account`(삭제+가장 오래된 승격, `created_at,id` 결정적). create는 `is_default=false` 삽입 후 RPC 전환. 계좌번호 검증=숫자 자릿수(6~20). 실DB로 전환·삭제승격·미존재 no-op·항상 dc=1 검증.
- **검증**: RPC 멤버0 부착 실DB e2e · `user_accounts` RLS/정책0/REVOKE/유니크인덱스 카탈로그 확인 · 정산결과 무로그인 렌더 프리뷰(콘솔 0 에러) · 새 기본/삭제 RPC 실DB e2e · build·lint·test(34) green. **잔여(수동)**: 카카오 로그인 후 마이 CRUD·만들기 자동채움 폰 스모크.
- **결정 핀**: 받는 사람 범위='내 계좌만', 저장='여러 개+기본 지정'(사용자 선택).

### 작업 3 후속 — 계좌입력 UX 이터레이션 (완료·라이브 2026-06-20, 사용자 피드백 연속 반영)
폰에서 라이브 보며 즉석 수정 → 각 건 커밋·배포(8커밋: cd2c824~3ed36a4). 전부 build·lint·test(41) green + 프리뷰로 동작 확인.
- **인라인 입력 전환**: 저장계좌 없을 때 안내 링크 → 은행/계좌/예금주 입력란 직접 노출(입력→정산 시 자동 저장, 비우면 계좌 없이). `resolveAccount`/`saveAccount`(액션 베스트에포트 저장, 중복 건너뜀).
- **은행 커스텀 드롭다운 `BankSelect`**: 네이티브 select→커스텀(화살표 패딩 안쪽, 열린 메뉴=둥근 패널+그림자+선택 브랜드그린·체크, 얇은 스크롤바 모서리 클립). **공간 부족하면 위로 flip + 가용 높이 제한**(하단 탭바 잘림 방지).
- **계좌번호 숫자만 + 은행별 하이픈 자동**: `lib/account`(`onlyDigits`/`formatAccountNo`, 은행별 그룹 테이블). 저장·송금·검증은 숫자만(account_no 숫자 저장), 표시만 하이픈. 은행 바꾸면 즉시 재포맷, 초과 숫자 보존. **하이픈 위치는 best-effort**(상품별 다를 수 있음, 숫자가 정본) — 통장과 다른 은행 있으면 `BANK_GROUPS` 한 줄 수정.
- **멤버 엔터로 추가/이동**: '누구랑 나눠요?' 입력 후 엔터(모바일 `enterKeyHint="next"`) → 마지막 칸이면 새 사람 추가+포커스, 중간이면 다음 칸 이동, 빈 칸은 무시. 홈·항목별 양쪽.
- **잡 수정**: 홈 '1인당' 박스↔정산하기 버튼 간격(mb-4). Vercel 웹훅 누락 1건 → 빈 커밋(31ab5ec) 재트리거로 복구.
- **권한**: `git push origin main` 자동 허용 규칙을 `.claude/settings.local.json`(로컬, 커밋 안 함)에 추가 — 이후 배포 시 안 물어봄.

## ✅ M5 내역 목록 — 내가 만든 정산 (완료·검증 2026-06-20, 증분 A)
내역탭이 빈 자리표시자였음 → M4 `groups.owner_id`(로그인 생성 시 부여) 재사용으로 "내 정산" 목록. **별도 저장 테이블 없음 = 만들면 이미 저장됨.** 상세 근거 [[DECISIONS#ADR-014]].
- **query `listGroupsByOwner(ownerId)`**(읽기): `groups where owner_id order by created_at desc` + `members`/`expenses` `in()` 한 번씩 → JS 집계(인원·총액). **N+1 없이 3쿼리, 새 마이그레이션·RPC 0.** 반환 `SettlementSummary{slug,name,kind,createdAt,memberCount,total}`.
- **내역탭 = Server Component**(읽기라 액션·레이트리밋 불필요, ADR-006): 미로그인=카카오 CTA(`next=/history`) / 로그인+0건=빈상태 / 목록=카드(이름·`N명 · 상대날짜`·총액, 탭→settle). 빠른정산은 다 이름이 "빠른정산"이라 **총액·인원·날짜가 식별 정보**.
- **상대 날짜** `lib/datetime.formatRelativeDay(iso, now)` 순수 유틸 — KST(+9, DST 없음) 캘린더일 기준 오늘/어제/N일 전/`YYYY.MM.DD`. Vercel UTC 보정·now 서버 주입(결정적)·단위테스트로 KST 경계 핀.
- **카피 정리**: settle 푸터 "(곧)" → "로그인하고 만든 정산은 내역에 자동 저장돼요". 내역 빈상태 문구 갱신.
- **검증**: test **47 green**(+datetime 6)·build(`/history` ƒ Dynamic)·lint. 실DB owner 스코프(나희진 4건·null-owner 제외)·집계 대조. 프리뷰 미로그인 CTA(콘솔·서버 에러 0). **잔여(수동)**: 카카오 로그인 후 내역 목록 렌더 폰 스모크.
- **범위 밖(증분 B)**: per-transfer 송금완료 기록(기존 `settlements` → "보냈어요"·차감·"완료" 배지, 공개 링크 write라 withRateLimit+zod 필요).

### 정산결과 UI 후속 — 받는 계좌 상단 1회 (폰 피드백, 2026-06-20)
폰에서 정산결과 보고 4건 수정([[DECISIONS#ADR-013]] UI 갱신, 프리뷰 검증·build·lint green):
- **받는 계좌를 상단 배너 1회로**(행마다 반복 → 1회). '내 계좌만' 모델이라 받는 사람이 하나(=나)면 위에 한 번. `accountMember`(계좌 가진 멤버)가 **받는 사람으로 등장할 때만** 표시 — 내 계좌 오노출 방지 그대로. 행은 `보내는사람→받는사람·금액·[금액복사]·[토스](받는사람=계좌주인 행만)`.
- **계좌번호 안 잘림**: 행 내 truncate 제거 → 배너에서 전체 표시(`484602-04-255161`).
- **iOS 계좌번호 밑줄 제거**: Safari가 계좌번호를 전화번호로 오인해 `tel:` 링크(밑줄)로 만들던 것 → 루트 레이아웃 `formatDetection: { telephone: false }`(메타 `telephone=no`). 프리뷰로 `tel:` 링크 0개 확인.
- **공유 버튼**: 죽은 `flex-1` 제거 + full-width `py-4` primary로 정리.

## ▶ 다음 세션 시작점
1. **로그인 스모크(폰, 미완)** — 카카오 로그인 후 한 번에: ①마이 계좌 추가/기본지정/수정/삭제 + 만들기 자동채움(인라인 첫 저장→다음엔 칩) + 숫자만/하이픈 + 정산결과 토스 ②**내역탭에 내 정산 목록**(이름·인원·상대날짜·총액, 탭하면 settle). (둘 다 OAuth라 이 세션 자동검증 불가.)
2. 본인 은행 계좌번호 하이픈이 통장과 다르면 `src/lib/account.ts` `BANK_GROUPS` 보정.
3. 그다음 택1: **송금완료 기록(M5 증분 B)** = settle "보냈어요"→기존 `settlements` 기록→남은송금 차감·"완료" 배지(공개 링크 write라 withRateLimit+zod 필요) / 또는 **구글 로그인**(M4 잔여, 같은 패턴+인앱웹뷰 폴백).

## 이후 마일스톤
M5 잔여(송금완료 기록·그룹 지속/이름 편집) → M6 운영(레이트리밋·리전·정리·키롤).

## 운영 주의
- Vercel 무료 = **동시 빌드 1개**. 빌드 멈추면 큐 막힘 → Deployments에서 멈춘 배포 **Cancel**(또는 빈 커밋 재트리거).
- git push 시 GCM 계정 picker는 remote URL `favoryteam-star@`로 이미 해결됨.
- 배포 확인은 라이브 CSS에서 `rgb(15 161 119)`(그린) 같은 마커 grep, 또는 vercel MCP `get_deployment`.
