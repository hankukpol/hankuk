-- Notice 테이블에 is_pinned 컬럼 추가
ALTER TABLE notices ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

-- 기존 인덱스 교체 (컬럼 순서 개선)
DROP INDEX IF EXISTS notices_target_type_is_published_idx;
CREATE INDEX IF NOT EXISTS notices_target_published_pinned_idx ON notices(target_type, is_published, is_pinned);
