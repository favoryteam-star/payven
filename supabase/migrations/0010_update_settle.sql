-- 0010: 정산 '수정'(교체) RPC. 내역에서 내가 만든 정산을 고치게 한다.
-- 수정 = 한 트랜잭션에서 그 그룹의 자식(settlements/expense_shares/expenses/members)을 전부 지우고
--   새 입력으로 다시 채운다(group 행·slug·owner_id는 보존). 멤버 FK가 DEFERRABLE INITIALLY DEFERRED라
--   같은 트랜잭션 안에서 wipe→재삽입이 깨끗이 커밋된다(0001 주석, ADR-012와 같은 성질).
-- 소유자 가드: p_owner_id가 그룹 owner_id와 일치할 때만. 무로그인(owner null) 정산은 수정 불가.
-- 주의(의미): settlements(보냈어요 기록)도 wipe된다 — 금액이 바뀌면 옛 송금기록은 무의미. UI가 경고.
-- 분담(shares)은 생성과 동일하게 도메인(TS)에서 계산해 넘긴다(반올림 단일 출처).
-- SECURITY INVOKER: 호출자(service_role) 권한 → anon은 grant 없어 실패.

create or replace function update_quick_settle(
  p_slug text,
  p_owner_id uuid,
  p_name text,
  p_member_names text[],
  p_amount bigint,
  p_paid_by_index int,
  p_shares bigint[],
  p_description text,
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

  -- 그룹 조회 + 소유자 가드(없거나 남의 것이면 거부)
  select id, owner_id into v_group_id, v_owner from groups where slug = p_slug;
  if v_group_id is null then
    raise exception '정산을 찾을 수 없습니다';
  end if;
  if p_owner_id is null or v_owner is distinct from p_owner_id then
    raise exception '권한이 없습니다';
  end if;

  -- 자식 wipe(child→parent). 멤버 참조 FK는 deferred라 한 트랜잭션 안에서 안전.
  delete from settlements where group_id = v_group_id;
  delete from expense_shares where expense_id in (select id from expenses where group_id = v_group_id);
  delete from expenses where group_id = v_group_id;
  delete from members where group_id = v_group_id;

  update groups set name = p_name where id = v_group_id;

  -- 멤버 재삽입(순서 보존 — 첨자 INTO 불가라 스칼라 + array_append)
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

  -- 받는 사람(=나, 멤버 0) 계좌 재부착(있으면)
  if p_acct_bank is not null then
    update members
      set bank_name = p_acct_bank, account_no = p_acct_no, account_holder = p_acct_holder
      where id = v_member_ids[1];
  end if;

  return p_slug;
end;
$$;
revoke execute on function update_quick_settle(text, uuid, text, text[], bigint, int, bigint[], text, text, text, text) from public, anon, authenticated;
grant execute on function update_quick_settle(text, uuid, text, text[], bigint, int, bigint[], text, text, text, text) to service_role;

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

  -- 그룹 조회 + 소유자 가드
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

  if p_acct_bank is not null then
    update members
      set bank_name = p_acct_bank, account_no = p_acct_no, account_holder = p_acct_holder
      where id = v_member_ids[1];
  end if;

  return p_slug;
end;
$$;
revoke execute on function update_itemized_bill(text, uuid, text, text[], jsonb, text, text, text) from public, anon, authenticated;
grant execute on function update_itemized_bill(text, uuid, text, text[], jsonb, text, text, text) to service_role;
