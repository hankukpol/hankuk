-- exam_scores 에 updated_at 을 추가한다.
--
-- 성적 가져오기가 이 컬럼에 의존하는데 테이블에는 없었다. 두 곳에서 어긋난다.
--   1) 쓰기: regularDbRecord 가 updatedAt 을 넘겨 createMany 가 통째로 실패한다.
--      정기 시험 가져오기가 실제 DB 에서는 한 건도 저장되지 않는다.
--   2) 삭제: planExamImportDeletion 이 이 값을 "가져온 뒤 사람이 손대지 않았다"는
--      증거로 쓴다. 값이 없으면 가져온 성적을 안전 삭제할 수 없다.
-- morning_exam_scores 에는 처음부터 있던 컬럼이라 아침 시험은 영향이 없었다.
--
-- 기존 행은 created_at 으로 채운다. 가져오기 이력이 없는 수기 입력 행이므로
-- "만든 뒤 바뀐 적 없음"이 맞는 값이다.
ALTER TABLE study_hall.exam_scores
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

UPDATE study_hall.exam_scores
   SET "updated_at" = "created_at"
 WHERE "updated_at" IS NULL;

ALTER TABLE study_hall.exam_scores
  ALTER COLUMN "updated_at" SET NOT NULL;
