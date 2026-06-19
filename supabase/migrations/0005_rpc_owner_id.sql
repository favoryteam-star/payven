-- 0005: 두 생성 RPC가 owner_id(로그인 사용자)를 받아 groups에 기록. 만들기=로그인 게이트(M4).
-- 기존 시그니처 드롭 후 재생성(p_owner_id 추가, default null). 무로그인 호출은 없어짐(액션이 세션 검증).

drop function if exists create_quick_settle(text, text, text[], bigint, int, bigint[], text);
create or replace function create_quick_settle(
  p_slug text,
  p_name text,
  p_member_names text[],
  p_amount bigint,
  p_paid_by_index int,
  p_shares bigint[],
  p_description text,
  p_owner_id uuid default null
) returns text
language plpgsql
security invoker
as $$
declare
  v_group_id uuid;
  v_member_ids uuid[] := array[]::uuid[];
  v_id uuid;
  v_expense_id uuid;
  v_count int := array_length(p_member_names, 1);
  i int;
begin
  if v_count is null or v_count < 2 then
    raise exception '참여자는 최소 2명이어야 합니다';
  end if;
  if array_length(p_shares, 1) <> v_count then
    raise exception '분담 개수가 참여자 수와 다릅니다';
  end if;
  if p_paid_by_index < 0 or p_paid_by_index >= v_count then
    raise exception '낸 사람 인덱스가 범위를 벗어났습니다';
  end if;

  insert into groups (slug, name, kind, owner_id) values (p_slug, p_name, 'quick', p_owner_id)
    returning id into v_group_id;

  for i in 1..v_count loop
    insert into members (group_id, name) values (v_group_id, p_member_names[i])
      returning id into v_id;
    v_member_ids := array_append(v_member_ids, v_id);
  end loop;

  insert into expenses (group_id, description, amount, paid_by, split_type)
    values (v_group_id, coalesce(nullif(p_description, ''), '정산'), p_amount,
            v_member_ids[p_paid_by_index + 1], 'equal')
    returning id into v_expense_id;

  for i in 1..v_count loop
    insert into expense_shares (expense_id, member_id, amount)
      values (v_expense_id, v_member_ids[i], p_shares[i]);
  end loop;

  return p_slug;
end;
$$;
revoke execute on function create_quick_settle(text, text, text[], bigint, int, bigint[], text, uuid) from public, anon, authenticated;
grant execute on function create_quick_settle(text, text, text[], bigint, int, bigint[], text, uuid) to service_role;

drop function if exists add_itemized_bill(text, text, text[], jsonb);
create or replace function add_itemized_bill(
  p_slug text,
  p_name text,
  p_member_names text[],
  p_items jsonb,
  p_owner_id uuid default null
) returns text
language plpgsql
security invoker
as $$
declare
  v_group_id uuid;
  v_member_ids uuid[] := array[]::uuid[];
  v_id uuid;
  v_bill_id uuid := gen_random_uuid();
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
    v_amount := (v_item->>'amount')::bigint;
    v_paid_idx := (v_item->>'paid_by_index')::int;
    if v_paid_idx < 0 or v_paid_idx >= v_count then
      raise exception '낸 사람 인덱스가 범위를 벗어났습니다';
    end if;
    if coalesce(jsonb_array_length(v_item->'shares'), -1) <> v_count then
      raise exception '분담 개수가 참여자 수와 다릅니다';
    end if;

    insert into expenses (group_id, description, amount, paid_by, split_type, bill_id)
      values (v_group_id,
              coalesce(nullif(v_item->>'description', ''), '항목'),
              v_amount,
              v_member_ids[v_paid_idx + 1],
              'weighted',
              v_bill_id)
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

  return p_slug;
end;
$$;
revoke execute on function add_itemized_bill(text, text, text[], jsonb, uuid) from public, anon, authenticated;
grant execute on function add_itemized_bill(text, text, text[], jsonb, uuid) to service_role;
