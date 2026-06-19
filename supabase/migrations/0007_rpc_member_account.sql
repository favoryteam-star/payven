-- 0007: 두 생성 RPC가 '받는 사람(=나) 계좌'를 받아 멤버에 저장.
-- 계좌는 항상 멤버 인덱스 0(만들기 폼의 '나' 슬롯=로그인 생성자)에 붙인다 — '내 계좌만'(M4 결정).
--   이유: 내가 낸 사람=받는 사람일 때만 정산 결과의 to에 내가 등장 → 계좌가 노출됨.
--   친구가 낸 사람이면 나(0)는 채무자라 to에 안 떠서 내 계좌가 노출되지 않음(오노출 방지).
-- 기존 시그니처 드롭 후 재생성(계좌 파라미터 추가, 전부 default null → 구버전 호출도 호환).

drop function if exists create_quick_settle(text, text, text[], bigint, int, bigint[], text, uuid);
create or replace function create_quick_settle(
  p_slug text,
  p_name text,
  p_member_names text[],
  p_amount bigint,
  p_paid_by_index int,
  p_shares bigint[],
  p_description text,
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

  -- 받는 사람(=나, 멤버 0) 계좌 저장(있으면)
  if p_acct_bank is not null then
    update members
      set bank_name = p_acct_bank, account_no = p_acct_no, account_holder = p_acct_holder
      where id = v_member_ids[1];
  end if;

  return p_slug;
end;
$$;
revoke execute on function create_quick_settle(text, text, text[], bigint, int, bigint[], text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function create_quick_settle(text, text, text[], bigint, int, bigint[], text, uuid, text, text, text) to service_role;

drop function if exists add_itemized_bill(text, text, text[], jsonb, uuid);
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

  -- 받는 사람(=나, 멤버 0) 계좌 저장(있으면)
  if p_acct_bank is not null then
    update members
      set bank_name = p_acct_bank, account_no = p_acct_no, account_holder = p_acct_holder
      where id = v_member_ids[1];
  end if;

  return p_slug;
end;
$$;
revoke execute on function add_itemized_bill(text, text, text[], jsonb, uuid, text, text, text) from public, anon, authenticated;
grant execute on function add_itemized_bill(text, text, text[], jsonb, uuid, text, text, text) to service_role;
