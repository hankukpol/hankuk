INSERT INTO app_config (config_key, config_value, description)
VALUES
  ('staff_pin_hash', '""', 'Shared staff PIN bcrypt hash'),
  ('admin_pin_hash', '""', 'Admin PIN bcrypt hash')
ON CONFLICT (config_key) DO NOTHING;
