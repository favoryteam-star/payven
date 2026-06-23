import { getAuthUser, resolveDisplayName } from '@/server/auth'
import { SettleForm } from '@/components/SettleForm'

// 홈 = 정산 만들기. 폼 본문은 components/SettleForm(수정 화면 /g/[slug]/edit와 공유).
// 로그인 여부('모임으로 저장' 노출) + 표시 이름('내 이름' 기본값)을 서버에서 읽어 넘긴다.
export default async function Home() {
  const user = await getAuthUser()
  return <SettleForm isLoggedIn={!!user} myName={resolveDisplayName(user) ?? undefined} />
}
