create or replace function class_pass.ensure_course_seat_display_schedule_session(
  p_course_id bigint,
  p_room_id bigint,
  p_display_slot_id bigint default null,
  p_schedule_id bigint default null,
  p_display_token_hash text default null,
  p_expires_at timestamptz default null,
  p_now timestamptz default clock_timestamp()
)
returns setof class_pass.course_seat_display_sessions
language plpgsql
security definer
set search_path = class_pass, public
as $$
begin
  if p_course_id is null or p_room_id is null then
    raise exception 'course_id and room_id are required';
  end if;

  if p_display_token_hash is null or btrim(p_display_token_hash) = '' then
    raise exception 'display token hash is required';
  end if;

  if p_expires_at is null then
    raise exception 'expires_at is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('class_pass_display_session'),
    hashtext(concat_ws(':', p_course_id::text, p_room_id::text, coalesce(p_display_slot_id::text, 'course')))
  );

  update class_pass.course_seat_display_sessions
    set revoked_at = p_now
  where course_id = p_course_id
    and room_id = p_room_id
    and revoked_at is null
    and expires_at <= p_now
    and (
      (p_display_slot_id is null and display_slot_id is null)
      or display_slot_id = p_display_slot_id
    );

  return query
    select *
    from class_pass.course_seat_display_sessions
    where course_id = p_course_id
      and room_id = p_room_id
      and revoked_at is null
      and expires_at > p_now
      and (
        (p_display_slot_id is null and display_slot_id is null)
        or display_slot_id = p_display_slot_id
      )
    order by created_at desc
    limit 1;

  if found then
    return;
  end if;

  return query
    insert into class_pass.course_seat_display_sessions (
      course_id,
      room_id,
      display_token_hash,
      created_by,
      expires_at,
      last_seen_at,
      source,
      schedule_id,
      display_slot_id
    )
    values (
      p_course_id,
      p_room_id,
      p_display_token_hash,
      'schedule',
      p_expires_at,
      p_now,
      'schedule',
      p_schedule_id,
      p_display_slot_id
    )
    returning *;
end;
$$;

grant execute on function class_pass.ensure_course_seat_display_schedule_session(
  bigint,
  bigint,
  bigint,
  bigint,
  text,
  timestamptz,
  timestamptz
) to service_role;
