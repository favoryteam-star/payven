'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* 등록 실패는 조용히 무시 — 앱은 SW 없이도 동작 */
      })
    }
  }, [])
  return null
}
