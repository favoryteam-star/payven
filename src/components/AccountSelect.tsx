'use client'

import { useEffect, useState } from 'react'
import { BANKS } from '@/lib/banks'
import { formatAccountNo, onlyDigits } from '@/lib/account'
import { getMyAccountsAction } from '@/app/actions'
import { BankSelect } from './BankSelect'

// 저장 계좌 DTO는 서버 액션 반환 타입에서 추론(server-only 런타임 import 없이 타입만 흐른다).
export type SavedAccountDTO = Awaited<ReturnType<typeof getMyAccountsAction>>[number]

// 저장 계좌가 없을 때 폼에서 직접 입력하는 계좌(은행/계좌번호/예금주).
export type InlineAcct = { bank: string; no: string; holder: string }
export const EMPTY_INLINE: InlineAcct = { bank: BANKS[0], no: '', holder: '' }

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

function chipLabel(a: SavedAccountDTO): string {
  const head = a.label?.trim() ? a.label.trim() : a.bankName
  return `${head} ${maskAccount(a.accountNo)}`
}

export interface ResolvedAccount {
  account?: { bankName: string; accountNo: string; accountHolder: string }
  saveAccount: boolean // 인라인 입력이라 정산 시 저장해야 하는지
  error?: string
}

/**
 * 제출 시 쓸 받을 계좌를 결정.
 * - 저장 계좌가 있으면: 선택된 칩(기본=기본계좌, ''=없음=계좌 없이) → 저장 안 함(saveAccount=false)
 * - 없으면: 인라인 입력(선택). 비우면 계좌 없이 정산. 채우면 정산에 쓰고 저장(saveAccount=true).
 */
export function resolveAccount(
  accounts: SavedAccountDTO[] | null,
  accountId: string | undefined,
  inline: InlineAcct,
): ResolvedAccount {
  if (accounts && accounts.length > 0) {
    const chosen =
      accountId === undefined
        ? (accounts.find((a) => a.isDefault) ?? accounts[0])
        : accountId === ''
          ? undefined
          : accounts.find((a) => a.id === accountId)
    return {
      account: chosen
        ? { bankName: chosen.bankName, accountNo: chosen.accountNo, accountHolder: chosen.accountHolder }
        : undefined,
      saveAccount: false,
    }
  }
  // 저장 계좌 없음 → 인라인 입력(선택). 둘 다 비면 계좌 없이 정산. accountNo는 숫자만 저장.
  const no = onlyDigits(inline.no)
  const holder = inline.holder.trim()
  if (!no && !holder) return { account: undefined, saveAccount: false }
  const valid = holder.length >= 1 && holder.length <= 20 && no.length >= 6 && no.length <= 20
  if (!valid) {
    return {
      account: undefined,
      saveAccount: false,
      error: '계좌번호(숫자 6~20자리)와 예금주를 확인해 주세요. 비워두면 계좌 없이 정산돼요.',
    }
  }
  return { account: { bankName: inline.bank, accountNo: no, accountHolder: holder }, saveAccount: true }
}

const fieldCls =
  'w-full rounded-xl border border-neutral-200 bg-transparent px-4 py-3 text-[15px] outline-none focus:border-brand dark:border-neutral-700'

/**
 * 받을 계좌 필드. 저장 계좌가 있으면 칩 선택, 없으면 인라인 입력(은행/계좌/예금주).
 * 완전 제어형 — 상태는 폼이 보유(로그인 왕복 보존 위해).
 */
export function AccountField({
  accounts,
  accountId,
  onSelect,
  inline,
  onInline,
}: {
  accounts: SavedAccountDTO[]
  accountId: string
  onSelect: (id: string) => void
  inline: InlineAcct
  onInline: (v: InlineAcct) => void
}) {
  if (accounts.length > 0) {
    const chip = (active: boolean) =>
      'rounded-full px-4 py-2 text-sm font-medium transition ' +
      (active
        ? 'bg-brand text-white'
        : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300')
    return (
      <div className="flex flex-wrap gap-2">
        {accounts.map((a) => (
          <button key={a.id} type="button" onClick={() => onSelect(a.id)} className={chip(accountId === a.id)}>
            {chipLabel(a)}
          </button>
        ))}
        <button type="button" onClick={() => onSelect('')} className={chip(accountId === '')}>
          없음
        </button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <BankSelect value={inline.bank} onChange={(b) => onInline({ ...inline, bank: b })} />
      <input
        value={formatAccountNo(inline.bank, inline.no)}
        onChange={(e) => onInline({ ...inline, no: onlyDigits(e.target.value) })}
        placeholder="계좌번호 (숫자만)"
        inputMode="numeric"
        className={`num ${fieldCls}`}
      />
      <input
        value={inline.holder}
        onChange={(e) => onInline({ ...inline, holder: e.target.value })}
        placeholder="예금주"
        className={fieldCls}
      />
    </div>
  )
}
