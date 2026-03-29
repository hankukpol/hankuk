CREATE TABLE IF NOT EXISTS "payment_categories" (
  "id" TEXT NOT NULL,
  "division_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_categories_division_id_name_key"
ON "payment_categories"("division_id", "name");

CREATE INDEX IF NOT EXISTS "payment_categories_division_id_idx"
ON "payment_categories"("division_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_categories_division_id_fkey'
  ) THEN
    ALTER TABLE "payment_categories"
    ADD CONSTRAINT "payment_categories_division_id_fkey"
    FOREIGN KEY ("division_id") REFERENCES "divisions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "payment_categories" (
  "id",
  "division_id",
  "name",
  "display_order",
  "created_at",
  "updated_at"
)
SELECT
  'paycat_' || substr(md5(d.id || ':' || t.code), 1, 24),
  d.id,
  t.name,
  t.display_order,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "divisions" d
CROSS JOIN (
  VALUES
    ('ENROLLMENT', '등록비', 0),
    ('MONTHLY', '월납부', 1),
    ('REFUND', '환불', 2)
) AS t(code, name, display_order)
ON CONFLICT ("division_id", "name") DO NOTHING;

ALTER TABLE "payments"
ADD COLUMN IF NOT EXISTS "payment_type_id" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'type'
  ) THEN
    EXECUTE $sql$
      UPDATE "payments" p
      SET "payment_type_id" = pc."id"
      FROM "students" s
      JOIN "payment_categories" pc
        ON pc."division_id" = s."division_id"
       AND pc."name" = CASE p."type"
         WHEN 'ENROLLMENT'::"PaymentType" THEN '등록비'
         WHEN 'MONTHLY'::"PaymentType" THEN '월납부'
         WHEN 'REFUND'::"PaymentType" THEN '환불'
       END
      WHERE p."student_id" = s."id"
        AND p."payment_type_id" IS NULL
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'payment_type_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM "payments"
    WHERE "payment_type_id" IS NULL
  ) THEN
    ALTER TABLE "payments"
    ALTER COLUMN "payment_type_id" SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "payments_payment_type_id_idx"
ON "payments"("payment_type_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_payment_type_id_fkey'
  ) THEN
    ALTER TABLE "payments"
    ADD CONSTRAINT "payments_payment_type_id_fkey"
    FOREIGN KEY ("payment_type_id") REFERENCES "payment_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "payments"
DROP COLUMN IF EXISTS "type";

DROP TYPE IF EXISTS "PaymentType";
