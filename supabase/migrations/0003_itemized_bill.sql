-- 0003: 항목별 정산 (itemized bill)
-- 한 영수증 = expenses N행(각 항목 1행), bill_id로 묶는다. split_type에 'weighted' 추가.
-- add_itemized_bill: group(kind=quick) + members + N개 항목 + 분담을 한 트랜잭션으로 원자 생성.
-- 분담(shares)은 도메인(splitByWeights, TS)에서 계산해 멤버 정렬 정수배열로 넘긴다(반올림 단일 출처).
-- SECURITY INVOKER: 호출자(service_role) 권한 → anon은 grant 없어 실패.

alter table expenses add column if not exists bill_id uuid;
create index if not exists idx_expenses_bill on expenses(bill_id);

alter table expenses drop constraint if exists expenses_split_type_check;
alter table expenses add constraint expenses_split_type_check
  check (split_type in ('equal', 'custom', 'weighted'));

create or replace function add_itemized_bill(
  p_slug text,
  p_name text,
  p_member_names text[],
  p_items jsonb
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

  insert into groups (slug, name, kind) values (p_slug, p_name, 'quick')
    returning id into v_group_id;

  -- 배열 첨자 INTO는 plpgsql에서 불가 → 스칼라 + array_append로 멤버 순서 보존
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
    -- shares는 멤버 수만큼 정렬된 정수 배열(미참여자는 0). null/길이불일치 방어.
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

    -- 0원 분담은 행을 만들지 않는다(미참여자). 합은 항목 금액과 정확히 일치해야 한다.
    v_share_sum := 0;
    for i in 1..v_count loop
      -- 경계 방어: 원소가 숫자가 아니면(null/문자열 등) 즉시 실패 — null이 합검증을 우회하지 못하게.
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

revoke execute on function add_itemized_bill(text, text, text[], jsonb) from public, anon, authenticated;
grant execute on function add_itemized_bill(text, text, text[], jsonb) to service_role;
