-- 0006: 저장 계좌(받는 사람 계좌) — 로그인 사용자에 묶인 재사용 계좌 + members.account_holder(예금주).
-- 택배주소처럼 마이에 여러 개 저장 + 기본 1개 → 만들기 때 자동 채움 / 보기에서 표시·복사·토스.
-- 무로그인 보기엔 영향 없음(읽기는 그대로 service_role 경유). 만들기=로그인 게이트(M4)라 user_id 항상 존재.
-- RLS deny-all + REVOKE(런타임 백스톱, CLAUDE.md 하드룰 5). 앱은 service_role로만 접근(db.ts).

create table if not exists user_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_name text not null,                  -- 한글 짧은 은행명 (banks.ts 화이트리스트, 토스 딥링크용)
  account_no text not null,                 -- 계좌번호(하이픈 허용 — 토스는 숫자만 사용, 표시·복사는 원문)
  account_holder text not null,             -- 예금주
  label text,                               -- 표시용 별칭(선택, 예: '카뱅 월급통장')
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_accounts_user on user_accounts(user_id, created_at);
-- 유저당 기본 계좌는 최대 1개(부분 유니크). 기본 전환은 '먼저 끄고 켜기' 순서로 처리(server/queries).
create unique index if not exists uq_user_accounts_one_default
  on user_accounts(user_id) where is_default;

-- RLS deny-all 백스톱 + 공개 롤 권한 회수 + service_role DML 부여.
alter table user_accounts enable row level security;
revoke all on user_accounts from anon, authenticated;
grant select, insert, update, delete on user_accounts to service_role;

-- 예금주: 받는 사람(멤버)에 저장. 기존 bank_name/account_no와 함께 표시·복사·토스에 사용.
alter table members add column if not exists account_holder text;
