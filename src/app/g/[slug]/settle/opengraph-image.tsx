import { ImageResponse } from 'next/og'
import { formatWon } from '@/domain/money'
import { getGroupBySlug } from '@/server/queries'
import { resolveDisplayNames } from '@/lib/displayNames'

// 정산 링크를 카톡·SNS에 붙이면 자동으로 뜨는 동적 카드(공유 훅, 성장 루프 ②).
// 링크만 봐도 "오 이거 뭐야" 나오게 — 총액·인원·결제자를 브랜드 카드로 렌더.
// runtime=nodejs: getGroupBySlug(service_role DB)·env 필요. 한글은 Pretendard OTF로(없으면 두부).
export const runtime = 'nodejs'
export const alt = '페이븐 정산'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Pretendard OTF를 모듈 스코프에 1회 fetch 캐시(콜드스타트당 1번). Satori는 OTF/TTF 지원(woff2 X).
let fontCache: ArrayBuffer | null = null
async function pretendard(): Promise<ArrayBuffer> {
  if (fontCache) return fontCache
  const res = await fetch(
    'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/Pretendard-Bold.otf',
  )
  fontCache = await res.arrayBuffer()
  return fontCache
}

type Params = { params: Promise<{ slug: string }> }

export default async function Image({ params }: Params) {
  const { slug } = await params
  const [snap, font] = await Promise.all([getGroupBySlug(slug), pretendard()])

  // 데이터 없으면(없는 슬러그) 브랜드 폴백 카드.
  const isDefault = !snap || ['빠른정산', '항목별 정산'].includes(snap.group.name)
  const name = snap && !isDefault ? snap.group.name : ''
  const total = snap ? snap.expenses.reduce((s, e) => s + e.amount, 0) : 0
  const memberCount = snap ? snap.members.length : 0
  // 항목별이면 1/N 카드와 구별되게 메뉴 수·'사람마다 다르게' 신호를 노출(추가 쿼리 0, snap에 이미 있음).
  const isItemized = !!snap?.isItemized
  const menuCount = snap ? snap.rounds.reduce((s, r) => s + r.items.length, 0) : 0
  let payerText = ''
  if (snap) {
    const names = resolveDisplayNames(snap.members)
    const payerIds = [...new Set(snap.expenses.map((e) => e.paidBy))]
    payerText =
      payerIds.length === 1
        ? `${names.get(payerIds[0]) ?? ''}님이 결제`
        : payerIds.length > 1
          ? '여러 명이 결제'
          : ''
  }
  const subLine = isItemized
    ? [memberCount ? `${memberCount}명` : '', menuCount ? `메뉴 ${menuCount}개` : '', '사람마다 다르게'].filter(Boolean).join(' · ')
    : [memberCount ? `${memberCount}명` : '', payerText].filter(Boolean).join(' · ')

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '76px 80px',
          background: 'linear-gradient(135deg, #0FA177 0%, #0a7d5c 100%)',
          color: 'white',
          fontFamily: 'Pretendard',
        }}
      >
        {/* 워드마크 = 이븐바(=) + 페이븐 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 44 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ width: 48, height: 8, background: 'white', borderRadius: 4 }} />
            <div style={{ width: 48, height: 8, background: 'white', borderRadius: 4 }} />
          </div>
          <div style={{ display: 'flex' }}>페이븐</div>
        </div>

        {/* 핵심 = 총액 (Wrapped식 큰 숫자) */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {name ? (
            <div style={{ display: 'flex', fontSize: 52, opacity: 0.92, marginBottom: 10 }}>{name}</div>
          ) : null}
          <div style={{ display: 'flex', fontSize: 140, lineHeight: 1.02 }}>{`총 ${formatWon(total)}`}</div>
          {subLine ? (
            <div style={{ display: 'flex', fontSize: 44, opacity: 0.9, marginTop: 18 }}>{subLine}</div>
          ) : null}
        </div>

        {/* 푸터 = 호기심 유발 + 무가입 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 36 }}>
          <div style={{ display: 'flex', opacity: 0.95 }}>
            {isItemized ? '내 메뉴만큼만 보낼지 링크에서 확인 →' : '각자 얼마 보낼지 링크에서 확인 →'}
          </div>
          <div style={{ display: 'flex', opacity: 0.8 }}>무가입 · payven.kr</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Pretendard', data: font, weight: 400, style: 'normal' }] },
  )
}
