-- Review-only until this scope receives migration approval. No activation/backfill.
SET search_path TO study_hall, public;

-- AlterTable
ALTER TABLE "division_settings" ADD COLUMN     "arrival_settings" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "arrival_records" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "first_received_at" TIMESTAMPTZ(3),
    "effective_at" TIMESTAMPTZ(3) NOT NULL,
    "source" TEXT NOT NULL,
    "device_id" TEXT,
    "device_name" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "arrival_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arrival_history" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "arrival_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "reason" TEXT,
    "actor_id" TEXT,
    "actor_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arrival_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arrival_devices" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credential_hash" TEXT NOT NULL,
    "registered_by_id" TEXT NOT NULL,
    "registered_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "arrival_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arrival_pairings" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "device_id" TEXT,

    CONSTRAINT "arrival_pairings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "arrival_records_division_id_date_effective_at_idx" ON "arrival_records"("division_id", "date", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "arrival_records_division_id_student_id_date_key" ON "arrival_records"("division_id", "student_id", "date");

-- CreateIndex
CREATE INDEX "arrival_history_division_id_student_id_created_at_idx" ON "arrival_history"("division_id", "student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "arrival_devices_credential_hash_key" ON "arrival_devices"("credential_hash");

-- CreateIndex
CREATE INDEX "arrival_devices_division_id_idx" ON "arrival_devices"("division_id");

-- CreateIndex
CREATE UNIQUE INDEX "arrival_pairings_token_hash_key" ON "arrival_pairings"("token_hash");

-- CreateIndex
CREATE INDEX "arrival_pairings_division_id_code_hash_idx" ON "arrival_pairings"("division_id", "code_hash");

-- AddForeignKey
ALTER TABLE "arrival_records" ADD CONSTRAINT "arrival_records_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrival_records" ADD CONSTRAINT "arrival_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrival_records" ADD CONSTRAINT "arrival_records_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "arrival_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrival_history" ADD CONSTRAINT "arrival_history_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrival_history" ADD CONSTRAINT "arrival_history_arrival_id_fkey" FOREIGN KEY ("arrival_id") REFERENCES "arrival_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrival_devices" ADD CONSTRAINT "arrival_devices_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrival_pairings" ADD CONSTRAINT "arrival_pairings_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE arrival_records ADD CONSTRAINT arrival_record_source CHECK (source IN ('KIOSK', 'ADMIN_ADDED', 'ADMIN_CORRECTED'));
ALTER TABLE arrival_records ADD CONSTRAINT arrival_record_version CHECK (version > 0);
ALTER TABLE arrival_records ADD CONSTRAINT arrival_record_kst_date CHECK (date = (effective_at AT TIME ZONE 'Asia/Seoul')::date);
ALTER TABLE arrival_history ADD CONSTRAINT arrival_history_action CHECK (action IN ('CHECK_IN', 'RECHECK', 'ADD', 'CORRECT', 'CANCEL'));
ALTER TABLE arrival_history ADD CONSTRAINT arrival_history_reason CHECK (action NOT IN ('ADD', 'CORRECT', 'CANCEL') OR (reason IS NOT NULL AND length(trim(reason)) > 0));

-- Only the server's Prisma connection accesses kiosk credentials and attendance.
ALTER TABLE arrival_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrival_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrival_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrival_pairings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arrival_records, arrival_history, arrival_devices, arrival_pairings FROM PUBLIC;
DO $$ DECLARE browser_role text; BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format('REVOKE ALL ON study_hall.arrival_records, study_hall.arrival_history, study_hall.arrival_devices, study_hall.arrival_pairings FROM %I', browser_role);
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION study_hall.guard_arrival_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM study_hall.students s WHERE s.id = NEW.student_id AND s.division_id = NEW.division_id) THEN
    RAISE EXCEPTION 'Arrival student division mismatch' USING ERRCODE = '23503';
  END IF;
  IF NEW.device_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM study_hall.arrival_devices d WHERE d.id = NEW.device_id AND d.division_id = NEW.division_id) THEN
    RAISE EXCEPTION 'Arrival device division mismatch' USING ERRCODE = '23503';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.student_id <> OLD.student_id OR NEW.division_id <> OLD.division_id OR NEW.date <> OLD.date OR
       (OLD.first_received_at IS NOT NULL AND NEW.first_received_at IS DISTINCT FROM OLD.first_received_at) THEN
      RAISE EXCEPTION 'Arrival identity and original receipt are immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER arrival_record_scope BEFORE INSERT OR UPDATE ON study_hall.arrival_records FOR EACH ROW EXECUTE FUNCTION study_hall.guard_arrival_record();

CREATE FUNCTION study_hall.guard_arrival_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Arrival history is append only' USING ERRCODE = '23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM study_hall.arrival_records r WHERE r.id = NEW.arrival_id AND r.division_id = NEW.division_id AND r.student_id = NEW.student_id) THEN
    RAISE EXCEPTION 'Arrival history division mismatch' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER arrival_history_scope BEFORE INSERT OR UPDATE OR DELETE ON study_hall.arrival_history FOR EACH ROW EXECUTE FUNCTION study_hall.guard_arrival_history();
