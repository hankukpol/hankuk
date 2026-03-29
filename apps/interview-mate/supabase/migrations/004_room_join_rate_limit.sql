CREATE TABLE IF NOT EXISTS room_join_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES group_rooms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  failed_attempts INT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  last_failed_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_room_join_attempts_locked_until
  ON room_join_attempts(locked_until);

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
  v_attempt room_join_attempts%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_failed_attempts INT := 0;
  v_locked_until TIMESTAMPTZ;
  v_remaining_attempts INT := 0;
BEGIN
  SELECT *
  INTO v_room
  FROM group_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND'
      USING ERRCODE = 'RJ404';
  END IF;

  IF v_room.status = 'closed' THEN
    RAISE EXCEPTION 'ROOM_CLOSED'
      USING ERRCODE = 'RJ410';
  END IF;

  SELECT *
  INTO v_attempt
  FROM room_join_attempts
  WHERE room_id = p_room_id
    AND student_id = p_student_id
  FOR UPDATE;

  IF FOUND AND v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until > v_now THEN
    RAISE EXCEPTION 'ROOM_JOIN_LOCKED'
      USING ERRCODE = 'RJ429',
            DETAIL = to_char(v_attempt.locked_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  END IF;

  IF v_room.password <> p_password THEN
    v_failed_attempts := CASE
      WHEN FOUND AND v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until <= v_now THEN 1
      WHEN FOUND THEN v_attempt.failed_attempts + 1
      ELSE 1
    END;

    v_locked_until := CASE
      WHEN v_failed_attempts >= 5 THEN v_now + INTERVAL '5 minutes'
      ELSE NULL
    END;

    INSERT INTO room_join_attempts (
      room_id,
      student_id,
      failed_attempts,
      last_failed_at,
      locked_until,
      updated_at
    )
    VALUES (
      p_room_id,
      p_student_id,
      v_failed_attempts,
      v_now,
      v_locked_until,
      v_now
    )
    ON CONFLICT (room_id, student_id)
    DO UPDATE
      SET failed_attempts = EXCLUDED.failed_attempts,
          last_failed_at = EXCLUDED.last_failed_at,
          locked_until = EXCLUDED.locked_until,
          updated_at = EXCLUDED.updated_at;

    IF v_locked_until IS NOT NULL THEN
      RAISE EXCEPTION 'ROOM_JOIN_LOCKED'
        USING ERRCODE = 'RJ429',
              DETAIL = to_char(v_locked_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    END IF;

    v_remaining_attempts := GREATEST(0, 5 - v_failed_attempts);

    RAISE EXCEPTION 'ROOM_PASSWORD_INVALID'
      USING ERRCODE = 'RJ401',
            DETAIL = v_remaining_attempts::TEXT;
  END IF;

  SELECT *
  INTO v_existing_member
  FROM room_members
  WHERE student_id = p_student_id
    AND status = 'joined'
  FOR UPDATE;

  IF FOUND THEN
    DELETE FROM room_join_attempts
    WHERE room_id = p_room_id
      AND student_id = p_student_id;

    IF v_existing_member.room_id = p_room_id THEN
      RETURN v_existing_member;
    END IF;

    RAISE EXCEPTION 'ROOM_MEMBERSHIP_EXISTS'
      USING ERRCODE = 'RJ409';
  END IF;

  SELECT COUNT(*)
  INTO v_member_count
  FROM room_members
  WHERE room_id = p_room_id
    AND status = 'joined';

  IF v_member_count >= v_room.max_members THEN
    RAISE EXCEPTION 'ROOM_FULL'
      USING ERRCODE = 'RJ420';
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

  DELETE FROM room_join_attempts
  WHERE room_id = p_room_id
    AND student_id = p_student_id;

  RETURN v_member;
END;
$$;
