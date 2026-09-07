-- 한 강좌 안에서 수강중인 연락처는 하나뿐이어야 한다.
--
-- 배경: 수령현황에서 자료를 건네줄 때 이름 아래 연락처로 사람을 가른다.
-- 이름은 동명이인이 있을 수 있으니 그대로 두고, 연락처만 유일하게 잡는다.
--
-- status='active'로 한정한 이유: 환불하거나 수강종료한 사람의 번호까지 잠그면
-- 본인이 같은 강좌에 다시 등록할 수 없다. 재등록은 기존 행을 active로 되살리는데,
-- 그 시점에 다른 사람이 그 번호로 수강중이 아니라면 이 인덱스를 통과한다.
--
-- 기존 unique(course_id, name, phone)는 그대로 둔다. 그쪽은 같은 사람의 중복 행을 막고,
-- 이쪽은 다른 사람이 같은 번호를 쓰는 것을 막는다.
--
-- 적용 시점 기준으로 운영·로컬 모두 위반 데이터가 0건임을 확인했다.

create unique index if not exists enrollments_course_active_phone_key
  on class_pass.enrollments (course_id, phone)
  where status = 'active' and phone is not null and phone <> '';
