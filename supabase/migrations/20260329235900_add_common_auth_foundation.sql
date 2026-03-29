create table if not exists public.user_app_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app_key text not null references public.app_registry (app_key) on delete restrict,
  role_key text not null,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_app_memberships_role_key_check check (
    role_key in ('super_admin', 'admin', 'assistant', 'staff', 'student', 'viewer')
  ),
  constraint user_app_memberships_status_check check (
    status in ('active', 'invited', 'suspended', 'archived')
  ),
  constraint user_app_memberships_unique unique (user_id, app_key, role_key)
);

comment on table public.user_app_memberships is 'Service-level memberships for shared auth across hankuk apps.';

drop trigger if exists trg_user_app_memberships_updated_at on public.user_app_memberships;
create trigger trg_user_app_memberships_updated_at
before update on public.user_app_memberships
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.user_app_memberships enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_app_memberships'
      and policyname = 'user_app_memberships_select_own'
  ) then
    create policy user_app_memberships_select_own
      on public.user_app_memberships
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;

revoke all on public.user_app_memberships from anon, authenticated;
grant select on public.user_app_memberships to authenticated;
grant all on public.user_app_memberships to service_role;

create table if not exists public.user_division_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app_key text not null references public.app_registry (app_key) on delete restrict,
  division_slug text not null,
  role_key text not null,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_division_memberships_division_slug_check check (length(trim(division_slug)) > 0),
  constraint user_division_memberships_role_key_check check (
    role_key in ('super_admin', 'admin', 'assistant', 'staff', 'student', 'viewer')
  ),
  constraint user_division_memberships_status_check check (
    status in ('active', 'invited', 'suspended', 'archived')
  ),
  constraint user_division_memberships_unique unique (user_id, app_key, division_slug, role_key)
);

comment on table public.user_division_memberships is 'Division-level memberships for tenant-aware access control.';

drop trigger if exists trg_user_division_memberships_updated_at on public.user_division_memberships;
create trigger trg_user_division_memberships_updated_at
before update on public.user_division_memberships
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.user_division_memberships enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_division_memberships'
      and policyname = 'user_division_memberships_select_own'
  ) then
    create policy user_division_memberships_select_own
      on public.user_division_memberships
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;

revoke all on public.user_division_memberships from anon, authenticated;
grant select on public.user_division_memberships to authenticated;
grant all on public.user_division_memberships to service_role;

create table if not exists public.user_login_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app_key text references public.app_registry (app_key) on delete cascade,
  alias_type text not null,
  alias_value text not null,
  is_primary boolean not null default false,
  is_verified boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_login_aliases_alias_type_check check (
    alias_type in ('email', 'phone', 'username', 'student_number', 'admin_id', 'staff_id', 'legacy_id')
  ),
  constraint user_login_aliases_alias_value_check check (length(trim(alias_value)) > 0)
);

create unique index if not exists user_login_aliases_unique_idx
  on public.user_login_aliases (coalesce(app_key, ''), alias_type, alias_value);

comment on table public.user_login_aliases is 'Legacy and app-specific login aliases mapped to shared auth users.';

drop trigger if exists trg_user_login_aliases_updated_at on public.user_login_aliases;
create trigger trg_user_login_aliases_updated_at
before update on public.user_login_aliases
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.user_login_aliases enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_login_aliases'
      and policyname = 'user_login_aliases_select_own'
  ) then
    create policy user_login_aliases_select_own
      on public.user_login_aliases
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;

revoke all on public.user_login_aliases from anon, authenticated;
grant select on public.user_login_aliases to authenticated;
grant all on public.user_login_aliases to service_role;

create or replace function public.has_app_role(requested_app_key text, allowed_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_app_memberships membership
    where membership.user_id = auth.uid()
      and membership.app_key = requested_app_key
      and membership.status = 'active'
      and (
        allowed_roles is null
        or membership.role_key = any (allowed_roles)
      )
  );
$$;

create or replace function public.has_division_role(
  requested_app_key text,
  requested_division_slug text,
  allowed_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_division_memberships membership
    where membership.user_id = auth.uid()
      and membership.app_key = requested_app_key
      and membership.division_slug = requested_division_slug
      and membership.status = 'active'
      and (
        allowed_roles is null
        or membership.role_key = any (allowed_roles)
      )
  );
$$;

grant execute on function public.has_app_role(text, text[]) to authenticated, service_role;
grant execute on function public.has_division_role(text, text, text[]) to authenticated, service_role;
