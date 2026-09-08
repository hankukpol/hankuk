-- 직원 채팅 실시간 전달용 최소 노출.
--
-- study_hall 스키마의 테이블 중 브라우저에서 읽을 수 있게 되는 것은 chat_messages 하나뿐이다.
-- 다른 테이블은 지금처럼 anon/authenticated 권한이 전혀 없는 상태로 남는다.
-- 쓰기 권한은 어떤 경우에도 주지 않는다. 모든 쓰기는 서버(Prisma)를 거친다.
--
-- Prisma 는 영향을 받지 않는다. DATABASE_URL 은 테이블 소유자이자 BYPASSRLS 인
-- postgres 역할로 접속하고, FORCE ROW LEVEL SECURITY 를 쓰지 않는다.

-- 1) 열람 자격 판정.
--    SECURITY DEFINER 로 두어 authenticated 가 admins 테이블을 직접 볼 필요가 없게 한다.
--    search_path 를 고정해 함수 안에서 참조가 가로채이지 않도록 한다.
CREATE OR REPLACE FUNCTION study_hall.chat_can_read_division(p_division_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = study_hall, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM study_hall.admins a
    WHERE a.user_id = auth.uid()::text
      AND a.is_active
      AND (a.role::text = 'SUPER_ADMIN' OR a.division_id = p_division_id)
  );
$$;

REVOKE ALL ON FUNCTION study_hall.chat_can_read_division(text) FROM PUBLIC;

-- 2) 읽기 권한은 chat_messages 한 장, authenticated 한 역할에만.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION study_hall.chat_can_read_division(text) TO authenticated;

    REVOKE ALL ON study_hall.chat_messages FROM anon, authenticated;
    GRANT SELECT ON study_hall.chat_messages TO authenticated;
  END IF;
END $$;

-- 3) RLS. SELECT 정책 하나만 둔다.
--    쓰기 정책이 없으므로 나중에 실수로 INSERT 권한이 부여되어도 행을 넣을 수 없다.
ALTER TABLE study_hall.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_messages_select_division_staff ON study_hall.chat_messages;
CREATE POLICY chat_messages_select_division_staff
  ON study_hall.chat_messages
  FOR SELECT
  TO authenticated
  USING (study_hall.chat_can_read_division(division_id));

-- 4) Realtime 퍼블리케이션. 퍼블리케이션이 없거나 FOR ALL TABLES 인 경우를 대비해 감싼다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication
             WHERE pubname = 'supabase_realtime' AND puballtables = false)
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime'
                       AND schemaname = 'study_hall'
                       AND tablename = 'chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE study_hall.chat_messages;
  END IF;
END $$;

-- chat_read_states 에는 아무것도 하지 않는다.
-- 다른 study_hall 테이블과 똑같이 브라우저에서 도달할 수 없는 상태로 남는다.
