-- 0014: 항목(메뉴) 라인 수량. 공유 상세 표시 + 수정 라운드트립용.
-- amount는 여전히 '라인 총액'(분담의 단일 출처). quantity는 표시/복원 메타 — 단가 = amount/quantity 파생.
-- 기본 1 → 기존 데이터·동작 영향 0. add/update RPC가 p_items의 quantity를 저장(없으면 1 폴백).

alter table expenses add column if not exists quantity int not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_quantity_pos') then
    alter table expenses add constraint expenses_quantity_pos check (quantity >= 1);
  end if;
end $$;

-- RPC 갱신(0011 바디 동일 + expenses INSERT에 quantity 추가). 시그니처 동일 → create or replace로 grant 보존.
create or replace function add_itemized_bill(
  p_slug text,
  p_name text,
  p_member_names text[],
  p_items jsonb,
  p_owner_id uuid default null,
  p_acct_bank text default null,
  p_acct_no text default null,
  p_acct_holder text default null
) returns text
language plpgsql
security invoker
as $$
declare
  v_group_id uuid;
  v_member_ids uuid[] := array[]::uuid[];
  v_id uuid;
  v_bill_ids uuid[] := array[]::uuid[];
  v_round_count int := 0;
  v_round int;
  v_count int := array_length(p_member_names, 1);
  v_item jsonb;
  v_expense_id uuid;
  v_paid_idx int;
  v_amount bigint;
  v_share bigint;
  v_share_sum bigint;
  i int;
begin
  if v_count is null or v_count < 2 then
    raise exception '참여자는 최소 2명이어야 합니다';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception '항목이 최소 1개 필요합니다';
  end if;

  insert into groups (slug, name, kind, owner_id) values (p_slug, p_name, 'quick', p_owner_id)
    returning id into v_group_id;

  for i in 1..v_count loop
    insert into members (group_id, name) values (v_group_id, p_member_names[i])
      returning id into v_id;
    v_member_ids := array_append(v_member_ids, v_id);
  end loop;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_round := coalesce((v_item->>'round')::int, 0);
    if v_round + 1 > v_round_count then v_round_count := v_round + 1; end if;
  end loop;
  for i in 1..greatest(v_round_count, 1) loop
    v_bill_ids := array_append(v_bill_ids, gen_random_uuid());
  end loop;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_round := coalesce((v_item->>'round')::int, 0);
    v_amount := (v_item->>'amount')::bigint;
    v_paid_idx := (v_item->>'paid_by_index')::int;
    if v_paid_idx < 0 or v_paid_idx >= v_count then
      raise exception '낸 사람 인덱스가 범위를 벗어났습니다';
    end if;
    if coalesce(jsonb_array_length(v_item->'shares'), -1) <> v_count then
      raise exception '분담 개수가 참여자 수와 다릅니다';
    end if;

    insert into expenses (group_id, description, amount, paid_by, split_type, bill_id, quantity)
      values (v_group_id,
              coalesce(nullif(v_item->>'description', ''), '항목'),
              v_amount,
              v_member_ids[v_paid_idx + 1],
              'weighted',
              v_bill_ids[v_round + 1],
              greatest(1, coalesce((v_item->>'quantity')::int, 1)))
      returning id into v_expense_id;

    v_share_sum := 0;
    for i in 1..v_count loop
      if jsonb_typeof(v_item->'shares'->(i - 1)) <> 'number' then
        raise exception '분담 금액이 숫자가 아닙니다';
      end if;
      v_share := (v_item->'shares'->>(i - 1))::bigint;
      v_share_sum := v_share_sum + v_share;
      if v_share > 0 then
        insert into expense_shares (expense_id, member_id, amount)
          values (v_expense_id, v_member_ids[i], v_share);
      end if;
    end loop;
    if v_share_sum <> v_amount then
      raise exception '분담 합(%)이 항목 금액(%)과 다릅니다', v_share_sum, v_amount;
    end if;
  end loop;

  if p_acct_bank is not null then
    update members
      set bank_name = p_acct_bank, account_no = p_acct_no, account_holder = p_acct_holder
      where id = v_member_ids[1];
  end if;

  return p_slug;
end;
$$;

create or replace function update_itemized_bill(
  p_slug text,
  p_owner_id uuid,
  p_name text,
  p_member_names text[],
  p_items jsonb,
  p_acct_bank text default null,
  p_acct_no text default null,
  p_acct_holder text default null
) returns text
language plpgsql
security invoker
as $$
declare
  v_group_id uuid;
  v_owner uuid;
  v_member_ids uuid[] := array[]::uuid[];
  v_id uuid;
  v_bill_ids uuid[] := array[]::uuid[];
  v_round_count int := 0;
  v_round int;
  v_count int := array_length(p_member_names, 1);
  v_item jsonb;
  v_expense_id uuid;
  v_paid_idx int;
  v_amount bigint;
  v_share bigint;
  v_share_sum bigint;
  i int;
begin
  if v_count is null or v_count < 2 then
    raise exception '참여자는 최소 2명이어야 합니다';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception '항목이 최소 1개 필요합니다';
  end if;

  select id, owner_id into v_group_id, v_owner from groups where slug = p_slug;
  if v_group_id is null then
    raise exception '정산을 찾을 수 없습니다';
  end if;
  if p_owner_id is null or v_owner is distinct from p_owner_id then
    raise exception '권한이 없습니다';
  end if;

  delete from settlements where group_id = v_group_id;
  delete from expense_shares where expense_id in (select id from expenses where group_id = v_group_id);
  delete from expenses where group_id = v_group_id;
  delete from members where group_id = v_group_id;

  update groups set name = p_name where id = v_group_id;

  for i in 1..v_count loop
    insert into members (group_id, name) values (v_group_id, p_member_names[i])
      returning id into v_id;
    v_member_ids := array_append(v_member_ids, v_id);
  end loop;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_round := coalesce((v_item->>'round')::int, 0);
    if v_round + 1 > v_round_count then v_round_count := v_round + 1; end if;
  end loop;
  for i in 1..greatest(v_round_count, 1) loop
    v_bill_ids := array_append(v_bill_ids, gen_random_uuid());
  end loop;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_round := coalesce((v_item->>'round')::int, 0);
    v_amount := (v_item->>'amount')::bigint;
    v_paid_idx := (v_item->>'paid_by_index')::int;
    if v_paid_idx < 0 or v_paid_idx >= v_count then
      raise exception '낸 사람 인덱스가 범위를 벗어났습니다';
    end if;
    if coalesce(jsonb_array_length(v_item->'shares'), -1) <> v_count then
      raise exception '분담 개수가 참여자 수와 다릅니다';
    end if;

    insert into expenses (group_id, description, amount, paid_by, split_type, bill_id, quantity)
      values (v_group_id,
              coalesce(nullif(v_item->>'description', ''), '항목'),
              v_amount,
              v_member_ids[v_paid_idx + 1],
              'weighted',
              v_bill_ids[v_round + 1],
              greatest(1, coalesce((v_item->>'quantity')::int, 1)))
      returning id into v_expense_id;

    v_share_sum := 0;
    for i in 1..v_count loop
      if jsonb_typeof(v_item->'shares'->(i - 1)) <> 'number' then
        raise exception '분담 금액이 숫자가 아닙니다';
      end if;
      v_share := (v_item->'shares'->>(i - 1))::bigint;
      v_share_sum := v_share_sum + v_share;
      if v_share > 0 then
        insert into expense_shares (expense_id, member_id, amount)
          values (v_expense_id, v_member_ids[i], v_share);
      end if;
    end loop;
    if v_share_sum <> v_amount then
      raise exception '분담 합(%)이 항목 금액(%)과 다릅니다', v_share_sum, v_amount;
    end if;
  end loop;

  if p_acct_bank is not null then
    update members
      set bank_name = p_acct_bank, account_no = p_acct_no, account_holder = p_acct_holder
      where id = v_member_ids[1];
  end if;

  return p_slug;
end;
$$;
