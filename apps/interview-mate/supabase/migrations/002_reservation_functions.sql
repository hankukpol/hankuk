CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_slots_unique_time
  ON reservation_slots(session_id, date, start_time, end_time);

CREATE OR REPLACE FUNCTION public.create_reservation(
  p_slot_id UUID,
  p_session_id UUID,
  p_name TEXT,
  p_phone TEXT,
  p_booked_by TEXT DEFAULT '학생'
)
RETURNS reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot reservation_slots%ROWTYPE;
  v_reservation reservations%ROWTYPE;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM reservations
    WHERE session_id = p_session_id
      AND phone = p_phone
      AND status = '확정'
  ) THEN
    RAISE EXCEPTION '이미 예약된 연락처입니다.';
  END IF;

  SELECT *
  INTO v_slot
  FROM reservation_slots
  WHERE id = p_slot_id
    AND session_id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '예약 슬롯을 찾을 수 없습니다.';
  END IF;

  IF v_slot.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION '비활성화된 슬롯입니다.';
  END IF;

  IF v_slot.reserved_count >= v_slot.capacity THEN
    RAISE EXCEPTION '정원이 마감되었습니다.';
  END IF;

  INSERT INTO reservations (
    slot_id,
    session_id,
    name,
    phone,
    status,
    booked_by
  )
  VALUES (
    p_slot_id,
    p_session_id,
    p_name,
    p_phone,
    '확정',
    p_booked_by
  )
  RETURNING *
  INTO v_reservation;

  UPDATE reservation_slots
  SET reserved_count = reserved_count + 1
  WHERE id = v_slot.id;

  RETURN v_reservation;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_reservation(
  p_reservation_id UUID,
  p_cancel_reason TEXT DEFAULT NULL
)
RETURNS reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation reservations%ROWTYPE;
BEGIN
  SELECT *
  INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '예약 정보를 찾을 수 없습니다.';
  END IF;

  IF v_reservation.status = '취소' THEN
    RETURN v_reservation;
  END IF;

  UPDATE reservations
  SET status = '취소',
      cancel_reason = p_cancel_reason
  WHERE id = p_reservation_id
  RETURNING *
  INTO v_reservation;

  UPDATE reservation_slots
  SET reserved_count = GREATEST(reserved_count - 1, 0)
  WHERE id = v_reservation.slot_id;

  RETURN v_reservation;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_reservation_slot(
  p_reservation_id UUID,
  p_new_slot_id UUID
)
RETURNS reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation reservations%ROWTYPE;
  v_old_slot reservation_slots%ROWTYPE;
  v_new_slot reservation_slots%ROWTYPE;
  v_locked_slot reservation_slots%ROWTYPE;
BEGIN
  SELECT *
  INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '예약 정보를 찾을 수 없습니다.';
  END IF;

  IF v_reservation.status <> '확정' THEN
    RAISE EXCEPTION '확정 예약만 변경할 수 있습니다.';
  END IF;

  IF v_reservation.slot_id = p_new_slot_id THEN
    RETURN v_reservation;
  END IF;

  FOR v_locked_slot IN
    SELECT *
    FROM reservation_slots
    WHERE id IN (v_reservation.slot_id, p_new_slot_id)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_locked_slot.id = v_reservation.slot_id THEN
      v_old_slot := v_locked_slot;
    END IF;

    IF v_locked_slot.id = p_new_slot_id THEN
      v_new_slot := v_locked_slot;
    END IF;
  END LOOP;

  IF v_new_slot.id IS NULL THEN
    RAISE EXCEPTION '변경할 슬롯을 찾을 수 없습니다.';
  END IF;

  IF v_new_slot.session_id <> v_reservation.session_id THEN
    RAISE EXCEPTION '같은 면접반의 슬롯으로만 변경할 수 있습니다.';
  END IF;

  IF v_new_slot.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION '비활성화된 슬롯입니다.';
  END IF;

  IF v_new_slot.reserved_count >= v_new_slot.capacity THEN
    RAISE EXCEPTION '변경할 슬롯이 마감되었습니다.';
  END IF;

  UPDATE reservation_slots
  SET reserved_count = GREATEST(reserved_count - 1, 0)
  WHERE id = v_old_slot.id;

  UPDATE reservation_slots
  SET reserved_count = reserved_count + 1
  WHERE id = v_new_slot.id;

  UPDATE reservations
  SET slot_id = p_new_slot_id,
      cancel_reason = NULL
  WHERE id = p_reservation_id
  RETURNING *
  INTO v_reservation;

  RETURN v_reservation;
END;
$$;
