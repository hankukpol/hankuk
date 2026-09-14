-- Operator-run only, AFTER migration 20260914190000_perfect_attendance_week_month.
-- This script is not a deployment migration and has not been run in production.
BEGIN;
DO $revision$
DECLARE
  target_division text;
  current_policy jsonb;
  partial_id text;
  full_day_id text;
  matches integer;
BEGIN
  SELECT d.id, s.management_policy INTO STRICT target_division, current_policy
  FROM study_hall.divisions d JOIN study_hall.division_settings s ON s.division_id = d.id
  WHERE d.slug = 'police'
  FOR UPDATE OF s;

  IF current_policy->>'version' NOT LIKE 'RESTART%'
     OR COALESCE((current_policy->>'separateMeritDemerit')::boolean, false) <> true
     OR COALESCE((current_policy->>'managerConfirmsAttendance')::boolean, false) <> true THEN
    RAISE EXCEPTION 'Expected RESTART policy with separate merit/demerit and manager confirmation';
  END IF;
  full_day_id := current_policy->>'fullDayAbsenceRuleId';
  IF NOT EXISTS (SELECT 1 FROM study_hall.point_rules WHERE id = full_day_id AND division_id = target_division
    AND name = '관리일 전체 무단결석' AND points IN (-5, -9) AND is_active) THEN
    RAISE EXCEPTION 'Full-day absence rule differs from the reviewed policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM study_hall.point_rules WHERE id = current_policy->>'tardyRuleId' AND division_id = target_division
    AND name = '시간통제 교시 시작 후 도착' AND points = -2 AND is_active) THEN
    RAISE EXCEPTION 'Tardy rule differs from the reviewed policy';
  END IF;
  SELECT count(*), min(id) INTO matches, partial_id FROM study_hall.point_rules
  WHERE division_id = target_division AND name = '시간통제 교시 결석';
  IF matches > 1 THEN RAISE EXCEPTION 'Duplicate partial absence rules require operator review'; END IF;
  IF current_policy->>'partialAbsenceRuleId' IS NOT NULL
     AND current_policy->>'partialAbsenceRuleId' IS DISTINCT FROM partial_id THEN
    RAISE EXCEPTION 'An unexpected partial absence rule is already connected';
  END IF;
  IF partial_id IS NULL THEN
    partial_id := 'restart-v31-police-partial-absence';
    INSERT INTO study_hall.point_rules (id, division_id, category, name, points, description, is_active, display_order)
    VALUES (partial_id, target_division, '출결', '시간통제 교시 결석', -2,
      '의무 시간통제 교시 무단결석. 관리일 전체 무단결석과 중복 금지.', true, 19);
  ELSE
    UPDATE study_hall.point_rules SET category = '출결', points = -2, is_active = true
    WHERE id = partial_id AND division_id = target_division;
  END IF;
  UPDATE study_hall.point_rules SET points = -9 WHERE id = full_day_id AND division_id = target_division;
  current_policy := jsonb_set(current_policy, '{partialAbsenceRuleId}', to_jsonb(partial_id));

  -- Preserve every other guidance entry and every unrelated policy setting.
  IF jsonb_typeof(current_policy->'guidance') = 'array' THEN
    current_policy := jsonb_set(current_policy, '{guidance}', COALESCE((
      SELECT jsonb_agg(CASE WHEN item->>'title' = '월별 상·벌점' THEN jsonb_set(item, '{text}',
        to_jsonb('주간 개근 +2점, 월 전체 개근 +2점이며 일일 개근은 사용하지 않습니다. 의무 통제 교시의 출석·수업만 인정하고 아침모의고사는 제외합니다. 기록일은 마지막 관리일이며 출석 정정으로 개근이 깨지면 회수합니다. 상점과 벌점은 별도 집계하며 상계하지 않습니다. 매월 말 집계가 종료되고 다음 달 새로 집계합니다. 원기록·개선미션·최종경고·즉시 퇴실심의 이력은 삭제하지 않습니다. 월 상점 상위 3명 보상은 별도 공지, 동점은 순공시간 → 아침모의고사 응시율 → 모의고사 성적 순으로 정합니다.'::text)) ELSE item END ORDER BY ordinal)
      FROM jsonb_array_elements(current_policy->'guidance') WITH ORDINALITY AS entries(item, ordinal)
    ), '[]'::jsonb));
  END IF;
  UPDATE study_hall.division_settings SET management_policy = current_policy,
    perfect_attendance_weekly_pts = 2, perfect_attendance_monthly_pts = 2,
    perfect_attendance_pts_enabled = false, perfect_attendance_pts = 0, updated_at = CURRENT_TIMESTAMP
  WHERE division_id = target_division;
END $revision$;
COMMIT;

-- Review only configured fields; student records and existing points are untouched.
SELECT d.slug, s.management_policy->>'partialAbsenceRuleId' AS partial_rule,
  s.perfect_attendance_weekly_pts, s.perfect_attendance_monthly_pts, s.perfect_attendance_pts_enabled,
  r.name, r.points
FROM study_hall.divisions d JOIN study_hall.division_settings s ON s.division_id = d.id
JOIN study_hall.point_rules r ON r.division_id = d.id
  AND r.id IN (s.management_policy->>'partialAbsenceRuleId', s.management_policy->>'tardyRuleId', s.management_policy->>'fullDayAbsenceRuleId')
WHERE d.slug = 'police' ORDER BY r.name;
