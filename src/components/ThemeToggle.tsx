'use client'

import { useEffect, useState } from 'react'
import { IcoSun, IcoMoon } from '@/components/icons'

const KEY = 'payven:theme'

// 다크↔라이트 토글. 기본 다크(layout이 html.dark 시드 + FOUC 스크립트). 선택은 localStorage에 저장.
// 서버/첫 페인트는 theme=null(아이콘 없는 빈 버튼)로 안정 → 마운트 후 실제 테마로 복원(하이드레이트 불일치 회피).
export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light' | null>(null)

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    setTheme(isDark ? 'dark' : 'light')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0a0a0a' : '#ffffff')
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0a0a0a' : '#ffffff')
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* 스토리지 차단 — 저장만 생략, 토글은 동작 */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 transition active:scale-95 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      {/* 전환 대상 아이콘(다크면 해=라이트로, 라이트면 달=다크로). 마운트 전엔 빈 자리만. */}
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
