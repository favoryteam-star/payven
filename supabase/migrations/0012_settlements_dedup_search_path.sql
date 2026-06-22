-- 0012: 출시 전 보안 감사 후속(2026-06-22)
-- ⓐ settlements 중복기록(TOCTOU 경쟁) 방지 + ⓑ RPC search_path 고정.

-- ⓐ 무로그인 '보냈어요' 동시클릭/더블탭 시 같은 송금이 2번 insert되어 net이 꼬이던 경쟁 차단.
-- 이 앱은 minimizeCashFlow가 pair당 송금 1건이라 동일 (group,from,to,amount)=항상 중복(정상 송금 안 막음).
-- recordSettlement가 유니크 위반(23505)을 '이미 정산됐어요'로 친절 처리.
-- 기존 중복(과거 경쟁 잔재)이 있으면 가장 이른 1건만 남기고 정리한 뒤 유니크 인덱스 생성(자체완결).
delete from public.settlements s
using public.settlements s2
where s.group_id = s2.group_id
  and s.from_member = s2.from_member
  and s.to_member = s2.to_member
  and s.amount = s2.amount
  and (s.settled_at > s2.settled_at or (s.settled_at = s2.settled_at and s.id > s2.id));

create unique index if not exists settlements_dedup_uniq
  on public.settlements (group_id, from_member, to_member, amount);

-- ⓑ SECURITY INVOKER 함수 6개 search_path 고정(방어심화 — search_path 하이재킹 차단,
-- Supabase advisor function_search_path_mutable 6건 해소). ALTER는 함수 본문·EXECUTE 권한을 보존한다.
alter function public.create_quick_settle(p_slug text, p_name text, p_member_names text[], p_amount bigint, p_paid_by_index integer, p_shares bigint[], p_description text, p_owner_id uuid, p_acct_bank text, p_acct_no text, p_acct_holder text) set search_path = pg_catalog, public;
alter function public.add_itemized_bill(p_slug text, p_name text, p_member_names text[], p_items jsonb, p_owner_id uuid, p_acct_bank text, p_acct_no text, p_acct_holder text) set search_path = pg_catalog, public;
alter function public.update_quick_settle(p_slug text, p_owner_id uuid, p_name text, p_member_names text[], p_amount bigint, p_paid_by_index integer, p_shares bigint[], p_description text, p_acct_bank text, p_acct_no text, p_acct_holder text) set search_path = pg_catalog, public;
alter function public.update_itemized_bill(p_slug text, p_owner_id uuid, p_name text, p_member_names text[], p_items jsonb, p_acct_bank text, p_acct_no text, p_acct_holder text) set search_path = pg_catalog, public;
alter function public.set_default_account(p_user uuid, p_id uuid) set search_path = pg_catalog, public;
alter function public.delete_account(p_user uuid, p_id uuid) set search_path = pg_catalog, public;
