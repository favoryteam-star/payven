# CLAUDE.md — 페이븐(Payven) 작업 규칙

> 무로그인 링크 기반 친구·모임 정산 모바일 웹앱. 첫 출시작.
> **모든 세션이 이 파일을 먼저 읽는다.** 제품/빌드 계획은 [`PAYVEN_PLAN.md`](./PAYVEN_PLAN.md), 코드 구조는 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), 결정 근거는 [`docs/DECISIONS.md`](./docs/DECISIONS.md).

## 스택 & 명령어
- Next.js (App Router) + TypeScript(strict) + Tailwind / Supabase(Postgres) / Vitest / Vercel
- `npm run dev` · `npm run build` · `npm test`(Vitest) · `npm run lint`
- import alias: `@/` → `src/`

## 아키텍처 한 줄 (자세히는 ARCHITECTURE.md)
**솔기는 딱 2개.** ①`src/domain/` 순수 정산 코어(프레임워크 0) ②`src/server/` 서버 전용 DB 경계(`service_role` 한 곳). 나머지 격식(Repository 인터페이스·use-case 레이어·DI·DTO 매퍼)은 **안 만든다.**

**의존성 규칙(유일한 규칙): 화살표는 안쪽 `domain`으로만.**
`app(pages/actions) → server → domain` / `lib`·`domain`은 브라우저 안전 / **`'use client'`는 `server/`를 절대 import 안 함.**

## 하드룰 (절대 어기지 말 것)
1. **돈은 전부 정수 `원`(KRW, 보조단위 없음). 부동소수점 금지.** 나눗셈 나머지는 largest-remainder(§ARCHITECTURE), tie-break = 낸 사람 우선→멤버 id 오름차순(결정적). **선택: 단위 반올림**(`splitByWeights` 옵션 `unit`∈{1,10,100,1000}·`absorber`) — base는 unit 배수로 내림, 남는 금액은 흡수자 한 명(없으면 자동). `unit=1`·흡수자 없음 = 기존과 동일([[DECISIONS#ADR-016]]). 합==amount·정수 불변.
2. **`service_role`/`sb_secret_` 키는 `src/server/db.ts` 단 한 파일에서만** 읽고 클라이언트를 생성한다. **절대 `NEXT_PUBLIC_` 금지.**
3. **`src/server/` 모든 파일은 1행이 `import 'server-only'`.** 클라이언트가 import하면 빌드 에러여야 한다(규율 아닌 컴파일 보장).
4. **브라우저에 Supabase 키 0개.** anon/publishable 키도 클라이언트에 두지 않는다(브라우저는 supabase-js를 쓰지 않음).
5. **모든 테이블 RLS 활성화 + 정책 0개 = deny-all** + `REVOKE ALL ... FROM anon, authenticated`(런타임 백스톱).
6. **변이 = Server Actions(`'use server'`)**, 공개 write 액션은 **반드시 `withRateLimit()` + zod 검증**으로 감싼다(무로그인이라 모든 액션이 공개 엔드포인트). **읽기 = Server Component가 `server/queries`를 직접 호출**(API hop 없음). **Route Handler는 cron 등 머신 트리거에만.**
7. **슬러그 = `nanoid(21)`**(CSPRNG). `Math.random` 금지. 공유 페이지엔 `noindex`.
8. **멤버 삭제는 지출/분담/정산에 안 묶인 멤버만**(FK cascade 없음). 규칙은 `domain/rules.ts`의 순수 함수로 두고 테스트.

## 코딩 컨벤션
- TypeScript strict. 도메인 타입은 `domain/types.ts`(DB 행과 분리). `any` 지양.
- **무엇을 어디에 두나:** 순수 정산/규칙 → `domain/` · DB·시크릿 → `server/`(server-only) · 브라우저 안전 유틸(딥링크/공유/은행목록) → `lib/` · 라우트 전용 컴포넌트 → 해당 라우트 `_components/` · 진짜 공용 → `components/`.
- 컴포넌트는 **계산된 숫자를 props로 받는 프레젠테이션**. 페이지가 계산, 컴포넌트는 렌더. 컴포넌트 안에서 `settle()` 재호출·잔액 재유도 금지 — 항상 `domain`을 거친다.
- 송금 딥링크/공유는 `lib/toss.ts`·`lib/share.ts` 순수 빌더 통해서만.

## 테스트 정책
- **노력의 ~90%를 `domain/*.test.ts`에.** §5.3 불변식 6개 + fast-check property 테스트 + 고정 예시(10,000÷3 = 3,334/3,333/3,333) + tie-break 핀.
- 라우트/액션/컴포넌트 단위테스트는 V0에서 **안 함**(프레임워크만 테스트). 대신 TS + `server-only` 빌드가드 + 마일스톤별 폰 수동 스모크(DoD).
- `server/queries.ts`는 필요 시 실 DB 통합테스트 소수만(멤버 삭제 가드, 빠른정산 라운드트립) — 내부 루프 밖.

## 작업 전/후 체크리스트 (DoD)
- [ ] 돈 관련 코드에 float 없음 / 모든 금액 정수 원
- [ ] 새 DB 접근은 `server/`(server-only) 안에만, 시크릿은 `db.ts`에만
- [ ] 공개 write 액션에 `withRateLimit` + zod 적용
- [ ] `npm test` green (특히 `domain` 불변식)
- [ ] `npm run build` 통과(= client에 server-only 누수 없음)
- [ ] 스코프 밖(§Non-goals) 기능 추가 안 함

## 스코프
**안 넣음:** 결제/송금레일·입금 자동확인·회비/총무·다중통화(V2)·푸시·실시간동기화(V2). 자세히는 PAYVEN_PLAN §11.
**원래 비목표였으나 라이브:** 로그인(M4 카카오·구글, 만들기 게이트 / 보기·공유는 무로그인) · **영수증 OCR**(Gemini 2.5 Flash-Lite, 사진→메뉴·금액·수량 자동입력, `98cb7f0`). OCR 키 **`GEMINI_API_KEY`는 `src/server/ocr.ts` 단 한 파일(server-only)에서만** 읽고 `NEXT_PUBLIC_` 금지(하드룰 2와 같은 결) · 로그인 게이트(미로그인=Gemini 호출 전 차단=토큰 0)+`withRateLimit('ocr')`+zod · 이미지 미저장.

## 변경 시 동기화
구조/규칙을 바꾸면 이 파일 + `docs/ARCHITECTURE.md` + `docs/DECISIONS.md`를 같이 갱신(단일 출처 유지).
