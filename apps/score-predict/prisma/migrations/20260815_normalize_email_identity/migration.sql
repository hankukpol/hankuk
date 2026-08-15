DO $$
BEGIN
  IF EXISTS (
    SELECT lower("email")
    FROM "User"
    WHERE "email" IS NOT NULL
    GROUP BY lower("email")
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize recovery emails because case-insensitive duplicates exist.';
  END IF;
END $$;

UPDATE "User"
SET "email" = lower("email")
WHERE "email" IS NOT NULL
  AND "email" <> lower("email");

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_key"
  ON "User" (lower("email"))
  WHERE "email" IS NOT NULL;
