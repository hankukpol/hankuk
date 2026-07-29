alter table class_pass.courses
  add column if not exists copied_from_course_id integer
    references class_pass.courses(id) on delete set null,
  add column if not exists copied_from_course_name text,
  add column if not exists copied_at timestamptz;

create index if not exists idx_class_pass_courses_copied_from
  on class_pass.courses (copied_from_course_id);

drop function if exists class_pass.copy_course_template(integer, text);

create function class_pass.copy_course_template(
  p_source_course_id integer,
  p_target_division text
)
returns jsonb
language plpgsql
set search_path = class_pass, public
as $$
declare
  v_source class_pass.courses%rowtype;
  v_source_room class_pass.course_rooms%rowtype;
  v_name_suffix text;
  v_slug_suffix text;
  v_candidate_name text;
  v_candidate_slug text;
  v_copy_index integer := 1;
  v_slug_index integer := 1;
  v_new_course_id integer;
  v_new_room_id bigint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_target_division || ':' || p_source_course_id::text, 0)
  );

  select *
    into v_source
  from class_pass.courses
  where id = p_source_course_id
    and division = p_target_division
  for share;

  if not found then
    raise exception 'SOURCE_COURSE_NOT_FOUND';
  end if;

  v_name_suffix := ' (템플릿 복사본)';
  v_candidate_name :=
    left(v_source.name, greatest(1, 100 - char_length(v_name_suffix)))
    || v_name_suffix;
  while exists (
    select 1
    from class_pass.courses
    where division = p_target_division
      and name = v_candidate_name
  ) loop
    v_copy_index := v_copy_index + 1;
    v_name_suffix := format(' (템플릿 복사본 %s)', v_copy_index);
    v_candidate_name :=
      left(v_source.name, greatest(1, 100 - char_length(v_name_suffix)))
      || v_name_suffix;
  end loop;

  v_slug_suffix := '-template-copy';
  v_candidate_slug :=
    left(v_source.slug, greatest(1, 100 - char_length(v_slug_suffix)))
    || v_slug_suffix;
  while exists (
    select 1
    from class_pass.courses
    where division = p_target_division
      and slug = v_candidate_slug
  ) loop
    v_slug_index := v_slug_index + 1;
    v_slug_suffix := format('-template-copy-%s', v_slug_index);
    v_candidate_slug :=
      left(v_source.slug, greatest(1, 100 - char_length(v_slug_suffix)))
      || v_slug_suffix;
  end loop;

  insert into class_pass.courses (
    division,
    name,
    slug,
    course_type,
    status,
    theme_color,
    tuition_amount,
    settlement_report_code,
    feature_qr_pass,
    feature_qr_distribution,
    feature_seat_assignment,
    feature_designated_seat,
    feature_attendance,
    feature_time_window,
    feature_photo,
    feature_dday,
    feature_notices,
    feature_refund_policy,
    feature_exam_delivery_mode,
    feature_weekday_color,
    feature_anti_forgery_motion,
    time_window_start,
    time_window_end,
    target_date,
    target_date_label,
    notice_title,
    notice_content,
    notice_visible,
    refund_policy,
    kakao_chat_url,
    extra_site_url,
    extra_site_label,
    presence_location_enabled,
    presence_enforcement_mode,
    presence_latitude,
    presence_longitude,
    presence_radius_m,
    presence_accuracy_max_m,
    presence_required_for_attendance,
    presence_required_for_designated_seat,
    enrolled_from,
    enrolled_until,
    enrollment_fields,
    designated_seat_open,
    attendance_open,
    sort_order,
    copied_from_course_id,
    copied_from_course_name,
    copied_at,
    created_at,
    updated_at
  )
  values (
    p_target_division,
    v_candidate_name,
    v_candidate_slug,
    v_source.course_type,
    'archived',
    v_source.theme_color,
    v_source.tuition_amount,
    v_source.settlement_report_code,
    v_source.feature_qr_pass,
    v_source.feature_qr_distribution,
    v_source.feature_seat_assignment,
    v_source.feature_designated_seat,
    v_source.feature_attendance,
    v_source.feature_time_window,
    v_source.feature_photo,
    v_source.feature_dday,
    v_source.feature_notices,
    v_source.feature_refund_policy,
    v_source.feature_exam_delivery_mode,
    v_source.feature_weekday_color,
    v_source.feature_anti_forgery_motion,
    v_source.time_window_start,
    v_source.time_window_end,
    v_source.target_date,
    v_source.target_date_label,
    v_source.notice_title,
    v_source.notice_content,
    v_source.notice_visible,
    v_source.refund_policy,
    v_source.kakao_chat_url,
    v_source.extra_site_url,
    v_source.extra_site_label,
    v_source.presence_location_enabled,
    v_source.presence_enforcement_mode,
    v_source.presence_latitude,
    v_source.presence_longitude,
    v_source.presence_radius_m,
    v_source.presence_accuracy_max_m,
    v_source.presence_required_for_attendance,
    v_source.presence_required_for_designated_seat,
    v_source.enrolled_from,
    v_source.enrolled_until,
    coalesce(v_source.enrollment_fields, '[]'::jsonb),
    false,
    false,
    v_source.sort_order,
    v_source.id,
    v_source.name,
    now(),
    now(),
    now()
  )
  returning id into v_new_course_id;

  insert into class_pass.course_subjects (
    course_id,
    name,
    sort_order
  )
  select
    v_new_course_id,
    name,
    sort_order
  from class_pass.course_subjects
  where course_id = v_source.id
  order by sort_order, id;

  for v_source_room in
    select *
    from class_pass.course_rooms
    where course_id = v_source.id
    order by sort_order, id
  loop
    insert into class_pass.course_rooms (
      course_id,
      name,
      sort_order,
      is_active,
      is_open,
      created_at,
      updated_at
    )
    values (
      v_new_course_id,
      v_source_room.name,
      v_source_room.sort_order,
      v_source_room.is_active,
      false,
      now(),
      now()
    )
    returning id into v_new_room_id;

    insert into class_pass.course_seat_layouts (
      course_id,
      room_id,
      columns,
      rows,
      aisle_columns,
      created_at,
      updated_at
    )
    select
      v_new_course_id,
      v_new_room_id,
      layout.columns,
      layout.rows,
      coalesce(layout.aisle_columns, '[]'::jsonb),
      now(),
      now()
    from class_pass.course_seat_layouts layout
    where layout.course_id = v_source.id
      and layout.room_id = v_source_room.id;

    insert into class_pass.course_seats (
      course_id,
      room_id,
      label,
      position_x,
      position_y,
      is_active,
      created_at,
      updated_at
    )
    select
      v_new_course_id,
      v_new_room_id,
      seat.label,
      seat.position_x,
      seat.position_y,
      seat.is_active,
      now(),
      now()
    from class_pass.course_seats seat
    where seat.course_id = v_source.id
      and seat.room_id = v_source_room.id
    order by seat.position_y, seat.position_x, seat.id;
  end loop;

  return (
    select to_jsonb(copied_course)
    from class_pass.courses copied_course
    where copied_course.id = v_new_course_id
  );
end;
$$;

revoke all on function class_pass.copy_course_template(integer, text)
  from public, anon, authenticated;
grant execute on function class_pass.copy_course_template(integer, text)
  to service_role;

comment on function class_pass.copy_course_template(integer, text)
  is 'Copies course template settings, subjects, rooms, layouts, and seats without student or operational data.';

-- NOTE: class_pass.duplicate_course_settings(integer, text) is intentionally kept here.
-- Dropping it in this migration would break the currently deployed production build,
-- which still calls the legacy RPC. It is removed in a follow-up migration that runs
-- only after the new Vercel production deployment is verified.
