import { describe, expect, it } from 'vitest'
import { resolveDisplayNames, type DisplayMember } from './displayNames'

const resolve = (ms: DisplayMember[]) => {
  const map = resolveDisplayNames(ms)
  return Object.fromEntries(ms.map((m) => [m.id, map.get(m.id)]))
}

describe('resolveDisplayNames', () => {
  it('충돌이 없으면 예금주명 우선으로 기존과 동일하게 해석한다', () => {
    expect(
      resolve([
        { id: 'a', name: '나', accountHolder: '나희진', bankName: '카카오뱅크' },
        { id: 'b', name: '철수' },
        { id: 'c', name: '영희', accountHolder: null },
      ]),
    ).toEqual({ a: '나희진', b: '철수', c: '영희' })
  })

  it('예금주명 == 다른 멤버 멤버명 충돌: 계좌 주인은 은행으로 구분(자기송금 오해 제거)', () => {
    // 계좌주(멤버명 '나', 예금주 '나희진') + 참여자 '나희진' → 둘 다 '나희진'으로 보이던 버그
    expect(
      resolve([
        { id: 'a', name: '나', accountHolder: '나희진', bankName: '카카오뱅크' },
        { id: 'b', name: '나희진' },
      ]),
    ).toEqual({ a: '나희진 (카카오뱅크)', b: '나희진' })
  })

  it('계좌주의 멤버명·예금주명이 모두 같고 참여자도 동명이면 계좌주는 은행으로 구분', () => {
    // '내 이름' 기본값이 닉네임(나희진)이라 멤버명=예금주명인 흔한 케이스
    expect(
      resolve([
        { id: 'a', name: '나희진', accountHolder: '나희진', bankName: '토스뱅크' },
        { id: 'b', name: '나희진' },
      ]),
    ).toEqual({ a: '나희진 (토스뱅크)', b: '나희진' })
  })

  it('계좌 없는 두 멤버가 진짜 동명이면 순번으로 유일화한다', () => {
    expect(
      resolve([
        { id: 'a', name: '민수' },
        { id: 'b', name: '민수' },
        { id: 'c', name: '지연' },
      ]),
    ).toEqual({ a: '민수 (1)', b: '민수 (2)', c: '지연' })
  })

  it('예금주명이 멤버명을 덮어 충돌하고 은행이 없으면 멤버명으로 구분', () => {
    expect(
      resolve([
        { id: 'a', name: '대표', accountHolder: '김사장' },
        { id: 'b', name: '김사장' },
      ]),
    ).toEqual({ a: '김사장 (대표)', b: '김사장' })
  })

  it('계좌주만 구분되면 동명이던 다른 멤버엔 순번을 붙이지 않는다', () => {
    // 계좌주 relabel 후 나머지는 유일해지므로 깔끔하게 유지
    const out = resolve([
      { id: 'a', name: '나', accountHolder: '나희진', bankName: '국민' },
      { id: 'b', name: '나희진' },
      { id: 'c', name: '철수' },
    ])
    expect(out).toEqual({ a: '나희진 (국민)', b: '나희진', c: '철수' })
  })

  it('이름·예금주 모두 비어 있으면 물음표로 폴백', () => {
    expect(resolve([{ id: 'a', name: '', accountHolder: null }])).toEqual({ a: '?' })
  })

  it('공백만 있는 예금주명은 멤버명으로 폴백한다', () => {
    expect(resolve([{ id: 'a', name: '철수', accountHolder: '   ' }])).toEqual({ a: '철수' })
  })
})
