-- CreateEnum
CREATE TYPE "PaymentCategory" AS ENUM ('TUITION', 'FACILITY', 'TEXTBOOK', 'MATERIAL', 'SINGLE_COURSE', 'PENALTY', 'ETC');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'POINT', 'MIXED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'PARTIAL_REFUNDED', 'FULLY_REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundType" AS ENUM ('CARD_CANCEL', 'CASH', 'TRANSFER', 'PARTIAL');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "examNumber" TEXT,
    "enrollmentId" TEXT,
    "category" "PaymentCategory" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'APPROVED',
    "grossAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "couponAmount" INTEGER NOT NULL DEFAULT 0,
    "pointAmount" INTEGER NOT NULL DEFAULT 0,
    "netAmount" INTEGER NOT NULL,
    "note" TEXT,
    "processedBy" UUID NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_items" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "itemType" "PaymentCategory" NOT NULL,
    "itemId" TEXT,
    "itemName" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "payment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "refundType" "RefundType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "processedBy" UUID NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bankName" TEXT,
    "accountNo" TEXT,
    "accountHolder" TEXT,
    "cardCancelNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidPaymentId" TEXT,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_settlements" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tuitionTotal" INTEGER NOT NULL DEFAULT 0,
    "facilityTotal" INTEGER NOT NULL DEFAULT 0,
    "textbookTotal" INTEGER NOT NULL DEFAULT 0,
    "posTotal" INTEGER NOT NULL DEFAULT 0,
    "etcTotal" INTEGER NOT NULL DEFAULT 0,
    "grossTotal" INTEGER NOT NULL DEFAULT 0,
    "refundTotal" INTEGER NOT NULL DEFAULT 0,
    "netTotal" INTEGER NOT NULL DEFAULT 0,
    "cashAmount" INTEGER NOT NULL DEFAULT 0,
    "cardAmount" INTEGER NOT NULL DEFAULT 0,
    "transferAmount" INTEGER NOT NULL DEFAULT 0,
    "cashActual" INTEGER,
    "cashDiff" INTEGER,
    "closedAt" TIMESTAMP(3),
    "closedBy" UUID,
    "reopenedAt" TIMESTAMP(3),
    "reopenedBy" UUID,
    "reopenReason" TEXT,

    CONSTRAINT "daily_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_examNumber_processedAt_idx" ON "payments"("examNumber", "processedAt");

-- CreateIndex
CREATE INDEX "payments_processedAt_idx" ON "payments"("processedAt");

-- CreateIndex
CREATE INDEX "payments_processedBy_idx" ON "payments"("processedBy");

-- CreateIndex
CREATE INDEX "payments_category_processedAt_idx" ON "payments"("category", "processedAt");

-- CreateIndex
CREATE INDEX "payments_status_processedAt_idx" ON "payments"("status", "processedAt");

-- CreateIndex
CREATE INDEX "payment_items_paymentId_idx" ON "payment_items"("paymentId");

-- CreateIndex
CREATE INDEX "refunds_paymentId_idx" ON "refunds"("paymentId");

-- CreateIndex
CREATE INDEX "installments_paymentId_idx" ON "installments"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "installments_paymentId_seq_key" ON "installments"("paymentId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "daily_settlements_date_key" ON "daily_settlements"("date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "notification_logs_dedupeKey_key" ON "notification_logs"("dedupeKey");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_processedBy_fkey" FOREIGN KEY ("processedBy") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

