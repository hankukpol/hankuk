-- Migration: academy_settings_v2
-- Add faxNumber, documentIssuer, sealImagePath, logoImagePath columns
-- to academy_settings table

ALTER TABLE academy_settings
  ADD COLUMN IF NOT EXISTS "faxNumber"       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "documentIssuer"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "sealImagePath"   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "logoImagePath"   TEXT NOT NULL DEFAULT '';
