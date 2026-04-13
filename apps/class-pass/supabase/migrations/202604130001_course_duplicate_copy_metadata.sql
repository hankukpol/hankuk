alter table class_pass.courses
  add column if not exists kakao_chat_url text,
  add column if not exists enrolled_from date,
  add column if not exists enrolled_until date,
  add column if not exists enrollment_fields jsonb not null default '[]'::jsonb,
  add column if not exists copied_from_course_id integer references class_pass.courses(id) on delete set null,
  add column if not exists copied_from_course_name text,
  add column if not exists copied_at timestamptz;

create index if not exists idx_class_pass_courses_copied_from
  on class_pass.courses (copied_from_course_id);

create or replace function class_pass.duplicate_course_settings(
  p_source_course_id integer,
  p_target_division text
)
returns integer
language plpgsql
as $$
declare
  v_source class_pass.courses%rowtype;
  v_candidate_name text;
  v_candidate_slug text;
  v_copy_index integer := 1;
  v_slug_index integer := 1;
  v_new_course_id integer;
begin
  select *
    into v_source
  from class_pass.courses
  where id = p_source_course_id
    and division = p_target_division;

  if not found then
    raise exception 'SOURCE_COURSE_NOT_FOUND';
  end if;

  v_candidate_name := format('%s (복사본)', v_source.name);
  while exists (
    select 1
    from class_pass.courses
    where division = p_target_division
      and name = v_candidate_name
  ) loop
    v_copy_index := v_copy_index + 1;
    v_candidate_name := format('%s (복사본 %s)', v_source.name, v_copy_index);
  end loop;

  v_candidate_slug := format('%s-copy', v_source.slug);
  while exists (
    select 1
    from class_pass.courses
    where division = p_target_division
      and slug = v_candidate_slug
  ) loop
    v_slug_index := v_slug_index + 1;
    v_candidate_slug := format('%s-copy-%s', v_source.slug, v_slug_index);
  end loop;

  insert into class_pass.courses (
    division,
    name,
    slug,
    course_type,
    status,
    theme_color,
    feature_qr_pass,
    feature_qr_distribution,
    feature_seat_assignment,
    feature_designated_seat,
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
    enrolled_from,
    enrolled_until,
    enrollment_fields,
    designated_seat_open,
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
    v_source.feature_qr_pass,
    v_source.feature_qr_distribution,
    v_source.feature_seat_assignment,
    v_source.feature_designated_seat,
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
    v_source.enrolled_from,
    v_source.enrolled_until,
    coalesce(v_source.enrollment_fields, '[]'::jsonb),
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

  return v_new_course_id;
end;
$$;
