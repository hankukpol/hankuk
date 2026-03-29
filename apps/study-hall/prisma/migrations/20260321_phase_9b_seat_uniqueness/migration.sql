-- Keep the earliest existing assignment when the same seat was assigned more than once.
WITH ranked_students AS (
  SELECT
    id,
    seat_id,
    ROW_NUMBER() OVER (
      PARTITION BY seat_id
      ORDER BY created_at ASC, id ASC
    ) AS row_num
  FROM "students"
  WHERE seat_id IS NOT NULL
)
UPDATE "students"
SET seat_id = NULL
WHERE id IN (
  SELECT id
  FROM ranked_students
  WHERE row_num > 1
);

DROP INDEX IF EXISTS "seats_division_id_label_key";
DROP INDEX IF EXISTS "students_seat_id_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "seats_study_room_id_label_key"
ON "seats"("study_room_id", "label");

CREATE UNIQUE INDEX IF NOT EXISTS "students_seat_id_key"
ON "students"("seat_id");
