create or replace function class_pass.upsert_enrollment_care_state(
  p_enrollment_id bigint,
  p_subject_id integer default null,
  p_state text default 'pending',
  p_updated_by text default null
)
returns table (
  state text
)
language plpgsql
security definer
set search_path = class_pass, public
as $$
declare
  v_state text;
begin
  if p_state not in ('pending', 'needs_contact', 'contacted', 'meeting_scheduled') then
    raise exception 'invalid enrollment care state'
      using errcode = '23514';
  end if;

  if p_subject_id is null then
    insert into class_pass.enrollment_care_states (
      enrollment_id,
      subject_id,
      state,
      updated_by,
      updated_at
    )
    values (
      p_enrollment_id,
      null,
      p_state,
      p_updated_by,
      now()
    )
    on conflict (enrollment_id) where subject_id is null do update
      set state = excluded.state,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
    returning enrollment_care_states.state into v_state;
  else
    insert into class_pass.enrollment_care_states (
      enrollment_id,
      subject_id,
      state,
      updated_by,
      updated_at
    )
    values (
      p_enrollment_id,
      p_subject_id,
      p_state,
      p_updated_by,
      now()
    )
    on conflict (enrollment_id, subject_id) where subject_id is not null do update
      set state = excluded.state,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
    returning enrollment_care_states.state into v_state;
  end if;

  state := v_state;
  return next;
end;
$$;

revoke all on function class_pass.upsert_enrollment_care_state(bigint, integer, text, text) from public;
grant execute on function class_pass.upsert_enrollment_care_state(bigint, integer, text, text) to service_role;
