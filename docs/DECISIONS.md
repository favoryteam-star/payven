# 결정 기록 (ADR-lite) — 페이븐(Payven)

> 왜 그렇게 정했는지 추적용. 형식: 맥락 → 결정 → 근거(필요 시 리서치 출처) → 상태.
> 코드 구조는 [`./ARCHITECTURE.md`](./ARCHITECTURE.md), 제품/빌드 계획은 [`../PAYVEN_PLAN.md`](../PAYVEN_PLAN.md).

---

### ADR-001 — 무로그인, 슬러그가 곧 접근 자격
- **맥락:** 식당에서 한 손으로 30초. 로그인은 마찰.
- **결정:** 그룹은 `nanoid(21)`(~126비트) 슬러그로 식별, 링크 가진 사람 = 보기·편집. view/edit 구분 없음(V0).
- **근거:** 21자면 UUIDv4급(122비트) 추측불가. CSPRNG 필수(`Math.random` 금지). 공유 페이지 `noindex`.
- **상태:** 확정.

### ADR-002 — 모든 DB 접근은 서버, `service_role`는 단일 server-only 모듈
- **결정:** 브라우저에 Supabase 키 0개. `service_role`(신규 `sb_secret_`)은 `src/server/db.ts` 한 곳에서만. `server/` 전 파일 `import 'server-only'`. 절대 `NEXT_PUBLIC_` 금지.
- **근거:** 2025 리서치 — AI 생성 Supabase 앱의 ~절반이 키를 클라이언트 도달 가능 위치에 둠(NEXT_PUBLIC_ 접두사 / 'use client' import / 클라 번들되는 공유모듈). 유출 시 auth 스키마 포함 DB 전체 탈취.
- **상태:** 확정. (출처: supabase.com/docs/guides/api/api-keys, security-2025-retro)

### ADR-003 — RLS deny-all 백스톱
- **결정:** 모든 테이블 `ENABLE ROW LEVEL SECURITY` + 정책 0개(= anon/authenticated deny-all) + `REVOKE ALL ... FROM anon, authenticated`.
- **근거:** `service_role`은 RLS 우회라 앱은 정상 동작. 혹시 anon/publishable 키가 새도 PostgREST 직접 접근 0. 비용 0의 심층 방어.
- **상태:** 확정.

### ADR-004 — 돈은 정수 KRW, largest-remainder 반올림
- **결정:** 모든 금액 정수 `원`(`bigint`). 부동소수점 금지. k명 균등분할: 각자 `floor(amount/k)`, 나머지 `amount mod k`원을 1원씩 분배. tie-break = **낸 사람 우선 → 멤버 id 오름차순**(결정적).
- **근거:** KRW는 보조단위 없음. largest-remainder(Hamilton)로 분담합==amount 정확·편차 ≤1원. 결정적 tie-break라야 재현·테스트 가능.
- **상태:** 확정. (출처: Largest remainder method, Wikipedia)

### ADR-005 — 최소송금은 그리디(최적 아님), ≤ m−1 보장
- **결정:** 가장 큰 채권자↔채무자 상계 반복. 최소 거래수는 보장하지 않음.
- **근거:** 진짜 최소화는 NP-hard(subset-sum 환원, LeetCode 465). 그리디는 **거래수 ≤ m−1**(m=잔액 0 아닌 인원) 보장 — 사람 눈에 충분. 정확해(비트마스크 DP O(3^m), m≤~12)는 나중 옵션 토글.
- **상태:** 확정. ≤ m−1을 회귀 테스트로 고정. (출처: GeeksforGeeks Minimize Cash Flow, arxiv 1111.3663)

### ADR-006 — 변이=Server Actions, 읽기=Server Component 직접, cron=Route Handler ★
- **맥락:** 초안 플랜은 "Route Handlers 전부 + 클라이언트 fetch". 설계 패널 3안 중 2안이 Server-Action-우선을 강력 추천(현 App Router 정석). 사용자가 Server Actions 채택.
- **결정:** 모든 UI 변이 = `'use server'` 액션 + **필수 `withRateLimit()` + zod**. 읽기 = Server Component가 `server/queries` 직접 호출(API hop 제거). Route Handler는 머신 트리거(cron)만.
- **근거:** 무로그인이라 브라우저가 유일 호출자 → 공개 REST 표면은 순수 부채(레이트리밋·검증·CORS 늘어남). 액션은 보일러플레이트 절반·end-to-end 타입. service_role·IP 레이트리밋 모두 액션 안 `headers()`로 처리 가능. **리스크:** 모든 액션이 공개 미인증 POST라 가드 빠뜨리기 쉬움 → `withRateLimit` 래퍼로 강제 + zod 상단 검증으로 완화.
- **상태:** 확정. 초안 플랜의 api/ 트리를 이 구조로 대체.

### ADR-007 — 빠른정산은 항상 `kind='quick'` 임시 그룹 자동 생성 + 정리
- **결정:** 스펙대로 빠른정산이 매번 임시 그룹 생성(코드 분기 없음). `groups.kind in ('group','quick')`. 활동 없는 `quick` 그룹은 30일 후 cron cleanup으로 삭제.
- **근거:** 사용자 선택(항상 자동생성). 단 DB 누적 방지를 위해 `kind` 플래그 + cleanup 추가. "저장하고 공유" 시 `kind='group'`으로 승격.
- **상태:** 확정.

### ADR-008 — 송금: 계좌복사 본진 + 토스 딥링크 best-effort
- **결정:** 받는 사람 은행+계좌+금액 큰 글씨 + `[계좌번호 복사]`(보장). 추가로 `[토스로 송금]` = `supertoss://send?bank={한글은행명}&accountNo={숫자}&amount={원}` 한 버튼(best-effort). `members`에 `bank_name`+`account_no` 구조화 저장.
- **근거:** 리서치 — `supertoss://send`는 토스 공식 QR/사진송금이 쓰는 살아있는 스킴(2025~26). **`toss.me`는 2024.8 종료**(쓰지 말 것). 카카오페이·은행 스킴은 사전입력 송금 불가. 제약: 모바일+토스설치 시에만, PC 무반응, 카톡 인앱브라우저 차단 → userAgent 감지 + Android `intent://` fallback.
- **상태:** 확정. 은행명 토큰 리스트는 빌드 시 토스로 실검증(`lib/banks.ts`). (출처: velog Toss URL scheme, Toss app2app docs)

### ADR-009 — 카톡 미리보기는 OG만(Kakao SDK는 post-MVP)
- **결정:** Next `generateMetadata`(+`opengraph-image.tsx`)로 서버렌더 OG(title=그룹명, 절대 HTTPS, og:image 1200×630 <1MB). 공유 버튼 = `navigator.share` + clipboard fallback. Kakao JS SDK 미사용.
- **근거:** 리서치 — 카톡 스크래퍼는 client JS 미실행, OG만 읽음. 리치카드에 SDK 불필요. **OG 캐시가 며칠 박힘** → 변경 시 `developers.kakao.com/tool/clear/og`로 초기화 + 이미지 `?v=N`.
- **상태:** 확정. (출처: developers.kakao.com kakaotalk-share/faq, devtalk OG 139618)

### ADR-010 — 2-솔기 적정 아키텍처(격식 스킵)
- **결정:** 솔기 둘(순수 `domain/` + server-only `server/`)만 유지. Repository 인터페이스·use-case 레이어·DI·DTO 매퍼·Result 모나드·클라 상태/캐시 라이브러리는 안 만듦.
- **근거:** 설계 패널 3안 합의. 이 규모(주말 첫 출시, 솔로)에서 추가 레이어는 "안 할 스왑/필요 없는 더블" 비용. 자세히는 ARCHITECTURE §7.
- **상태:** 확정.

### ADR-011 — 인프라/툴링
- **결정:** Supabase 처음부터 연결(로컬 mock 단계 없음). `src/` 레이아웃(`@/`→`src/`). Vitest. Vercel 배포. 동시 편집은 last-write-wins + 당겨 새로고침(실시간은 V2).
- **근거:** 사용자 선택(Supabase 처음부터). `src/`로 domain/server/lib를 app/과 분리. 가벼운 정합성으로 주말 범위 유지.
- **상태:** 확정.

### ADR-012 — Supabase 셋업에서 발견·수정 (그룹삭제 cascade · service_role grant · 함수 하드닝) ★
- **맥락:** M0 Supabase 연결 중 MCP 스모크테스트로 3가지 발견.
- **결정/수정:**
  1. **멤버참조 FK 4개**(`expenses.paid_by`, `expense_shares.member_id`, `settlements.from_member/to_member`)를 **DEFERRABLE INITIALLY DEFERRED**로. 그룹 삭제가 members·expenses를 동시에 cascade 삭제할 때 NO ACTION FK 체크가 먼저 터져 실패하던 문제 해결.
  2. **service_role에 명시적 DML grant**. 프로젝트 생성 시 'Automatically expose new tables'를 꺼서 service_role 기본 grant가 없었고, **RLS 우회 ≠ 테이블 권한**이라 앱이 403. anon/authenticated는 REVOKE 유지.
  3. 'Enable automatic RLS'가 만든 `public.rls_auto_enable()`(SECURITY DEFINER, anon RPC 노출) **공개 EXECUTE 회수**.
- **근거:** deferrable로 그룹 cascade는 한 트랜잭션에서 완료, 활성멤버 개별삭제 백스톱은 커밋시점에 유지(→ [[ADR-005]]·`canDeleteMember`와 양립). service_role grant는 서버 전용이라 무로그인 모델 불변.
- **검증:** service_role 200 OK / anon·publishable 401 permission denied(deny-all 백스톱 증명). 그룹 삭제 후 전 테이블 0행.
- **상태:** 확정. 정본 `supabase/migrations/0001_init.sql`에 반영(deferrable FK + service_role grant + 가드된 함수 회수).

### ADR-013 — 받는 사람 저장 계좌(택배주소식) + 예금주 + 토스 버튼 연결 ★
- **맥락:** 만들기 폼에 받는 사람 계좌 입력란이 없고(`members`에 컬럼은 있으나 폼이 안 받아 항상 NULL), 정산마다 재입력해야 하며 **예금주 칸이 아예 없었음**. [[ADR-008]]의 토스 버튼도 빌더만 있고 UI 미연결. 사용자가 "택배주소처럼 저장해두고 자동 채움" 요청.
- **결정:**
  1. **`user_accounts` 테이블**(로그인 사용자에 묶임): 은행/계좌번호/예금주/별칭/기본여부. **여러 개 저장 + 기본 1개**(부분 유니크 인덱스 `where is_default`로 강제, 전환은 항상 '먼저 끄고 켜기'). 마이 탭에서 CRUD.
  2. **`members.account_holder`(예금주) 컬럼 추가** — 표시·확인·복사용.
  3. **만들기 때 자동 채움**: 로그인 시 기본/선택 계좌를 **멤버 0('나') 슬롯**에 저장(RPC `p_acct_*` 파라미터). **'내 계좌만'**(받는 사람=나) 모델.
  4. **정산 결과 화면**: 받는 사람의 은행·계좌·예금주 표시 + `[계좌 복사]` + `[토스 송금]`([[ADR-008]] 빌더 드디어 연결, Android `intent://`·그 외 `supertoss://`).
- **근거:** M4 로그인 도입으로 user-level 저장이 자연스러움(만들기=로그인 게이트라 `user_id` 항상 존재). **멤버 0 부착이 안전**: 내가 낸 사람=받는 사람일 때만 정산 결과의 `to`에 등장해 계좌가 노출되고, 친구가 받는 사람이면 나(0)는 채무자라 노출 안 됨(내 계좌 오노출 방지). **예금주는 토스 딥링크에 미사용**(토스는 은행+계좌+금액만) — 사람이 눈으로 확인·복사하는 용도.
- **검증:** RPC가 계좌를 멤버 0에만 부착(실DB e2e). `user_accounts` RLS on·정책 0·anon/authenticated REVOKE·기본 유니크 인덱스 존재 확인. 정산 결과 화면 무로그인 렌더(은행/계좌/예금주+복사+토스) 프리뷰 확인. **적대적 리뷰(32 에이전트)** 후 확정 수정 반영. build·lint·test(34) green.
- **불변식 하드닝(0008, 리뷰 반영):** 기본 1개 전환을 처음엔 OFF/ON 별도 호출로 했더니 동시 요청 시 '기본 0개' 창·유니크 충돌 가능 → **원자적 RPC 2개**로 교체: `set_default_account(p_user,p_id)`(한 트랜잭션 OFF→ON, 대상 미존재면 no-op로 제로-기본 방지)·`delete_account(p_user,p_id)`(삭제+가장 오래된 남은 계좌 승격, `created_at,id` 결정적). createUserAccount는 `is_default=false`로 삽입 후 RPC 전환(삽입 유니크 충돌 원천 차단). 실DB로 전환·삭제승격·미존재 no-op·항상 dc=1 검증. 계좌번호 검증은 문자열 길이가 아니라 **숫자 자릿수(6~20)**로(‘12-3’ 통과 방지).
- **상태:** 확정. `0006_user_accounts.sql`(테이블+`account_holder`) + `0007_rpc_member_account.sql`(두 RPC 계좌 파라미터) + `0008_account_default_rpc.sql`(원자적 기본전환·삭제승격). 잔여: 만들기 자동채움/마이 CRUD는 로그인(카카오) 수동 스모크 필요.
