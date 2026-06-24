# 페이븐 — 다음 세션 핸드오프 (2026-06-21)

> 새 세션은 이 파일 + 메모리(자동 로드)부터 읽고 이어서 진행. 결정: **색=그린 확정**. **정체성·M3 항목별·M4 카카오 인증+만들기 게이트 완료·라이브(2026-06-19)**. **받는 사람 저장 계좌(은행/계좌번호/예금주)+토스 버튼+계좌입력 UX 완료·라이브(2026-06-20, 작업 3)** — 인라인 입력·은행 커스텀 드롭다운·숫자만+은행별 하이픈 자동·멤버 엔터 추가. **2026-06-20 추가 완료·라이브**: M5 내역 목록(`owner_id` 재사용) · 정산결과 UI 정리(받는계좌 상단 1회·계좌 안잘림·iOS 밑줄제거·공유버튼) · **Vercel 함수 서울(icn1) 이전**(교차리전 느림 해결) · 정산결과 **받는사람 예금주 실명+맥락(웨이브1)**. **✅ 웨이브 2 완료·검증(2026-06-20)**: 공유 정산 페이지 = 인터랙티브 보드 `SettleBoard`(개인화 '내 것만 콕'[localStorage 신원]+내 차례 히어로+**보냈어요/취소** 송금완료, **주최자=전체 관리·친구=자기 것만** 권한, net 가드, 스키마 변경 0) — 실DB 프리뷰 e2e 통과, [[DECISIONS#ADR-015]]. **✅ 단위 반올림 완료·검증(2026-06-20)**: 빠른정산·항목별에 **단위(10/100/1000원) 내림 + 남는 금액 흡수자 직접 선택**(안 떨어지면 항상, '안 함'의 1~2원 포함) — `splitByWeights` 옵션(`unit`/`absorber`), DB·스키마 변경 0, [[DECISIONS#ADR-016]]. **✅ 2026-06-21 추가 완료·라이브**: 로그인 왕복 입력값 복원 버그 수정(`?resume` 유실→sessionStorage draft 신호, ADR-017) · **1/N·항목별 한 페이지 토글 통합**(별도 `/items` 폐지→redirect, ADR-018) · 금액 **키보드 입력**(Numpad window keydown) · **정산 날짜 선택**(`event_date` 기본 오늘·수정, 0009, ADR-019) · **참여자 '최근 같이 정산한 사람' 빠른 추가 칩**(ADR-020) · **정산 제목 입력**(기본=모드명·수정, ADR-021)+정산결과 **히어로 적응형**(제목 있으면 제목이 큰 글씨) · 제목 라벨 "뭐라고 부를까요?" · 받을 계좌 '안 받음'→'없음' · **내역 수정(교체)·삭제**(ADR-022: 만들기 폼 재사용+교체 RPC 0010, 소유자 가드, ⋯메뉴) · **정산결과 1인당 제거**(ADR-023; 공유 보드 통일은 시도했다 사용자 의도와 달라 ADR-015 신원 개인화로 되돌림) · iOS 날짜 입력 커스텀 표시(ADR-019 후속) · **항목별=차수(round) 2단**(1차·2차 여러 곳 + 차수 안에 메뉴, ADR-024→ADR-025로 일반화, RPC 0011 차수=bill_id). **test 58 green·라이브.** **다음 = 폰 스모크(누적, OAuth/실기기라 자동검증 불가) 먼저 → 그다음 구글 로그인(M4 잔여) 또는 그룹 지속/이름 편집** — ▼"다음 세션 시작점".

## 현재 상태 (M0~M3 + M4 카카오 인증·만들기 게이트 완료, 라이브)
- 라이브(공유용): **`payven.kr`**(정식 도메인 — 가비아 구매 + Vercel 연결, 2026-06-22) + `payven-hazel.vercel.app`(폴백). 에메랄드 그린. `git push origin main` → Vercel 자동배포.
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
- **✅ 구글 로그인 완료·라이브(`8348224`, 2026-06-22, ADR-029):** 클라 진입점 6곳에 구글 추가. 공용 `LoginButtons`(카카오/구글, `next`=앵커·`onSelect`=버튼) · `/auth` 선택 페이지(noindex) · 수정 재인증 게이트 `/auth?next=`로 · 인앱 웹뷰 안내(`lib/ua.ts`) · **🔐 next 오픈 리다이렉트 하드닝**(`lib/next-path.safeNextPath`) · 마이 탭 출처 라벨 `app_metadata.provider` 동적화. **외부 설정 완료**(Google Cloud OAuth 클라 + Supabase Providers→Google 활성) · 서버 OAuth 체인 e2e(307→Supabase authorize→302→accounts.google.com) · **폰 스모크 통과("다 잘돼") = M4 인증 종료.** test 66·lint·build green. (앱 "테스트" 모드 — 타인 공개는 구글 콘솔 '프로덕션 게시' 출시 전 처리.)
- **남음(M4 잔여)**: 익명 게스트→`linkIdentity`(선택).

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

## ✅ 내역 수정(교체)·삭제 (완료·검증 2026-06-21)
사용자 요청: "내역을 수정하거나 삭제" → **전체 수정까지** 결정. 상세 [[DECISIONS#ADR-022]].
- **수정 = 교체(replace):** 만들기 폼을 기존 값으로 시드해 재사용 → 저장 시 그 그룹 자식(settlements/expense_shares/expenses/members) **한 트랜잭션 wipe→재삽입**(group·slug·owner_id 보존). 멤버 FK가 `DEFERRABLE INITIALLY DEFERRED`(0001)라 안전(그룹 cascade와 같은 성질). 신규 RPC **`update_quick_settle`/`update_itemized_bill`(0010**, SECURITY INVOKER+grant, 생성과 분담 계산 동일). **소유자 가드 이중**: RPC `p_owner_id↔owner_id` + 액션 로그인.
- **삭제:** `delete from groups where slug and owner_id`(owner 스코프) + FK cascade. wrong-owner면 0행.
- **의미 결정 2(UI 경고):** ①수정은 교체라 친구 **'보냈어요' 기록 초기화**(기존 기록 있으면 amber 배너) ②멤버 새 id → 친구 '내가 콕'(localStorage) 리셋(재선택). **반올림(unit/absorber)은 저장 안 됨** → 수정 폼은 '안 함'으로 시작, 사용자가 다시 고름(실시간 미리보기라 정직).
- **구조:** 만들기 폼 본문 `(tabs)/page.tsx` → **`components/SettleForm.tsx` 추출**(홈·`/g/[slug]/edit` 공유, `initial` 분기). 수정 라우트=서버 컴포넌트(auth+owner 게이트→`getEditableGroup` 프리필→폼). 내역 카드=**`HistoryCard`**(⋯ 메뉴 수정/삭제+인라인 확인). 액션 `update*Action`·`deleteGroupAction`(withRateLimit+zod). `database.types` 재생성.
- **검증:** build·lint·test 58. 실DB e2e: 수정 라운드트립(quick 3→2명·30000→20000·낸사람 변경·**보냈어요 wipe**, items 2→1항목·weighted 유지)·**wrong-owner 수정/삭제 거부**·owner 삭제 cascade(orphan 0)·테스트데이터 정리. 프리뷰: **폼 추출 무회귀**(홈 렌더·모드 토글·제목 따라감·콘솔 0 에러)·내역 로그아웃 CTA. **잔여(수동): 로그인 후 수정/삭제 UI 폰 스모크**(OAuth라 자동검증 불가) — 내역 ⋯ 메뉴→수정 프리필→교체·삭제 확인.

## ✅ 정산결과 1인당 제거 (+ 공유 보드 통일 시도→되돌림) (2026-06-21)
사용자 피드백 2건. 상세 [[DECISIONS#ADR-023]].
- **① 1인당 제거(확정):** 정산결과 히어로의 "1인당 {금액}" 삭제 — 반올림·흡수자로 6,668/6,666처럼 달라 오해. 커스텀 제목=요약 "총 X · N명", 기본 제목="총 X"가 히어로. `perPerson` 삭제. (만들기 폼 1인당 미리보기는 `leftover===0`만 떠 정확 → 유지.)
- **② 공유 보드 통일 — 시도했다가 되돌림:** "사진처럼 버튼"을 *"신원 선택 없이 누구나 전 행 버튼"*으로 잘못 해석 → `SettleBoard` 단일 보드로 합치고 [[ADR-015]] 개인화·`canManageAll` 폐기(f157afe 배포). **사용자 의도는 반대**("누구인지 선택은 그대로, 고른 사람 항목에만 버튼") → **ADR-015 동작 복원**(`git checkout HEAD~1` SettleBoard 원복 + page `canManageAll`/`getAuthUser` 재추가). 친구=신원 고르면 "내 차례" 카드+[토스/보냈어요], 나머지 전체 보기 읽기 전용. ①만 남김.
- **교훈:** "사진처럼 똑같이"가 "개인화 제거" 아님. 모호한 UX 지시는 크게 바꾸기 전 확인.
- **검증:** build·lint·test 58. 프리뷰(무로그인=친구): 신원 선택 복원·1인당 없음·홍길동 선택→"내 차례 나희진님에게 6,668원"+[계좌 복사/토스/보냈어요]·다른 행 읽기 전용·"내가 아니에요". **dev 함정: PWA SW 옛 청크(해제+캐시 삭제) + dev 떠 있는 채 build→`.next` 깨짐(@upstash 500·코드 무관, dev 정지+`.next` rm+재시작).** 잔여: 보냈어요/취소 폰 스모크.

## ✅ 항목별=여러 건, 항목마다 낸 사람(1차·2차·3차) (완료·검증 2026-06-21)
사용자: "1차·2차·3차 여러 군데 갈 때" → **항목별을 '여러 건'으로 확장**(새 모드 안 만듦). 상세 [[DECISIONS#ADR-024]].
- **핵심:** 자리마다 **낸 사람이 다름**. 항목별 RPC(`add_itemized_bill`)가 **이미 항목별 `paid_by_index`를 받게** 돼 있어서([[ADR-007]]) 스키마·도메인·RPC 변경 0 — 검증·쿼리·UI만.
- **변경:** validation(itemized top-level payerIndex 제거→각 item에 payerIndex) · queries(add/update splitOpts·paid_by_index를 it.payerIndex로, getEditableGroup이 expense.paid_by→item.payer) · SettleForm(`Item.payer`, 항목 카드 '참여'+'낸 사람' 칩 두 줄·단일선택·기본 직전 상속, 공유 낸사람은 1/N만) · settle page(결제자 2명+면 "여러 명이 결제", `님` 제거 — 멀티 결제자가 이번에 처음 도달 가능).
- **한계(V2):** 결제자 여러 명이면 받을 사람도 여럿인데 저장 계좌는 '내 계좌'만([[ADR-013]]) → 다른 결제자 계좌 자동표시 없음(정산 금액·관계는 정확).
- **검증:** build·lint·test 58. 실DB e2e(1차 나·2차 홍길동 → paid_by 다름·net 김철수→나 10,000·합 0). 프리뷰(항목 카드 참여+낸사람 칩·기본 나·단일선택 / 공유 낸사람 1/N만 / settle "여러 명이 결제"). 잔여: 로그인 생성→실제 1차2차3차 폰 스모크.

## ✅ 항목별 = 차수(round) 2단: 차수 안에 메뉴 (완료·검증 2026-06-21)
사용자: "자리 안에서 메뉴까지 쪼개고 싶으면 한 단계 더". 목업 2장 확정 후 진행. 상세 [[DECISIONS#ADR-025]](ADR-023/024 일반화).
- **2단:** 바깥=차수(낸 사람 1명), 안=메뉴(금액+참여자). 차수=간단(총액 1줄) 또는 메뉴별로 나누기(메뉴 N개). **차수 = 한 `bill_id`**(기존 컬럼 재사용, 스키마 변경 0).
- **변경:** RPC 0011(p_items에 round 인덱스→차수별 bill_id, 시그니처 동일 create or replace) · validation(items→rounds 중첩) · queries(buildItemizedRpcItems 공용·getEditableGroup이 (bill_id,paid_by)로 rounds 재구성) · SettleForm(rounds 2단 UI: 차수 카드 낸사람+간단/메뉴별로 나누기, 메뉴 추가·간단히·차수 추가) · edit route. settle·도메인 변경 0.
- **흡수:** 원래 항목별=1차수 N메뉴 / ADR-024 per-item payer=N차수 1메뉴 / 1차2차3차+메뉴=N차수 다메뉴 → 2단이 셋 다 포함.
- **검증:** build·lint·test 58. 실DB e2e(1차 삼겹살 전원+소주 나·홍 / 2차 홍 김철수빠짐 → bill_id 2그룹·net 나+9,000·홍−1,000·김−8,000·합0). 프리뷰(차수 카드·낸사람·간단↔메뉴별로 나누기 토글·차수 추가·콘솔0). 한계(V2): 차수 장소명 미저장(자동 N차)·다른 결제자 계좌 자동표시 없음. 잔여: 로그인 생성→차수 폰 스모크.

## ✅ 프로필 닉네임 수정 + 정산 '내 이름' 기본값 (완료·검증 2026-06-23, 배포 대기)
사용자: 마이에서 닉네임 수정. OAuth 이름이 마이 인사말에만 쓰여(정산=자유 텍스트) → 수정 + **새 정산 '내 이름' 기본값으로** 결정. 상세 [[DECISIONS#ADR-037]].
- 저장 = `user_metadata.display_name`(커스텀 키 — provider 재로그인에 안 덮임). 표시 `resolveDisplayName`=`display_name ?? name ?? …`(auth.ts 공용).
- **인증 첫 쓰기:** `updateNicknameAction`(withRateLimit+zod+로그인)이 `getSupabaseAuth()` 세션 클라로 `auth.updateUser`(service_role 아님). 마이 `NicknameEditor` 인라인 수정.
- '내 이름' 기본값 = 홈이 `myName` prop 전달 → member[0]=닉네임(>20자/anon이면 '나'). 부작용: `getRecentMembersAction`이 본인 이름도 제외(자기 친구칩 방지).
- 변경 0(마이그·도메인·RPC). tsc·test 69·lint·build + 프리뷰 비로그인 무회귀(콘솔0). 잔여: 로그인 후 수정·보존·정산 기본값 폰 스모크.

## ✅ 항목별 × 쏘기(항목마다 '한 명이 쏘기') (완료·검증 2026-06-23, 배포 대기)
사용자(출시 직전 "진짜 마지막"): 쏘기를 항목별에서도 — 자리(차수)별(#1) + 메뉴별(#3) 둘 다. 상세 [[DECISIONS#ADR-036]].
- **통찰:** "한 명이 쏘기" = 그 항목 참여자(among) 한 명만 = 엔진이 그 사람에게 전액(차수 낸 사람에게 빚짐). 단순 차수=#1, 메뉴=#3, 같은 단위.
- **구현 = `amongRow`에 "🎲 한 명이 쏘기" 버튼 하나**(참여 ≥2면 노출 → `AbsorberGame` 후보=참여자 → among=[winner], 1명이면 "{이름}님이 이거 다 쏴요 💸" 힌트). 단순/메뉴 공용 헬퍼라 #1·#3 한 번에.
- **변경 0**(스키마·도메인·RPC·validation·제출·edit 복원 전부 무변경), SettleForm UI만(`itemGame` 상태). tsc·test 69·lint·build + 프리뷰 e2e(#3 게임→당첨→collapse→복귀 / #1 단순차수 버튼 / 콘솔0). 잔여: 로그인 생성 폰 스모크.

## ✅ "내 모임"(저장 멤버 그룹) (완료·검증 2026-06-23, 배포 대기)
사용자(출시 직전): 자주 정산하는 친구 묶음을 매번 새로 등록하기 번거롭고, 최근목록([[ADR-020]])은 최근순이라 단골이 밀려 사라짐 → **고정 묶음 "모임"**. 상세 [[DECISIONS#ADR-035]].
- **새 테이블 `member_groups`(0013):** user_id·label·`names text[]`('나' 제외)·created_at. RLS deny-all+REVOKE+service_role(하드룰5, user_accounts 동형). RPC 0(단순 CRUD, user_id+id 스코프).
- **server/validation/actions:** `list/create/update/deleteMemberGroup` + 마이 `MemberGroupManager`(추가/수정/삭제) + `useMyMemberGroups` 훅. 쓰기=withRateLimit+zod+로그인(하드룰6), 읽기 `getMyMemberGroupsAction`.
- **만들기 폼(SettleForm):** "내 모임" 칩 탭→**전원 추가**(`addMemberNames`, 빈칸 채우고 덧붙임+among 동기화·중복 skip·다 든 모임 숨김) + **"현재 멤버 저장"**(로그인 시·'나' 제외·베스트에포트). 로그인 신호=서버 `isLoggedIn` prop(홈 `getAuthUser`로 Dynamic).
- **검증:** tsc·test 69·lint·build(누수0)·RLS/정책0/REVOKE 카탈로그 + 프리뷰 비로그인 무회귀(홈·마이·콘솔0·모임 비로그인 숨김). 실DB CRUD는 오토모드가 프로덕션 실유저 쓰기 차단→미실행(검증된 user_accounts 패턴 동형). **잔여: 로그인 후 모임 CRUD·칩 전원추가·현재멤버저장 폰 스모크.**

## ✅ 게임 B — "한 명이 다 쏘기"(진 사람→낸 사람 전액) (완료·확정·라이브 2026-06-23, `58d2af0`)
게임으로 한 명을 뽑아 **전액 부담**시키는 모드. 사용자 결정: **정산으로 기록**(진 사람이 낸 사람에게 전액, 기존 정산 보드·토스·보냈어요 그대로 재사용) + **진입 두 방식 둘 다 만들어 폰 비교 후 한쪽 삭제**.
- **도메인/스키마/RPC 변경 0:** "쏘기" = quick settle의 분담을 `[0,…,전액@진사람,…,0]`로 둔 것(`winnerIndex` 하나 추가). `equalSplit(amount,[진사람])`이 전액을 그 사람에게 → net이 진사람→낸사람 전액. **진 사람=낸 사람이면 net 0 → "정산할 게 없어요"**(완료 모먼트). RPC가 share=0·합 미체크라 생성/수정 모두 그대로 동작.
- **게임 재사용:** `AbsorberGame`(돌림판/사다리)을 범용화(`prompt` prop 추가, `leftover` 선택) → "{금액} 누가 다 쏠지! 💸". 흡수자 게임과 동일 컴포넌트.
- **진입 = 모드 칩 `🎲 쏘기`(확정):** 1/N·항목별 옆 별도 칩. 만들 때 1/N 안 토글 방식과 둘 다 빌드 상수(`SHOOT_PLACEMENT='both'`)로 동시 노출해 폰 비교 → **사용자가 모드 칩 채택**(발견성↑·게임 느낌). 토글 분기 + 비교 상수 **삭제 완료**(`isShoot = mode==='shoot'`로 고정).
- **변경:** ModeChips(`'shoot'`+`modes` prop) · AbsorberGame(범용 prompt) · validation(`winnerIndex` 범위 refine) · queries(`quickSharesArray` create/update 공용 + `getEditableGroup` 단일승자 감지 복원) · edit route(winnerIndex 전달) · SettleForm(쏘기 picker·결과 미리보기·낸사람 "누가 먼저 냈어요?"·draft에 winnerIndex 보존) · settle 도메인/페이지 **변경 0**(net이 단일 송금으로 자연 수렴).
- **수정 라운드트립:** quick인데 분담이 한 명에게만 전액(나머지 0)이면 그 사람=winnerIndex 복원(안 그러면 1/N으로 변질). **휴리스틱 무해성**: 단위 반올림된 극소액 1/N(amount<인원·단위)도 단일승자로 보일 수 있으나 그 한 명=흡수자라 재저장해도 분담 동일(`winner!=payer` 가드는 진짜 자기쏘기를 1/N으로 변질시켜 역효과 — 적용 안 함, queries.ts 주석에 명문화).
- **검증:** `tsc`·test **69**(쏘기 net/전액/자기쏘기 불변식 +3)·lint·build + **프리뷰 e2e**(모드 칩→picker→게임→결과 "철수님이 30,000원 다 쏴요 → 나님에게" / 자기쏘기 "본인이 냈으니 정산할 게 없어요" / 단위·흡수자 섹션 숨김; 비교 중 토글 방식도 동일 검증). **8에이전트 적대리뷰(money/하드룰/엣지 3렌즈→검증): 확정 실결함 0**(2건은 위 무해 휴리스틱, 13건 정확 확인). 생성/수정 RPC 0-share 허용 확인.
- **잔여:** 로그인 생성→정산결과 금액 폰 스모크(OAuth라 자동검증 불가).

## ▶ 다음 세션 시작점

**▶▶▶ 2026-06-24 마감 현황 — Android 출시 진행 중 (clear 후 여기부터, 이게 최신):**

> 이번 세션 한 일: 내 모임·항목별쏘기·닉네임 라이브 + 🔑키롤 스킵(검증=노출0) + iOS 사전조사(LAUNCH 트랙3) + **경쟁분석** + **Android 패키징 시작**.

**🧭 전략 결정(경쟁분석 후 — 중요):** 일반 대중은 카톡/토스 두고 "그냥 N빵"으론 **안 씀**(2026.1 카카오뱅크 '빵나누기'까지 등장해 무가입 링크 차별점도 깎임). payven 진짜 강점 = **복잡·비대칭 정산**(안 마신 술값·메뉴별·여러 차수) — 카톡/토스가 메뉴 자동배분 못 함. → **포지셔닝 = "복잡 정산 계산기"(N빵 앱 아님)** + 카톡 보완재(계산→결과 카톡 복붙) + 유통=SEO/검색("더치페이 계산기"·"여행 경비 정산"). **iOS는 보류**(무거움 — 웹+안드로 "복잡 정산기" 수요 검증 후 결정). 일반 대중 미사용 확신 80%+, 좁은 틈새 생존 40%대.

**📱 Android 출시 진행 상태:**
- ✅ 홈택스 **영문 사업자등록증명** 발급: 상호 `makersbridge` · 대표 `NAHEEJIN`(나희진) · 주소 `74 Geulpo 2-ro, Gimpo-si, Gyeonggi-do, Republic of Korea` · 사업자 675-76-00551 · 간이과세자. (이 영문 상호·주소를 D-U-N-S·Play에 글자 그대로 복붙 = 3중 일치)
- ✅ **D-U-N-S 신청 제출**(애플 무료폼 developer.apple.com/enroll/duns-lookup, 법인명 makersbridge·payven.kr·sole proprietorship). 접수확인 메일 옴(Tracking# 10505883 · Case# 10571821 · Request Key 34N7L2RU64). **⏳ 실제 D-U-N-S 번호 메일 대기**(별도 메일, 1~5영업일, 스팸함도 확인).
- ✅ **PWABuilder manifest 통과** — SVG 아이콘 제거로 packaging critical 해소(`52f107a`), id/orientation 추가(`732e03e`). "Package For Stores" 활성·"ready for packaging". (SW 경고·스크린샷·categories 등은 선택, 패키징 안 막음.)
- ✅ **Android 패키지 Download 클릭함**(Package ID `kr.payven.app` 확정·새 서명키) → **zip 받음**(.aab·.apk·signing.keystore·signing-key-info.txt·assetlinks.json·next-steps).

**✅ 2026-06-24 (이어서) 완료:**
- **단계 1 — keystore 백업 완료.** zip 통째로 Google Drive(이 PC 밖) + `Documents\payven 서명키 백업 (삭제금지)\`(로컬, ★먼저읽기 메모 동봉) 2겹. Gmail은 zip 속 `.apk`를 보안차단 → keystore·info·assetlinks·readme만 담은 작은 zip(`payven-keystore-백업(Gmail용).zip`)도 같은 폴더에 생성해둠(필요시 메일용). keystore SHA-256 = `c006c32e890221a33f33e4a6f51525c7c1bf8d7563196996ba5f74711c05e439`.
- **단계 2 — assetlinks 라우트 생성·배포 완료.** `public/.well-known/assetlinks.json`(정적 파일, server-only 아님) — package `kr.payven.app` + **업로드키 지문 1개**(`E5:BB:FA:...:1D:48`). Route Handler 안 씀(하드룰#6 준수). `src/middleware.ts` matcher에 `\.well-known` 제외 추가(공개 검증 엔드포인트에 세션갱신/쿠키 안 씀). dev 검증 = `/.well-known/assetlinks.json` → **200 · `application/json`** OK, build green. TWA 대상 호스트는 APK `resources.arsc`에서 `https://payven.kr`(apex)·manifest `https://payven.kr/manifest.webmanifest` 확인.
- **D-U-N-S 대기 중 Play 제출 준비 3종:** ① `docs/play-store-listing.md`(앱이름·짧은/자세한 설명·카테고리·데이터보안 양식·콘텐츠등급 복붙 시트). ② **계정 삭제 경로 구현**(마이 탭 "계정 삭제" 2단계 — `deleteMyAccountAction`→auth 유저 삭제로 개인정보 제거+공유정산 비식별화; FK가 user_accounts·member_groups cascade·groups.owner_id set null; build/lint/test green; **로그인 폰 스모크 잔여**, 실삭제라 버리는 계정으로). ③ **피처 그래픽** `store-assets/feature-graphic.html`(열고 'PNG로 저장'→1024×500 PNG). 스크린샷은 폰에서 payven.kr 직접 캡처(레시피=listing §6-3).

**▶ 다음 세션 첫 할 일(순서대로):**
3. (사용자) **D-U-N-S 번호 메일 오면** → [D&B lookup](https://www.dnb.com/en-us/smb/duns/duns-lookup.html)에서 이름·주소가 증명서랑 같은지 확인 → **Play Organization 계정 생성**($25, 조직명 `makersbridge`·영문 주소 3중 일치·웹사이트 payven.kr·**새 결제 프로필**). 조직 계정 = 테스터 12명 게이트 면제.
4. (사용자) **.aab Play 업로드** → Play Console → Release → Setup → **App integrity → App signing key certificate의 SHA-256** 복사.
5. (나) 그 **Play 앱서명 지문을 assetlinks에 추가**(지문 2개: 업로드 키 + Play 서명 키) → 재배포. ⚠️ 안 넣으면 프로덕션 앱에 주소창 노출.
6. 테스트 기기에서 **주소창 사라짐 확인** → **프로덕션 제출** 🚀

**📌 파킹(출시 후):** 항목별 입력 무게 완화(A=기본 간단+C=참여 프리셋)·결제문자 붙여넣기 파싱. 자동 계좌/카드 내역연동=스코프 밖(라이선스급). (아래 "📌 출시 후 개선 후보" 참조.)
**🍎 iOS(나중, 보류):** LAUNCH **트랙 3** 참조 — Apple=Individual 계정(D-U-N-S 불필요·Play용과 별개)·**4.8 Sign in with Apple + 5.1.1 인앱 계정삭제 선구현 필수**·OAuth 서버 교환.

---

## ▶ 다음 세션 시작점 (2026-06-23 마감 — 기능 전부 완료·폰 확인 끝 / 키롤·앱스토어는 위 2026-06-24 현황으로 대체됨)

> **세션 마감 상태:** 게임 B '쏘기' + 하단 CTA 폴리시 + 항목별 순서까지 전부 라이브(`a278c4e`), **사용자 폰 확인 완료("폰화면은 확인했고")**. 기능 개발은 사실상 끝. 사용자가 "②③은 다음 세션에 clear 후 시작"으로 결정 → **다음 세션은 키롤부터.**

**▶▶ 다음 세션 할 일(이것부터 — 둘 다 본질적으로 '출시 작업'). 상세 절차·근거·체크리스트 = [`docs/LAUNCH.md`](./LAUNCH.md)(2026-06-23 검증 정리):**
1. ✅ ~~게임 B '한 명이 다 쏘기'~~ — 완료·확정·라이브([[DECISIONS#ADR-034]], 아래 §"게임 B"). 폰 확인 끝. + 하단 정산하기 버튼 폴리시·항목별 입력 순서(멤버 먼저)도 라이브·폰 확인 끝.
2. ✅ ~~키/토큰 롤~~ — **검증 후 스킵(2026-06-23).** 노출 점검(git 전체 이력 + 워킹트리 grep) 결과 service_role/anon/MCP 키 **실제 값이 `.env.local`(gitignore·미커밋)·Vercel env(암호화) 밖 어디에도 없음** = 확인된 노출 0. 노출 벡터(①GitHub ②문서 기록) 둘 다 클린 → 롤 불필요. ("노출된 키"는 초기 과한 가정이었음.) *만약* 나중에 실제 유출 시 절차는 LAUNCH §1(신형 키라 무중단·세션 안 끊김).
3. **앱 스토어** (LAUNCH §2 — **iOS 포함 결정**). **Play 계정 = Organization(조직) 경로 결정**: 사용자 보유 **간이과세자 사업자등록증으로 가능**(법인 불필요) → **테스터 12명×14일 비공개 테스트 게이트 면제**(개인 계정이면 ~3주 의무). 절차=영문 사업자등록증명(홈택스)→D-U-N-S 무료 신청(1~5영업일)→Organization 계정($25, 이름 3중 일치, payven.kr 웹사이트)→PWABuilder AAB→**assetlinks.json 지문 2개**(업로드 키+Play 앱서명 키, ②는 첫 업로드 후 생김·안 넣으면 주소창 노출, 라우트는 내가)→프로덕션. iOS=Capacitor(상세 사전조사 완료 = LAUNCH **트랙 3**). **iOS 핵심(정정):** Apple은 **개인사업자=Individual 계정**(D-U-N-S 불필요 — Play용과 별개·실명 노출), **4.2보다 4.8(Sign in with Apple)+5.1.1(인앱 계정삭제) 누락이 더 확실한 반려**, OAuth=**선택 A(서버 교환)**(구글 네이티브 `signInWithIdToken`·카카오 시스템브라우저+HTTPS hop, 하드룰 정합), 래핑=하이브리드(로컬 셸+원격).
> ⚠️ **dev 함정(반드시 기억):** 프리뷰에서 코드 변경이 안 보이면 **PWA 서비스워커가 옛 청크 cache-first 서빙**이 범인(`.next` 삭제만으론 부족). eval로 `navigator.serviceWorker.getRegistrations()→unregister()` + `caches.delete()` + `location.reload()`. **커밋/푸시는 분리**(compound 분류기 차단), main 직접 push가 이 repo 방식.

**📌 출시 후 개선 후보(파킹 — 2026-06-24, 사용자 실사용 피드백. "일단 이대로 출시" 결정 → 출시 후 검토):**
- **항목별 입력 무게 완화** — 사용자: "메뉴 채우는 게 은근히 걸린다". 후보 A=항목별 기본을 '간단(차수 총액 1줄)'으로·메뉴 쪼개기는 탭 옵션(예전 ad41831 '메뉴 기본 펼침' 뒤집기 — 써보니 부담된다는 피드백) + C=참여자 프리셋 '전원/나 빼고/직접'(비대칭 1탭). B=메뉴 이름 생략 강조. (방향 미확정, 출시 후 사용자와 다시.)
- **결제 문자 붙여넣기 → 금액 자동 인식** — `[Web발신] OO카드 12,000원 승인` 복붙→클라 정규식으로 금액/가맹점 추출. 권한·인증정보·라이선스 0, 웹/iOS/안드 다 됨. "자동 내역" 체감의 가벼운 대체.
- **자동 계좌/카드 내역 연동 = 스코프 밖(결론).** 마이데이터(금융위 허가·자본금)/오픈뱅킹(이용기관)/스크래핑 집계(신용정보법·금융인증정보 취급) 전부 핀테크 라이선스급 + iOS는 SMS 읽기 불가·Play READ_SMS 제한. CLAUDE.md Non-goals(입금 자동확인) 정합 — 안 함.

---

**현재 상태:** 큰 기능 + 폰 스모크 + M6 레이트리밋 + 커스텀 도메인 + 보안 감사 통과 + **잔돈 게임(A)** + **쏘기 게임(B, 모드 칩 확정)** + **하단 CTA 폴리시·항목별 순서** → 기능 완료·폰 확인 끝, 남은 건 출시 작업(키롤·앱스토어). **라이브 = `a278c4e`**. **2026-06-23 세션 배치(전부 라이브·폰 확인):** ①게임 B '한 명이 다 쏘기'(모드 칩 🎲 쏘기, 진 사람→낸 사람 전액, [[DECISIONS#ADR-034]], `58d2af0`) ②하단 정산하기 버튼 폴리시(스크림 제거+탭바 위로 바싹, `e7aa466`) ③항목별 입력 순서=멤버 먼저→차수(`a278c4e`). 2026-06-22 배치: 구글 로그인(ADR-029)·이름변경+보관(ADR-030)·뒤로가기(ADR-031)·내역 진행도(ADR-032)·iOS 입력 줌(`2a535c9`)·레이트리밋(Upstash+fail-fast `95dc403`)·**커스텀 도메인 `payven.kr`**(가비아+Vercel+Supabase Auth, 로그인 확인)·**공유 OG 카드 개선**(브랜드 이미지+정산 정보, metadataBase)·**브랜드 한글 404**·**'무로그인' 카피 제거**·**개인정보처리방침 배포**(`/privacy`+마이 탭 링크)·**✅ 보안 감사+하드닝**(8에이전트 6렌즈, critical/high 0·하드룰 라이브 대조 통과; 보안 헤더·settlements 중복기록 방지 마이그 0012·RPC search_path)·**잔돈 흡수자 '게임으로 정하기'(A)**(돌림판/사다리, crypto 추첨, `AbsorberGame`; 사다리 트레이스 💸→이름 거꾸로 `86b3984`).

**완료 내역(이번까지, 참고):**
1. ✅ `64a5028`·iOS 줌 수정 푸시·배포 완료.
2. ✅ **폰 스모크(누적) 통과(2026-06-22, 사용자 "문제 없어")** — 내역 이름변경/보관·뒤로가기·진행도·구글/카카오 로그인·마이 계좌 CRUD·만들기 자동채움·웨이브2 신원/보냈어요·단위 반올림·수정/삭제 전부 정상. iOS 입력 포커스 줌도 수정 확인.
3. ✅ **M6 레이트리밋 활성(2026-06-22, `95dc403`):** Vercel **Upstash for Redis 통합** 연결(Tokyo·Free·`KV_REST_API_URL/TOKEN` 자동 주입, payven Production+Preview) + **프로덕션 fail-fast 가드**(env 없으면 throw=fail-closed / dev는 graceful no-op, `KV_*`·`UPSTASH_REDIS_REST_*` 둘 다 인식). build·test 66·lint green + 일회용 가드 테스트(prod throw/dev no-op) + 배포 READY·라이브 200. **✅ 라이브 정산 생성 폰 확인(2026-06-22)** — `정산하기`(레이트리밋 write) 성공·결과 보드 렌더 정상 = Upstash env 정상 주입, **레이트리밋 완전 검증 완료**(미설정이면 fail-closed라 에러 떴을 것).
4. ✅ **구글 프로덕션 게시 = 이미 완료**(2026-06-22 확인 — Google 인증 플랫폼 `대상` 게시상태=**프로덕션 단계**, 버튼이 '테스트로 돌아가기'라 현재 프로덕션 확정. 기본 스코프 email/profile이라 무심사·전 구글계정 로그인 가능. 메모리 '테스트 모드' 기록은 오류였음). → **M6 잔여 = 키/토큰 롤 1개뿐, 출시 직전으로 결정**(키 유출 아님·do-once·프로덕션 깨질 위험·MCP 끊김 회피).
   - **키롤 체크리스트(출시/앱스토어 직전 한 방):** ① Supabase Dashboard→Settings→API→service_role(또는 sb_secret) 재발급 ② Vercel env `SUPABASE_SERVICE_ROLE_KEY`(Production+Preview)·`SUPABASE_ANON_KEY` 새 값으로 교체 ③ 로컬 `.env.local` 동일 교체 ④ 재배포 후 라이브 write 1회 확인(정산 생성) ⑤ (선택) `.mcp.json` Supabase MCP 토큰 재발급(이 세션 MCP 끊김 주의).
5. ✅ **커스텀 도메인 `payven.kr` 연결 완료(2026-06-22):** 가비아서 payven.kr 구매(16,500원/년, 등록정보 숨김 ON·총 19,800원) → Vercel 도메인 추가(**apex, www 리다이렉트 끔 = 짧은 링크 `payven.kr/g/...`**) → 가비아 DNS A레코드 `@`→**`216.198.79.1`**(Vercel 신규 IP, TTL 600) → Vercel Valid·HTTPS 자동 발급 → curl 200·앱 서빙 확인. **Supabase Auth URL Configuration**: Site URL=`https://payven.kr` + Redirect URLs에 `https://payven.kr/**` 추가(payven-hazel·localhost 유지). 코드 **하드코딩 도메인 0**(redirect는 `req.nextUrl.origin` 기준이라 자동 동작), `NEXT_PUBLIC_SITE_URL`은 **미사용**(grep 0). **payven.kr 로그인 폰 확인 완료.** Google/Kakao OAuth 리디렉션 URI는 Supabase 콜백(`gtssqmibfhkyffvrkhzy.supabase.co/auth/v1/callback`)이라 **무변경**. 네임서버=ns.gabia.co.kr(가비아 DNS 유지).
6. ▶ **앱 스토어(다음 단계):** **PWA = TWA-ready 확인**(manifest standalone·192/512/512-maskable·theme #0FA177/bg·HTTPS·SW). 안드로이드 **TWA** 먼저 — 권장 **PWABuilder.com**에 **`https://payven.kr`** 넣어 AAB 패키징(서명·assetlinks.json 발급). 필요: **Google Play 개발자 계정($25 1회, 인증 1~2일)**. 받은 SHA-256 지문으로 **`payven.kr/.well-known/assetlinks.json`** 호스팅(라우트 추가는 내가). 스토어 등록정보에 **개인정보처리방침 URL 필수** → ✅ **배포됨 `https://payven.kr/privacy`**(`src/app/privacy/page.tsx`, 문의 favory.team@gmail.com). 그다음 iOS **Capacitor**(웹뷰 구글OAuth→시스템브라우저 + 애플 4.2 심사 주의). 앱 내 `/privacy` 링크는 마이 탭 하단에 연결됨(`e9c6f77`).
7. ✅ **출시 전 보안 감사 완료(2026-06-22, 8에이전트 6렌즈 워크플로 + 적대적 검증):** critical/high 0, 하드룰 전부 라이브 대조 통과. 확정 1건(medium TOCTOU 중복기록) → 마이그 0012(유니크 인덱스+23505 캐치)로 해소. XFF 우회 1건 기각(Vercel이 헤더 덮어씀). 무위험 하드닝 적용: next.config 보안 헤더(X-Frame DENY·nosniff·Referrer·HSTS)·validation.ts server-only·.env.example anon·RPC search_path. low/info 보류분(postcss 권고[악용경로 없음]·eventDate 정규식·slug 정규식)은 출시 후 선택.
8. (틈날 때) 문서 V2 전체 갱신(CLAUDE/PLAN/ARCHITECTURE가 V0 무로그인 기준 — 무거운 작업).

— 이하 옛 시작점 메모(참고용, 대부분 ✅ 완료):
- **① 폰 스모크(미완, 누적):** 카카오 로그인 후 ⓐ마이 계좌 CRUD·만들기 자동채움(인라인 첫 저장→칩) ⓑ내역탭 내 정산 목록 렌더 ⓒ웨이브2 신원/보냈어요/취소 + 주최자 관리 모드 ⓓ**단위 반올림 정산 생성→정산결과 금액**(흡수자만 다르고 나머지 깔끔한지) ⓔ**내역 수정/삭제 UI**(⋯ 메뉴→수정 프리필 정확→교체 저장→정산결과 반영 / 삭제 확인→목록에서 사라짐, 보냈어요 있던 정산 수정 시 경고 배너). (코드 신뢰는 높음 — 프리뷰 e2e + 도메인 58테스트 통과. 실기기는 토스 앱·localStorage·OAuth 왕복만 확인.)
- **✅ ② 구글 로그인(M4 잔여) — 코드 완료(2026-06-22, ADR-029).** 외부 설정(Google Cloud OAuth 클라 + Supabase Providers→Google 활성) + 구글 OAuth 왕복 폰 스모크만 잔여.
- **✅ ③ 정산 이름 변경 + 보관 토글 완료(2026-06-22, ADR-030):** 내역 ⋯메뉴에 **이름 변경**(비파괴, `renameGroup` owner 스코프)·**보관**(`kind` 'group'↔'quick' 토글, `setGroupKept`, M6 cleanup 면제 표시·`IcoBookmark` 배지). 스키마·마이그레이션 0(`kind`·`name` 기존). test 66·lint·build green, 로그아웃 회귀 0. 잔여: 로그인 후 이름변경·보관 UI 폰 스모크. **(누적잔액 그룹 본격 UI는 M6 cleanup 때.)**
- **✅ 내역 카드 정산 진행도 완료(2026-06-22, ADR-032):** 내역 카드 메타 줄에 `✓ 정산 완료`(brand)/`{done}/{total} 완료`(진행 amber·미시작 neutral). `listGroupsByOwner` 3→5쿼리(분담·정산 추가)로 그룹별 `netBalances→minimizeCashFlow`(검증된 도메인 재사용) + 보냈어요 수. `SettlementSummary`에 `doneTransfers`/`totalTransfers`. test 66·lint·build green + 실DB 손검증(3인 그룹 totalTransfers=2). 현재 settlements 0이라 라이브 전부 `0/N`(완료색은 폰 스모크).
- **✅ 뒤로가기 컨텍스트 인식 완료(2026-06-22, ADR-031):** settle "← 새 정산"이 내역에서 들어와도 항상 홈으로, edit "← 뒤로"가 항상 settle로 가던 것 → **온 곳으로 복귀**(`router.back()`+히스토리 없으면 폴백). settle=`SettleBackLink`(내부→뒤로/외부→새 정산 CTA), edit=클릭 시점 판정. `/auth` 홈으로·탭은 의도적 유지. test 66·lint·build green, 프리뷰(settle 뒤로→홈 복귀) 검증. edit는 폰 스모크 잔여.
- 그다음 **M6 운영**(레이트리밋 활성+프로덕션 fail-fast 가드·키/토큰 롤). **임시그룹 cleanup은 보류**(ADR-033 — 로그인 게이트로 무로그인 누적 0, 30일 초과 0개라 불필요. DB 비대해지면 그때 owner-null만 대상으로).

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
