create or replace function class_pass.check_rate_limit(
  p_key text,
  p_max_attempts integer default 5,
  p_window_seconds integer default 900,
  p_increment boolean default true,
  p_reset boolean default false
)
returns table (
  allowed boolean,
  remaining_attempts integer,
  retry_after_ms integer
)
language plpgsql
security definer
set search_path = class_pass, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_attempts integer;
  v_reset_at timestamptz;
  v_incremented boolean := false;
begin
  if p_key is null or btrim(p_key) = '' then
    allowed := false;
    remaining_attempts := 0;
    retry_after_ms := 0;
    return next;
    return;
  end if;

  if p_reset then
    delete from class_pass.auth_rate_limits where key = p_key;
    allowed := true;
    remaining_attempts := greatest(p_max_attempts, 0);
    retry_after_ms := 0;
    return next;
    return;
  end if;

  delete from class_pass.auth_rate_limits
  where reset_at < v_now - interval '1 minute';

  select attempts, reset_at
    into v_attempts, v_reset_at
  from class_pass.auth_rate_limits
  where key = p_key
  for update;

  if not found or v_reset_at <= v_now then
    if p_increment then
      insert into class_pass.auth_rate_limits as limits (
        key,
        attempts,
        reset_at,
        updated_at
      )
      values (
        p_key,
        1,
        v_now + make_interval(secs => p_window_seconds),
        v_now
      )
      on conflict (key) do update
        set attempts = case
              when limits.reset_at <= v_now then 1
              else limits.attempts + 1
            end,
            reset_at = case
              when limits.reset_at <= v_now then excluded.reset_at
              else limits.reset_at
            end,
            updated_at = excluded.updated_at
      returning attempts, reset_at into v_attempts, v_reset_at;
      v_incremented := true;
    else
      v_attempts := 0;
      v_reset_at := v_now;
    end if;
  elsif p_increment and v_attempts < p_max_attempts then
    update class_pass.auth_rate_limits
      set attempts = attempts + 1,
          updated_at = v_now
    where key = p_key
    returning attempts, reset_at into v_attempts, v_reset_at;
    v_incremented := true;
  end if;

  allowed := v_attempts < p_max_attempts or (v_incremented and v_attempts <= p_max_attempts);
  remaining_attempts := greatest(p_max_attempts - v_attempts, 0);
  retry_after_ms := case
    when allowed then 0
    else greatest(floor(extract(epoch from (v_reset_at - v_now)) * 1000), 0)::integer
  end;

  return next;
end;
$$;

grant all on table class_pass.auth_rate_limits to service_role;
grant execute on function class_pass.check_rate_limit(text, integer, integer, boolean, boolean) to service_role;
