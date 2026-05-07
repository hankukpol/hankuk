create table if not exists class_pass.staff_accounts (
  id text primary key default gen_random_uuid()::text,
  division text not null,
  name text not null,
  pin_hash text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint class_pass_staff_accounts_name_check check (length(trim(name)) > 0),
  constraint class_pass_staff_accounts_pin_hash_check check (length(trim(pin_hash)) > 0),
  constraint class_pass_staff_accounts_unique_name unique (division, name)
);

create index if not exists idx_class_pass_staff_accounts_division_created
  on class_pass.staff_accounts (division, created_at);

alter table class_pass.staff_accounts enable row level security;

drop policy if exists service_role_full_staff_accounts
  on class_pass.staff_accounts;

create policy service_role_full_staff_accounts
  on class_pass.staff_accounts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant all on table class_pass.staff_accounts to service_role;

do $$
declare
  config_row record;
  account_row jsonb;
  account_name text;
  account_pin_hash text;
begin
  for config_row in
    select key, value
    from class_pass.app_config
    where key like '%::staff_accounts'
  loop
    begin
      if config_row.value is null or left(trim(config_row.value), 1) <> '[' then
        continue;
      end if;

      for account_row in
        select *
        from jsonb_array_elements(config_row.value::jsonb)
      loop
        account_name := trim(coalesce(account_row->>'name', ''));
        account_pin_hash := trim(coalesce(account_row->>'pin_hash', ''));

        if account_name = '' or account_pin_hash = '' then
          continue;
        end if;

        insert into class_pass.staff_accounts (
          division,
          id,
          name,
          pin_hash,
          created_at,
          updated_at
        )
        values (
          split_part(config_row.key, '::', 1),
          coalesce(nullif(account_row->>'id', ''), gen_random_uuid()::text),
          account_name,
          account_pin_hash,
          coalesce(nullif(account_row->>'created_at', '')::timestamptz, timezone('utc', now())),
          timezone('utc', now())
        )
        on conflict (division, name) do update
        set
          pin_hash = excluded.pin_hash,
          updated_at = timezone('utc', now());
      end loop;
    exception when others then
      raise notice 'Skipping invalid staff_accounts app_config row: %', config_row.key;
    end;
  end loop;
end;
$$;
