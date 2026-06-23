# 페이븐 — 출시 준비 가이드 (키 롤 + 앱 스토어)

> 작성 2026-06-23. 기능 개발·폰 확인은 끝났고(라이브 `a278c4e`), 남은 건 **출시 작업 2트랙**뿐.
> 이 문서는 "무엇을·어떻게·왜"의 단일 출처. 실행 중 사실이 바뀌면 여기 갱신.
> 근거는 repo 실물 대조 + 2025~2026 Supabase/구글 플레이 공식 문서 검증(맨 아래 §출처).

## 결정 핀 (2026-06-23, 사용자 확정)
- **🔑 키 롤 = 안 함(검증 후 불필요로 결정).** service_role 키 유출 점검 결과 **확인된 노출 0** — 실제 값은 `.env.local`(gitignore·미커밋) + Vercel env(암호화)에만 있고, **GitHub 전체 이력·모든 문서·채팅 어디에도 실제 값 없음**(md의 `sb_secret_`는 전부 플레이스홀더). MCP 토큰(.mcp.json)도 gitignore·미커밋. 노출 벡터(①GitHub ②문서에 기록) 둘 다 클린 → **롤 불필요.** ("노출된 키 롤"은 초기의 과한 가정이었음. 트랙 1은 참고용으로 남겨둠.)
- **iOS 포함:** Android + iOS 둘 다 출시 대상.
- **Play 계정 = Organization(조직) 경로:** 사용자가 보유한 **간이과세자 사업자등록증으로 가능** → 12명 테스트 게이트 회피(아래 §2.1). (개인 계정으로 가면 테스터 12명×14일 의무.)
- **순서:** 키 롤 스킵 → **남은 출시 작업 = 트랙 2 앱 스토어뿐.**

## ⚠️ 계획이 바뀐 새 사실 3개 (이번 검증에서 확인)
1. **키 롤은 위험하지 않다.** API 키(`service_role`/`secret`, `anon`/`publishable`) 롤은 **로그인 세션을 안 끊는다.** 사용자를 로그아웃시키는 건 *JWT 서명 키* 회전뿐인데 그건 **우리가 건드릴 필요 없는 별개 항목**. (단, 레거시 키면 함정 — §1.2 케이스 B.)
2. **구글 플레이 신규 개인 계정은 "테스터 12명 × 14일 연속" 비공개 테스트 통과해야 프로덕션 출시 가능**(2023-11-13 도입, 20→12명으로만 완화·여전히 유효). **Organization 계정은 면제** → 그래서 위 결정 핀.
3. **`assetlinks.json`은 SHA-256 지문 2개 필요.** PWABuilder는 *업로드 키* 지문만 넣어줌. 실제 기기엔 **Play 앱 서명 키**로 재서명돼 깔리므로 **Play 서명 키 지문을 추가 안 하면 프로덕션 앱에 주소창이 보인다**(TWA 검증 실패). 이 지문은 첫 업로드 후 생김 → 순서 주의(§2.3).

---

# 트랙 1 — 키 / 토큰 롤 ~~(필수)~~ → **검증 후 스킵(2026-06-23)**

> **결론: 안 함.** 노출 점검(git 전체 이력 + 전체 워킹트리 grep) 결과 service_role/anon/MCP 키의 **실제 값이 `.env.local`·Vercel env 밖 어디에도 없음** = 확인된 노출 0. 아래는 만약 나중에 실제 유출이 생기면 쓸 **참고 절차**로만 남김.

## 1.1 무엇을 / 왜 (원래 가정 — 이제 무효)
원래 "개발 중 키가 채팅·설정파일에 노출됐을 수 있어 출시 전 1회 위생 교체"로 적었으나, **실제 점검 결과 노출 경로(GitHub·문서 기록)가 둘 다 클린**이라 불필요로 판명. `service_role`은 RLS를 통째로 우회하는 키라 *만약* 유출되면 즉시 롤해야 하지만, 지금은 그 상황이 아님. (`anon`/`publishable`은 원래 공개용이라 더더욱 무관.)

## 1.2 어떻게

### 선결 — 레거시 vs 신형 확인 (갈림길)
Supabase 대시보드 → **Settings → API Keys**:
- **"Create new API keys" 버튼이 보이면** → 아직 **레거시**(`anon`/`service_role` JWT).
- **`sb_publishable_…`/`sb_secret_…` 값이 이미 있으면** → **신형**.

> 우리 코드는 **둘 다 지원**: `db.ts`가 `process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY`로 읽음(src/server/db.ts). anon은 `SUPABASE_ANON_KEY`(src/server/auth.ts, src/middleware.ts). URL은 `NEXT_PUBLIC_SUPABASE_URL`. → **Vercel env에 실제로 뭐가 꽂혀 있는지도 같이 확인.**

### 케이스 A — 신형 키(`sb_secret_`) → 무중단 교체
1. Settings → API Keys에서 **새 `sb_secret_` 생성**(옛 키는 그대로 살아있음 — 동시 다중 가능).
2. Vercel env `SUPABASE_SERVICE_ROLE_KEY`(또는 `SUPABASE_SECRET_KEY`) 새 값으로 교체 — **Production + Preview 둘 다.**
3. 로컬 `.env.local` 동일 교체.
4. **⚠️ 재배포 필수** — env만 바꾸고 재배포 안 하면 실행 중 함수는 옛 키를 계속 쓴다(Vercel은 배포 시점에 주입).
5. 재배포 후 **라이브 정산 생성 1회 성공 확인**(내가 거듦).
6. 확인되면 옛 키 **삭제**(되돌릴 수 없음). "마지막 사용" 표시가 없으니 5번으로 직접 확인 후 삭제.

### 케이스 B — 레거시 키(`service_role` JWT) → 신형 마이그레이션 권장
레거시는 깨끗한 단독 롤이 안 됨(돌리려면 JWT 시크릿 재생성 = **전원 로그아웃**). 게다가 **레거시 키는 2026년 말 폐기 예정.** 그래서:
1. "Create new API keys"로 **신형 publishable + secret 생성.**
2. Vercel env: `SUPABASE_ANON_KEY` ← 새 `sb_publishable_…`, service 슬롯 ← 새 `sb_secret_…`(코드는 둘 다 받음).
3. 재배포 → 라이브 write 확인 → 전부 신형으로 도는 것 확인 후 **레거시 키 비활성화.**
4. → 롤 + 미래 대비를 한 번에. 세션도 안 끊김(신형 키는 JWT 시크릿을 안 건드림).

### MCP 토큰 = 별개·마지막
`.mcp.json`의 Supabase MCP 토큰은 *계정 단위 PAT*(Account → Access Tokens)라 프로젝트 키 롤과 무관. 노출 우려 있으면 거기서 따로 재발급.
**⚠️ 재발급하면 이 세션의 Supabase MCP가 끊긴다** → 다른 작업 다 끝낸 뒤 맨 마지막에.

## 1.3 체크리스트
- [ ] 대시보드에서 레거시/신형 확인 + Vercel env 현재 값 확인
- [ ] 새 secret(필요시 publishable) 생성
- [ ] Vercel env 교체(Prod+Preview) + 로컬 `.env.local`
- [ ] **재배포**
- [ ] 라이브 정산 생성 1회 확인(내가 거듦)
- [ ] 옛 키 삭제/레거시 비활성화
- [ ] (선택·마지막) MCP PAT 재발급

---

# 트랙 2 — 앱 스토어

PWA를 네이티브로 감싸 스토어 등록. **우리 PWA는 이미 TWA-ready**: manifest `display:standalone`·192/512/512-maskable 아이콘·`theme_color #0FA177`·HTTPS·SW(src/app/manifest.ts). **Android 먼저(싸고 Mac 불필요), iOS 뒤.**

## 2.1 Play 개발자 계정 — Organization 경로 (간이과세자로 진행)

**왜 Organization:** 신규 개인 계정의 "테스터 12명 × 14일" 게이트를 면제받아 **바로 프로덕션 출시 가능**. 검증 결과 **간이과세자/개인사업자도 사업자등록증만으로 Organization 가능**(법인 불필요). Organization이 요구하는 건 법인 형태가 아니라 **D-U-N-S 번호**이고, D&B는 개인사업자에게도 발급.

**절차:**
1. **홈택스에서 영문 사업자등록증명 발급**(≤90일 이내, 주민번호 비공개 선택). 무료.
2. **D-U-N-S 번호 직접 신청**(NICE D&B / dnb.com 구글 개발자 플로) — **무료**, 상호는 *상호의 정확한 영문 번역*으로. 한국은 보통 **1~5 영업일**(공식 최대 30일).
3. 발급 후 **2~3일 전파 대기.**
4. **Play Console 계정을 Organization(조직)으로 생성** — **새 결제 프로필**로(기존 개인 프로필 재사용 시 검증 실패 사례). **법인명+주소가 D-U-N-S 기록·사업자등록증과 정확히 일치**해야 함.
5. **회사 웹사이트 = `payven.kr`** 제출(2024~ 조직 계정 필수 요건 — 우리는 이미 보유). 전화+신원+사업자 문서 검증 완료.
6. 검증되면 **비공개 테스트·12명·14일 없이** 바로 프로덕션.

**실패 모드(자주):** ① D-U-N-S 주소/이름 불일치(최다) ② **3중 이름 일치**(Google ⇄ 사업자등록증 ⇄ D-U-N-S 정확 일치) ③ 웹사이트 누락(payven.kr로 해소) ④ 결제 프로필 불일치(새 조직 프로필로 해소).

**비용:** D-U-N-S 무료(에이전시 대행은 유료 — 직접 신청). Play 등록비 **$25 1회.**

**주의(불확실):** 구글 공식 문서는 "개인 계정만 테스트 의무"라고 *범위로* 적고 "조직은 면제"를 명시 인쇄하진 않음(2차 출처·다수 한국 개발자 사례로는 확립된 관행). → **프로덕션 신청 시점에 콘솔에서 실제 확인.**

## 2.2 PWABuilder로 Android 패키징
1. **pwabuilder.com**에 `https://payven.kr` 입력 → 크롤·manifest/SW 검증 → "Package for stores" → Android.
2. 받는 zip: **`.aab`**(Play 업로드용) · `.apk`(sideload 테스트) · **`signing.keystore` + 키 정보**(⚠️ **반드시 백업** — 잃으면 업데이트 서명 불가) · `assetlinks.json`(업로드 키 지문만) · `next-steps` 안내.
3. 서명 옵션: **"Sign with a new signing key, created by PWABuilder"**(기본) 권장. 내부적으로 Bubblewrap → TWA.
4. manifest 요건은 이미 충족(name·short_name·start_url·standalone·theme/background·512 아이콘+maskable).

## 2.3 assetlinks.json (지문 2개 — 가장 흔한 실수)

**현재 repo에 파일/라우트 없음** 확인됨 → **내가 추가.**

**구조:**
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "kr.payven.twa",
    "sha256_cert_fingerprints": [
      "업로드_키_지문(콜론 hex)",
      "Play_앱서명_키_지문(콜론 hex)"
    ]
  }
}]
```
- **지문 출처:** ① 업로드 키 = PWABuilder가 줌. ② **Play 앱 서명 키** = AAB 첫 업로드 후 **Play Console → Release → Setup → App integrity → App signing key certificate**의 SHA-256. **둘 다 넣어야** 함(②가 빠지면 프로덕션 앱에 주소창 보임).
- **순서(닭-달걀):** assetlinks(①만) 호스팅 → AAB 업로드 → ② 복사 → assetlinks에 추가·재배포 → 테스트 기기에서 주소창 사라진 것 확인.
- **경로/타입:** `https://payven.kr/.well-known/assetlinks.json`, `Content-Type: application/json`. (우리는 www 리다이렉트 꺼놔서 도메인 깔끔 — 유리. 리다이렉트되면 검증 실패.)
- **Next.js 구현(내 작업):** `public/.well-known/assetlinks.json` 파일 + `next.config.mjs` `headers()`에 그 경로 `Content-Type: application/json` 규칙 추가. (또는 App Router 라우트 핸들러 `app/.well-known/assetlinks.json/route.ts`로 `NextResponse.json([...])` — MIME 모호성 0. 둘 중 택1.)

## 2.4 OAuth — Android는 코드 수정 0
TWA는 외부 OAuth를 **Chrome Custom Tab**으로 열어 구글이 "임베디드 웹뷰"로 안 봄(`disallowed_useragent` 회피) → **구글/카카오 로그인 그대로 동작.** Supabase redirect URL이 `payven.kr`(TWA scope)면 깔끔히 복귀. (기존 웹 설정 그대로 상속.)

## 2.5 iOS (Capacitor) — 더 무겁고 위험
> **상세·정정은 아래 [트랙 3 — iOS 상세](#트랙-3--ios-capacitor-상세) 참조.** 핵심 정정: **Apple은 개인사업자=Individual 계정(D-U-N-S 불필요 — Play용 D-U-N-S와 별개)**, 그리고 **4.2보다 4.8(Sign in with Apple)+5.1.1(인앱 계정삭제) 누락이 더 확실한 반려.**

**왜 뒤로:** Apple **$99/년** + **Mac + Xcode 필수** + OAuth 우회 작업 + **4.2/4.8/5.1.1 반려 위험.**

- **OAuth 함정:** 구글은 `WKWebView` 내 OAuth 차단 → **시스템 브라우저**(`ASWebAuthenticationSession`, 또는 `@capacitor/browser`)로 빼야 함. Supabase **PKCE**는 코드 검증자가 웹뷰에 있어 `SFSafariViewController`가 커스텀 스킴 딥링크를 안정적으로 못 깨움 → **HTTPS(Universal Link, 예: payven.kr 페이지) → 커스텀 스킴(`kr.payven://callback`) 한 단계 거쳐 앱 복귀** 패턴 필요 + Associated Domains 설정. 카카오도 동일 원칙(네이티브 SDK가 가장 매끄러움, redirect URI 정확 일치 = KOE006 회피). 실무선 `@capgo/capacitor-social-login`(네이티브 구글/애플/카카오) 같은 플러그인이 안정적.
- **Apple 4.2(최소 기능) 반려 위험 — 최고 난관:** "웹사이트 그냥 감싼 앱"은 반려. **네이티브 기능 여러 개 실제 탑재**로 완화: 푸시 알림("정산 요청 왔어요")·공유 시트·햅틱·Face ID 잠금·연락처 선택(참여자 추가)·오프라인 상태. 브라우저 UI 안 보이게 + 네이티브 네비/스플래시/아이콘. 심사 노트에 네이티브 통합 명시 + **데모 계정 제공**(로그인 막히면 반려).

## 2.6 앱스토어 체크리스트
- [ ] (Android) 영문 사업자등록증명 → D-U-N-S 신청 → 전파 대기
- [ ] Play Organization 계정 생성($25, 이름 3중 일치, payven.kr 웹사이트)
- [ ] PWABuilder로 AAB·keystore 생성(keystore 백업)
- [ ] `/.well-known/assetlinks.json` 라우트 추가(①업로드 지문) [내]
- [ ] AAB 업로드 → Play 서명 지문 ② 복사 → assetlinks에 추가·재배포 [내]
- [ ] 테스트 기기에서 주소창 사라짐 확인 → 프로덕션 제출
- [ ] (iOS) Mac/Xcode + Capacitor 래핑
- [ ] (iOS) OAuth를 시스템 브라우저 + Universal Link→커스텀 스킴으로 [내]
- [ ] (iOS) 4.2 대비 네이티브 기능(푸시/Face ID/공유/연락처) 추가 [내]
- [ ] (iOS) 데모 계정 + 심사 노트 작성 후 제출

---

## 트랙 3 — iOS (Capacitor) 상세

> 트랙 2 §2.5의 확장판(4에이전트 리서치 종합, 2026-06-23). **D-U-N-S·Android TWA는 §2.1~2.6 참조**(여기서 중복 안 함).
> 핵심 결론 3줄: ①순수 `server.url` 원격 래핑은 공식 "비프로덕션" + 4.2 위험 → **하이브리드(로컬 셸+원격+네이티브 몇 개)** 권장. ②OAuth는 **구글=네이티브 SDK(`signInWithIdToken`)·카카오=시스템 브라우저+HTTPS hop**, 교환은 전부 서버에서(하드룰 정합). ③**가장 확실한 반려 트리거는 4.2가 아니라 4.8(Sign in with Apple 누락)과 5.1.1(인앱 계정 삭제 누락)** — 이 둘부터 막아야 함.

### 3.1 래핑 방식 결정 — 하이브리드 권장
payven은 SSR + 서버 액션 + httpOnly 쿠키 세션이라 `output:'export'`(정적 `out/`)이 **불가**. 선택지:
| 방식 | 평가 |
|---|---|
| 풀 원격 (`server.url`만) | 가장 단순·가장 위험. Capacitor 공식이 `server.url`/`allowNavigation`/`cleartext`를 **"not intended for production"** 명시 + 4.2 위험 최고 + WKWebView 쿠키/SW/오프라인 약점이 payven 구조와 충돌. **비권장.** |
| **하이브리드: 로컬 셸 + 원격 (권장)** | `webDir`에 **최소 정적 셸**(스플래시·오프라인 "다시 시도"·네이티브 부트스트랩)만 번들, 실제 UI는 `payven.kr`를 WKWebView 로드. 오프라인 시 셸 폴백 → 백지 제거(4.2 완화). SSR/세션 거의 안 건드림. |
| 풀 네이티브 재작성 | 범위 초과(CLAUDE.md Non-goals). 제외. |

**payven 권장 = 하이브리드.** 부담되면 최소선 = **네이티브 오프라인 폴백 + 공유/스플래시**만이라도 추가해 "순수 래퍼" 면할 것.

```ts
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli'
const config: CapacitorConfig = {
  appId: 'kr.payven.app',          // 역DNS, Apple Bundle ID와 일치
  appName: 'Payven',
  webDir: 'public/shell',          // 로컬 오프라인 셸(최소 index.html)
  server: {
    url: 'https://payven.kr',      // 원격 콘텐츠("non-production" 경고 인지하고 의도적)
    allowNavigation: ['payven.kr', '*.supabase.co', 'accounts.google.com', 'kauth.kakao.com'],
  },
  ios: { contentInset: 'always' },
}
export default config
```
```bash
npm i @capacitor/core && npm i -D @capacitor/cli
npx cap init Payven kr.payven.app
npm i @capacitor/ios && npx cap add ios
npm i @capacitor/share @capacitor/splash-screen @capacitor/status-bar \
      @capacitor/push-notifications @capacitor/haptics @capacitor/app @capacitor/browser
npx cap sync ios && npx cap open ios   # Xcode에서 Signing 후 Run
```

### 3.2 OAuth (구글+카카오, 하드룰 정합)
**문제:** ①구글은 WKWebView OAuth 차단(`disallowed_useragent`). ②`@supabase/ssr` PKCE의 `code_verifier`가 쿠키에 저장되는데 시스템 브라우저로 분리되며 iOS가 비울 수 있어 `exchangeCodeForSession()` 조용히 실패. ③SFSafariVC는 커스텀 스킴 직접 리다이렉트 불안정(서버 302는 OK).

**해법 = 선택 A(하드룰 #2·#4 "브라우저에 supabase-js/키 0" 준수): verifier 저장·교환을 둘 다 서버에서** → 쿠키 분리 문제 원천 제거.
- **구글 = 네이티브 SDK + `signInWithIdToken`(브라우저 안 엶).** `@capgo/capacitor-social-login` 네이티브 로그인 → `idToken`+`rawNonce`를 **서버 액션**에 → 서버 `signInWithIdToken`. Google Cloud에 **iOS Client ID + Web Client ID(Supabase에 입력) 둘 다** 필요. ⚠️ nonce 캐시 불일치 시 logout 후 1회 재시도.
- **카카오 = 시스템 브라우저(`@capacitor/browser`) + HTTPS hop.** `redirectTo = https://payven.kr/api/auth/native-callback` → 그 라우트가 **서버에서 `exchangeCodeForSession`** → 세션 쿠키 set → 커스텀 스킴(`kr.payven.app://auth-callback`) hop → 앱 복귀.

```ts
// 신규 src/app/api/auth/native-callback/route.ts (카카오용 서버 교환 + hop)
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const supabase = createServerClient(URL, ANON, { cookies: { /* getAll/setAll */ } })
  if (code) await supabase.auth.exchangeCodeForSession(code) // verifier가 서버 쿠키라 성공
  return NextResponse.redirect('kr.payven.app://auth-callback?ok=1', 302)
}
```
```ts
// 구글: 네이티브 id_token → 서버 액션(withRateLimit+zod, 하드룰 #6)
'use server'
export async function setNativeGoogleSession(idToken: string, rawNonce: string) {
  const supabase = createServerClient(URL, ANON, { cookies: { /* getAll/setAll */ } })
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce })
  return { ok: !error }
}
```
> ⚠️ **WKWebView↔서버 httpOnly 쿠키 동기화(디바이스 검증 필수).** 세션 쿠키는 **WebView 컨텍스트 안 요청**에서 굽도록(시스템 브라우저가 구운 쿠키는 WebView로 자동 공유 안 됨). 구글 `signInWithIdToken`은 WebView 안 fetch라 가장 안전. `window.location.href` 금지(외부 Safari로 튐) — 내부 라우터 이동.

**설정:** Supabase Redirect URLs에 `https://payven.kr/api/auth/native-callback` + `kr.payven.app://auth-callback` 추가(기존 유지) · 카카오 콘솔 Redirect URI = `https://<project-ref>.supabase.co/auth/v1/callback`(앱 스킴 아님! KOE006=불일치) + iOS 플랫폼 Bundle ID 등록 · Info.plist `CFBundleURLSchemes`에 `kr.payven.app`(+구글 reversed client ID 스킴) · Universal Link 대신 **ASWebAuthenticationSession** 쓰면 Associated Domains·AASA 불필요(iOS 단독 마찰 최소).

### 3.3 Apple 4.2 + 더 치명적인 4.8 / 5.1.1
🔴 **4.2보다 먼저 막아야 할 확정 반려 2개:**
1. **4.8 — Sign in with Apple 누락.** 소셜 전용(구글/카카오)은 "프라이버시 3요건 동등 로그인" 추가 제공해야 → 사실상 **Sign in with Apple 추가 필요**(Supabase Apple provider). iOS에서만 새로 추가되는 작업.
2. **5.1.1(v) — 인앱 계정 삭제 누락.** 계정 생성 앱은 **인앱 계정 삭제**(실데이터 + Supabase Auth 유저 삭제) 필수. 마이 탭에 추가.

**4.2 추천 네이티브 조합(첫 제출):** `@capacitor/push-notifications`(정산 확정 알림) + `@capacitor/share`(정산 링크 공유=핵심 동선) + `@capacitor/splash-screen` + **커스텀 오프라인 폴백 화면**(흰 화면=즉시 반려) + `@capacitor/haptics` + `@capacitor/status-bar` + `@capacitor/browser`. ⚠️ 4.7 균형 — 과한 네이티브는 역효과, 최소·의미 있게. 생체 잠금은 우선순위 낮음(재제출 대비).

**제거할 반려 신호:** Safari 로딩바·주소창 / 웹 햄버거 메뉴만 / 오프라인 백지 / 외부 링크 Safari 튐 / 스토어 설명의 "웹·사파리·website" 카피.

**심사 노트(2.1) — 무로그인 데모 경로 활용:**
```
DEMO ACCESS (no social login needed):
- Open this demo settlement board directly (no login): https://payven.kr/g/[demo-slug]
- Or email login: review@payven.kr / [password]
HOW TO TEST: 정산하기 → amount → add members → Save → Share (native iOS sheet).
NATIVE: push (APNs), native share sheet, haptics, offline fallback, splash.
NOTE: Google/Kakao OAuth needs 2FA on test accounts; use the email demo above.
```
⚠️ 제출 전 **실기에서 데모 계정 직접 로그인** 확인.

### 3.4 준비물·비용·일정 + 개인사업자 계정 형태
⚠️ **개인사업자(간이과세자)는 Apple "조직(Organization)" 가입 불가 → "개인(Individual)"으로만**(Apple 공식: sole proprietorship → enroll as individual). 한국 개인사업자는 Apple 기준 법인격 아님.
- **D-U-N-S 재사용 ✗:** **Apple Individual 가입엔 D-U-N-S 불필요.** §2.1의 Play Organization용 D-U-N-S는 **Apple에선 안 씀**(두 트랙 계정 형태가 갈림 — Android=조직, Apple=개인).
- **트레이드오프:** Individual은 빠르나 **판매자명에 본인 실명 노출.** 브랜드명("Payven") 판매자 노출은 **법인 설립 후 Organization 전환(V2)**. → **V1은 Individual 권장.**
- **비용:** Apple Developer **$99/년**. **Mac + Xcode 16+/iOS 18 SDK**(2025-04-24~ 강제). 심사 **3~5일 여유**(피크 7일+).
- **App Privacy 라벨(payven):** Email·User ID·정산내역(User Content)·IP(**Diagnostics**) 전부 **Linked=Yes, Track=No**. **ATT 불필요**(광고/추적 SDK 없음). Financial Info 신고 안 함(송금레일·카드 없음).
- **에셋:** 아이콘 1024²(투명·둥근모서리 없음), 스크린샷 iPhone 6.9형 1세트(자동 스케일).

**iOS 체크리스트:**
- [ ] Apple Developer 가입 = **Individual**($99/년, D-U-N-S 불필요, 실명 노출 감수)
- [ ] Mac + Xcode 16+/iOS 18 SDK
- [ ] Capacitor 초기화 + iOS 추가 + 하이브리드 셸(repo에 래퍼 없음 → 선행)
- [ ] Bundle ID `kr.payven.app` + App Store Connect 앱 + 자동 서명
- [ ] **Sign in with Apple 추가**(4.8, Supabase Apple provider) [내]
- [ ] **인앱 계정 삭제**(5.1.1, 마이 탭, 데이터+Auth 유저 삭제) [내]
- [ ] OAuth 선택 A(서버 교환) — 구글 네이티브 SDK + 카카오 시스템브라우저+hop [내]
- [ ] `api/auth/native-callback` 라우트 + 구글 서버 액션(withRateLimit+zod) [내]
- [ ] Supabase/카카오/구글 콘솔 + Info.plist 스킴 등록
- [ ] 4.2 네이티브(push·share·splash·**오프라인 폴백**·haptics·status-bar·browser) [내]
- [ ] App Privacy 라벨 + 아이콘 1024²·스크린샷 6.9형
- [ ] 심사 노트(데모) + 실기 데모 로그인 확인 후 제출
- [ ] ⚠️ 디바이스 스모크: WKWebView↔서버 쿠키 동기화 / AASA 미동작 시 ASWebAuth / 구글 nonce 재시도

### 3.5 지금 결정 · 위험
**결정(코딩 전):** ①계정=Individual 확정?(실명 노출 vs 법인 지연) ②Sign in with Apple 추가=예 권장 ③OAuth=선택 A(서버 교환) 권장 ④Universal Link vs ASWebAuth(iOS 단독=ASWebAuth 마찰↓) ⑤하이브리드 셸 범위.
**위험:** 🔴 4.8/5.1.1 누락=확정 반려(4.2보다 먼저) · 🔴 WKWebView 쿠키 동기화(디바이스 검증 필수) · 🟠 4.2 reviewer 재량(조합+무로그인 데모로 완화) · 🟠 server.url 비프로덕션(하이브리드 폴백) · 🟡 KOE006/구글 nonce/AASA 캐시(디바이스 스모크).

### 3.6 출처
- Capacitor config(server.url "non-production"): https://capacitorjs.com/docs/config
- Supabase PKCE on Capacitor iOS: https://medium.com/@vpodugu/supabase-pkce-oauth-in-capacitor-ios-why-your-code-verifier-disappears-and-how-to-fix-it-29a4747dce9e
- Capgo social-login + signInWithIdToken: https://capgo.app/blog/setup-supabase-with-capacitor-social-login/ · https://supabase.com/docs/reference/javascript/auth-signinwithidtoken
- 구글 임베디드 웹뷰 차단: https://supabase.com/docs/guides/auth/social-login/auth-google
- Apple Review Guidelines(2.1/4.2/4.7/4.8/5.1.1): https://developer.apple.com/app-store/review/guidelines/
- 4.8 Sign in with Apple 2024: https://9to5mac.com/2024/01/27/sign-in-with-apple-rules-app-store/
- 웹뷰 래퍼 4.2: https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper
- Apple D-U-N-S(개인 가입 불필요)/Enrollment: https://developer.apple.com/help/account/membership/D-U-N-S/ · https://developer.apple.com/help/account/membership/program-enrollment/
- Xcode 16/iOS 18 SDK: https://developer.apple.com/news/upcoming-requirements/?id=02212025a
- 심사 소요(2025): https://www.runway.team/appreviewtimes

---

# repo 정리(선택, 출시 무관하지만 깔끔히)
검증 중 발견:
- `NEXT_PUBLIC_SITE_URL`·`NEXT_PUBLIC_KAKAO_JS_KEY`·`CRON_SECRET`이 `.env.example`에 선언만 되고 **코드에서 미사용**(metadataBase는 `layout.tsx`에 `https://payven.kr` 하드코딩). → `.env.example` 정리 가능.
- `public/app-icon-256.png`은 manifest 미참조. **apple-touch-icon·favicon.ico 없음**(iOS 홈 추가/탭 아이콘 폴리시 차원에서 추가 고려).
- `next.config.mjs` 보안 헤더 OK(X-Frame DENY·nosniff·Referrer·HSTS). **CSP 없음**(출시 후 선택).

---

# 출처 (검증 근거)
**Supabase 키:**
- 신/구 키 마이그레이션: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- API 키 이해: https://supabase.com/docs/guides/getting-started/api-keys
- JWT 서명 키(세션 영향): https://supabase.com/docs/guides/auth/signing-keys · https://supabase.com/blog/jwt-signing-keys
- 키 변경 예고/타임라인: https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys
- 서비스 키 안전 롤(재배포 필요): https://github.com/orgs/supabase/discussions/39498
- MCP PAT(별개 자격): https://supabase.com/docs/guides/ai-tools/mcp · https://supabase.com/dashboard/account/tokens

**Play / TWA / 간이과세자:**
- 테스트 의무(개인 계정만): https://support.google.com/googleplay/android-developer/answer/14151465
- 계정 유형: https://support.google.com/googleplay/android-developer/answer/13634885
- 필요 정보/D-U-N-S/이름 일치: https://support.google.com/googleplay/android-developer/answer/13628312
- 한국 검증 서류(사업자등록증): https://support.google.com/googleplay/android-developer/answer/15633622?hl=ko
- D-U-N-S(개인사업자 가능): https://www.dnb.com/en-us/smb/duns.html · https://documentation.swing2app.co.kr/developer/duns
- 한국 개인사업자 조직계정 성공 사례: https://wingsnote.com/279 · 1일 무료 D-U-N-S: https://idlebread.com/
- PWABuilder Android: https://github.com/pwa-builder/pwabuilder-google-play · assetlinks: https://github.com/pwa-builder/pwabuilder-google-play/blob/main/Asset-links.md
- Digital Asset Links: https://developers.google.com/digital-asset-links/v1/getting-started
- TWA 검증 실패(주소창): https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs

**OAuth 웹뷰 / iOS:**
- 구글 임베디드 웹뷰 차단: https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/
- Supabase PKCE on Capacitor iOS: https://medium.com/@vpodugu/supabase-pkce-oauth-in-capacitor-ios-why-your-code-verifier-disappears-and-how-to-fix-it-29a4747dce9e
- Capacitor Social Login: https://capgo.app/blog/setup-supabase-with-capacitor-social-login/
- Apple 4.2 심사: https://developer.apple.com/app-store/review/guidelines/
