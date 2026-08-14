-- HTML/CSS 자유 랜딩만 운영한다.
-- 기존 구조화 캠페인의 게시 내용과 이력은 보관하되 대표 캠페인 연결에서는 해제한다.
UPDATE "ExamOperationState"
SET
  "activeCampaignId" = NULL,
  "version" = "version" + 1,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "activeCampaignId" IN (
  SELECT "id"
  FROM "PromotionCampaign"
  WHERE "templateKey" <> 'custom-html-v1'
);

UPDATE "PromotionCampaign"
SET
  "status" = 'ARCHIVED',
  "archivedAt" = COALESCE("archivedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "templateKey" <> 'custom-html-v1'
  AND "status" <> 'ARCHIVED';
