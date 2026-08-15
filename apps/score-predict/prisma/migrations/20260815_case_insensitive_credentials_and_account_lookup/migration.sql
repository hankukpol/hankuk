ALTER TYPE "AccountRecoveryPurpose" ADD VALUE IF NOT EXISTS 'ACCOUNT_LOOKUP';

DO $$
BEGIN
  IF EXISTS (
    SELECT lower("phone")
    FROM "User"
    GROUP BY lower("phone")
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize login identifiers because case-insensitive duplicates exist.';
  END IF;
END $$;

UPDATE "User"
SET "phone" = lower("phone")
WHERE "phone" <> lower("phone");

UPDATE "User"
SET "contactPhone" = regexp_replace("contactPhone", '[^0-9]', '', 'g')
WHERE "contactPhone" <> regexp_replace("contactPhone", '[^0-9]', '', 'g');

DO $$
BEGIN
  IF EXISTS (
    SELECT "contactPhone"
    FROM "User"
    WHERE "contactPhone" <> ''
    GROUP BY "contactPhone"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one account per contact phone because duplicate contact phones exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_lower_key"
  ON "User" (lower("phone"));

CREATE UNIQUE INDEX IF NOT EXISTS "User_contactPhone_nonempty_key"
  ON "User" ("contactPhone")
  WHERE "contactPhone" <> '';
