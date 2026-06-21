-- 0009: 정산 날짜(사용자가 고르는 '쓴 날', 기본 오늘). created_at(레코드 생성 시각)과 분리.
-- nullable — 기존 행은 null(정산결과에서 created_at으로 폴백). 표시용(날짜만)이라 date 타입.
-- 테이블 레벨 grant라 새 컬럼 자동 포함(재grant 불필요), RLS는 테이블 단위라 영향 없음.
alter table groups add column if not exists event_date date;
