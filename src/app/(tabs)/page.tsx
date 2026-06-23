import { getAuthUser } from '@/server/auth'
import { SettleForm } from '@/components/SettleForm'

// 홈 = 정산 만들기. 폼 본문은 components/SettleForm(수정 화면 /g/[slug]/edit와 공유).
// 로그인 여부만 읽어 '모임으로 저장' 노출 결정에 넘긴다(모임=로그인 기능).
export default async function Home() {
  const user = await getAuthUser()
  return <SettleForm isLoggedIn={!!user} />
}
