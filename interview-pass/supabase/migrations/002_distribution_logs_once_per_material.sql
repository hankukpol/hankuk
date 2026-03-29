ALTER TABLE distribution_logs
  DROP CONSTRAINT IF EXISTS distribution_logs_once_per_day;

ALTER TABLE distribution_logs
  DROP CONSTRAINT IF EXISTS distribution_logs_once_per_material;

WITH ranked_logs AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY student_id, material_id
      ORDER BY distributed_at ASC, id ASC
    ) AS row_num
  FROM distribution_logs
)
DELETE FROM distribution_logs
WHERE id IN (
  SELECT id
  FROM ranked_logs
  WHERE row_num > 1
);

ALTER TABLE distribution_logs
  ADD CONSTRAINT distribution_logs_once_per_material UNIQUE (student_id, material_id);

CREATE OR REPLACE FUNCTION distribute_material(
  p_student_id    UUID,
  p_material_id   INTEGER,
  p_staff_label   TEXT DEFAULT '',
  p_note          TEXT DEFAULT ''
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_already BOOLEAN;
  v_log_id  BIGINT;
  v_mat     RECORD;
  v_stu     RECORD;
BEGIN
  SELECT id, name INTO v_stu FROM students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'student_not_found');
  END IF;

  SELECT id, name, is_active INTO v_mat FROM materials WHERE id = p_material_id;
  IF NOT FOUND OR NOT v_mat.is_active THEN
    RETURN jsonb_build_object('success', false, 'reason', 'material_inactive');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM distribution_logs
    WHERE student_id = p_student_id
      AND material_id = p_material_id
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_distributed');
  END IF;

  INSERT INTO distribution_logs (student_id, material_id, distributed_by, note)
  VALUES (p_student_id, p_material_id, p_staff_label, p_note)
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'material_name', v_mat.name,
    'student_name', v_stu.name
  );
END;
$$;
