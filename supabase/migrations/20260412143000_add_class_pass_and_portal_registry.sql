create schema if not exists class_pass;
create schema if not exists portal;

comment on schema class_pass is 'App schema for the class-pass service.';
comment on schema portal is 'App schema for the unified admin portal service.';

grant usage on schema class_pass to anon, authenticated, service_role;
grant usage on schema portal to anon, authenticated, service_role;

alter table public.app_registry
  drop constraint if exists app_registry_app_key_check;

alter table public.app_registry
  drop constraint if exists app_registry_schema_name_check;

alter table public.user_profiles
  drop constraint if exists user_profiles_default_app_check;

alter table public.app_registry
  add constraint app_registry_app_key_check
  check (
    app_key in (
      'academy-ops',
      'score-predict',
      'study-hall',
      'interview-pass',
      'class-pass',
      'interview-mate',
      'portal'
    )
  );

alter table public.app_registry
  add constraint app_registry_schema_name_check
  check (
    schema_name in (
      'academy_ops',
      'score_predict',
      'study_hall',
      'interview',
      'class_pass',
      'interview_mate',
      'portal'
    )
  );

insert into public.app_registry (app_key, schema_name, display_name)
values
  ('class-pass', 'class_pass', 'Class Pass'),
  ('portal', 'portal', 'Unified Portal')
on conflict (app_key) do update
set
  schema_name = excluded.schema_name,
  display_name = excluded.display_name,
  is_active = true;

alter table public.user_profiles
  add constraint user_profiles_default_app_check
  check (
    default_app is null or default_app in (
      'academy-ops',
      'score-predict',
      'study-hall',
      'interview-pass',
      'class-pass',
      'interview-mate',
      'portal'
    )
  );

create table if not exists public.portal_launch_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  app_key text not null references public.app_registry (app_key) on delete restrict,
  division_slug text,
  target_path text not null default '/',
  target_role text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.portal_launch_tokens
  drop constraint if exists portal_launch_tokens_target_role_check;

alter table public.portal_launch_tokens
  add constraint portal_launch_tokens_target_role_check
  check (target_role in ('super_admin', 'admin', 'assistant', 'staff'));

create index if not exists idx_portal_launch_tokens_lookup
  on public.portal_launch_tokens (app_key, expires_at desc)
  where used_at is null;

revoke all on public.portal_launch_tokens from anon, authenticated;
grant all on public.portal_launch_tokens to service_role;

create or replace function public.consume_portal_launch_token(
  p_plain_token text,
  p_app_key text
)
returns table (
  user_id uuid,
  division_slug text,
  target_path text,
  target_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := encode(extensions.digest(coalesce(p_plain_token, ''), 'sha256'), 'hex');
begin
  if coalesce(trim(p_plain_token), '') = '' then
    return;
  end if;

  return query
  with matched as (
    select id, user_id, division_slug, target_path, target_role
    from public.portal_launch_tokens
    where token_hash = v_hash
      and app_key = p_app_key
      and used_at is null
      and expires_at > timezone('utc', now())
    for update
  ),
  consumed as (
    update public.portal_launch_tokens token
    set used_at = timezone('utc', now())
    from matched
    where token.id = matched.id
    returning matched.user_id, matched.division_slug, matched.target_path, matched.target_role
  )
  select consumed.user_id, consumed.division_slug, consumed.target_path, consumed.target_role
  from consumed;
end;
$$;

grant execute on function public.consume_portal_launch_token(text, text) to service_role;
