-- PointBalance table
CREATE TABLE IF NOT EXISTS "point_balances" (
  "id"         TEXT PRIMARY KEY,
  "examNumber" TEXT NOT NULL UNIQUE,
  "balance"    INTEGER NOT NULL DEFAULT 0,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_balances_examNumber_fkey"
    FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "point_balances_examNumber_idx" ON "point_balances"("examNumber");

-- Extend PointType enum with new values
ALTER TYPE "PointType" ADD VALUE IF NOT EXISTS 'USE_PAYMENT';
ALTER TYPE "PointType" ADD VALUE IF NOT EXISTS 'USE_RENTAL';
ALTER TYPE "PointType" ADD VALUE IF NOT EXISTS 'ADJUST';
ALTER TYPE "PointType" ADD VALUE IF NOT EXISTS 'EXPIRE';
ALTER TYPE "PointType" ADD VALUE IF NOT EXISTS 'REFUND_CANCEL';
