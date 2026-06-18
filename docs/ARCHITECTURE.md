# 아키텍처 — 페이븐(Payven)

> 코드 구조의 단일 출처. 제품/빌드 계획은 [`../PAYVEN_PLAN.md`](../PAYVEN_PLAN.md), 결정 근거는 [`./DECISIONS.md`](./DECISIONS.md).
> 3개 독립 설계안(미니멀 / 포트앤어댑터 / Next.js 정석)을 합성한 **적정(right-sized) 클린아키텍처**.

## 0. 고도(altitude) — 왜 "2 솔기"인가

이 앱에서 진짜 어려운 건 **정산 수학** 하나, 진짜 위험한 건 **`service_role` 키 유출** 하나뿐이다. 그래서 값을 하는 추상은 정확히 2개:

| 솔기 | 무엇 | 무엇을 가능케 하나 |
|---|---|---|
| **① 순수 도메인 코어** `src/domain/` | settle·money·rules·types. next/supabase/react 0 의존 | 정산 로직을 mock 없이 Vitest로 100% 검증 = 신뢰의 근거 |
| **② 서버 전용 DB 경계** `src/server/` | `db.ts`가 `service_role` 키를 쥔 유일 파일, 전부 `import 'server-only'` | 키가 클라이언트로 새는 게 **컴파일 불가능**해짐(규율 아님) |

**일부러 안 만드는 것:** Repository 인터페이스, use-case/service 레이어, DI 컨테이너, DTO/매퍼, Result 모나드, CQRS/이벤트버스, HTTP 추상화, 클라이언트 상태/캐시 라이브러리. 이유는 §7.

## 1. 의존성 규칙 (유일한 규칙)

```
            ┌─────────────── 화살표는 안쪽으로만 ───────────────┐
 app/ (pages·actions·api)  ──▶  server/  ──▶  domain/  ◀── lib/
        │  ('use client'는 server/ 절대 import 안 함)              ▲
        └────────────────────────  components/  ──────────────────┘
```

- **`domain/`** — 프로젝트 내부에서 아무것도 import 안 함(stdlib + 자기 자신만). next·react·supabase·env·`Date.now()` 금지. 인자로 다 받는다.
- **`lib/`** — 브라우저 안전 순수 유틸(시크릿·부작용 0). `domain/`까지만 import. `'use client'`에서 자유롭게 사용.
- **`server/`** — `domain/`·`lib/` import 가능. **모든 파일 1행이 `import 'server-only'`.** 시크릿은 여기서만.
- **`app/`** — pages(Server Component)·actions(`'use server'`)·api(머신용)는 `server/`·`domain/`·`lib/`·`components/`를 오케스트레이션. SQL·알고리즘을 직접 담지 않는다.
- **`'use client'` 컴포넌트** — `domain/`·`lib/`·`components/`만. **`server/` import 금지**(빌드 에러).

## 2. 폴더 구조

```
payven/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx
│  │  ├─ page.tsx                    # 화면0 빠른정산(랜딩). client form → createQuickSettle 액션
│  │  ├─ actions.ts                  # 'use server' — createQuickSettle, createGroup
│  │  ├─ g/[slug]/
│  │  │  ├─ page.tsx                 # 화면2 그룹홈. Server Component가 server/queries 직접 호출 + generateMetadata(OG)
│  │  │  ├─ actions.ts               # 'use server' — addExpense, addMember, deleteMember, recordSettlement, saveAsGroup
│  │  │  ├─ opengraph-image.tsx      # 동적 OG 이미지(그룹명) — 카톡 미리보기
│  │  │  ├─ _components/             # 라우트 전용 프레젠테이션
│  │  │  │  ├─ BalanceSummary.tsx    # 주인공: 누적 잔액 요약
│  │  │  │  ├─ ExpenseList.tsx
│  │  │  │  └─ SettleSheet.tsx
│  │  │  ├─ expense/page.tsx         # 화면3 지출추가
│  │  │  └─ settle/page.tsx          # 화면4 정산
│  │  └─ api/cron/cleanup/route.ts   # 머신 트리거 ONLY (Vercel Cron, CRON_SECRET 가드)
│  ├─ domain/                        # SEAM 1 (순수)
│  │  ├─ settle.ts  settle.test.ts   # 균등분할(largest-remainder)·순잔액·최소송금(그리디)
│  │  ├─ money.ts   money.test.ts    # KRW 정수 파싱/포맷
│  │  ├─ rules.ts                    # 순수 규칙 (canDeleteMember 등) + 테스트
│  │  └─ types.ts                    # 도메인 타입 (DB 행과 분리)
│  ├─ server/                        # SEAM 2 (server-only)
│  │  ├─ db.ts                       # supabaseAdmin(service_role) — 유일 생성처
│  │  ├─ queries.ts                  # 데이터 함수(아래 §3)
│  │  ├─ ratelimit.ts                # @upstash/ratelimit + withRateLimit() 래퍼 + IP 추출
│  │  └─ validation.ts               # zod 입력 스키마
│  ├─ lib/                           # 브라우저 안전 순수 유틸
│  │  ├─ toss.ts  toss.test.ts       # supertoss/intent 딥링크 빌더
│  │  ├─ share.ts                    # navigator.share + clipboard fallback
│  │  └─ banks.ts                    # 토스 한글 은행명 리스트
│  └─ components/                    # 진짜 공용(Button, CopyButton …)
├─ supabase/migrations/0001_init.sql # 스키마 + RLS deny-all + REVOKE
├─ public/og-default.png             # 1200×630 기본 OG(랜딩용)
├─ vitest.config.ts                  # @/ → src/, env node
├─ vercel.json                       # cron 스케줄
├─ CLAUDE.md  PAYVEN_PLAN.md
└─ docs/ARCHITECTURE.md  docs/DECISIONS.md
```

## 3. Supabase는 어디 사나 / 어떻게 닿나

- **`src/server/db.ts`** — `import 'server-only'` 후 `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } })` 모듈 싱글톤. **여기서만** 시크릿을 읽는다.
- **`src/server/queries.ts`** — 유일하게 `.from()/.select()/.insert()`를 호출. DB 행↔도메인 타입 정규화(특히 `bigint→number`)를 이 경계에서 인라인 처리. 함수 예: `getGroupBySlug`, `createQuickSettle`, `createGroup`, `addMember`, `deleteMemberIfUnused`, `addExpenseWithShares`, `recordSettlement`, `deleteStaleQuickGroups`.
- **닿는 경로 두 가지(둘 다 서버):**
  1. **읽기** — Server Component(`g/[slug]/page.tsx`)가 렌더 중 `await getGroupBySlug(slug)` → `domain/settle`로 잔액 계산 → HTML. 브라우저는 키를 못 봄(= "모든 접근은 서버 경유"가 기본 충족, API hop 0).
  2. **쓰기** — Server Action(`actions.ts`)이 같은 `queries.ts` 함수 호출 후 `revalidatePath('/g/'+slug)`.

## 4. 변이 패턴 — Server Action + 필수 가드

무로그인이라 **모든 액션 = 공개 미인증 엔드포인트**. 그래서 공개 write 액션은 예외 없이 래핑한다.

```ts
// src/app/g/[slug]/actions.ts
'use server'
import { withRateLimit } from '@/server/ratelimit'
import { addExpenseSchema } from '@/server/validation'
import { addExpenseWithShares } from '@/server/queries'
import { equalSplit } from '@/domain/settle'
import { revalidatePath } from 'next/cache'

export const addExpense = withRateLimit(async (raw: unknown) => {
  const input = addExpenseSchema.parse(raw)              // zod 검증
  const shares = equalSplit(input.amount, input.participantIds, input.paidBy)  // 순수 도메인
  await addExpenseWithShares({ ...input, shares })        // server-only 경계
  revalidatePath(`/g/${input.slug}`)
})
```

- `withRateLimit`: `headers()`에서 `x-forwarded-for` IP 추출 → `@upstash/ratelimit` 슬라이딩 윈도우(쓰기 5~10/10초) → 초과 시 에러/429. **공개 write 액션 전부 적용**(빠뜨리기 쉬우니 래퍼 강제).
- 빠른정산 등 **다중 insert는 원자성 필요** → `queries.ts`에서 Supabase RPC/트랜잭션으로 묶는다(4번 순차 insert 금지, 실패 시 orphan 방지).
- **Route Handler는 cron만**: `api/cron/cleanup/route.ts`가 `CRON_SECRET` 헤더 검증 후 `deleteStaleQuickGroups()`.

## 5. 보안 — 3중 백스톱(심층 방어)

1. **빌드타임** — `server/` 전 파일 `import 'server-only'` → 클라이언트 import = `next build` 실패.
2. **CI/grep** — `SUPABASE_SERVICE_ROLE_KEY`가 `server/db.ts`에만 존재함을 검사 + 빌드된 client 번들에 키 prefix(`sb_secret_`/`service_role`)가 없음을 grep.
3. **런타임** — 모든 테이블 RLS deny-all + `REVOKE ALL ... FROM anon, authenticated`. 키가 새도 PostgREST 직접 접근 0.
- 슬러그 `nanoid(21)`(~126비트), 공유 페이지 `noindex`, 시크릿은 로그/Referer에 노출 금지.

## 6. 테스트 전략 (피라미드, 90% 순수)

- **`domain/settle.test.ts`(척추):** §5.3 불변식 6개 — ①Σnet==0(전·후) ②지출별 분담합==amount ③전부 정수·음수 없음 ④송금 amount>0·자기송금 없음 ⑤송금 적용 시 net 전부 0 ⑥송금수 ≤ m−1. fast-check property + 고정 예시(10,000÷3) + tie-break 핀.
- **`money.test.ts`·`lib/toss.test.ts`:** 정수 파싱/포맷, 딥링크 인코딩(`국민`→`bank=%EA%B5%AD%EB%AF%BC`).
- **`server/queries`:** 필요 시 실 DB 통합테스트 소수(멤버 삭제 가드, 빠른정산 라운드트립) — 내부 루프 밖, 온디맨드.
- **안 함:** 라우트/액션/컴포넌트 단위테스트·E2E(V0). 폰 수동 스모크(DoD)로 커버.
- **CI 게이트:** `vitest run` green + 시크릿 grep + `next build`.

## 7. 일부러 안 만드는 것 (이유 명시)

| 격식 | 왜 스킵 |
|---|---|
| Repository 인터페이스 | DB는 하나뿐, 영원히 안 바꿈. `queries.ts` 구상함수가 이미 "한곳에서 스왑" 성질을 줌. 인터페이스는 안 할 스왑·필요 없는 테스트더블 비용. |
| use-case/service 레이어 | 각 "유스케이스"는 (검증→1~3 쿼리→revalidate) 10줄짜리 액션. 위임만 하는 래퍼는 hop만 추가. 액션이 곧 유스케이스. |
| DI 컨테이너 | 스왑할 구현·관리할 라이프사이클 없음. 직접 import가 더 짧고 타입 안전. |
| DTO/매퍼 | DB 행이 이미 평범한 객체. `bigint→number`만 경계에서 인라인. 5개 테이블에 매퍼 레이어는 과함. |
| 클라이언트 상태/캐시(Redux/React Query) | Server Component가 서버에서 읽고, 액션이 `revalidatePath`. last-write-wins + 당겨 새로고침(V0)이라 클라 캐시 불필요. |
| Result<T,E> 모나드 | 액션에서 throw/에러객체 반환이면 충분. |

## 8. 성장 경로 (언제 구조를 더 넣나)

지금의 2 솔기는 **추가형(additive) 리팩터**를 안전하게 한다 — 도메인과 DB 접근이 이미 격리됐으니, 커지면 "모듈 추가"지 "엉킴 풀기"가 아니다.
- `queries.ts`가 진짜 커지면 → 테이블별 `server/queries/groups.ts` 등으로 **구상 모듈** 분리(인터페이스 말고).
- 액션에 비자명한 분기가 쌓이면 → 그 분기를 `domain/`의 순수 헬퍼로 추출해 단위테스트.
- V1 custom 분할/ V2 다중통화·실시간 → 그때 해당 영역만 확장(스펙이 컬럼만 미리 둠).
