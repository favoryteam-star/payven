# 페이븐 — 출시 준비 가이드 (키 롤 + 앱 스토어)

> 작성 2026-06-23. 기능 개발·폰 확인은 끝났고(라이브 `a278c4e`), 남은 건 **출시 작업 2트랙**뿐.
> 이 문서는 "무엇을·어떻게·왜"의 단일 출처. 실행 중 사실이 바뀌면 여기 갱신.
> 근거는 repo 실물 대조 + 2025~2026 Supabase/구글 플레이 공식 문서 검증(맨 아래 §출처).

## 결정 핀 (2026-06-23, 사용자 확정)
- **iOS 포함:** Android + iOS 둘 다 출시 대상.
- **Play 계정 = Organization(조직) 경로:** 사용자가 보유한 **간이과세자 사업자등록증으로 가능** → 12명 테스트 게이트 회피(아래 §2.1). (개인 계정으로 가면 테스터 12명×14일 의무.)
- **순서:** 트랙 1 키 롤 먼저(빠르고 안전·출시 전제) → 트랙 2 앱 스토어(외부 일정에 묶임).

## ⚠️ 계획이 바뀐 새 사실 3개 (이번 검증에서 확인)
1. **키 롤은 위험하지 않다.** API 키(`service_role`/`secret`, `anon`/`publishable`) 롤은 **로그인 세션을 안 끊는다.** 사용자를 로그아웃시키는 건 *JWT 서명 키* 회전뿐인데 그건 **우리가 건드릴 필요 없는 별개 항목**. (단, 레거시 키면 함정 — §1.2 케이스 B.)
2. **구글 플레이 신규 개인 계정은 "테스터 12명 × 14일 연속" 비공개 테스트 통과해야 프로덕션 출시 가능**(2023-11-13 도입, 20→12명으로만 완화·여전히 유효). **Organization 계정은 면제** → 그래서 위 결정 핀.
3. **`assetlinks.json`은 SHA-256 지문 2개 필요.** PWABuilder는 *업로드 키* 지문만 넣어줌. 실제 기기엔 **Play 앱 서명 키**로 재서명돼 깔리므로 **Play 서명 키 지문을 추가 안 하면 프로덕션 앱에 주소창이 보인다**(TWA 검증 실패). 이 지문은 첫 업로드 후 생김 → 순서 주의(§2.3).

---

# 트랙 1 — 키 / 토큰 롤

## 1.1 무엇을 / 왜
개발 중 `service_role` 키·MCP 토큰이 채팅·설정파일에 노출됐을 수 있어 **공개 출시 전 1회 위생 교체**. `service_role`은 RLS를 통째로 우회하는 가장 위험한 키라 **이게 핵심 대상**. (`anon`/`publishable`은 원래 공개용이라 우선순위 낮음 — 선택 교체.)

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
**왜 뒤로:** Apple **$99/년** + **Mac + Xcode 필수** + OAuth 우회 작업 + **4.2 반려 위험.**

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
