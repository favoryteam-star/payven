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
  3. **만들기 때 자동 채움**: 로그인 시 기본/선택 계좌를 **멤버 0('나') 슬롯**에 저장(RPC `p_acct_*` 파라미터). **'내 계좌만'**(받는 사람=나) 모델. 저장 계좌가 **없으면** 폼에 **인라인 입력란**(은행·계좌·예금주, 선택)을 직접 노출 → 입력해서 정산하면 그 계좌가 저장돼 다음부턴 자동 채움(액션이 베스트에포트 저장, 중복 시 건너뜀). 비우면 계좌 없이 정산.
  4. **정산 결과 화면**: 받는 사람의 은행·계좌·예금주 표시 + `[계좌 복사]` + `[토스 송금]`([[ADR-008]] 빌더 드디어 연결, Android `intent://`·그 외 `supertoss://`).
- **근거:** M4 로그인 도입으로 user-level 저장이 자연스러움(만들기=로그인 게이트라 `user_id` 항상 존재). **멤버 0 부착이 안전**: 내가 낸 사람=받는 사람일 때만 정산 결과의 `to`에 등장해 계좌가 노출되고, 친구가 받는 사람이면 나(0)는 채무자라 노출 안 됨(내 계좌 오노출 방지). **예금주는 토스 딥링크에 미사용**(토스는 은행+계좌+금액만) — 사람이 눈으로 확인·복사하는 용도.
- **검증:** RPC가 계좌를 멤버 0에만 부착(실DB e2e). `user_accounts` RLS on·정책 0·anon/authenticated REVOKE·기본 유니크 인덱스 존재 확인. 정산 결과 화면 무로그인 렌더(은행/계좌/예금주+복사+토스) 프리뷰 확인. **적대적 리뷰(32 에이전트)** 후 확정 수정 반영. build·lint·test(34) green.
- **불변식 하드닝(0008, 리뷰 반영):** 기본 1개 전환을 처음엔 OFF/ON 별도 호출로 했더니 동시 요청 시 '기본 0개' 창·유니크 충돌 가능 → **원자적 RPC 2개**로 교체: `set_default_account(p_user,p_id)`(한 트랜잭션 OFF→ON, 대상 미존재면 no-op로 제로-기본 방지)·`delete_account(p_user,p_id)`(삭제+가장 오래된 남은 계좌 승격, `created_at,id` 결정적). createUserAccount는 `is_default=false`로 삽입 후 RPC 전환(삽입 유니크 충돌 원천 차단). 실DB로 전환·삭제승격·미존재 no-op·항상 dc=1 검증. 계좌번호 검증은 문자열 길이가 아니라 **숫자 자릿수(6~20)**로(‘12-3’ 통과 방지).
- **상태:** 확정. `0006_user_accounts.sql`(테이블+`account_holder`) + `0007_rpc_member_account.sql`(두 RPC 계좌 파라미터) + `0008_account_default_rpc.sql`(원자적 기본전환·삭제승격). 잔여: 만들기 자동채움/마이 CRUD는 로그인(카카오) 수동 스모크 필요.
- **정산결과 UI 후속(2026-06-20, 폰 피드백):** 받는 계좌를 **행마다 반복 → 상단 배너 1회**로(계좌 가진 멤버가 받는 사람으로 등장할 때만 = 오노출 방지 유지). 계좌번호 truncate 제거(전체 표시). iOS Safari가 계좌번호를 전화번호로 오인해 밑줄 `tel:` 링크로 만들던 것 → 루트 레이아웃 `formatDetection:{telephone:false}`로 차단. 공유 버튼 정리. 행은 토스만 받는사람=계좌주인 행에 노출.

### ADR-014 — M5 내역(내가 만든 정산 목록): owner_id 재사용, 집계는 3쿼리 ★
- **맥락:** 내역탭이 빈 자리표시자("(곧)")였음. M4에서 `groups.owner_id`(로그인 생성 시 부여)가 이미 있으니 **별도 저장 테이블 없이** "내 정산"을 그걸로 조회 = "만들면 이미 저장됨". 빠른정산은 전부 이름이 "빠른정산"이라 이름만으론 구분 불가.
- **결정:**
  1. **`listGroupsByOwner(ownerId)`**(읽기, server/queries): `groups where owner_id=… order by created_at desc` → id로 `members`/`expenses` 한 번씩 `in()` 조회 → JS 집계(인원수·총액). **N+1 없이 3쿼리, 새 마이그레이션·RPC 없음.** 반환 `SettlementSummary{slug,name,kind,createdAt,memberCount,total}`.
  2. **내역탭 = Server Component**([[ADR-006]]: 읽기는 액션 아님): `getAuthUser` → 미로그인이면 카카오 CTA(`next=/history`) / 로그인+0건이면 빈상태 / 목록이면 카드(이름·`N명 · 상대날짜`·총액, 탭하면 settle 페이지). 무로그인 보기 유지(브라우저 키 0개 모델 불변).
  3. **상대 날짜는 KST 고정(+9, DST 없음)** 순수 유틸 `lib/datetime.formatRelativeDay(iso, now)`(오늘/어제/N일 전/`YYYY.MM.DD`). Vercel은 UTC라 캘린더일 보정 필수 → `now`를 서버에서 주입해 결정적. 단위테스트로 KST 경계 핀(UTC로는 같은 날이지만 KST로는 어제인 케이스).
- **근거:** owner_id 재사용이 가장 작은 변경(저장은 M4가 이미 함). 개인 내역(수십 건)이라 3쿼리 집계로 충분 — RPC/뷰는 과설계. 공개 **write가 아니라 읽기**라 `withRateLimit`/zod 불필요(하드룰 6은 write 전용).
- **범위 밖(후속 증분 B):** per-transfer **송금완료 기록**(기존 `settlements` 테이블 = "보냈어요" → `netBalances`가 차감, "완료" 배지) — 이건 **공개 링크의 write**라 `withRateLimit`+zod 필요, 별도 증분. 그룹(`kind='group'`) 지속/이름 편집도 후속.
- **검증:** test 47 green(+`datetime` 6, KST 경계 포함)·build(`/history` ƒ Dynamic = server-only 누수 0)·lint. 실DB로 owner 스코프(나희진 4건 반환·null-owner 제외)·집계(인원/총액) 대조. 프리뷰로 미로그인 CTA 렌더(콘솔·서버 에러 0, 카카오 링크 `next=/history`). 로그인 목록 렌더는 OAuth라 폰 스모크 잔여.
- **상태:** 확정(증분 A=목록). 마이그레이션 없음. 잔여: 송금완료 기록(증분 B)·로그인 목록 폰 스모크.

### ADR-015 — 공유 정산 페이지 = 인터랙티브 보드(개인화 '내 것만 콕' + 송금완료/취소) ★
- **맥락:** `/g/[slug]/settle`는 친구가 읽는 공유 페이지. "만든 사람 시점" 정적 리스트 → "읽는 친구 시점"으로 개편(웨이브1=받는사람 실명+맥락 [[ADR-013]] 후속). 웨이브2 = 개인화 + ADR-014가 미룬 증분 B(송금완료 기록).
- **결정:**
  1. **클라 컴포넌트 하나 `SettleBoard`(settle `_components/`)** — page는 여전히 계산(`netBalances`/`minimizeCashFlow`)만 하고 **plain props**(`members`[이름=displayName 해석됨]·`pending`·`done`·`account`·`accountMemberId`)를 넘김. 컴포넌트는 **필터·렌더만**(하드룰: 컴포넌트 안 settle 재계산 금지). 요약 히어로(총/1인당/맥락)·공유 푸터는 서버 렌더 유지.
  2. **신원 선택(개인화)** = `localStorage['payven:me:'+slug]`(서버 모름). 없으면 "이 정산에서 당신은?" 멤버 칩 → 저장. "내가 아니에요" 리셋. SSR/첫 페인트는 meId=null로 안정 → 하이드레이트 후 복원(하이드레이션 미스매치 0). 저장된 id가 멤버에 없으면 무시.
  3. **내 차례 히어로:** 내가 debtor면 "{받는사람}님에게 {금액} 보내면 끝" + 계좌(받는사람=계좌주인일 때 inline)·토스/복사 + **보냈어요**. 내가 받는 사람이면 "받을 차례 — 총 {합}" + 대기/받음 목록. 둘 다 아니면 "정산할 게 없어요". 아래 **전체 보기** 토글로 기존 pending/done 리스트.
  4. **송금완료(공개 링크 write → 하드룰6: withRateLimit+zod 필수):** `recordSettlement(slug,from,to,amount)`(server/queries) → `markSentAction`. `undoSettlement(slug,settlementId)` → `undoSettlementAction`. 둘 다 성공 시 `revalidatePath('/g/'+slug+'/settle')` + 클라 `router.refresh()`. **net 가드**(`fromOwes≥amount && toOwed≥amount`, `netBalances` 재계산)로 **과다기록·역방향(net 부호 뒤집힘) 차단** — 여러 명이 같은 송금을 눌러도 안전, 정산 끝났으면 "이미 정산됐어요"로 거부. undo는 **그 그룹(slug)에 속한 settlement만** 삭제(타 그룹 id 차단).
  5. **표시 타입 분리:** `getGroupBySlug`의 settlements select에 `id` 추가 → `SettledTransfer{id,from,to,amount}`(표시·취소용). **`netBalances`엔 여전히 `SettlementRecord{from,to,amount}`만**(도메인 불변, id 누수 0). 둘 다 같은 행에서 매핑.
  6. **권한 — 주최자 vs 친구(사용자 결정 2026-06-20):** '전체 관리'(누구의 보냈어요/취소든)는 **정산을 연 사람만**. page가 `getAuthUser()`와 `group.owner_id`를 비교(`canManageAll = !ownerId || user.id===ownerId`)해 보드에 전달 → `getGroupBySlug`에 `owner_id`(→`ownerId`) 추가. **주최자**(또는 owner 없는 옛 정산=막을 대상 없어 누구나)는 신원 선택 없이 "정산 관리" 보드에서 **전체 행 보냈어요/취소**. **친구**(링크 공유받은 사람)는 신원 골라 **자기 송금만**(보낼 것=보냈어요, 보낸 것=취소) + **전체 보기는 읽기 전용**. 친구 신원(localStorage)은 서버가 검증 불가라 '자기 것만'은 **UI 가드**(서버 액션은 net 가드로 계산 안전만 보장 — 무로그인이라 발신자 강제는 원천 불가); **주최자 쪽만 로그인으로 진짜 잠금**. 무로그인 viewing 철학 유지(친구는 로그인 0, 주최자는 만들 때 이미 로그인).
- **근거:** settlements가 이미 `netBalances`에 반영되므로 **남은 송금 차감은 minimizeCashFlow가 자동** — 보드는 insert/delete 한 송금만 하면 됨(도메인 재계산은 page가). '내 계좌만'은 각 debtor 독립이라 한 명 완료해도 나머지 재페어링 안정. 스키마 변경 0(settlements 테이블이 이미 id/from/to/amount/group_id 보유).
- **검증:** test 49 green·lint·build(`/g/[slug]/settle` ƒ Dynamic = server-only 누수 0). **무로그인 프리뷰 e2e**(슬러그 `beLVTdnLqgAWK5ELGa_aI`, 나희진=받는쪽·계좌 있음): 신원없음(칩+배너+리스트)→김철수 선택(채무자 히어로)→보냈어요(**실DB insert 확인** 김철수→나 16667)→차감·"정산할 게 없어요"→전체보기 done [취소]→취소(**실DB delete 확인**)→복원→나희진 선택("받을 차례 33,333"+대기목록)→둘 다 보냈어요→**"딱 맞췄어요" 자연 수렴**→취소로 정리(0건 복구). **권한(2026-06-20 추가):** 친구 모드(비로그인·owner 있는 `beLVTdnLqgAWK5ELGa_aI`)=전체 목록 읽기 전용·본인 카드만 보냈어요/취소 / 관리 모드(owner 없는 `ocY-D7NpoysmeAdVIuc-G`)=신원 없이 전체 행 관리, 양쪽 실DB insert/delete 대조. 주최자 로그인 경로는 owner 없는 그룹과 렌더 동일(canManageAll=true)이라 폰 스모크 잔여. **주의(검증 중 발견):** dev에서 이전 세션 PWA SW(`payven-shell-v3`)가 `/_next/static` cache-first로 옛 청크 서빙 → "Cannot read properties of undefined (reading 'call')" → SW 해제+캐시 삭제로 해결, 캐시 버전 v4로 올림(반환 사용자 누적 캐시 정리). 프로덕션은 콘텐츠 해시 파일명이라 안전.
- **상태:** 확정·검증(라이브 배포 대기). 마이그레이션 없음. 잔여: 폰 스모크(**주최자 로그인 시 관리 모드** 렌더·실기기 localStorage 신원·토스 딥링크).

### ADR-016 — 금액 단위 반올림(원/십원/백원/천원) + 남는 금액 흡수자 직접 선택 ★
- **맥락:** 10,000÷3 = 3,334/3,333/3,333처럼 "애매한 금액"을 친구한테 보내라고 하기 불편 → 각자 3,300 같은 **깔끔한 금액**으로 보내게 하고, 그 때문에 생기는 **남는 금액**을 누가 낼지 직접 고르게(사용자 요청·결정).
- **사용자 결정(2회 질문):** ⓐ남는 금액 = **매번 직접 선택**(자동 기본값 없음) ⓑ적용 범위 = **빠른정산 + 항목별 둘 다**.
- **결정:**
  1. **도메인 `splitByWeights`에 옵션 추가**(하드룰1 단일 출처 유지): 3번째 인자를 `MemberId | SplitOptions`로(과거 `paidBy` 문자열 호출 100% 호환). `SplitOptions{ paidBy?, unit?, absorber? }`. base = `unit`의 배수로 내림(`floor(amount·w/(W·unit))·unit`, 정수만). 남는 금액(leftover)은 **absorber가 참여자면 전부 그 한 명에게**(나머지는 전부 unit 배수=깔끔), 아니면 자동(unit 청크 largest-remainder + sub-unit은 최우선자). **unit=1·absorber 없음이면 기존과 byte-동일**(기존 49 테스트 그대로 green, 신규 9 테스트로 단위/흡수자/불변식 핀, 300-run property).
  2. **DB·RPC·스키마 변경 0:** 단위·흡수자를 저장하지 않고 *계산된 분담 금액*만 저장(기존 RPC `create_quick_settle`/`add_itemized_bill`이 받던 그대로). 도메인이 합==amount 보장 → RPC 합 검증 통과. **마이그레이션 불필요.**
  3. **validation:** `roundUnitSchema = union(1,10,100,1000).default(1)` + `absorberIndex?`(멤버 인덱스, superRefine로 범위 검증) — quick·itemized 둘 다.
  4. **서버:** `createQuickSettle`은 `equalSplit(…, {paidBy,unit,absorber})`, `addItemizedBill`은 항목마다 `splitByWeights(…, {paidBy,unit,absorber})`. **항목별 = 전역 흡수자**(그 항목 참여자일 때만 흡수, 아니면 그 항목만 자동 — 비흡수자는 어느 쪽이든 unit 배수라 깔끔 유지).
  5. **UI(홈·항목별):** 단위 칩 [안 함·10원·100원·천원](기본 '안 함'=현행, 친구 정산 흐름 안 바뀜). unit>1이고 남는 금액>0이면 **"남은 N원 누가 낼까요?" 멤버 칩(필수 선택)** — 안 고르고 제출하면 "남는 금액 받을 사람을 골라주세요". 홈은 1인당 박스 숨기고 "각자 X·남은 Y" 미리보기, 항목별은 인별 합계 tabs가 실시간 반영(미리보기=제출과 같은 도메인 호출). 로그인 왕복 draft에 unit·absorberIndex 보존.
- **근거:** 도메인 한 함수에 옵션만 더해 빠른정산·항목별 공용(단일 출처). 저장은 결과 금액뿐이라 스키마 불변. 흡수자(보통 받는 사람=낸 사람)가 남는 걸 먹으면 친구들은 전원 깔끔 — '내 계좌만' 모델과 자연스럽게 맞음.
- **검증:** test **58 green**(기존 49 보존 + 신규 9)·build·lint. 무로그인 프리뷰 e2e: 홈(10,000÷3)=100원→"각자 3,300·남은 100"+1인당 박스 숨김, 천원→"각자 3,000·남은 1,000", 흡수자 미선택 제출→검증 에러, 선택 후 제출→로그인 게이트 도달 / 항목별=단위 선택 시 인별 합계 반올림(나 3,400/3,300/3,300 자동→홍길동 흡수 시 3,300/3,300/3,400). **실DB 생성은 로그인 게이트라 폰 스모크 잔여**(도메인 합==amount 보장이라 RPC 경로 불변).
- **상태:** 확정·검증(라이브 배포 대기). 마이그레이션 없음. 잔여: 로그인 후 반올림 정산 생성→정산결과 금액 폰 스모크.
