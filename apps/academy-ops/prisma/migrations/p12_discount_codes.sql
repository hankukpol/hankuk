-- CreateEnum
CREATE TYPE "CodeType" AS ENUM ('REFERRAL', 'ENROLLMENT', 'CAMPAIGN');

-- CreateTable
CREATE TABLE "discount_codes" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CodeType" NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "maxUsage" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "staffId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_code_usages" (
    "id" SERIAL NOT NULL,
    "codeId" INTEGER NOT NULL,
    "paymentId" TEXT NOT NULL,
    "examNumber" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_code_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discount_codes_code_key" ON "discount_codes"("code");

-- CreateIndex
CREATE INDEX "discount_codes_code_idx" ON "discount_codes"("code");

-- CreateIndex
CREATE INDEX "discount_codes_isActive_idx" ON "discount_codes"("isActive");

-- CreateIndex
CREATE INDEX "discount_code_usages_codeId_idx" ON "discount_code_usages"("codeId");

-- CreateIndex
CREATE INDEX "discount_code_usages_paymentId_idx" ON "discount_code_usages"("paymentId");

-- CreateIndex
CREATE INDEX "discount_code_usages_examNumber_idx" ON "discount_code_usages"("examNumber");

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_code_usages" ADD CONSTRAINT "discount_code_usages_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "discount_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_code_usages" ADD CONSTRAINT "discount_code_usages_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_code_usages" ADD CONSTRAINT "discount_code_usages_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE RESTRICT ON UPDATE CASCADE;
