CREATE TYPE "PromotionCampaignStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ExamOperationPhase" AS ENUM ('PRE_REGISTRATION', 'SCORING_OPEN', 'ANALYSIS_OPEN', 'FINAL_OPEN', 'CLOSED');

CREATE TABLE "PromotionCampaign" (
  "id" SERIAL NOT NULL,
  "tenantType" VARCHAR(16) NOT NULL,
  "examId" INTEGER NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "templateKey" VARCHAR(80) NOT NULL,
  "templateVersion" INTEGER NOT NULL DEFAULT 1,
  "draftContent" JSONB NOT NULL,
  "publishedContent" JSONB,
  "publishedVersion" INTEGER NOT NULL DEFAULT 0,
  "status" "PromotionCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "createdBy" INTEGER NOT NULL,
  "updatedBy" INTEGER NOT NULL,
  "publishedBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "PromotionCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionCampaignRevision" (
  "id" SERIAL NOT NULL,
  "campaignId" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "content" JSONB NOT NULL,
  "createdBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromotionCampaignRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExamOperationState" (
  "id" SERIAL NOT NULL,
  "examId" INTEGER NOT NULL,
  "phase" "ExamOperationPhase" NOT NULL DEFAULT 'CLOSED',
  "activeCampaignId" INTEGER,
  "featureOverrides" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExamOperationState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExamOperationAuditLog" (
  "id" SERIAL NOT NULL,
  "operationStateId" INTEGER NOT NULL,
  "examId" INTEGER NOT NULL,
  "previousPhase" "ExamOperationPhase",
  "nextPhase" "ExamOperationPhase" NOT NULL,
  "previousCampaignId" INTEGER,
  "nextCampaignId" INTEGER,
  "beforeSnapshot" JSONB,
  "afterSnapshot" JSONB NOT NULL,
  "changedBy" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExamOperationAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromotionCampaign_examId_status_updatedAt_idx" ON "PromotionCampaign"("examId", "status", "updatedAt");
CREATE INDEX "PromotionCampaign_tenantType_examId_status_idx" ON "PromotionCampaign"("tenantType", "examId", "status");
CREATE UNIQUE INDEX "PromotionCampaignRevision_campaignId_version_key" ON "PromotionCampaignRevision"("campaignId", "version");
CREATE INDEX "PromotionCampaignRevision_campaignId_createdAt_idx" ON "PromotionCampaignRevision"("campaignId", "createdAt");
CREATE UNIQUE INDEX "ExamOperationState_examId_key" ON "ExamOperationState"("examId");
CREATE INDEX "ExamOperationState_activeCampaignId_idx" ON "ExamOperationState"("activeCampaignId");
CREATE INDEX "ExamOperationAuditLog_examId_createdAt_idx" ON "ExamOperationAuditLog"("examId", "createdAt");
CREATE INDEX "ExamOperationAuditLog_operationStateId_createdAt_idx" ON "ExamOperationAuditLog"("operationStateId", "createdAt");

ALTER TABLE "PromotionCampaign" ADD CONSTRAINT "PromotionCampaign_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionCampaign" ADD CONSTRAINT "PromotionCampaign_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionCampaign" ADD CONSTRAINT "PromotionCampaign_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionCampaign" ADD CONSTRAINT "PromotionCampaign_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionCampaignRevision" ADD CONSTRAINT "PromotionCampaignRevision_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PromotionCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionCampaignRevision" ADD CONSTRAINT "PromotionCampaignRevision_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamOperationState" ADD CONSTRAINT "ExamOperationState_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamOperationState" ADD CONSTRAINT "ExamOperationState_activeCampaignId_fkey" FOREIGN KEY ("activeCampaignId") REFERENCES "PromotionCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExamOperationState" ADD CONSTRAINT "ExamOperationState_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExamOperationAuditLog" ADD CONSTRAINT "ExamOperationAuditLog_operationStateId_fkey" FOREIGN KEY ("operationStateId") REFERENCES "ExamOperationState"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamOperationAuditLog" ADD CONSTRAINT "ExamOperationAuditLog_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamOperationAuditLog" ADD CONSTRAINT "ExamOperationAuditLog_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
