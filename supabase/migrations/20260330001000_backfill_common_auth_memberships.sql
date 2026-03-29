create table if not exists public.identity_claim_reservations (
  id uuid primary key default gen_random_uuid(),
  app_key text not null references public.app_registry (app_key) on delete restrict,
  division_slug text not null default '',
  alias_type text not null,
  alias_value text not null,
  role_key text not null,
  status text not null default 'reserved',
  claimed_user_id uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint identity_claim_reservations_division_slug_check check (
    division_slug = '' or length(trim(division_slug)) > 0
  ),
  constraint identity_claim_reservations_alias_type_check check (
    alias_type in ('email', 'phone', 'username', 'student_number', 'admin_id', 'staff_id', 'legacy_id')
  ),
  constraint identity_claim_reservations_alias_value_check check (
    length(trim(alias_value)) > 0
  ),
  constraint identity_claim_reservations_role_key_check check (
    role_key in ('super_admin', 'admin', 'assistant', 'staff', 'student', 'viewer')
  ),
  constraint identity_claim_reservations_status_check check (
    status in ('reserved', 'claimed', 'revoked')
  ),
  constraint identity_claim_reservations_unique unique (app_key, division_slug, alias_type, alias_value)
);

comment on table public.identity_claim_reservations is 'Reserved legacy identifiers waiting to be claimed by a shared auth user.';

drop trigger if exists trg_identity_claim_reservations_updated_at on public.identity_claim_reservations;
create trigger trg_identity_claim_reservations_updated_at
before update on public.identity_claim_reservations
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.identity_claim_reservations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'identity_claim_reservations'
      and policyname = 'identity_claim_reservations_select_own'
  ) then
    create policy identity_claim_reservations_select_own
      on public.identity_claim_reservations
      for select
      to authenticated
      using (claimed_user_id = auth.uid());
  end if;
end
$$;

revoke all on public.identity_claim_reservations from anon, authenticated;
grant select on public.identity_claim_reservations to authenticated;
grant all on public.identity_claim_reservations to service_role;

insert into public.user_profiles (id, full_name, phone, default_app)
select
  admin.user_id::uuid as id,
  coalesce(nullif(admin.name, ''), auth_user.email, 'Study Hall Admin') as full_name,
  nullif(auth_user.phone, '') as phone,
  'study-hall' as default_app
from study_hall.admins admin
left join auth.users auth_user
  on auth_user.id = admin.user_id::uuid
where admin.is_active = true
on conflict (id) do update
set
  full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
  phone = coalesce(public.user_profiles.phone, excluded.phone),
  default_app = coalesce(public.user_profiles.default_app, excluded.default_app),
  updated_at = timezone('utc', now());

insert into public.user_app_memberships (user_id, app_key, role_key, status)
select distinct
  admin.user_id::uuid as user_id,
  'study-hall' as app_key,
  case admin.role
    when 'SUPER_ADMIN' then 'super_admin'
    when 'ADMIN' then 'admin'
    when 'ASSISTANT' then 'assistant'
    else 'viewer'
  end as role_key,
  'active' as status
from study_hall.admins admin
where admin.is_active = true
on conflict (user_id, app_key, role_key) do update
set
  status = 'active',
  updated_at = timezone('utc', now());

insert into public.user_division_memberships (user_id, app_key, division_slug, role_key, status)
select distinct
  admin.user_id::uuid as user_id,
  'study-hall' as app_key,
  division.slug as division_slug,
  case admin.role
    when 'SUPER_ADMIN' then 'super_admin'
    when 'ADMIN' then 'admin'
    when 'ASSISTANT' then 'assistant'
    else 'viewer'
  end as role_key,
  'active' as status
from study_hall.admins admin
join study_hall.divisions division
  on division.id = admin.division_id
where admin.is_active = true
on conflict (user_id, app_key, division_slug, role_key) do update
set
  status = 'active',
  updated_at = timezone('utc', now());

insert into public.user_login_aliases (user_id, app_key, alias_type, alias_value, is_primary, is_verified)
select distinct
  admin.user_id::uuid as user_id,
  null as app_key,
  'email' as alias_type,
  lower(auth_user.email) as alias_value,
  true as is_primary,
  auth_user.email_confirmed_at is not null as is_verified
from study_hall.admins admin
join auth.users auth_user
  on auth_user.id = admin.user_id::uuid
where admin.is_active = true
  and auth_user.email is not null
  and length(trim(auth_user.email)) > 0
on conflict do nothing;

insert into public.user_login_aliases (user_id, app_key, alias_type, alias_value, is_primary, is_verified)
select distinct
  admin.user_id::uuid as user_id,
  null as app_key,
  'phone' as alias_type,
  auth_user.phone as alias_value,
  false as is_primary,
  auth_user.phone_confirmed_at is not null as is_verified
from study_hall.admins admin
join auth.users auth_user
  on auth_user.id = admin.user_id::uuid
where admin.is_active = true
  and auth_user.phone is not null
  and length(trim(auth_user.phone)) > 0
on conflict do nothing;

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
  'interview-pass' as app_key,
  split_part(config.config_key, '::', 1) as division_slug,
  'admin_id' as alias_type,
  trim(both '"' from config.config_value::text) as alias_value,
  'admin' as role_key,
  'reserved' as status,
  jsonb_build_object(
    'source', 'interview.app_config',
    'legacy_login', 'pin',
    'config_key', config.config_key
  ) as metadata
from interview.app_config config
where config.config_key like '%::admin_id'
  and length(trim(both '"' from config.config_value::text)) > 0
on conflict (app_key, division_slug, alias_type, alias_value) do update
set
  role_key = excluded.role_key,
  status = excluded.status,
  metadata = public.identity_claim_reservations.metadata || excluded.metadata,
  updated_at = timezone('utc', now());
