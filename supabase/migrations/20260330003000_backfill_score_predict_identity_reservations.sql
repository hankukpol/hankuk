create or replace function public.upsert_score_predict_identity_reservation(
  p_division_slug text,
  p_alias_type text,
  p_alias_value text,
  p_role_key text,
  p_legacy_user_id bigint,
  p_name text,
  p_source_schema text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_alias_value is null or length(trim(p_alias_value)) = 0 then
    return;
  end if;

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
    'score-predict',
    p_division_slug,
    p_alias_type,
    case when p_alias_type = 'email' then lower(trim(p_alias_value)) else trim(p_alias_value) end,
    p_role_key,
    'reserved',
    jsonb_build_object(
      'source', p_source_schema || '.User',
      'legacy_user_id', p_legacy_user_id,
      'name', p_name
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
end;
$$;

create or replace function public.revoke_score_predict_identity_reservation(
  p_division_slug text,
  p_alias_type text,
  p_alias_value text,
  p_legacy_user_id bigint,
  p_name text,
  p_source_schema text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_alias_value is null or length(trim(p_alias_value)) = 0 then
    return;
  end if;

  update public.identity_claim_reservations
  set
    status = case
      when status = 'claimed' then 'claimed'
      else 'revoked'
    end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'revoked_from', p_source_schema || '.User',
      'legacy_user_id', p_legacy_user_id,
      'name', p_name
    ),
    updated_at = timezone('utc', now())
  where app_key = 'score-predict'
    and division_slug = p_division_slug
    and alias_type = p_alias_type
    and alias_value = case when p_alias_type = 'email' then lower(trim(p_alias_value)) else trim(p_alias_value) end
    and status <> 'claimed';
end;
$$;

create or replace function public.sync_score_predict_identity_reservations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_division_slug text;
  v_primary_alias_type text;
  v_primary_alias_value text;
  v_primary_role_key text;
  v_source_schema text;
begin
  v_source_schema := tg_table_schema;
  v_division_slug := case tg_table_schema
    when 'score_predict_fire' then 'fire'
    when 'score_predict_police' then 'police'
    else null
  end;

  if v_division_slug is null then
    raise exception 'Unsupported score-predict schema: %', tg_table_schema;
  end if;

  v_primary_alias_type := case
    when v_division_slug = 'police' then 'username'
    else 'phone'
  end;

  if tg_op in ('UPDATE', 'DELETE') then
    perform public.revoke_score_predict_identity_reservation(
      v_division_slug,
      v_primary_alias_type,
      old.phone,
      old.id,
      old.name,
      v_source_schema
    );

    perform public.revoke_score_predict_identity_reservation(
      v_division_slug,
      'email',
      old.email,
      old.id,
      old.name,
      v_source_schema
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  v_primary_alias_value := new.phone;
  v_primary_role_key := case new.role::text
    when 'ADMIN' then 'admin'
    else 'student'
  end;

  perform public.upsert_score_predict_identity_reservation(
    v_division_slug,
    v_primary_alias_type,
    v_primary_alias_value,
    v_primary_role_key,
    new.id,
    new.name,
    v_source_schema
  );

  perform public.upsert_score_predict_identity_reservation(
    v_division_slug,
    'email',
    new.email,
    v_primary_role_key,
    new.id,
    new.name,
    v_source_schema
  );

  return new;
end;
$$;

insert into public.identity_claim_reservations (
  app_key,
  division_slug,
  alias_type,
  alias_value,
  role_key,
  status,
  metadata
)
select
  'score-predict' as app_key,
  'fire' as division_slug,
  'phone' as alias_type,
  trim(user_row.phone) as alias_value,
  case user_row.role::text when 'ADMIN' then 'admin' else 'student' end as role_key,
  'reserved' as status,
  jsonb_build_object(
    'source', 'score_predict_fire.User',
    'legacy_user_id', user_row.id,
    'name', user_row.name
  ) as metadata
from score_predict_fire."User" user_row
where user_row.phone is not null
  and length(trim(user_row.phone)) > 0
on conflict (app_key, division_slug, alias_type, alias_value) do update
set
  role_key = excluded.role_key,
  status = case
    when public.identity_claim_reservations.status = 'claimed' then 'claimed'
    else 'reserved'
  end,
  metadata = public.identity_claim_reservations.metadata || excluded.metadata,
  updated_at = timezone('utc', now());

insert into public.identity_claim_reservations (
  app_key,
  division_slug,
  alias_type,
  alias_value,
  role_key,
  status,
  metadata
)
select
  'score-predict' as app_key,
  'fire' as division_slug,
  'email' as alias_type,
  lower(trim(user_row.email)) as alias_value,
  case user_row.role::text when 'ADMIN' then 'admin' else 'student' end as role_key,
  'reserved' as status,
  jsonb_build_object(
    'source', 'score_predict_fire.User',
    'legacy_user_id', user_row.id,
    'name', user_row.name
  ) as metadata
from score_predict_fire."User" user_row
where user_row.email is not null
  and length(trim(user_row.email)) > 0
on conflict (app_key, division_slug, alias_type, alias_value) do update
set
  role_key = excluded.role_key,
  status = case
    when public.identity_claim_reservations.status = 'claimed' then 'claimed'
    else 'reserved'
  end,
  metadata = public.identity_claim_reservations.metadata || excluded.metadata,
  updated_at = timezone('utc', now());

insert into public.identity_claim_reservations (
  app_key,
  division_slug,
  alias_type,
  alias_value,
  role_key,
  status,
  metadata
)
select
  'score-predict' as app_key,
  'police' as division_slug,
  'username' as alias_type,
  trim(user_row.phone) as alias_value,
  case user_row.role::text when 'ADMIN' then 'admin' else 'student' end as role_key,
  'reserved' as status,
  jsonb_build_object(
    'source', 'score_predict_police.User',
    'legacy_user_id', user_row.id,
    'name', user_row.name
  ) as metadata
from score_predict_police."User" user_row
where user_row.phone is not null
  and length(trim(user_row.phone)) > 0
on conflict (app_key, division_slug, alias_type, alias_value) do update
set
  role_key = excluded.role_key,
  status = case
    when public.identity_claim_reservations.status = 'claimed' then 'claimed'
    else 'reserved'
  end,
  metadata = public.identity_claim_reservations.metadata || excluded.metadata,
  updated_at = timezone('utc', now());

insert into public.identity_claim_reservations (
  app_key,
  division_slug,
  alias_type,
  alias_value,
  role_key,
  status,
  metadata
)
select
  'score-predict' as app_key,
  'police' as division_slug,
  'email' as alias_type,
  lower(trim(user_row.email)) as alias_value,
  case user_row.role::text when 'ADMIN' then 'admin' else 'student' end as role_key,
  'reserved' as status,
  jsonb_build_object(
    'source', 'score_predict_police.User',
    'legacy_user_id', user_row.id,
    'name', user_row.name
  ) as metadata
from score_predict_police."User" user_row
where user_row.email is not null
  and length(trim(user_row.email)) > 0
on conflict (app_key, division_slug, alias_type, alias_value) do update
set
  role_key = excluded.role_key,
  status = case
    when public.identity_claim_reservations.status = 'claimed' then 'claimed'
    else 'reserved'
  end,
  metadata = public.identity_claim_reservations.metadata || excluded.metadata,
  updated_at = timezone('utc', now());

drop trigger if exists trg_sync_score_predict_fire_identity_reservations on score_predict_fire."User";
create trigger trg_sync_score_predict_fire_identity_reservations
after insert or update or delete on score_predict_fire."User"
for each row
execute function public.sync_score_predict_identity_reservations();

drop trigger if exists trg_sync_score_predict_police_identity_reservations on score_predict_police."User";
create trigger trg_sync_score_predict_police_identity_reservations
after insert or update or delete on score_predict_police."User"
for each row
execute function public.sync_score_predict_identity_reservations();
