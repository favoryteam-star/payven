-- 0015: 단위 맞춤 '남은 금액'(흡수자) 표시용 메타. 공유 페이지 상세에 "한 명이 남은 N원을 더 냈어요" 안내.
-- 분담 금액 자체는 그대로(이미 흡수자에게 반영돼 저장됨) — 이건 '폼에서 본 남은 N원 + 누가'를 표시하기 위한 메타.
-- RPC는 안 건드림: 생성/수정 후 서버가 setGroupMeta(=setEventDate 패턴)로 best-effort UPDATE.
-- 기본 0/null → 기존 데이터·동작 영향 0(옛 정산은 안내 안 뜸).

alter table groups add column if not exists leftover_amount bigint not null default 0;
alter table groups add column if not exists absorber_index int; -- null = 흡수자 없음(딱 떨어지거나 쏘기)

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'groups_leftover_nonneg') then
    alter table groups add constraint groups_leftover_nonneg check (leftover_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'groups_absorber_idx_nonneg') then
    alter table groups add constraint groups_absorber_idx_nonneg check (absorber_index is null or absorber_index >= 0);
  end if;
end $$;
