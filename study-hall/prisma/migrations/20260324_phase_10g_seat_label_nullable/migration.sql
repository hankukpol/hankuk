-- 1. 기존 studyRoomId+label unique 제약 제거 (먼저!)
DROP INDEX IF EXISTS "seats_study_room_id_label_key";

-- 2. 기존 _X-Y 플레이스홀더 라벨을 빈 문자열로 정리
UPDATE "seats" SET "label" = '' WHERE "label" ~ '^_\d+-\d+$' AND "is_active" = false;

-- 3. 빈 문자열이 아닌 label에만 유니크 제약 적용 (partial unique index)
CREATE UNIQUE INDEX "seats_study_room_id_label_key"
ON "seats"("study_room_id", "label")
WHERE "label" != '';
