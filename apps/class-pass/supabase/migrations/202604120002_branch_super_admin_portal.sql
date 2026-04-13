create table if not exists class_pass.branches (
  id bigserial primary key,
  slug text not null unique,
  name text not null,
  track_type text not null default 'police',
  description text not null default '',
  admin_title text not null default 'Class Pass 관리자',
  series_label text not null default '구분',
  region_label text not null default '응시지',
  app_name text not null default 'Class Pass',
  theme_color text not null default '#1A237E',
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint class_pass_branches_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint class_pass_branches_track_type_check check (track_type in ('police', 'fire')),
  constraint class_pass_branches_theme_color_check check (theme_color ~ '^#[0-9A-Fa-f]{6}$')
);

create table if not exists class_pass.operator_accounts (
  id bigserial primary key,
  login_id text not null unique,
  display_name text not null,
  pin_hash text,
  shared_user_id uuid references auth.users (id) on delete set null,
  is_active boolean not null default true,
  credential_version integer not null default 1,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists class_pass.operator_memberships (
  id bigserial primary key,
  operator_account_id bigint not null references class_pass.operator_accounts(id) on delete cascade,
  role text not null,
  branch_id bigint references class_pass.branches(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint class_pass_operator_memberships_role_check
    check (role in ('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF')),
  constraint class_pass_operator_memberships_branch_required_check
    check (
      (role = 'SUPER_ADMIN' and branch_id is null)
      or (role in ('BRANCH_ADMIN', 'STAFF') and branch_id is not null)
    ),
  constraint class_pass_operator_memberships_unique unique (operator_account_id, role, branch_id)
);

create table if not exists class_pass.operator_sessions (
  id uuid primary key default gen_random_uuid(),
  operator_account_id bigint not null references class_pass.operator_accounts(id) on delete cascade,
  membership_id bigint not null references class_pass.operator_memberships(id) on delete cascade,
  branch_id bigint references class_pass.branches(id) on delete cascade,
  role text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint class_pass_operator_sessions_role_check
    check (role in ('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'))
);

create index if not exists idx_class_pass_branches_active_order
  on class_pass.branches (is_active, display_order, slug);

create index if not exists idx_class_pass_operator_accounts_shared_user
  on class_pass.operator_accounts (shared_user_id)
  where shared_user_id is not null;

create index if not exists idx_class_pass_operator_memberships_branch
  on class_pass.operator_memberships (branch_id, role)
  where branch_id is not null;

create index if not exists idx_class_pass_operator_sessions_account
  on class_pass.operator_sessions (operator_account_id, created_at desc);

create index if not exists idx_class_pass_operator_sessions_membership
  on class_pass.operator_sessions (membership_id, revoked_at, expires_at desc);

insert into class_pass.branches (
  slug,
  name,
  track_type,
  description,
  admin_title,
  series_label,
  region_label,
  app_name,
  theme_color,
  is_active,
  display_order
)
select
  branch.slug,
  coalesce(
    max(case when config.key = branch.slug || '::branch_name' then nullif(trim(config.value), '') end),
    initcap(replace(branch.slug, '-', ' '))
  ) as name,
  coalesce(
    max(case when config.key = branch.slug || '::branch_track_type' and config.value in ('police', 'fire') then config.value end),
    case when branch.slug like '%fire%' then 'fire' else 'police' end
  ) as track_type,
  coalesce(
    max(case when config.key = branch.slug || '::branch_description' then config.value end),
    ''
  ) as description,
  coalesce(
    max(case when config.key = branch.slug || '::branch_admin_title' then config.value end),
    initcap(replace(branch.slug, '-', ' ')) || ' Class Pass 관리자'
  ) as admin_title,
  coalesce(
    max(case when config.key = branch.slug || '::branch_series_label' then config.value end),
    case when branch.slug like '%fire%' then '직렬' else '구분' end
  ) as series_label,
  coalesce(
    max(case when config.key = branch.slug || '::branch_region_label' then config.value end),
    case when branch.slug like '%fire%' then '응시지' else '응시지' end
  ) as region_label,
  coalesce(
    max(case when config.key = branch.slug || '::app_name' then config.value end),
    initcap(replace(branch.slug, '-', ' ')) || ' Class Pass'
  ) as app_name,
  coalesce(
    max(case when config.key = branch.slug || '::theme_color' and config.value ~ '^#[0-9A-Fa-f]{6}$' then config.value end),
    case when branch.slug like '%fire%' then '#9A3412' else '#1A237E' end
  ) as theme_color,
  true as is_active,
  row_number() over (order by branch.slug) - 1 as display_order
from (
  select distinct division as slug
  from class_pass.courses
  union
  select distinct division as slug
  from class_pass.popup_content
  union
  select distinct split_part(key, '::', 1) as slug
  from class_pass.app_config
  where key like '%::branch_name'
     or key like '%::branch_track_type'
     or key like '%::admin_id'
) branch
left join class_pass.app_config config
  on config.key like branch.slug || '::%'
where branch.slug is not null
  and length(trim(branch.slug)) > 0
on conflict (slug) do update
set
  name = excluded.name,
  track_type = excluded.track_type,
  description = excluded.description,
  admin_title = excluded.admin_title,
  series_label = excluded.series_label,
  region_label = excluded.region_label,
  app_name = excluded.app_name,
  theme_color = excluded.theme_color,
  updated_at = timezone('utc', now());

insert into class_pass.operator_accounts (
  login_id,
  display_name,
  pin_hash,
  is_active,
  credential_version,
  created_at,
  updated_at
)
select
  config.value as login_id,
  coalesce(branch.name, split_part(config.key, '::', 1)) || ' 관리자' as display_name,
  pin_hash.value as pin_hash,
  true as is_active,
  coalesce(nullif(session_version.value, '')::integer, 1) as credential_version,
  timezone('utc', now()),
  timezone('utc', now())
from class_pass.app_config config
join class_pass.branches branch
  on branch.slug = split_part(config.key, '::', 1)
left join class_pass.app_config pin_hash
  on pin_hash.key = split_part(config.key, '::', 1) || '::admin_pin_hash'
left join class_pass.app_config session_version
  on session_version.key = split_part(config.key, '::', 1) || '::admin_session_version'
where config.key like '%::admin_id'
  and length(trim(coalesce(config.value, ''))) > 0
on conflict (login_id) do update
set
  display_name = excluded.display_name,
  pin_hash = coalesce(excluded.pin_hash, class_pass.operator_accounts.pin_hash),
  credential_version = greatest(class_pass.operator_accounts.credential_version, excluded.credential_version),
  updated_at = timezone('utc', now());

insert into class_pass.operator_memberships (
  operator_account_id,
  role,
  branch_id,
  is_active
)
select
  account.id,
  'BRANCH_ADMIN',
  branch.id,
  true
from class_pass.app_config config
join class_pass.branches branch
  on branch.slug = split_part(config.key, '::', 1)
join class_pass.operator_accounts account
  on account.login_id = config.value
where config.key like '%::admin_id'
  and length(trim(coalesce(config.value, ''))) > 0
on conflict (operator_account_id, role, branch_id) do update
set
  is_active = true,
  updated_at = timezone('utc', now());
