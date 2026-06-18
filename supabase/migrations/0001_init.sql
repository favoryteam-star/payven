-- 페이븐 초기 스키마 (V0+V1 커버, 스키마 변경 없이 V1까지)
-- Supabase SQL Editor 또는 supabase CLI로 적용. 이 파일이 통합 정본 스키마(원격은 MCP로 증분 적용됨).
-- 금액은 전부 정수 '원'(bigint). 부동소수점 금지.
-- 멤버 참조 FK는 DEFERRABLE INITIALLY DEFERRED — 그룹 cascade 삭제가 한 트랜잭션에서 깨끗이 완료되게
-- 하면서, 활성 멤버 개별 삭제 백스톱은 커밋 시점에 유지(§DECISIONS ADR-012).

-- ── 그룹: 공유의 단위. slug가 사실상의 접근 키 ──────────────────
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                       -- nanoid 21자, URL 노출
  name text not null,
  kind text not null default 'group'               -- 'group'(지속) | 'quick'(빠른정산 임시)
       check (kind in ('group', 'quick')),
  base_currency text not null default 'KRW',       -- V2 다중통화 대비 컬럼만
  created_at timestamptz not null default now()
);

-- ── 멤버: 회원이 아니라 '그룹 안의 이름'. 로그인 없음 ─────────────
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  bank_name text,                                  -- 토스 딥링크용 한글 짧은 은행명 (예: 국민, 신한, 카카오뱅크)
  account_no text,                                 -- 계좌번호 숫자만(하이픈 제거) — 복사/딥링크 공용
  account_label text,                              -- 표시용 원문(선택)
  created_at timestamptz not null default now()
);

-- ── 지출: 누가 얼마 냈는지 ──────────────────────────────────────
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  description text not null,
  amount bigint not null,                          -- 정수(원)
  paid_by uuid not null references members(id) deferrable initially deferred,
  currency text not null default 'KRW',
  split_type text not null default 'equal'
       check (split_type in ('equal', 'custom')),  -- custom은 V1
  created_at timestamptz not null default now()
);

-- ── 분담: 참여자별 부담 금액 ────────────────────────────────────
create table if not exists expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  member_id uuid not null references members(id) deferrable initially deferred,
  amount bigint not null                           -- 이 멤버가 이 지출에서 부담할 정수 금액
);

-- ── 정산 기록: 수동 '송금 완료' ─────────────────────────────────
create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  from_member uuid not null references members(id) deferrable initially deferred,
  to_member uuid not null references members(id) deferrable initially deferred,
  amount bigint not null,
  settled_at timestamptz not null default now()
);

-- ── 인덱스 ──────────────────────────────────────────────────────
create index if not exists idx_members_group on members(group_id);
create index if not exists idx_expenses_group on expenses(group_id);
create index if not exists idx_expense_shares_expense on expense_shares(expense_id);
create index if not exists idx_settlements_group on settlements(group_id);
-- 임시그룹 cleanup용
create index if not exists idx_groups_kind_created on groups(kind, created_at);

-- ── RLS deny-all 백스톱 ─────────────────────────────────────────
-- service_role(서버)은 RLS를 우회하므로 앱은 정상 동작.
-- 정책을 0개로 두면 anon/authenticated는 전부 deny → 키가 새도 PostgREST 직접 접근 0.
alter table groups         enable row level security;
alter table members        enable row level security;
alter table expenses       enable row level security;
alter table expense_shares enable row level security;
alter table settlements    enable row level security;

-- 벨트+멜빵: 공개 롤의 테이블 권한도 회수
revoke all on groups, members, expenses, expense_shares, settlements
  from anon, authenticated;

-- 앱(서버)은 service_role 키로 접근한다. RLS 우회 ≠ 테이블 권한이므로 service_role에 DML 부여.
-- ('Automatically expose new tables'를 끄면 이 grant가 자동으로 안 생기므로 명시 필요.)
grant select, insert, update, delete on
  groups, members, expenses, expense_shares, settlements
  to service_role;

-- 프로젝트 생성 시 'Enable automatic RLS'를 켰다면 만들어지는 SECURITY DEFINER 함수가
-- anon/authenticated에게 /rest/v1/rpc/로 공개 노출된다 → 공개 EXECUTE 회수. (함수 없으면 무시)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
