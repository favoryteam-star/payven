// 인앱 브라우저(카카오톡·인스타·페북 등 앱 내장 웹뷰) 감지 — 순수 함수.
// 구글 OAuth는 임베디드 웹뷰에서 'disallowed_useragent'로 막히므로, 감지되면
// 로그인 화면에서 "외부 브라우저로 열기" 안내를 띄운다(카카오 로그인은 카카오 웹뷰에서 동작).
// 보수적으로 잘 알려진 앱 토큰만 매칭 — 일반 브라우저 오탐 최소화(generic `wv` 미사용).
const IN_APP = /KAKAOTALK|KAKAOSTORY|FBAN|FBAV|FB_IAB|Instagram|Line\/|NAVER\(inapp|DaumApps|Snapchat|everytimeApp|TikTok/i

export function isInAppBrowser(ua: string | null | undefined): boolean {
  if (!ua) return false
  return IN_APP.test(ua)
}

// 안드로이드(갤럭시·크롬·삼성인터넷·TWA 포함) 감지 — 순수 함수.
// 안드로이드 13+/Chrome은 <input accept="image/*">를 시스템 포토피커(갤러리)로 직행시켜 카메라 선택지가
// 없다. 그래서 안드로이드일 때만 '촬영/앨범' 선택지를 직접 띄운다(iOS는 네이티브 시트가 촬영을 줌).
export function isAndroid(ua: string | null | undefined): boolean {
  if (!ua) return false
  return /Android/i.test(ua)
}
