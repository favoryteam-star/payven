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
  5. **UI(홈·항목별):** 단위 칩 [안 함·10원·100원·천원](기본 '안 함'). **안 나눠떨어지면(단위 무관 — 안 함의 1~2원 포함, `leftover>0`) "남은 N원 누가 낼까요?" 멤버 칩(필수 선택·자동 기본값 없음)** — 안 고르고 제출하면 "남는 금액 받을 사람을 골라주세요". 딱 떨어지면 픽커 없이 1인당 박스(홈)·tabs(항목별). 홈은 leftover>0일 때 "각자 X·남은 Y" 미리보기, 항목별은 인별 합계 tabs 실시간 반영(미리보기=제출과 같은 도메인 호출). 로그인 왕복 draft에 unit·absorberIndex 보존.
- **근거:** 도메인 한 함수에 옵션만 더해 빠른정산·항목별 공용(단일 출처). 저장은 결과 금액뿐이라 스키마 불변. 흡수자(보통 받는 사람=낸 사람)가 남는 걸 먹으면 친구들은 전원 깔끔 — '내 계좌만' 모델과 자연스럽게 맞음.
- **이터레이션(사용자 피드백 2026-06-20):** "안 함도 안 나눠떨어지면 남는 1~2원을 누구한테 줄지 선택할 수 있어야" → **흡수자 선택을 unit>1뿐 아니라 `leftover>0` 전체로 확장**(안 함 포함). 사용자 재선택: **항상 직접 고르기**(자동 기본값 없음). UI 조건만 `unit>1`→`leftover>0`로 바꿈(도메인·서버 그대로 — 흡수자 있으면 그 사람이 전부 흡수). 효과: 안 함도 안 떨어지면 친구는 전원 동일 금액, 고른 사람만 1~2원 더(예 20,000÷3 → 6,666/6,666/6,668).
- **검증:** test **58 green**(기존 49 보존 + 신규 9)·build·lint. 무로그인 프리뷰 e2e: 홈 100원→"각자 3,300·남은 100"+1인당 박스 숨김, 천원→"각자 3,000·남은 1,000", **안 함+10,000÷3→"각자 3,333·남은 1원 누가 낼까요?"**(1인당 박스 숨김), 흡수자 미선택 제출→"남는 금액 받을 사람을 골라주세요", 선택 후 제출→로그인 게이트, **딱 떨어짐(10,000÷2)→픽커 없이 "1인당 5,000원"** / 항목별=단위 선택 시 tabs 반올림(나 3,400 자동→홍길동 흡수 시 3,400 이동). **실DB 생성은 로그인 게이트라 폰 스모크 잔여**(도메인 합==amount 보장이라 RPC 경로 불변).
- **상태:** 확정·검증(라이브 배포 대기). 마이그레이션 없음. 잔여: 로그인 후 (반올림·안 함 모두) 정산 생성→정산결과 금액 폰 스모크.

### ADR-017 — 로그인 왕복 입력값 복원: URL `?resume=1` → sessionStorage draft 신호 (버그 수정) ★
- **맥락(사용자 버그 제보 2026-06-21):** 미로그인으로 정산 채우고 정산하기→카카오 로그인→복귀 시 **입력값이 리셋**. M4 게이트는 `goLogin`에서 입력값을 `sessionStorage`(`payven:draft:{quick,items}`)에 저장하고 `/?resume=1`로 돌아와 복원·자동제출하도록 했는데, **`?resume=1`이 OAuth 리다이렉트에서 유실**됨.
- **원인:** Supabase Site URL이 `/`라 OAuth가 `redirectTo`(콜백+next) 대신 Site URL로 폴백 → `?code`가 `/`로 떨어짐 → 미들웨어가 `/auth/callback`로 라우팅(세션 교환 안전망)하지만 그 과정에 **`next`(=`?resume=1`)가 사라짐** → 콜백이 기본값 `/`로 복귀 → 복원 신호 없음. 항목별은 더 나쁨: 폴백이 **항상 홈(`/`)으로** 떨어져 `/items`로 안 돌아감.
- **결정:** **복원 신호를 URL이 아니라 `sessionStorage` draft 존재로** 바꿈(같은 탭이라 외부 OAuth 왕복에도 draft는 살아남음 — `?resume`보다 신뢰). ①홈/항목별 모두 마운트 시 draft 있으면 복원(+자동제출), `?resume=1`은 cosmetic URL 정리에만. ②**홈이 `payven:draft:items`를 발견하면 `/items`로 `location.replace`**(폴백이 홈으로 떨어져도 항목별에서 복원되게). 서버/인증 흐름·스키마 변경 0(클라 useEffect 조건만).
- **근거:** sessionStorage는 same-tab 외부 왕복에도 보존되지만 URL 쿼리는 OAuth 리다이렉트 체인(Site URL 폴백·미들웨어 라우팅)에서 유실될 수 있음 → draft를 단일 진실로. 근본 대안(Supabase Redirect URLs에 콜백 등록해 `redirectTo` 존중)도 유효하나, 대시보드 설정 의존 없이 코드로 경로 무관 복원.
- **검증:** build·lint·test 58. 프리뷰로 OAuth 폴백 시뮬(draft 심고 `?resume` 없이 `/` 복귀): 빠른정산=20,000·멤버 3·단위100(각자6,600·남은200) **완전 복원**+자동제출(미로그인→로그인 시트) / 항목별=홈 복귀→**`/items` 바운스**→치킨·콜라·tabs(나6,800/친구8,100)·흡수자 복원. **실 OAuth 왕복은 폰 스모크 잔여**(코드는 draft 보존에만 의존).
- **상태:** 확정·검증(라이브 배포 대기). 잔여: 실기기 카카오 로그인 왕복 후 복원 확인.

### ADR-018 — 정산 만들기 = 한 페이지 토글(1/N ↔ 항목별), 별도 페이지 폐지 ★
- **맥락(사용자 피드백 2026-06-21):** 1/N(`/`)과 항목별(`/items`)이 **별도 페이지**라 상단 칩으로 전환 시 (1)헤더가 바뀌고 (2)하단 탭바가 사라지고(`/`는 `(tabs)` 안, `/items`는 밖) (3)**입력값이 리셋**됨(페이지마다 상태 분리). "굳이 페이지를 나눌 필요 없다 — 밑 입력칸만 바뀌면 된다."
- **결정:** **한 페이지(`/`)에서 모드 토글**로 통합. `ModeChips`를 Link 네비 → **제어형 세그먼트(value/onChange)**로. 헤더·하단탭·공유 입력(멤버·낸사람·단위/흡수자·계좌)은 고정, **맨 위 입력칸만 swap**: 1/N=금액(순서 그대로), 항목별=항목(사용자 요청대로 "뭘 먹었어요?"를 맨 위로). 멤버·계좌 등 공유 state라 **모드 바꿔도 입력 유지**. `/items`는 `redirect('/')`(옛 북마크). 로그인 draft도 하나로(`payven:draft:create`+`mode`) → [[ADR-017]] 바운스 로직 제거(단순화).
- **근거:** 1/N·항목별은 "정산 만들기" 한 작업의 모드 차이일 뿐 → 세그먼트가 맞음(페이지 분리는 항목별을 나중에 덧붙이며 생긴 우발적 구조). 통합으로 헤더/탭 일관 + 모드 전환 시 데이터 보존 + **두 페이지의 중복 코드(멤버 입력·낸사람·계좌·단위·엔터 이동·로그인 복원)를 한 곳으로**. 도메인·서버·검증·스키마 변경 0(두 액션은 그대로 호출).
- **검증:** build·lint·test 58. 프리뷰 e2e: `/` 유지(네비 X)·헤더 "페이븐" 고정·1/N=금액 위·항목별=항목 위, **토글 왕복에 멤버(양방향)·금액(복귀 시) 보존**, 1/N 흡수자 선택→정산→로그인 게이트, `/items`→`/` 리다이렉트. **주의:** dev 서버 떠 있는 채 `npm run build`(프로덕션) 돌리면 `.next` 충돌로 dev가 500(코드 무관) → dev 재시작+`.next` 삭제로 복구.
- **상태:** 확정·검증(라이브 배포 대기). 마이그레이션 없음. IA 갱신(3탭은 그대로, 만들기 화면만 통합).

### ADR-019 — 정산 날짜(`event_date`) 선택: 기본 오늘, 수정 가능 ★
- **맥락(사용자 피드백 2026-06-21):** 정산결과의 "{결제자}님이 결제 · {월일}"이 `created_at`(레코드 생성 시각) 고정 → 어제 먹은 걸 오늘 정산하면 날짜가 안 맞음. "날짜 기본 오늘 + 수정 가능"하게.
- **결정:** `groups.event_date date`(nullable) 추가(0009). 사용자가 고른 '쓴 날'을 저장, **`created_at`(생성 시각·내역 정렬용)과 분리**. 정산결과 표시는 `event_date ?? created_at`(기존 행은 null→폴백). **RPC 미수정**: 생성 RPC 직후 `update groups set event_date`(베스트에포트 — 실패해도 정산 유지, 폴백). UI=`<input type="date">`(기본 오늘[마운트 후 클라 로컬=KST로 set, SSR UTC 불일치 회피]·네이티브 피커+키보드). 검증 `eventDateSchema`(YYYY-MM-DD), 로그인 draft에 보존.
- **근거:** nullable 컬럼이라 안전(데이터 마이그레이션 0·테이블 grant가 새 컬럼 커버·RLS 테이블 단위라 무영향). RPC 시그니처를 안 건드려(DROP/재생성·재grant 회피) post-update로 — 날짜는 표시용·폴백 있어 비원자성 허용. `formatMonthDay`는 'YYYY-MM-DD'(UTC 자정+9h=같은 날)·full ISO 둘 다 처리해 유틸 추가 0.
- **검증:** build·lint·test 58. 프리뷰: 날짜 필드 기본=오늘(2026-06-21)·수정 가능(2026-06-15), **실DB로 event_date 세팅→정산결과 "나희진님이 결제 · 6월 15일"(created_at 6/20 아님) 확인→null 복구**. 컬럼 카탈로그 확인(date, nullable). **잔여:** 로그인 후 실제 생성→날짜 저장 폰 스모크. 내역탭 상대날짜는 `created_at` 유지(생성 recency, 범위 밖).
- **상태:** 확정·검증(라이브 배포 대기). 마이그레이션 0009 적용(원격+repo 파일). database.types 갱신.
- **후속(2026-06-21, UI 렌더): 날짜 표시 = 커스텀(네이티브 값 렌더 안 씀).** 사용자 제보 "날짜 칸 크기·정렬이 다른 입력칸과 안 맞고 이상함". 원인: iOS Safari `input[type=date]` 값(`::-webkit-date-and-time-value`)이 가운데 정렬+시스템 폰트라 통제 불가(CSS로 left/inherit 줘도 안 맞았음). **해결: 값은 직접 그리고**(`SettleForm`에서 `formatDateDisplay` → "YYYY. M. D." div, 다른 입력칸과 동일 클래스 15px·왼쪽·px-4 py-3), **투명 네이티브 input(`absolute inset-0 opacity-0`)을 위에 겹쳐 피커만**(`peer-focus`로 보더). 데스크톱·iOS 동일 렌더. 프리뷰로 computed style 동일(15px·start·16px·49px)+날짜 변경→표시 갱신 검증. **주의: 이 패턴을 네이티브 직접 렌더로 '단순화'하면 iOS 버그 재발.** 커밋 6bc3fb0(앞선 236b3dc의 `::-webkit-date-and-time-value` CSS 시도는 불충분해 대체·제거).

### ADR-020 — 참여자 '최근 같이 정산한 사람' 빠른 추가 ★
- **맥락(사용자 피드백 2026-06-21):** 매번 참여자 이름을 타이핑하는 게 번거로움 → 과거 정산에서 쓴 이름을 칩으로 띄워 탭 한 번에 추가.
- **결정:** `listRecentMemberNames(ownerId)`(읽기, server/queries): 내 그룹(owner_id) 최신순 40개의 멤버 이름을 모아 **그룹 recency 랭크로 정렬→dedupe('나'·빈 이름 제외)→최대 12개**. N+1 없이 2쿼리(그룹 id → members `in()`). `getRecentMembersAction`(읽기, 로그인 필수·미로그인 []). 만들기 폼이 마운트 시 fetch → 참여자 섹션에 "최근 같이 정산한 사람" 칩. 탭 = `addNamedMember`(빈 칸 있으면 채우고 없으면 추가, 항목별 `among`도 +true). 이미 들어간 이름은 제외.
- **근거:** owner_id 재사용([[ADR-014]]와 동일 출처) — 별도 저장/연락처 테이블 없이 과거 데이터로 충분. 읽기라 withRateLimit/zod 불필요(하드룰6은 write 전용). 자기 데이터만(owner 스코프)이라 프라이버시 OK.
- **검증:** build·lint·test 58. 실DB로 쿼리 확인(나희진: 홍길동·김철수·김환욱… 최근순·'나' 제외·dedupe). 프리뷰 anon=칩 숨김·에러 0. 임시 시드로 UI 확인 후 되돌림: 칩 렌더→탭 시 빈 칸('친구1')에 채워짐+칩에서 사라짐. **잔여:** 로그인 후 실제 최근 목록 표시 폰 스모크.
- **상태:** 확정·검증(라이브 배포 대기). 마이그레이션 없음(기존 데이터 재사용).

### ADR-021 — 정산 제목 입력(기본=모드명, 수정 가능) ★
- **맥락(사용자 피드백 2026-06-21):** 제목을 기본값으로 채워두고 수정 가능하게.
- **결정:** 만들기 폼 상단(모드 칩 아래)에 제목 input. **기본값=모드명**(`빠른정산`/`항목별 정산`). 모드 전환 시 제목이 아직 기본값(또는 빈칸)이면 새 모드 기본값으로 따라가고, **직접 고친 제목은 유지**(touched 플래그 없이 '값이 기본값 중 하나인가'로 판정 — 단순). 제출 시 `name`으로 전달(빈칸이면 모드 기본값 폴백). 정산결과 표시는 **기존 customName 로직 그대로**(`빠른정산`/`항목별 정산`이면 제목 숨김, 커스텀이면 표시) → 기본값 유지 시 깔끔, 개인화하면 제목 노출. 로그인 draft에 보존.
- **근거:** `groups.name` 컬럼 이미 존재(스키마 변경 0). 항목별은 `itemizedBillSchema.name` 이미 있었고 UI만 노출, 빠른정산은 하드코딩 `'빠른정산'` → `quickSettleSchema.name` 추가 + `createQuickSettle` `p_name=input.name||'빠른정산'`. 기본값 숨김은 redundant 제목("빠른정산"이 제목으로 뜨는 것) 방지.
- **검증:** build·lint·test 58. 프리뷰: 기본 "빠른정산"·항목별 전환→"항목별 정산" 따라감·"강남 회식" 수정 후 모드 전환에도 유지. 실DB로 그룹명 커스텀→정산결과 "강남 회식" 표시→원복. 잔여: 로그인 생성→제목 저장 폰 스모크.
- **후속(2026-06-21, 사용자 피드백):** ①정산결과 히어로를 **적응형**으로 — 커스텀 제목이 있으면 **제목을 히어로(큰 글씨 text-3xl, `<h1>`)**, "총·N명·1인당"은 요약 줄로 내림. 기본값/무제목이면 **1인당이 히어로**(현행 text-4xl). 프리뷰 확인: "음식값"→제목 히어로 30px+요약 "총 60,000원 · 3명 · 1인당 20,000원" / "빠른정산"(기본)→1인당 히어로 36px·제목 숨김. ②만들기 폼 제목 input에 **라벨 "뭐라고 부를까요?"**(다른 섹션과 동일 패턴 — 라벨만 없던 것 보완).
- **상태:** 확정·검증(라이브 배포 대기). 마이그레이션 없음.

### ADR-022 — 내역 수정(교체)·삭제 ★
- **맥락(사용자 요청 2026-06-21):** 내역(내가 만든 정산)을 수정·삭제할 방법이 없었음(보기·송금완료만). "전체 수정까지" 결정.
- **결정 — 수정 = 교체(replace):** 만들기 폼(`SettleForm`)을 기존 값으로 시드해 그대로 재사용. 저장 시 그 그룹의 자식(`settlements`/`expense_shares`/`expenses`/`members`)을 **한 트랜잭션에서 전부 wipe → 새 입력으로 재삽입**(group 행·slug·owner_id 보존). 멤버 참조 FK가 `DEFERRABLE INITIALLY DEFERRED`(0001)라 wipe→재삽입이 깨끗이 커밋됨 — 그룹 cascade 삭제와 같은 성질([[ADR-012]]). 신규 RPC `update_quick_settle`/`update_itemized_bill`(0010, SECURITY INVOKER+service_role grant), 생성 RPC와 분담 계산·검증 동일(반올림 단일 출처). per-필드 부분 수정 RPC는 안 만듦(폼·도메인 100% 재사용 = 최소 솔기).
- **소유자 가드(이중):** ①RPC가 `p_owner_id ↔ groups.owner_id` 비교(불일치/없음/owner null → `권한이 없습니다` raise) ②액션이 로그인 검증. 삭제는 `delete from groups where slug and owner_id`(owner 스코프) + 자식은 FK cascade(0001). 무로그인 생성(owner null) 정산은 수정·삭제 불가(애초에 내역에 안 뜸).
- **2가지 의미 결정(UI 노출):** ①수정은 교체라 친구가 누른 **'보냈어요'(settlements) 기록이 초기화**됨 — 금액이 바뀌면 옛 송금기록은 무의미. 기존 기록 있으면 수정 화면에 amber 경고 배너. ②멤버가 새 id를 받아 친구 기기의 **'내가 콕'(localStorage 신원, [[ADR-015]])이 리셋**됨(재선택하면 됨, UI 가드라 계산 안전엔 영향 0).
- **반올림 미복원(정직한 선택):** `unit`/`absorber`는 저장 안 됨(계산된 분담만 DB에) → 수정 폼은 항상 **'안 함'으로 시작**, 필요하면 사용자가 다시 고름. 미리보기가 실시간 도메인 호출이라 즉시 반영 = 정직. 분담에서 단위를 역추론(취약)하지 않음.
- **모드·계좌 복원:** 모드 = `expenses.split_type`(`'weighted'`=항목별, else 빠른정산). 계좌 = 멤버0(나)의 bank/no/holder. 저장계좌와 일치하면 칩 자동선택, 없으면 인라인 시드(드문 '저장계좌에서 삭제됨' 케이스는 기본 칩 — 알려진 한계).
- **구조:** 만들기 폼 본문을 `(tabs)/page.tsx` → `components/SettleForm.tsx`로 추출(홈·`/g/[slug]/edit` 공유, `initial` prop로 분기). 수정 라우트 = 서버 컴포넌트(auth+owner 게이트 → 프리필 `getEditableGroup` 읽기 → 폼). 내역 카드 = `HistoryCard`(클라, ⋯ 메뉴 수정/삭제+인라인 확인). 액션 `update*Action`/`deleteGroupAction`(withRateLimit+zod, 하드룰6).
- **검증:** build·lint·test 58. 실DB e2e: 수정 라운드트립(quick 3→2명·30000→20000·낸사람 변경·**보냈어요 wipe**, items 2항목→1항목·weighted 유지), **wrong-owner 수정·삭제 거부**, owner 삭제 cascade(orphan 0). 프리뷰: 폼 추출 무회귀(홈 렌더·모드 토글·제목 따라감·콘솔 0 에러)·내역 로그아웃 CTA. 잔여: 로그인 후 수정/삭제 UI 폰 스모크(OAuth라 자동검증 불가).
- **상태:** 확정·검증(라이브 배포 대기). 마이그레이션 0010(교체 RPC, 원격 적용됨).

### ADR-023 — 정산결과 1인당 표시 제거 (+ 공유 보드 통일 시도→되돌림) ★
- **맥락(사용자 피드백 2026-06-21):** ①정산결과 히어로의 "1인당 {금액}"이 반올림·흡수자([[ADR-016]])로 사람마다 달라 오해 소지(6,668 vs 6,666인데 "1인당 6,666"). ②"링크를 공유 받았을 때 사진처럼 똑같이 버튼 있게".
- **결정 ① 1인당 제거(확정):** 정산결과 히어로에서 1인당 빼고 **총액·인원만**. 커스텀 제목이면 요약 줄 "총 X · N명", 기본 제목이면 "총 X"가 큰 히어로(기존 1인당 자리). `perPerson` 삭제. (만들기 폼의 "1인당" 미리보기는 `leftover===0`일 때만 떠서 항상 정확 → 유지.)
- **결정 ② 공유 보드 통일 — 시도했다가 되돌림:** 처음엔 "사진처럼 버튼"을 *"신원 선택 없이 누구나 전 행 버튼"*으로 해석해 `SettleBoard`를 단일 관리 보드로 합치고 [[ADR-015]] 친구 개인화·`canManageAll`을 폐기(커밋 f157afe로 배포). 그러나 **사용자 의도는 반대**였음: "누구인지 선택은 그대로 두고, **고른 사람 항목에만** 버튼이 뜨게(다른 사람 항목엔 X)". → **[[ADR-015]] 동작 그대로 복원**(`git checkout HEAD~1`로 SettleBoard 원복 + page에 `canManageAll`/`getAuthUser` 재추가, ①만 유지). 복원된 동작 = 친구가 신원 고르면 "내 차례" 카드에 자기 송금 + [계좌 복사/토스 송금/보냈어요], 나머지는 '전체 보기'에서 읽기 전용 → 정확히 "그 사람 항목에만 버튼".
- **교훈:** "사진처럼 똑같이"가 "개인화 제거"를 뜻하지 않았다. 모호한 UX 지시는 한쪽으로 크게 바꾸기 전에 확인할 것(또는 작게 바꾸고 보여줄 것).
- **검증:** build·lint·test 58. 프리뷰(무로그인=친구): 신원 선택 복원 + 히어로 1인당 없음 + 홍길동 선택→"내 차례 · 나희진님에게 · 6,668원" + [계좌 복사/토스 송금/보냈어요] + 다른 행은 전체 보기 읽기 전용 + "내가 아니에요" 리셋. **dev 함정 2개: ⓐPWA SW(`payven-shell-v4`)가 옛 청크 서빙→SW 해제+캐시 삭제, ⓑdev 떠 있는 채 `npm run build` 돌려 `.next` 깨짐(`@upstash` vendor-chunk 500·코드 무관)→dev 정지+`.next` 삭제+재시작으로 복구.**
- **상태:** ① 확정 · ② 복원 확정. 마이그레이션 없음.

### ADR-024 — 항목별 = '여러 건', 항목마다 낸 사람(1차·2차·3차 여러 곳) ★
- **맥락(사용자 2026-06-21):** "한 군데만 가는 게 아니라 1차·2차·3차 여러 군데 갈 때"를 어떻게 푸나. 핵심은 **자리마다 낸 사람이 다름**(1차 나, 2차 친구)이고 멤버도 조금씩 바뀜. 사용자 선택 = **항목별을 '여러 건'으로 확장**(새 모드 추가 대신).
- **결정:** 항목별의 각 항목(=건: 메뉴 한 줄 또는 1차 같은 한 자리)에 **낸 사람(payerIndex)을 추가**. 기본=직전 항목의 낸 사람 상속(한 명이 다 내면 안 바꿔도 됨) → 메뉴 나눔(한 명 결제)도 1차2차3차(자리별 결제)도 한 모드로. 공유 "누가 냈어요?"는 **1/N 모드만**(항목별은 항목 카드마다 고름).
- **스키마·도메인·RPC 변경 0:** `add_itemized_bill`/`update_*` RPC가 **이미 항목별 `paid_by_index`를 받게** 돼 있었음([[ADR-007]], 지금까지 UI가 한 명으로 고정해 안 썼을 뿐). `netBalances`/`minimizeCashFlow`도 여러 지출·여러 결제자를 원래 합산(도메인 불변). → **검증·쿼리·UI만** 수정.
- **변경 범위:** validation(itemized top-level `payerIndex` 제거 → 각 item에 `payerIndex`, refine 갱신) · queries(`addItemizedBill`/`updateItemizedBill` splitOpts.paidBy·paid_by_index를 `it.payerIndex`로, `getEditableGroup`이 각 expense.paid_by → `EditableItem.payer`) · `SettleForm`(`Item.payer`, 항목 카드에 '참여'/'낸 사람' 칩 두 줄, 낸 사람 단일선택·기본 직전 상속, addItem/removeMember 반영, submit per-item payer, 미리보기 per-item) · settle page(결제자 2명 이상이면 "여러 명이 결제" — 이번에 처음 도달 가능해진 문구, `님` 제거).
- **알려진 한계(V2):** 자리마다 낸 사람이 다르면 **받을 사람도 여러 명**인데 저장 계좌는 '내 계좌'([[ADR-013]] 멤버 0)만 → 다른 결제자 계좌 자동표시·토스 버튼은 아직 없음. **정산 금액·관계 계산은 정확**(누가 누구에게 얼마). 다른 결제자 계좌 입력은 후속.
- **검증:** build·lint·test 58. **실DB e2e**: `add_itemized_bill`로 1차(나 30,000·전원)·2차(홍길동 20,000·나+홍길동, 김철수 빠짐) → `expenses.paid_by`가 나/홍길동 다름 + net(나 +10,000·홍길동 0·김철수 −10,000 → 김철수→나 10,000, 합 0). 프리뷰: 항목 카드 '참여'(토글)+'낸 사람'(단일·기본 나·직전 상속) 칩 / 공유 낸사람 1/N만 / settle "여러 명이 결제 · 김철수→나 10,000원". 콘솔 0. **(dev 함정 재확인: PWA SW 옛 청크 → 해제+캐시 삭제 후 새 코드 반영.)** 잔여: 로그인 생성→실제 1차2차3차 폰 스모크.
- **상태:** 확정·검증(라이브 배포 대기). 마이그레이션 없음.
