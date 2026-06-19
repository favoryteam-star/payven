-- 0004: 그룹 소유자(로그인 사용자). M4 인증.
-- 정책: 만들기(정산하기)=로그인 게이트 → owner_id 부여 / 보기(공유 링크)=무로그인 유지.
-- 무로그인·기존 생성분은 owner_id null. 쓰기는 여전히 service_role 경유(Server Action이 세션 검증) → RLS deny-all 그대로.
-- 사용자 계정 삭제 시 정산 데이터는 남기고 소유만 해제(set null).
alter table groups add column if not exists owner_id uuid references auth.users(id) on delete set null;
create index if not exists idx_groups_owner on groups(owner_id);
