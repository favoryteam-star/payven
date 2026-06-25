import { describe, expect, it } from 'vitest'
import { isAndroid, isInAppBrowser } from './ua'

describe('isInAppBrowser', () => {
  it('알려진 인앱 웹뷰 UA는 true', () => {
    const uas = [
      'Mozilla/5.0 (iPhone) AppleWebKit KAKAOTALK 10.4.5',
      'Mozilla/5.0 (Linux; Android 13) Instagram 300.0',
      'Mozilla/5.0 (iPhone) FBAN/FBIOS;FBAV/450.0',
      'Mozilla/5.0 (iPhone) Line/13.5.0',
      'Mozilla/5.0 (Linux; Android) DaumApps/com.kakao.example',
    ]
    for (const ua of uas) expect(isInAppBrowser(ua)).toBe(true)
  })

  it('일반 모바일·데스크톱 브라우저는 false', () => {
    const uas = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/120.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit Chrome/120.0 Safari/537.36',
    ]
    for (const ua of uas) expect(isInAppBrowser(ua)).toBe(false)
  })

  it('빈 값은 false', () => {
    expect(isInAppBrowser('')).toBe(false)
    expect(isInAppBrowser(null)).toBe(false)
    expect(isInAppBrowser(undefined)).toBe(false)
  })
})

describe('isAndroid', () => {
  it('안드로이드(갤럭시 Chrome·삼성인터넷·TWA)는 true', () => {
    const uas = [
      'Mozilla/5.0 (Linux; Android 14; SM-G991N) AppleWebKit Chrome/120.0 Mobile Safari/537.36', // 갤럭시 S21 Chrome
      'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918N) AppleWebKit SamsungBrowser/23.0 Chrome/115 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit Chrome/120.0 Mobile Safari/537.36',
    ]
    for (const ua of uas) expect(isAndroid(ua)).toBe(true)
  })

  it('iOS·데스크톱은 false', () => {
    const uas = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit Mobile/15E148',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit Chrome/120.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit Version/17.0 Safari/605.1.15',
    ]
    for (const ua of uas) expect(isAndroid(ua)).toBe(false)
  })

  it('빈 값은 false', () => {
    expect(isAndroid('')).toBe(false)
    expect(isAndroid(null)).toBe(false)
    expect(isAndroid(undefined)).toBe(false)
  })
})
