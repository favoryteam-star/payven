'use client'

import { useEffect, useState } from 'react'
import { getMyAccountsAction } from '@/app/actions'

// 저장 계좌 DTO는 서버 액션 반환 타입에서 추론(server-only 런타임 import 없이 타입만 흐른다).
export type SavedAccountDTO = Awaited<ReturnType<typeof getMyAccountsAction>>[number]

/** 내 저장 계좌 조회 훅. null=로딩중, []=없음 또는 미로그인. */
export function useMyAccounts(): SavedAccountDTO[] | null {
  const [accounts, setAccounts] = useState<SavedAccountDTO[] | null>(null)
  useEffect(() => {
    let alive = true
    getMyAccountsAction()
      .then((r) => {
        if (alive) setAccounts(r)
      })
      .catch(() => {
        if (alive) setAccounts([])
      })
    return () => {
      alive = false
    }
  }, [])
  return accounts
}

/** 계좌번호 뒤 4자리만 노출(앞은 가림). */
function maskAccount(no: string): string {
  const digits = no.replace(/\D/g, '')
  if (digits.length <= 4) return digits
  return `··${digits.slice(-4)}`
}

export function accountChipLabel(a: SavedAccountDTO): string {
  const head = a.label?.trim() ? a.label.trim() : a.bankName
  return `${head} ${maskAccount(a.accountNo)}`
}

/** 만들기 폼의 '받을 계좌' 선택(칩). value=''는 '안 받음'. */
export function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: SavedAccountDTO[]
  value: string
  onChange: (id: string) => void
}) {
  const chip = (active: boolean) =>
    'rounded-full px-4 py-2 text-sm font-medium transition ' +
    (active
      ? 'bg-brand text-white'
      : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300')
  return (
    <div className="flex flex-wrap gap-2">
      {accounts.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onChange(a.id)}
          className={chip(value === a.id)}
        >
          {accountChipLabel(a)}
        </button>
      ))}
      <button type="button" onClick={() => onChange('')} className={chip(value === '')}>
        안 받음
      </button>
    </div>
  )
}
