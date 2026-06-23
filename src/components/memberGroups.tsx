'use client'

import { useEffect, useState } from 'react'
import { getMyMemberGroupsAction } from '@/app/actions'

// 모임 DTO는 서버 액션 반환 타입에서 추론(server-only 런타임 import 없이 타입만 흐른다).
export type MemberGroupDTO = Awaited<ReturnType<typeof getMyMemberGroupsAction>>[number]

/** 내 모임 조회 훅(만들기 폼). null=로딩, []=없음/미로그인. refresh로 저장 후 갱신. */
export function useMyMemberGroups(): { groups: MemberGroupDTO[] | null; refresh: () => void } {
  const [groups, setGroups] = useState<MemberGroupDTO[] | null>(null)
  const refresh = () => {
    getMyMemberGroupsAction()
      .then(setGroups)
      .catch(() => setGroups([]))
  }
  useEffect(() => {
    let alive = true
    getMyMemberGroupsAction()
      .then((r) => alive && setGroups(r))
      .catch(() => alive && setGroups([]))
    return () => {
      alive = false
    }
  }, [])
  return { groups, refresh }
}
