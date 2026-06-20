import { redirect } from 'next/navigation'

// 항목별은 이제 홈(/)의 토글로 통합됨. 옛 북마크/링크는 홈으로 보냄.
export default function ItemsRedirect() {
  redirect('/')
}
