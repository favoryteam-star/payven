'use client'

import { useEffect, useState } from 'react'
import { IcoSun, IcoMoon } from '@/components/icons'

const KEY = 'payven:theme'

function setMeta(isDark: boolean) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0a0a0a' : '#ffffff')
}

// 다크/라이트 상태 + 토글. 기본 다크(layout html.dark 시드 + FOUC 스크립트), 선택은 localStorage.
// theme=null = 마운트 전(서버/첫 페인트 안정 → 하이드레이트 불일치 회피).
export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light' | null>(null)

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    setTheme(isDark ? 'dark' : 'light')
    setMeta(isDark)
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    setMeta(next === 'dark')
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* 스토리지 차단 — 저장만 생략, 토글은 동작 */
    }
  }

  return { theme, toggle }
}

/** 아이콘 버튼(홈 헤더 우측). 전환 대상 아이콘(다크=해→라이트, 라이트=달→다크). */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 transition active:scale-95 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      {theme === 'dark' ? (
        <IcoSun className="h-[18px] w-[18px]" />
      ) : theme === 'light' ? (
        <IcoMoon className="h-[18px] w-[18px]" />
      ) : (
        <span className="h-[18px] w-[18px]" />
      )}
    </button>
  )
}

/** 설정용 스위치(마이 탭). ON=다크. 마운트 전엔 중립 자리(클릭 비활성·하이드레이트 안전). */
export function ThemeSwitch() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="다크 모드"
      onClick={toggle}
      disabled={theme === null}
      className={
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ' +
        (theme === null
          ? 'bg-neutral-200 dark:bg-neutral-800'
          : isDark
            ? 'bg-brand'
            : 'bg-neutral-300 dark:bg-neutral-700')
      }
    >
      {theme !== null && (
        <span
          className={
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition ' +
            (isDark ? 'translate-x-6' : 'translate-x-1')
          }
        />
      )}
    </button>
  )
}
