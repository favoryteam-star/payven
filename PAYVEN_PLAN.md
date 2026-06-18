# 페이븐 (Payven) — 빌드 계획 (확정본)

> 원본 스펙(V0+V1)을 기준으로, 빌드 들어가기 전 결정을 못 박고 리서치로 검증한 **클로드 코드 핸드오프용 실행 계획**.
> 이 문서가 제품/빌드 계획의 단일 출처. 원본 스펙과 충돌하면 이 문서가 우선.
> **코드 구조·변이 전송 방식**의 권위 출처는 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) + [`docs/DECISIONS.md`](./docs/DECISIONS.md)(특히 ADR-006: 변이=Server Actions, 읽기=Server Component 직접, cron만 Route Handler). 작업 규칙은 [`CLAUDE.md`](./CLAUDE.md).

---

## 0. 이번에 확정한 3가지 (사용자 결정)

| 항목 | 결정 | 영향 |
|---|---|---|
| **데이터 레이어** | 처음부터 Supabase 연결 | 로컬 mock 단계 없음. M0에서 Supabase 스키마+env부터 |
| **빠른정산(화면0) 영속성** | **스펙대로 항상 임시 그룹 자동 생성** | 모든 빠른정산이 DB 그룹+링크를 가짐. 단 DB 누적 방지 장치 추가(§4, §6) |
| **이번 세션 범위** | 계획 확정만 (코드 X) | 이 문서가 결과물. 다음 세션에 M0부터 빌드 |

---

## 1. 포지셔닝 (안 변함)

페이븐 = 무로그인 링크로 시작하는 친구·모임 정산 웹앱. 첫 출시작.
**고빈도 = 리텐션**이므로 "가벼운 한 끼 1초 정산"이 메인 도로, 지속 그룹·누적잔액은 옆길.
칼 두 개: **누적 잔액(V0)** + **항목별 비대칭 분할(V1)**.

---

## 2. 기술 스택 (확정)

- 프론트: Next.js (App Router) + TypeScript + Tailwind CSS
- DB: Supabase (Postgres) — **처음부터 연결**
- 데이터 접근: Next.js Route Handlers(`app/api/.../route.ts`), `runtime = 'nodejs'`, 서버에서만 `service_role`(신규 프로젝트면 `sb_secret_...`) 사용. **브라우저에는 Supabase 키 0개**.
- 테스트: **Vitest** (정산 알고리즘 단위테스트)
- 레이트리밋: `@upstash/ratelimit` (무료 티어, IP 기반)
- 배포: Vercel(프론트+API) + Supabase(DB). 둘 다 무료 티어.
- 공유: Next `generateMetadata`(OG) + `navigator.share` + 클립보드 fallback. **Kakao JS SDK는 post-MVP**.

---

## 3. 무로그인 보안 모델 (리서치 검증 완료)

- 그룹 식별 = **nanoid 슬러그**. **21자 기본값(~126비트, UUID급)** 사용. `Math.random` 금지(CSPRNG인 nanoid/crypto만). URL: `/g/{slug}`.
- 링크 가진 사람 = 보기·편집 가능(공유 문서 모델). V0는 view/edit 구분 없음.
- **`service_role` 키는 서버 코드에서만** — `src/server/db.ts` 단 한 파일에서만 읽고 클라이언트를 생성. `server/` 전 파일은 `import 'server-only'`(클라 import 시 빌드 에러). Server Action·Server Component·cron 핸들러가 이를 거쳐 접근. `'use client'` 파일이나 클라 번들 모듈에 절대 import 금지.
- **`NEXT_PUBLIC_` 접두사에 Supabase 키 절대 금지.** (AI 생성 앱의 절반이 여기서 키 유출됨)
- **모든 테이블 RLS 활성화 + 정책 0개 = deny-all 백스톱.** service_role은 RLS를 우회하므로 앱은 정상 동작하고, 혹시 anon/publishable 키가 새도 PostgREST 직접 접근은 0. 추가로 `REVOKE ALL ON <table> FROM anon, authenticated` 권장.
- 공유 페이지에 `<meta name="robots" content="noindex">` (검색엔진 인덱싱 방지 = 슬러그 노출 방지).
- **공개 write 레이트리밋**: 무로그인이라 모든 Server Action = 공개 미인증 엔드포인트. 공개 write 액션(`그룹/빠른정산 생성`, `지출 생성` 등)은 **반드시 `withRateLimit()` 래퍼 + zod 검증**(예: 쓰기 5~10회/10초 → 초과 429). 인메모리 Map은 서버리스에서 무용지물이므로 금지.

### 데이터 접근 레시피 (top 3 함정)
1. secret 키를 `NEXT_PUBLIC_`에 넣거나 client 모듈에 import → 브라우저 JS에 유출 → DB+auth 스키마 전체 탈취.
2. RLS 끈 채로 브라우저에 키 노출 → 테이블 전체 공개. → RLS deny-all 켜둘 것.
3. 슬러그만 믿기 → 엔트로피(≥95비트)와 레이트리밋 없으면 enumeration/스팸. → 21자 + 레이트리밋.

---

## 4. 데이터 모델 (원본 + 리서치 반영 변경점)

> **금액은 전부 정수 `원`(KRW는 보조단위 없음). 부동소수점 절대 금지. `bigint`.**

### 원본 스키마 대비 변경/추가 (★)

```sql
-- 그룹: 공유의 단위. slug가 사실상의 접근 키.
create table groups (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                       -- nanoid 21자
  name text not null,
  kind text not null default 'group'               -- ★ 'group' | 'quick'
       check (kind in ('group','quick')),
  base_currency text not null default 'KRW',       -- V2 다중통화 대비 컬럼만
  created_at timestamptz not null default now()
);

-- 멤버: 그룹 안의 이름(로그인 없음).
create table members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  bank_name text,            -- ★ 토스 딥링크용 한글 은행 짧은이름 (예: 국민, 신한, 카카오뱅크)
  account_no text,           -- ★ 계좌번호 숫자만(하이픈 제거) — 복사/딥링크 양쪽에 사용
  account_label text,        --   표시용 원문(선택). 없으면 bank_name+account_no로 합성
  created_at timestamptz not null default now()
);

-- 지출
create table expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  description text not null,
  amount bigint not null,                          -- 정수(원)
  paid_by uuid not null references members(id),
  currency text not null default 'KRW',
  split_type text not null default 'equal'
       check (split_type in ('equal','custom')),   -- custom은 V1
  created_at timestamptz not null default now()
);

-- 분담: 참여자별 부담 금액
create table expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  member_id uuid not null references members(id),
  amount bigint not null
);

-- 정산 기록(수동 '송금 완료')
create table settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  from_member uuid not null references members(id),
  to_member uuid not null references members(id),
  amount bigint not null,
  settled_at timestamptz not null default now()
);

-- ★ RLS deny-all 백스톱 (모든 테이블)
alter table groups         enable row level security;
alter table members        enable row level security;
alter table expenses       enable row level security;
alter table expense_shares enable row level security;
alter table settlements    enable row level security;
-- 정책은 추가하지 않음 = anon/authenticated 전부 deny. service_role만 통과.
```

**변경 이유**
- `bank_name` / `account_no` 추가: 토스 딥링크(`supertoss://send?bank=&accountNo=&amount=`)와 계좌복사를 둘 다 구동하려면 구조화된 은행+계좌가 필요. 원본의 단일 `account_label`만으로는 딥링크 못 만듦.
- `kind` 추가: 빠른정산이 만든 임시 그룹을 표시 → 누적 방지 정리(cleanup)의 대상 식별.

### 잔액 공식 (안 변함)
```
raw_net(m)      = Σ(expenses.amount where paid_by=m) − Σ(expense_shares.amount where member_id=m)
adjusted_net(m) = raw_net(m) + Σ(settlements.amount where from_member=m) − Σ(settlements.amount where to_member=m)
```
`adjusted_net > 0` 채권자, `< 0` 채무자, 전체 합 = 0.

### 멤버 삭제 규칙 (스키마 구멍 보완)
`expenses.paid_by` / `expense_shares` / `settlements`는 cascade 없음 → 활동 있는 멤버 삭제 시 FK 에러.
→ **지출/분담/정산에 한 번도 안 묶인 멤버만 삭제 허용**. API에서 사전 체크 후 "이미 지출에 참여한 멤버라 삭제할 수 없어요" 안내.

### 임시 그룹 정리 (DB 누적 방지)
빠른정산이 매번 그룹을 만들므로, **`kind='quick'`이고 정산 활동이 없는 그룹을 N일(기본 30일) 후 삭제**하는 정리 작업을 둔다. 구현은 Supabase `pg_cron`/스케줄 함수 또는 Vercel Cron이 호출하는 `/api/cron/cleanup`. (M3에서)

### 동시 편집
무로그인 = 여러 명 동시 편집. **V0는 last-write-wins + 당겨서 새로고침**. 실시간 동기화(Supabase Realtime)는 V2.

---

## 5. 핵심 알고리즘 — `lib/settle.ts` (리서치 검증)

### 5.1 균등 분할 반올림 (largest-remainder)
amount를 k명에게: 각자 `floor(amount/k)`, 나머지 `r = amount mod k` 원을 **1원씩 r명에게** 분배.
- 합 = amount 정확히, 개인 편차 ≤ 1원.
- **나머지 흡수 tie-break(결정적)**: 낸 사람(payer)이 참여자면 payer가 나머지 원을 먼저 흡수, 아니면 멤버 id 오름차순. (재현가능·테스트가능하면 규칙 자체는 무엇이든 OK)
- 예: 10,000 ÷ 3 → 3,334 / 3,333 / 3,333.

### 5.2 최소 송금 (그리디)
net(양수=받을, 음수=낼, 합=0)에서, 가장 큰 채권자 ↔ 가장 큰 채무자를 `t=min(|c|,|d|)`로 반복 상계.
- **최소 거래 횟수 보장 X** (이 문제는 subset-sum 환원 → NP-hard). 하지만 **거래 수 ≤ m−1** 보장(m=잔액 0 아닌 인원). 사람 눈에 충분히 작음.
- 복잡도 O(N log N)(힙). 정확 최소해(비트마스크 DP O(3^m), m≤~12)는 **나중 옵션 토글**, 출시 요건 아님.

### 5.3 단위테스트 불변식 (Vitest, 가능하면 property-based)
1. 모든 net 합 == 0 (정산 전·후).
2. 각 지출의 분담 합 == 지출 amount (정확히).
3. 모든 금액은 정수·음수 없음. 분담 ≥ 0.
4. 모든 송금 amount > 0 (0/음수/자기송금 없음).
5. 산출된 송금을 net에 적용하면 전부 0이 됨.
6. 송금 건수 ≤ m−1 (그리디 상한 회귀 가드).

---

## 6. 화면 (V0=0~4, V1=화면3 확장)

설계 원칙: **화면0(빠른 1회)이 메인 도로**, 화면1·2(지속 그룹)는 옆길. 가벼운 한 끼는 화면0으로 30초 안에.

0. **빠른 정산 (랜딩)** — 앱 첫 화면. 두 입력 모드를 한 폼이 흡수:
   - (a) *인원수만* → "1인당 N원" 결과(송금 그래프 불필요).
   - (b) *이름들 + 낸 사람* → "A→B 송금" 안내.
   - 확정 시 **`kind='quick'` 임시 그룹 자동 생성** → 정산 결과(화면4)로 직행. "계속 볼 그룹이면 이름 붙여 저장" 옵션(= `kind='group'`으로 승격).
1. **(지속) 그룹 생성** — 그룹명 + 내 이름 → 슬러그 → 공유 링크 + [복사]/[공유].
2. **그룹 홈 `/g/{slug}`** — 그룹명, 멤버 목록(+추가), **누적 잔액 요약(주인공 화면: "너 → 민수 +12,000")**, 지출 리스트, 하단 [+ 지출] · [정산하기].
3. **지출 추가** — 내용/금액/낸 사람/참여자(체크)/분할방식. 새 멤버 인라인 추가.
   - V0: 균등 분할
   - V1: 참여자별 금액 직접 입력(`split_type='custom'`) — "난 이거 안 먹음"
4. **정산** — 최소 송금 목록. 각 항목: [계좌 복사](보장) · [토스로 송금](best-effort) · [✓ 완료](settlements 기록).

---

## 7. 송금 & 공유 (리서치 확정 — 정직한 제약)

### 7.1 송금 affordance (2단 스택)
1. **보장 본진**: 받는 사람 은행+계좌+금액을 큰 글씨로 + **[계좌번호 복사]**(clipboard). 모든 기기/앱/브라우저에서 동작.
2. **best-effort 버튼 하나**: **[토스로 송금]** → `supertoss://send?bank={encodeURIComponent(한글은행명)}&accountNo={숫자만}&amount={원}`.
   - 토스 공식 QR/사진송금이 쓰는 살아있는 스킴. 탭하면 토스 송금화면이 사전입력됨(사용자는 확인만).
   - **제약(반드시 UI에 반영)**: 모바일+토스 설치 시에만. PC는 조용히 무반응. 카톡/인스타 인앱브라우저에서 자주 차단됨 → userAgent로 인앱 감지해 "사파리/크롬에서 열기" 안내 또는 `kakaotalk://web/openExternal?url=`로 우회.
   - **Android 보강**: `intent://send?...#Intent;scheme=supertoss;package=viva.republica.toss;S.browser_fallback_url={PlayStore};end` → 미설치자는 플레이스토어로.
   - 버튼 라벨에 "토스 앱 필요" 명시 → 없으면 계좌복사로 자연 fallback.
   - **`toss.me/{handle}` 사용 금지** (2024.8 종료, 도메인이 종료 안내로 redirect). 카카오페이·은행 스킴은 사전입력 송금 불가 → 시도하지 않음.
   - 은행명은 토스가 받는 **한글 짧은이름**(국민/신한/카카오뱅크 등). 선택 리스트 제공. ⚠️ 토큰 목록은 빌드 시 토스로 실검증 필요(리서치 confidence medium).

### 7.2 카톡 공유 & 미리보기
- **MVP는 OG만으로 충분, Kakao JS SDK 불필요.** Next App Router `generateMetadata`(동적 라우트 `/g/[slug]`)로 서버렌더:
  - `openGraph`: `title`(그룹명), `description`, `url`(절대 HTTPS), `images:[{url: 절대 HTTPS, width:1200, height:630}]`, `type:'website'`. `twitter.card='summary_large_image'`.
  - og:image는 **1200×630(카톡이 800×400 2:1로 스마트크롭) 또는 800×400, <1MB**, 텍스트/로고는 중앙 80%에.
  - **반드시 초기 HTML에 존재**(view-source 확인). client JS(useEffect)로 넣으면 카톡 스크래퍼가 못 봄.
- **카톡 OG 캐시 주의(1순위 함정)**: 며칠씩 캐시됨. 태그/이미지 바꿀 때마다 `https://developers.kakao.com/tool/clear/og`에서 해당 URL 초기화 + 이미지 URL 캐시버스트(`?v=N`). 새 채팅방에서 테스트.
- 공유 버튼: `navigator.share({title,text,url})`(HTTPS+user-gesture 필요) + 미지원/인앱/데스크톱은 `navigator.clipboard.writeText` + "복사됨" 토스트. navigator.share는 OS 공유시트만 열 뿐, 리치카드는 100% OG에서 나옴.
- Kakao JS SDK `Kakao.Share.sendDefault`(앱키+도메인등록+SDK)는 "카톡 친구에게 직접 커스텀 카드 전송"이 필요할 때만 post-MVP.

---

## 8. 마일스톤 (Supabase 처음부터 → 재배열)

| 단계 | 내용 | 끝났다는 기준(DoD) |
|---|---|---|
| **M0 토대·파이프라인** | Next+TS+Tailwind(`src/`) 스캐폴드 / Supabase 프로젝트+스키마(§4, RLS deny-all)+env(로컬+Vercel) / `src/server/db.ts`(server-only) / `src/domain/settle.ts`+Vitest(§5) / `src/domain/money.ts`(원 포맷·파싱) / Vercel에 스켈레톤 배포 | `npm test` green + `next build` 통과 + 라이브 URL + 서버에서 DB 도달 |
| **M1 메인 도로** | 화면0 빠른정산(랜딩, 임시그룹 자동생성) + 화면4 정산결과(계좌복사+토스버튼) | 폰에서 30초 안에 1/N→송금안내 |
| **M2 지속 그룹** | 화면1 생성/공유(OG+navigator.share) + 화면2 그룹홈(누적잔액) + 화면3 지출추가(균등) + 멤버추가/삭제규칙 | 링크 공유→둘이 지출→누적잔액 정확 |
| **M3 정산기록·운영** | 정산 완료 기록(settlements) + 레이트리밋 + noindex + 임시그룹 cleanup cron + 배포 + 카톡 OG 캐시 클리어 검증 | 실 URL에서 전 플로우 + 카톡 미리보기 정상 |
| **M4 도그푸딩** | 실제 밥/술 자리에서 매주 사용·다듬기 | 1회 이상 실사용 |
| **M5 (V1)** | 항목별 비대칭 분할(`split_type='custom'`, 참여자별 금액) | "술값은 마신 사람만" 동작 |

**핵심 포인트**: M0에서 `lib/settle.ts`는 DB 없이 순수함수로 100% 테스트되고, 화면들은 그 검증된 모듈을 호출만 함.

---

## 9. 파일 구조

> ⚠️ **권위 출처는 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) §2.** (초안의 `app/api/**` 변이 트리는 ADR-006으로 폐기 — 변이는 Server Actions, 읽기는 Server Component 직접.)

핵심만:
- `src/domain/` — **솔기①** 순수 코어(`settle`·`money`·`rules`·`types`). 프레임워크 0 의존, 100% 테스트.
- `src/server/` — **솔기②** server-only DB 경계(`db.ts`=service_role 유일 생성처, `queries.ts`, `ratelimit.ts`, `validation.ts`).
- `src/lib/` — 브라우저 안전 순수 유틸(`toss.ts` 딥링크, `share.ts`, `banks.ts`).
- `src/app/` — 화면 + `actions.ts`(`'use server'` 변이) + `api/cron/cleanup`(머신 트리거만). 라우트 전용 컴포넌트는 `_components/`.
- `src/components/` — 진짜 공용. `supabase/migrations/0001_init.sql` — 스키마+RLS.

---

## 10. 환경변수

- `NEXT_PUBLIC_SUPABASE_URL` — URL은 공개돼도 무방
- `SUPABASE_SERVICE_ROLE_KEY` (또는 신규 `SUPABASE_SECRET_KEY`) — **서버 전용, `NEXT_PUBLIC_` 절대 금지**
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — 레이트리밋
- `(선택) NEXT_PUBLIC_KAKAO_JS_KEY` — V1+ Kakao SDK 갈 때만
- **클라이언트에 Supabase anon/publishable 키 두지 않음** (브라우저가 supabase-js 안 씀)

---

## 11. 안 넣을 것 (Non-goals)

로그인/회원가입 · 결제·송금 레일 · 입금 자동확인 · 회비/총무(B2B) · 다중통화(V2) · 영수증 OCR(V2) · 푸시 알림 · 실시간 동기화(V2).

---

## 12. 남은 소소한 확정거리 (기본값 정해둠, 빌드 중 조정 가능)

1. 나머지 흡수 tie-break: **payer 우선, 없으면 멤버 id 오름차순** (기본값).
2. 임시그룹 cleanup 주기: **30일** (기본값).
3. 토스 은행명 토큰 리스트: 빌드 시 토스 앱으로 실검증 후 `lib/banks.ts` 확정.
4. 레이트리밋 한도: 쓰기 **5~10회/10초** (기본값).
