-- 개발용 시드 데이터 (로컬 전용)
INSERT INTO class_pass.branches (slug, name, track_type, theme_color, is_active)
VALUES
  ('police', '경찰 지점', 'police', '#1A237E', true),
  ('fire', '소방 지점', 'fire', '#9A3412', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO class_pass.operator_accounts (login_id, display_name, is_active)
VALUES ('dev-admin', '개발용 관리자', true)
ON CONFLICT (login_id) DO NOTHING;

INSERT INTO class_pass.operator_memberships (operator_account_id, role, branch_id, is_active)
SELECT a.id, 'BRANCH_ADMIN', b.id, true
FROM class_pass.operator_accounts a, class_pass.branches b
WHERE a.login_id = 'dev-admin'
ON CONFLICT (operator_account_id, role, branch_id) DO NOTHING;
