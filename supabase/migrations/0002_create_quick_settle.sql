-- 빠른정산 원자적 생성 RPC. group(kind=quick) + members + expense + shares 한 트랜잭션.
-- 분담(shares)은 도메인(equalSplit, TS)에서 계산해 넘긴다(반올림 단일 출처).
-- SECURITY INVOKER: 호출자(service_role) 권한으로 실행 → anon은 grant 없어 실패.

create or replace function create_quick_settle(
  p_slug text,
  p_name text,
  p_member_names text[],
  p_amount bigint,
  p_paid_by_index int,
  p_shares bigint[],
  p_description text
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

  insert into groups (slug, name, kind) values (p_slug, p_name, 'quick')
    returning id into v_group_id;

  -- 배열 첨자 INTO는 plpgsql에서 불가 → 스칼라 + array_append로 순서 보존
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

revoke execute on function create_quick_settle(text, text, text[], bigint, int, bigint[], text)
  from public, anon, authenticated;
grant execute on function create_quick_settle(text, text, text[], bigint, int, bigint[], text)
  to service_role;
