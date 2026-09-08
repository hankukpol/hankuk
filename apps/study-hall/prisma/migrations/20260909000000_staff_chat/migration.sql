-- 지점 단위 직원 단체 채팅(관리자 ↔ 조교).
-- 지점당 방이 하나이므로 room 테이블을 두지 않고 division_id 를 방 식별자로 쓴다.

CREATE TABLE IF NOT EXISTS study_hall.chat_messages (
  "id"            TEXT NOT NULL,
  "division_id"   TEXT NOT NULL,
  -- 직원 계정이 영구 삭제되어도 기록은 남는다. 이름은 작성 시점 스냅샷.
  "author_id"     TEXT,
  "author_name"   TEXT NOT NULL,
  "body"          TEXT NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- @updatedAt 은 Prisma 클라이언트 측 동작이라 비-Prisma 삽입을 위해 DB 기본값도 둔다.
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"    TIMESTAMP(3),
  "deleted_by_id" TEXT,
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "chat_messages_division_id_created_at_idx"
  ON study_hall.chat_messages("division_id", "created_at");

-- 증분 동기화 커서. 소프트 삭제는 updated_at 만 올리므로 created_at 기준으로는 삭제를 놓친다.
CREATE INDEX IF NOT EXISTS "chat_messages_division_id_updated_at_idx"
  ON study_hall.chat_messages("division_id", "updated_at");

CREATE INDEX IF NOT EXISTS "chat_messages_author_id_idx"
  ON study_hall.chat_messages("author_id");

-- SUPER_ADMIN 은 division_id 가 없고 여러 지점을 오가므로 (division, admin) 복합키로 둔다.
CREATE TABLE IF NOT EXISTS study_hall.chat_read_states (
  "id"           TEXT NOT NULL,
  "division_id"  TEXT NOT NULL,
  "admin_id"     TEXT NOT NULL,
  "last_read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_read_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_read_states_division_id_admin_id_key"
  ON study_hall.chat_read_states("division_id", "admin_id");

CREATE INDEX IF NOT EXISTS "chat_read_states_admin_id_idx"
  ON study_hall.chat_read_states("admin_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_division_id_fkey') THEN
    ALTER TABLE study_hall.chat_messages
      ADD CONSTRAINT "chat_messages_division_id_fkey"
      FOREIGN KEY ("division_id") REFERENCES study_hall.divisions("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_author_id_fkey') THEN
    ALTER TABLE study_hall.chat_messages
      ADD CONSTRAINT "chat_messages_author_id_fkey"
      FOREIGN KEY ("author_id") REFERENCES study_hall.admins("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_deleted_by_id_fkey') THEN
    ALTER TABLE study_hall.chat_messages
      ADD CONSTRAINT "chat_messages_deleted_by_id_fkey"
      FOREIGN KEY ("deleted_by_id") REFERENCES study_hall.admins("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_read_states_division_id_fkey') THEN
    ALTER TABLE study_hall.chat_read_states
      ADD CONSTRAINT "chat_read_states_division_id_fkey"
      FOREIGN KEY ("division_id") REFERENCES study_hall.divisions("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_read_states_admin_id_fkey') THEN
    ALTER TABLE study_hall.chat_read_states
      ADD CONSTRAINT "chat_read_states_admin_id_fkey"
      FOREIGN KEY ("admin_id") REFERENCES study_hall.admins("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
