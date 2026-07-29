-- Removes the legacy simple course duplicate RPC.
-- Split out of 202607290001_course_template_copy.sql so the production build that
-- still called it stayed working until the new template copy deployment was verified.
drop function if exists class_pass.duplicate_course_settings(integer, text);
