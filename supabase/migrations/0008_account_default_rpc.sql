-- 0008: 저장 계좌 '기본 1개' 불변식을 원자적으로 유지(동시 요청에도 '기본 0개' 창/유니크 충돌 없음).
-- 기존엔 OFF/ON을 별도 supabase-js 호출(각각 autocommit)로 처리해 그 사이 제로-기본 창이 있었음(리뷰 지적).
-- 두 함수 모두 한 트랜잭션에서 OFF→ON(또는 delete→promote)을 끝내므로 외부 읽기는 before/after만 본다.
-- SECURITY INVOKER: 호출자(service_role) 권한. p_user로 스코프 → 남의 계좌 못 건드림.

-- 기본 계좌를 p_id 하나로 전환. 대상이 본인 소유로 존재할 때만(없으면 기존 기본 유지 → 제로-기본 방지).
create or replace function set_default_account(p_user uuid, p_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  if not exists (select 1 from user_accounts where id = p_id and user_id = p_user) then
    return;
  end if;
  update user_accounts set is_default = false
    where user_id = p_user and is_default = true and id <> p_id;
  update user_accounts set is_default = true
    where user_id = p_user and id = p_id;
end;
$$;
revoke execute on function set_default_account(uuid, uuid) from public, anon, authenticated;
grant execute on function set_default_account(uuid, uuid) to service_role;

-- 계좌 삭제 + (기본을 지웠으면) 가장 오래된 남은 계좌를 기본으로 승격 — 한 트랜잭션.
create or replace function delete_account(p_user uuid, p_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_was_default boolean;
  v_promote uuid;
begin
  select is_default into v_was_default from user_accounts where id = p_id and user_id = p_user;
  if v_was_default is null then
    return; -- 없음 또는 본인 것 아님
  end if;
  delete from user_accounts where id = p_id and user_id = p_user;
  if v_was_default then
    select id into v_promote from user_accounts
      where user_id = p_user order by created_at asc, id asc limit 1;
    if v_promote is not null then
      update user_accounts set is_default = true where id = v_promote;
    end if;
  end if;
end;
$$;
revoke execute on function delete_account(uuid, uuid) from public, anon, authenticated;
grant execute on function delete_account(uuid, uuid) to service_role;
