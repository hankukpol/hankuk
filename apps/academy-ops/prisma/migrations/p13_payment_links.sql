-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DISABLED', 'USED_UP');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "paymentLinkId" INTEGER;

-- CreateTable
CREATE TABLE "payment_links" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "courseId" INTEGER,
    "amount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "finalAmount" INTEGER NOT NULL,
    "allowPoint" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUsage" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "status" "LinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_links_token_key" ON "payment_links"("token");

-- CreateIndex
CREATE INDEX "payment_links_token_idx" ON "payment_links"("token");

-- CreateIndex
CREATE INDEX "payment_links_status_idx" ON "payment_links"("status");

-- CreateIndex
CREATE INDEX "payment_links_createdBy_idx" ON "payment_links"("createdBy");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "payment_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
