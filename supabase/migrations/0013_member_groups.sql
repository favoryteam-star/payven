-- 0013: 저장 멤버 그룹("내 모임") — 자주 함께 정산하는 사람 묶음을 로그인 사용자에 저장.
-- 만들기 폼에서 탭 한 번에 전원 추가 + 마이에서 관리(이름 변경·삭제). 최근목록(listRecentMemberNames)과 보완:
-- 최근목록은 자동·휘발(딴 정산 하면 밀림), 모임은 사용자가 고른 고정 묶음.
-- 멤버는 이름 문자열일 뿐(전역 인물 엔티티 없음)이라 text[]로 저장 — 최근목록 방식과 일관, 조인 불필요.
-- RLS deny-all + REVOKE(런타임 백스톱, CLAUDE.md 하드룰 5). 앱은 service_role로만 접근(db.ts), 전부 user_id 스코프.

create table if not exists member_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,                      -- 표시용 이름(예: '회사 점심팟')
  names text[] not null default '{}',       -- 멤버 이름들('나' 제외 — 자기 자신은 만들 때 자동)
  created_at timestamptz not null default now()
);

create index if not exists idx_member_groups_user on member_groups(user_id, created_at);

-- RLS deny-all 백스톱 + 공개 롤 권한 회수 + service_role DML 부여.
alter table member_groups enable row level security;
revoke all on member_groups from anon, authenticated;
grant select, insert, update, delete on member_groups to service_role;
