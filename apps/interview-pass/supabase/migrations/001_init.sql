-- ============================================================
-- 경찰 면접 모바일 수강증 — Supabase 초기 스키마
-- ============================================================

-- ── students ──────────────────────────────────────────────
CREATE TABLE students (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  exam_number TEXT,
  gender      TEXT,
  region      TEXT,
  series      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_students_name_phone ON students (name, phone);
CREATE INDEX idx_students_phone ON students (phone);
CREATE INDEX idx_students_exam_number ON students (exam_number) WHERE exam_number IS NOT NULL;

-- ── materials ─────────────────────────────────────────────
CREATE TABLE materials (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_materials_active ON materials (is_active, sort_order);

-- ── distribution_logs ────────────────────────────────────
CREATE TABLE distribution_logs (
  id              BIGSERIAL PRIMARY KEY,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  material_id     INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  distributed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  distributed_by  TEXT DEFAULT '',
  note            TEXT DEFAULT '',
  CONSTRAINT distribution_logs_once_per_material
    UNIQUE (student_id, material_id)
);

CREATE INDEX idx_distlogs_student_id     ON distribution_logs (student_id);
CREATE INDEX idx_distlogs_material_id    ON distribution_logs (material_id);
CREATE INDEX idx_distlogs_distributed_at ON distribution_logs (distributed_at DESC);

-- ── app_config ────────────────────────────────────────────
CREATE TABLE app_config (
  config_key   TEXT PRIMARY KEY,
  config_value JSONB NOT NULL,
  description  TEXT DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_config (config_key, config_value, description) VALUES
  ('staff_pin_hash',  '""', '직원 PIN bcrypt 해시'),
  ('admin_pin_hash',  '""', '관리자 PIN bcrypt 해시'),
  ('qr_secret',       '""', 'QR 토큰 HMAC 시크릿 (운영 시 환경변수로 대체)'),
  ('theme_color',     '"#1a237e"', '앱 테마 색상'),
  ('app_name',        '"경찰 면접 모바일 수강증"', '앱 이름');

-- ── popup_content ─────────────────────────────────────────
CREATE TABLE popup_content (
  popup_key  TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  is_active  BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO popup_content (popup_key, title, body, is_active) VALUES
  ('notice',        '공지사항',  '', false),
  ('refund_policy', '환불규정', '', false);

-- ── RLS 설정 ──────────────────────────────────────────────
ALTER TABLE students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials         ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE popup_content     ENABLE ROW LEVEL SECURITY;

-- 공개 읽기: 활성 팝업만 anon 접근 허용
CREATE POLICY "popup_public_read" ON popup_content
  FOR SELECT TO anon USING (is_active = true);

-- 공개 읽기: 활성 자료 목록
CREATE POLICY "materials_public_read" ON materials
  FOR SELECT TO anon USING (is_active = true);

-- service_role은 RLS 우회 → 나머지 모든 접근은 API Route 서버에서만 처리

-- ── DB 함수: 자료 배부 (원자적 중복 차단) ────────────────
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
  -- 학생 존재 확인
  SELECT id, name INTO v_stu FROM students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'student_not_found');
  END IF;

  -- 자료 활성 확인
  SELECT id, name, is_active INTO v_mat FROM materials WHERE id = p_material_id;
  IF NOT FOUND OR NOT v_mat.is_active THEN
    RETURN jsonb_build_object('success', false, 'reason', 'material_inactive');
  END IF;

  -- 오늘 이미 수령 확인
  SELECT EXISTS(
    SELECT 1 FROM distribution_logs
    WHERE student_id  = p_student_id
      AND material_id = p_material_id
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_distributed');
  END IF;

  -- 배부 기록 삽입
  INSERT INTO distribution_logs (student_id, material_id, distributed_by, note)
  VALUES (p_student_id, p_material_id, p_staff_label, p_note)
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success',       true,
    'log_id',        v_log_id,
    'material_name', v_mat.name,
    'student_name',  v_stu.name
  );
END;
$$;

-- ── 기본 자료 시드 ────────────────────────────────────────
INSERT INTO materials (name, description, is_active, sort_order) VALUES
  ('1회차 자료', '', true, 0),
  ('2회차 자료', '', true, 1),
  ('3회차 자료', '', true, 2),
  ('4회차 자료', '', true, 3),
  ('5회차 자료', '', true, 4),
  ('6회차 자료', '', true, 5);
