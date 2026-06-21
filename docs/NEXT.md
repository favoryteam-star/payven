# 페이븐 — 다음 세션 핸드오프 (2026-06-20)

> 새 세션은 이 파일 + 메모리(자동 로드)부터 읽고 이어서 진행. 결정: **색=그린 확정**. **정체성·M3 항목별·M4 카카오 인증+만들기 게이트 완료·라이브(2026-06-19)**. **받는 사람 저장 계좌(은행/계좌번호/예금주)+토스 버튼+계좌입력 UX 완료·라이브(2026-06-20, 작업 3)** — 인라인 입력·은행 커스텀 드롭다운·숫자만+은행별 하이픈 자동·멤버 엔터 추가. **2026-06-20 추가 완료·라이브**: M5 내역 목록(`owner_id` 재사용) · 정산결과 UI 정리(받는계좌 상단 1회·계좌 안잘림·iOS 밑줄제거·공유버튼) · **Vercel 함수 서울(icn1) 이전**(교차리전 느림 해결) · 정산결과 **받는사람 예금주 실명+맥락(웨이브1)**. **✅ 웨이브 2 완료·검증(2026-06-20)**: 공유 정산 페이지 = 인터랙티브 보드 `SettleBoard`(개인화 '내 것만 콕'[localStorage 신원]+내 차례 히어로+**보냈어요/취소** 송금완료, **주최자=전체 관리·친구=자기 것만** 권한, net 가드, 스키마 변경 0) — 실DB 프리뷰 e2e 통과, [[DECISIONS#ADR-015]]. **✅ 단위 반올림 완료·검증(2026-06-20)**: 빠른정산·항목별에 **단위(10/100/1000원) 내림 + 남는 금액 흡수자 직접 선택** — `splitByWeights` 옵션(`unit`/`absorber`), DB·스키마 변경 0, test 58 green, [[DECISIONS#ADR-016]]. **다음 = 폰 스모크(누적, OAuth라 자동검증 불가) 먼저 → 그다음 구글 로그인(M4 잔여) 또는 그룹 지속/이름 편집** — ▼"다음 세션 시작점".

## 현재 상태 (M0~M3 + M4 카카오 인증·만들기 게이트 완료, 라이브)
- 라이브(공유용): **`payven-hazel.vercel.app`** (에메랄드 그린). `git push origin main` → Vercel 자동배포.
- IDs: Supabase project `gtssqmibfhkyffvrkhzy`(서울 icn1) / Vercel project `prj_yppD4l9aEleBsPUmZ8iA3yqXGoNm`, team `team_SyQ2rJNlnFscaz3yop6KIfLb`. 카카오 앱 `1491200`(비즈앱).
- MCP: **supabase + vercel 둘 다 연결됨**(`.mcp.json`, gitignore). `.env.local`+Vercel env에 URL·service_role·**`SUPABASE_ANON_KEY`(서버전용 anon — NEXT_PUBLIC_ 아님)**.
- 검증: `npm test`(**49 green**) · `npm run build` · `npm run lint` 통과.
- 코드 지도:
  - `src/domain/` settle(`equalSplit`/`splitByWeights`·netBalances·minimizeCashFlow)·money·rules·types (정산 엔진, 테스트됨)
  - `src/server/` db(service_role)·**`auth.ts`(@supabase/ssr, anon 서버전용·쿠키 세션)**·queries(createQuickSettle·addItemizedBill RPC+owner_id+계좌, getGroupBySlug(+`created_at`), **`listGroupsByOwner`(내역 집계)**, **저장계좌 CRUD `listUserAccounts`/`createUserAccount`/`updateUserAccount`/`deleteUserAccount`/`setDefaultUserAccount`**)·ratelimit·validation(+`accountFieldsSchema`/`saveAccountSchema`/`updateAccountSchema`)·database.types
  - `src/app/(tabs)/` 홈(숫자패드+**받을계좌선택**)·내역(**내 정산 목록** Server Component)·마이(로그인/로그아웃+**내 계좌 관리** `_components/AccountManager`) + `g/[slug]/settle`(+**받는사람 계좌·계좌복사·토스송금** `_components/TossButton`) + `items`(항목별+받을계좌) + `auth/{login,callback,logout}` 라우트 + `actions.ts`(+저장계좌 액션 5종·`getMyAccountsAction`) + `src/middleware.ts`(세션갱신·`?code`→콜백 안전망)
  - `src/components/` Logo·ModeChips·LoginSheet·Numpad·BottomNav·ShareButton·icons·ServiceWorkerRegister·**AccountSelect(`useMyAccounts`훅+`AccountField`[칩/인라인]+`resolveAccount`)**·**BankSelect(커스텀 드롭다운, flip)**
  - `src/lib/` toss(딥링크)·share·banks·**account(`onlyDigits`/`formatAccountNo` 은행별 하이픈, +test)**·**`datetime`(KST `formatRelativeDay`/`formatMonthDay`, +test)**
  - 인프라: **`vercel.json` `regions:["icn1"]`**(함수=서울, DB와 동일 리전). 루트 레이아웃 `formatDetection:{telephone:false}`(iOS 밑줄).
  - `supabase/migrations/0001~0009`(init·quick_settle·itemized·group owner_id·rpc owner_id·**user_accounts+members.account_holder**·**rpc 계좌 파라미터**·**기본계좌 원자 RPC `set_default_account`/`delete_account`**·**`groups.event_date`(정산 날짜)**)
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
- **(웨이브1, 2026-06-20) 받는사람 실명 + 맥락**: 공유 페이지라 받는 사람을 멤버명('나') 대신 **예금주 실명**으로(`displayName = accountHolder ?? name`). 히어로에 **"{결제자}님이 결제 · {월일}"** 맥락(`getGroupBySlug`에 `created_at` 추가, `lib/datetime.formatMonthDay` KST). 커스텀 그룹명이면 제목(기본 빠른정산/항목별 정산은 숨김). test 49 green·프리뷰 검증.

## ✅ 웨이브 2 — 공유 정산 페이지 인터랙티브 보드 (완료·검증 2026-06-20)
정산결과 `/g/[slug]/settle`를 "만든 사람 시점→읽는 친구 시점"으로 개편 완료. 웨이브1(받는사람 실명+맥락)에 이어 웨이브2 = **개인화 '내 것만 콕' + 보냈어요/완료/취소**. 상세 근거 [[DECISIONS#ADR-015]]. **스키마 변경 0**(settlements 테이블이 이미 id/from/to/amount/group_id 보유).
- **`SettleBoard`(`'use client'`, settle `_components/`)**: page는 `netBalances`/`minimizeCashFlow`만 계산하고 plain props(`members`[이름=displayName 해석]·`pending`·`done`·`account`·`accountMemberId`) 전달 → 컴포넌트는 필터·렌더만(요약 히어로·공유 푸터는 서버 렌더 유지).
- **신원(개인화)** = `localStorage['payven:me:'+slug]`. 칩 선택→저장, "내가 아니에요" 리셋. SSR=null로 안정 후 하이드레이트 복원(미스매치 0). 저장 id가 멤버에 없으면 무시.
- **내 차례 히어로**: 채무자=" {받는사람}님에게 {금액} 보내면 끝" + 계좌(받는사람=계좌주인 행만 inline)·토스/복사 + **보냈어요** / 받는사람="받을 차례 총 {합}" + 대기·받음 목록 / 둘 다 아니면 "정산할 게 없어요". 아래 **전체 보기** 토글로 기존 pending/done 리스트.
- **송금완료(공개 링크 write → 하드룰6 `withRateLimit`+zod):** `recordSettlement`/`markSentAction`(insert)·`undoSettlement`/`undoSettlementAction`(그 그룹 settlement만 delete). 둘 다 `revalidatePath`+클라 `router.refresh()`. **net 가드**(`fromOwes≥amount && toOwed≥amount`)로 과다기록·역방향 차단(중복 클릭 시 "이미 정산됐어요"). 전부 done이면 "딱 맞췄어요"로 자연 수렴. 남은 송금 차감은 기존 `minimizeCashFlow` 그대로(settlements가 이미 net 반영).
- **표시 타입 분리**: `getGroupBySlug` settlements select에 `id` 추가 → `SettledTransfer{id,from,to,amount}`(취소용). `netBalances`엔 여전히 `SettlementRecord{from,to,amount}`만(도메인 불변).
- **권한 — 주최자 vs 친구(사용자 결정, 2026-06-20 추가):** '전체 관리'(누구의 보냈어요/취소든)는 **정산을 연 사람만**. page가 `getAuthUser()`↔`group.owner_id` 비교(`canManageAll = !ownerId || user.id===ownerId`, `getGroupBySlug`에 `owner_id`→`ownerId` 추가). **주최자(또는 owner 없는 옛 정산)** = 신원 선택 없이 "정산 관리" 보드에서 전체 행 보냈어요/취소. **친구** = 신원 골라 자기 송금만(보낼것=보냈어요·보낸것=취소) + 전체 보기 읽기 전용. 친구 신원(localStorage)은 검증 불가 → '자기 것만'은 **UI 가드**(서버는 net 가드로 계산 안전만 보장); 주최자만 로그인으로 진짜 잠금. 무로그인 viewing 유지(친구 로그인 0).
- **검증**: test 49 green·lint·build(`/g/[slug]/settle` ƒ Dynamic). 무로그인 프리뷰 e2e: ⓐ친구 모드(owner 있는 `beLVTdnLqgAWK5ELGa_aI`)=신원없음→**전체 목록 읽기 전용**→김철수 선택(본인 보냈어요)→보냈어요(실DB insert)→본인 "✓ 보냈어요 [취소]"→취소(실DB delete)→복원, 전체 보기 버튼 0개 확인 ⓑ관리 모드(owner 없는 `ocY-D7NpoysmeAdVIuc-G`)=신원없이 "정산 관리"+전체 행 보냈어요/취소→실DB insert/delete. 양쪽 0건 복구. **주의:** dev에서 이전 세션 PWA SW(`payven-shell-v3`)가 옛 청크 서빙 → "Cannot read … 'call'" 에러 → SW 해제+캐시 삭제로 해결, **SW 캐시 v4로 올림**(프로덕션은 콘텐츠 해시라 안전).
- **잔여(수동)**: 폰 스모크 — **주최자 로그인 시 관리 모드** 렌더(owner 없는 그룹과 동일 경로라 코드 신뢰 높음)·실기기 localStorage 신원·토스 딥링크·보냈어요/취소 왕복.

## ✅ 금액 단위 반올림 + 남는 금액 흡수자 (완료·검증 2026-06-20)
"3,333 보내" 대신 "3,300" 같은 깔끔한 금액으로 보내게 — 사용자 요청. 상세 [[DECISIONS#ADR-016]]. **DB·스키마·RPC 변경 0**(계산된 분담 금액만 저장).
- **도메인**: `splitByWeights` 3번째 인자를 `MemberId | SplitOptions`(과거 호환). `SplitOptions{paidBy?,unit?,absorber?}`. base=unit 배수 내림, 남는 금액은 absorber 한 명(없으면 자동 largest-remainder+sub-unit). **unit=1·흡수자 없음 = 기존과 byte-동일**(49 테스트 보존). 신규 9 테스트(단위·흡수자·300-run 불변식: 비흡수자는 전부 unit 배수).
- **사용자 결정:** 남는 금액=**매번 직접 선택**(자동 기본값 없음) · 범위=**빠른정산+항목별 둘 다**.
- **validation**: `roundUnitSchema(union 1/10/100/1000, default 1)`+`absorberIndex?`(superRefine 범위). **server**: createQuickSettle/addItemizedBill이 도메인에 opts 전달. **항목별=전역 흡수자**(그 항목 참여자일 때만, 아니면 항목 자동 — 비흡수자는 어느쪽이든 깔끔).
- **UI(홈·항목별)**: 단위 칩 [안 함·10원·100원·천원](기본 '안 함'). **안 나눠떨어지면(단위 무관 — 안 함의 1~2원 포함, leftover>0)** "남은 N원 누가 낼까요?" 멤버 칩(필수, 자동 기본값 없음, 안 고르면 제출 막힘). 딱 떨어지면 픽커 없이 1인당 박스(홈)·tabs(항목별). 로그인 draft에 unit·absorberIndex 보존.
- **이터레이션(사용자 피드백)**: "안 함도 안 떨어지면 1~2원 누구한테 줄지 선택돼야" → 흡수자 선택을 `leftover>0` 전체로 확장(UI 조건만 `unit>1`→`leftover>0`, 도메인·서버 그대로). **항상 직접 고르기**(자동 없음). 효과: 안 함도 친구 전원 동일, 고른 사람만 1~2원 더(20,000÷3 → 6,666/6,666/6,668).
- **검증**: test **58 green**·build·lint. 프리뷰 e2e: 홈 100원→"각자 3,300·남은 100", 천원→"각자 3,000·남은 1,000", **안 함 10,000÷3→"각자 3,333·남은 1원"**, 흡수자 미선택→"남는 금액 받을 사람을 골라주세요", 선택→로그인 게이트, **딱 떨어짐 10,000÷2→픽커 없이 1인당 5,000** / 항목별 단위 선택 시 tabs 반올림(자동 나 3,400→홍길동 흡수). **생성은 로그인 게이트라 폰 스모크 잔여**(도메인 합==amount라 RPC 경로 불변).

## ✅ 로그인 왕복 입력값 복원 버그 수정 (완료·검증 2026-06-21)
미로그인 정산 채우고 정산하기→카카오 로그인→복귀 시 **입력값 리셋** 제보. 원인: M4가 쓰던 `/?resume=1` 신호가 **OAuth 리다이렉트(Supabase Site URL 폴백→미들웨어 `?code` 라우팅)에서 유실**(`next` 사라짐, 항목별은 홈으로 떨어짐). 상세 [[DECISIONS#ADR-017]].
- **수정:** 복원 신호를 URL이 아니라 **`sessionStorage` draft 존재로**(같은 탭이라 외부 왕복에도 살아남음). 홈/항목별 마운트 시 draft 있으면 복원+자동제출. **홈이 `payven:draft:items` 발견하면 `/items`로 `location.replace`**(폴백이 홈으로 떨어져도 복원). 서버·인증·스키마 변경 0(클라 useEffect 조건만).
- **검증:** build·lint·test 58. 프리뷰 OAuth 폴백 시뮬(`?resume` 없이 `/` 복귀): 빠른정산 20,000·멤버3·단위100 완전 복원 / 항목별 홈→`/items` 바운스→치킨·콜라·tabs·흡수자 복원. **실 OAuth 왕복 폰 스모크 잔여.** (선택 근본 대안: Supabase Redirect URLs에 콜백 등록해 `redirectTo` 존중 — 코드 수정으로 경로 무관 해결돼 필수 아님.)

## ✅ 정산 만들기 한 페이지 통합(1/N ↔ 항목별 토글) (완료·검증 2026-06-21)
사용자 피드백: 1/N(`/`)·항목별(`/items`)이 별도 페이지라 칩 누르면 헤더 바뀌고 하단탭 사라지고 **입력값 리셋**. → **한 페이지 토글로 통합**. 상세 [[DECISIONS#ADR-018]].
- `ModeChips`를 Link 네비 → **제어형 세그먼트**(value/onChange). 한 페이지(`(tabs)/page.tsx`)에서 `mode` state로 분기. **맨 위 입력칸만 swap**(1/N=금액 위[순서 그대로]·항목별=항목 위), 멤버·낸사람·단위/흡수자·계좌는 공유 → **모드 바꿔도 입력 유지**. `/items`는 `redirect('/')`. 로그인 draft 하나로(`payven:draft:create`+mode) → ADR-017 바운스 제거.
- **두 페이지 중복 코드 한 곳으로**(멤버·낸사람·계좌·단위·엔터이동·로그인 복원). 도메인·서버·검증·스키마 변경 0.
- **검증**: build·lint·test 58 + 프리뷰 e2e(토글 시 `/` 유지·헤더 고정·1/N 금액 위·항목별 항목 위·**멤버/금액 보존**·1/N 흡수자→정산→로그인 게이트·`/items`→`/`). **주의:** dev 떠 있는 채 `npm run build` 돌리면 `.next` 충돌로 dev 500(코드 무관)→dev 재시작+`.next` 삭제로 복구.
- **금액 키보드 입력 추가(2026-06-21, 사용자 피드백):** 금액 숫자패드(`Numpad`)가 터치 버튼만 받아 데스크톱에서 타이핑 불가 → **열려 있을 때 물리 키보드도 받음**(숫자=입력·Backspace=지움·Enter/Esc=닫기). `window` keydown 리스너(열렸을 때만), 다른 입력칸 포커스 시엔 안 가로챔(`e.target` 가드). 훅은 early-return 앞으로. 홈·항목별 금액 공용(같은 컴포넌트). 프리뷰로 타이핑/백스페이스/Enter 확인.

## ✅ 정산 날짜 선택(기본 오늘·수정 가능) (완료·검증 2026-06-21)
사용자 피드백: 정산결과 "{결제자}님이 결제 · {월일}"이 생성 시각 고정 → 날짜 고를 수 있게(기본 오늘). 상세 [[DECISIONS#ADR-019]].
- **`groups.event_date date`(nullable, 0009)** — `created_at`(생성 시각·정렬용)과 분리. 정산결과 표시는 `event_date ?? created_at`(옛 행 폴백). **RPC 미수정**(생성 직후 베스트에포트 `update`). UI=`<input type="date">`(기본 오늘=마운트 후 클라 로컬 set·네이티브 피커+키보드), 검증 `eventDateSchema`(YYYY-MM-DD), draft 보존.
- **검증**: build·lint·test 58 + 프리뷰(기본 오늘·수정 가능·**실DB event_date 세팅→정산결과 "6월 15일" 표시→null 복구**). 잔여: 로그인 후 생성→날짜 저장 폰 스모크. 내역탭 상대날짜는 created_at 유지(범위 밖).

## ✅ 참여자 '최근 같이 정산한 사람' 빠른 추가 (완료·검증 2026-06-21)
사용자 피드백: 매번 이름 타이핑 번거로움 → 과거 정산 이름을 칩으로 탭 추가. 상세 [[DECISIONS#ADR-020]].
- `listRecentMemberNames(ownerId)`(읽기, 2쿼리): 내 그룹 최신순 멤버 이름 dedupe('나'·빈 제외)·최대 12. `getRecentMembersAction`(로그인 필수, 미로그인 []). 만들기 폼 마운트 시 fetch → 참여자 섹션 "최근 같이 정산한 사람" 칩, 탭=`addNamedMember`(빈 칸 채우거나 추가, 항목별 among +true), 들어간 이름 제외. owner_id 재사용(별도 테이블 0).
- **검증**: build·lint·test 58 + 실DB 쿼리(나희진 홍길동·김철수… 최근순) + 프리뷰(anon 칩 숨김 / 임시 시드로 칩 렌더·탭→멤버 추가·칩 사라짐 확인 후 revert). 잔여: 로그인 후 실제 목록 폰 스모크.

## ✅ 정산 제목 입력(기본=모드명, 수정 가능) (완료·검증 2026-06-21)
사용자 피드백: 제목 기본값 채워두고 수정 가능하게. 상세 [[DECISIONS#ADR-021]].
- 만들기 폼 상단(칩 아래) 제목 input. 기본=`빠른정산`/`항목별 정산`, 모드 전환 시 기본값이면 따라가고 직접 고친 건 유지(값이 기본값인지로 판정). 제출 `name`(빈칸이면 폴백). 정산결과는 기존 customName 로직(기본값 숨김·커스텀 표시). `groups.name` 재사용(스키마 0) — quickSettleSchema에 `name` 추가+`createQuickSettle p_name=input.name||'빠른정산'`(항목별은 이미 있던 name UI만 노출). draft 보존.
- **검증**: build·lint·test 58 + 프리뷰(기본·모드 따라감·커스텀 유지) + 실DB(그룹명 커스텀→정산결과 "강남 회식" 표시→원복). 잔여: 로그인 생성→제목 저장 폰 스모크.
- **후속(사용자 피드백): 정산결과 히어로 적응형** — 커스텀 제목이면 제목이 히어로(text-3xl `<h1>`), "총·N명·1인당"은 요약 줄로. 기본/무제목이면 1인당이 히어로(현행). 프리뷰 확인(음식값→제목 히어로 / 빠른정산→1인당 히어로).

## ▶ 다음 세션 시작점 = 폰 스모크 누적분 → 구글 로그인 또는 그룹 지속
웨이브2까지 **라이브 가능 상태**(배포 후). OAuth·실기기 의존이라 자동검증 불가했던 **누적 폰 스모크**를 먼저 정리하는 걸 권장, 그다음 새 기능.
- **① 폰 스모크(미완, 누적):** 카카오 로그인 후 ⓐ마이 계좌 CRUD·만들기 자동채움(인라인 첫 저장→칩) ⓑ내역탭 내 정산 목록 렌더 ⓒ웨이브2 신원/보냈어요/취소 + 주최자 관리 모드 ⓓ**단위 반올림 정산 생성→정산결과 금액**(흡수자만 다르고 나머지 깔끔한지). (코드 신뢰는 높음 — 프리뷰 e2e + 도메인 58테스트 통과. 실기기는 토스 앱·localStorage·OAuth 왕복만 확인.)
- **② 구글 로그인(M4 잔여):** 카카오와 같은 패턴 — Google Cloud OAuth 클라 + 인앱웹뷰 폴백. `src/server/auth.ts`·`/auth/*`·`LoginSheet`에 provider 분기.
- **③ 그룹 지속/이름 편집:** `kind='group'`(현재 전부 'quick') + 그룹명 편집 액션(공개 write→withRateLimit+zod). 내역탭 식별성↑.
- 그다음 **M6 운영**(레이트리밋 활성+프로덕션 fail-fast 가드·키/토큰 롤·임시그룹 cleanup).

### 그 외 잔여(웨이브2와 별개)
- **폰 스모크(미완, OAuth라 자동검증 불가)**: 카카오 로그인 후 ①마이 계좌 CRUD·만들기 자동채움(인라인 첫 저장→칩) ②내역탭 내 정산 목록 렌더.
- 본인 은행 계좌번호 하이픈이 통장과 다르면 `src/lib/account.ts` `BANK_GROUPS` 보정.
- **맥락 문구 피드백**: "{결제자}님이 결제 · {월일}" 표현 사용자 확인 대기(쉽게 변경).

## 이후 마일스톤
~~웨이브2(개인화+송금완료)~~ ✅ → 구글 로그인(M4 잔여)·그룹 지속/이름 편집 → M6 운영(레이트리밋 활성+프로덕션 가드·키롤·정리).

## 운영 주의
- Vercel 무료 = **동시 빌드 1개**. 빌드 멈추면 큐 막힘 → Deployments에서 멈춘 배포 **Cancel**(또는 빈 커밋 재트리거).
- git push 시 GCM 계정 picker는 remote URL `favoryteam-star@`로 이미 해결됨.
- 배포 확인은 라이브 CSS에서 `rgb(15 161 119)`(그린) 같은 마커 grep, 또는 vercel MCP `get_deployment`.
