-- Migration: 승인 라인 설정 컬럼 추가 (academy_settings)
-- 환불·할인·현금 지급 승인 기준 금액

ALTER TABLE academy_settings
  ADD COLUMN IF NOT EXISTS refund_approval_threshold   INTEGER NOT NULL DEFAULT 200000,
  ADD COLUMN IF NOT EXISTS discount_approval_threshold INTEGER NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS cash_approval_threshold     INTEGER NOT NULL DEFAULT 100000;
