create or replace function public.archive_study_hall_common_auth(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_app_memberships
  set
    status = 'archived',
    updated_at = timezone('utc', now())
  where user_id = p_user_id
    and app_key = 'study-hall'
    and status <> 'archived';

  update public.user_division_memberships
  set
    status = 'archived',
    updated_at = timezone('utc', now())
  where user_id = p_user_id
    and app_key = 'study-hall'
    and status <> 'archived';
end;
$$;

create or replace function public.sync_study_hall_admin_to_common_auth()
returns trigger
language plpgsql
security definer
set search_path = public, study_hall, auth
as $$
declare
  v_user_id uuid;
  v_role_key text;
  v_division_slug text;
  v_email text;
  v_phone text;
begin
  if tg_op = 'DELETE' then
    perform public.archive_study_hall_common_auth(old.user_id::uuid);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.user_id <> new.user_id then
    perform public.archive_study_hall_common_auth(old.user_id::uuid);
  end if;

  if new.is_active is false then
    perform public.archive_study_hall_common_auth(new.user_id::uuid);
    return new;
  end if;

  v_user_id := new.user_id::uuid;
  v_role_key := case new.role::text
    when 'SUPER_ADMIN' then 'super_admin'
    when 'ADMIN' then 'admin'
    when 'ASSISTANT' then 'assistant'
    else 'viewer'
  end;

  if new.division_id is not null then
    select division.slug
    into v_division_slug
    from study_hall.divisions division
    where division.id = new.division_id;
  else
    v_division_slug := null;
  end if;

  select auth_user.email, auth_user.phone
  into v_email, v_phone
  from auth.users auth_user
  where auth_user.id = v_user_id;

  insert into public.user_profiles (id, full_name, phone, default_app)
  values (
    v_user_id,
    coalesce(nullif(new.name, ''), v_email, 'Study Hall Admin'),
    nullif(v_phone, ''),
    'study-hall'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    phone = coalesce(public.user_profiles.phone, excluded.phone),
    default_app = coalesce(public.user_profiles.default_app, excluded.default_app),
    updated_at = timezone('utc', now());

  insert into public.user_app_memberships (user_id, app_key, role_key, status)
  values (v_user_id, 'study-hall', v_role_key, 'active')
  on conflict (user_id, app_key, role_key) do update
  set
    status = 'active',
    updated_at = timezone('utc', now());

  update public.user_app_memberships
  set
    status = 'archived',
    updated_at = timezone('utc', now())
  where user_id = v_user_id
    and app_key = 'study-hall'
    and role_key <> v_role_key
    and status <> 'archived';

  update public.user_division_memberships
  set
    status = 'archived',
    updated_at = timezone('utc', now())
  where user_id = v_user_id
    and app_key = 'study-hall'
    and status <> 'archived'
    and (
      division_slug <> coalesce(v_division_slug, '')
      or role_key <> v_role_key
    );

  if v_division_slug is not null then
    insert into public.user_division_memberships (user_id, app_key, division_slug, role_key, status)
    values (v_user_id, 'study-hall', v_division_slug, v_role_key, 'active')
    on conflict (user_id, app_key, division_slug, role_key) do update
    set
      status = 'active',
      updated_at = timezone('utc', now());
  else
    update public.user_division_memberships
    set
      status = 'archived',
      updated_at = timezone('utc', now())
    where user_id = v_user_id
      and app_key = 'study-hall'
      and status <> 'archived';
  end if;

  if v_email is not null and length(trim(v_email)) > 0 then
    insert into public.user_login_aliases (user_id, app_key, alias_type, alias_value, is_primary, is_verified)
    values (
      v_user_id,
      null,
      'email',
      lower(v_email),
      true,
      exists(select 1 from auth.users where id = v_user_id and email_confirmed_at is not null)
    )
    on conflict do nothing;
  end if;

  if v_phone is not null and length(trim(v_phone)) > 0 then
    insert into public.user_login_aliases (user_id, app_key, alias_type, alias_value, is_primary, is_verified)
    values (
      v_user_id,
      null,
      'phone',
      v_phone,
      false,
      exists(select 1 from auth.users where id = v_user_id and phone_confirmed_at is not null)
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_study_hall_admin_to_common_auth on study_hall.admins;
create trigger trg_sync_study_hall_admin_to_common_auth
after insert or update or delete on study_hall.admins
for each row
execute function public.sync_study_hall_admin_to_common_auth();

create or replace function public.sync_interview_admin_id_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, interview
as $$
declare
  v_old_division text;
  v_old_alias text;
  v_new_division text;
  v_new_alias text;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.config_key like '%::admin_id' then
    v_old_division := split_part(old.config_key, '::', 1);
    v_old_alias := trim(both '"' from old.config_value::text);

    if length(v_old_alias) > 0 then
      update public.identity_claim_reservations
      set
        status = 'revoked',
        updated_at = timezone('utc', now()),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('revoked_from', old.config_key)
      where app_key = 'interview-pass'
        and division_slug = v_old_division
        and alias_type = 'admin_id'
        and alias_value = v_old_alias
        and status <> 'claimed';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.config_key like '%::admin_id' then
    v_new_division := split_part(new.config_key, '::', 1);
    v_new_alias := trim(both '"' from new.config_value::text);

    if length(v_new_alias) > 0 then
      insert into public.identity_claim_reservations (
        app_key,
        division_slug,
        alias_type,
        alias_value,
        role_key,
        status,
        metadata
      )
      values (
        'interview-pass',
        v_new_division,
        'admin_id',
        v_new_alias,
        'admin',
        'reserved',
        jsonb_build_object(
          'source', 'interview.app_config',
          'legacy_login', 'pin',
          'config_key', new.config_key
        )
      )
      on conflict (app_key, division_slug, alias_type, alias_value) do update
      set
        role_key = excluded.role_key,
        status = case
          when public.identity_claim_reservations.status = 'claimed' then 'claimed'
          else 'reserved'
        end,
        metadata = public.identity_claim_reservations.metadata || excluded.metadata,
        updated_at = timezone('utc', now());
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_interview_admin_id_reservation on interview.app_config;
create trigger trg_sync_interview_admin_id_reservation
after insert or update or delete on interview.app_config
for each row
execute function public.sync_interview_admin_id_reservation();
