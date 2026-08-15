CREATE TABLE IF NOT EXISTS "LegacyAccountIdentity" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "value" VARCHAR(191) NOT NULL,
  "normalizedValue" VARCHAR(191) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LegacyAccountIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LegacyAccountIdentity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "LegacyAccountIdentity_userId_kind_normalizedValue_key"
  ON "LegacyAccountIdentity"("userId", "kind", "normalizedValue");
CREATE INDEX IF NOT EXISTS "LegacyAccountIdentity_kind_normalizedValue_idx"
  ON "LegacyAccountIdentity"("kind", "normalizedValue");
CREATE INDEX IF NOT EXISTS "LegacyAccountIdentity_userId_idx"
  ON "LegacyAccountIdentity"("userId");

-- 대소문자만 다른 기존 아이디는 어느 계정도 삭제하거나 병합하지 않는다.
-- 원문 아이디를 계정별 별칭으로 먼저 보존한 뒤, 가장 오래된 계정 외에는
-- 외부에 노출하지 않는 충돌 없는 내부 아이디로 옮긴다.
INSERT INTO "LegacyAccountIdentity" ("userId", "kind", "value", "normalizedValue")
SELECT u."id", 'USERNAME', u."phone", lower(u."phone")
FROM "User" u
JOIN (
  SELECT lower("phone") AS normalized
  FROM "User"
  GROUP BY lower("phone")
  HAVING count(*) > 1
) duplicate_group ON duplicate_group.normalized = lower(u."phone")
ON CONFLICT ("userId", "kind", "normalizedValue") DO NOTHING;

DO $$
DECLARE
  conflicted RECORD;
  candidate TEXT;
BEGIN
  FOR conflicted IN
    SELECT ranked."id"
    FROM (
      SELECT
        u."id",
        row_number() OVER (
          PARTITION BY lower(u."phone")
          ORDER BY u."createdAt" ASC, u."id" ASC
        ) AS position
      FROM "User" u
    ) ranked
    WHERE ranked.position > 1
    ORDER BY ranked."id"
  LOOP
    candidate := 'legacy' || conflicted."id"::text;
    WHILE EXISTS (
      SELECT 1 FROM "User" WHERE lower("phone") = lower(candidate)
    ) LOOP
      candidate := candidate || 'x';
      IF length(candidate) > 20 THEN
        RAISE EXCEPTION 'Unable to allocate a safe internal username for user %.', conflicted."id";
      END IF;
    END LOOP;

    UPDATE "User"
    SET "phone" = candidate
    WHERE "id" = conflicted."id";
  END LOOP;
END $$;

-- 형식 문자를 제거했을 때 같은 기존 연락처도 모두 계정별 별칭으로 보존한다.
-- 가장 오래된 계정만 활성 연락처를 유지하고 나머지는 미등록 상태로 전환해,
-- 잘못된 계정으로 비밀번호 재설정 문자가 전달되는 일을 막는다.
INSERT INTO "LegacyAccountIdentity" ("userId", "kind", "value", "normalizedValue")
SELECT
  u."id",
  'CONTACT_PHONE',
  u."contactPhone",
  regexp_replace(u."contactPhone", '[^0-9]', '', 'g')
FROM "User" u
JOIN (
  SELECT regexp_replace("contactPhone", '[^0-9]', '', 'g') AS normalized
  FROM "User"
  WHERE regexp_replace("contactPhone", '[^0-9]', '', 'g') <> ''
  GROUP BY regexp_replace("contactPhone", '[^0-9]', '', 'g')
  HAVING count(*) > 1
) duplicate_group
  ON duplicate_group.normalized = regexp_replace(u."contactPhone", '[^0-9]', '', 'g')
ON CONFLICT ("userId", "kind", "normalizedValue") DO NOTHING;

WITH ranked AS (
  SELECT
    u."id",
    row_number() OVER (
      PARTITION BY regexp_replace(u."contactPhone", '[^0-9]', '', 'g')
      ORDER BY u."createdAt" ASC, u."id" ASC
    ) AS position
  FROM "User" u
  WHERE regexp_replace(u."contactPhone", '[^0-9]', '', 'g') <> ''
)
UPDATE "User" u
SET "contactPhone" = ''
FROM ranked
WHERE ranked."id" = u."id"
  AND ranked.position > 1;
