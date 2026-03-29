CREATE TABLE IF NOT EXISTS "instructor_settlements" (
  "id"            TEXT PRIMARY KEY,
  "instructorId"  TEXT NOT NULL,
  "month"         TEXT NOT NULL,
  "totalSessions" INTEGER NOT NULL DEFAULT 0,
  "totalAmount"   INTEGER NOT NULL DEFAULT 0,
  "isPaid"        BOOLEAN NOT NULL DEFAULT false,
  "paidAt"        TIMESTAMP(3),
  "note"          TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instructor_settlements_instructorId_fkey"
    FOREIGN KEY ("instructorId") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instructor_settlements_instructorId_month_key"
    UNIQUE ("instructorId", "month")
);
CREATE INDEX IF NOT EXISTS "instructor_settlements_instructorId_idx" ON "instructor_settlements"("instructorId");
