ALTER TABLE "payments"
ADD COLUMN "payment_group_id" TEXT,
ADD COLUMN "original_payment_id" TEXT;

CREATE INDEX "payments_payment_group_id_idx" ON "payments"("payment_group_id");
CREATE INDEX "payments_original_payment_id_idx" ON "payments"("original_payment_id");
