CREATE UNIQUE INDEX IF NOT EXISTS idx_room_members_unique_joined_student
  ON room_members(student_id)
  WHERE status = 'joined';

CREATE OR REPLACE FUNCTION public.create_group_room(
  p_session_id UUID,
  p_student_id UUID,
  p_room_name TEXT,
  p_invite_code TEXT,
  p_password TEXT,
  p_max_members INT DEFAULT 10
)
RETURNS group_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room group_rooms%ROWTYPE;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM room_members
    WHERE student_id = p_student_id
      AND status = 'joined'
  ) THEN
    RAISE EXCEPTION '이미 다른 조에 소속되어 있습니다.';
  END IF;

  INSERT INTO group_rooms (
    session_id,
    room_name,
    invite_code,
    password,
    status,
    creator_student_id,
    created_by_admin,
    max_members
  )
  VALUES (
    p_session_id,
    p_room_name,
    p_invite_code,
    p_password,
    'recruiting',
    p_student_id,
    false,
    p_max_members
  )
  RETURNING *
  INTO v_room;

  INSERT INTO room_members (
    room_id,
    student_id,
    role,
    status
  )
  VALUES (
    v_room.id,
    p_student_id,
    'creator',
    'joined'
  );

  RETURN v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_group_room(
  p_room_id UUID,
  p_student_id UUID,
  p_password TEXT
)
RETURNS room_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room group_rooms%ROWTYPE;
  v_existing_member room_members%ROWTYPE;
  v_member_count INT;
  v_member room_members%ROWTYPE;
BEGIN
  SELECT *
  INTO v_room
  FROM group_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '조 방을 찾을 수 없습니다.';
  END IF;

  IF v_room.password <> p_password THEN
    RAISE EXCEPTION '비밀번호가 올바르지 않습니다.';
  END IF;

  IF v_room.status = 'closed' THEN
    RAISE EXCEPTION '닫힌 조 방입니다.';
  END IF;

  SELECT *
  INTO v_existing_member
  FROM room_members
  WHERE student_id = p_student_id
    AND status = 'joined'
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_member.room_id = p_room_id THEN
      RETURN v_existing_member;
    END IF;

    RAISE EXCEPTION '이미 다른 조에 소속되어 있습니다.';
  END IF;

  SELECT COUNT(*)
  INTO v_member_count
  FROM room_members
  WHERE room_id = p_room_id
    AND status = 'joined';

  IF v_member_count >= v_room.max_members THEN
    RAISE EXCEPTION '정원이 찼습니다.';
  END IF;

  INSERT INTO room_members (
    room_id,
    student_id,
    role,
    status
  )
  VALUES (
    p_room_id,
    p_student_id,
    'member',
    'joined'
  )
  RETURNING *
  INTO v_member;

  RETURN v_member;
END;
$$;
