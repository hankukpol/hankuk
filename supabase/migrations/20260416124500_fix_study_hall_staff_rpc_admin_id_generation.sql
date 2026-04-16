create or replace function public.provision_staff_for_app(
  p_user_id uuid,
  p_app_key text,
  p_role_key text,
  p_division_slug text default null,
  p_full_name text default null,
  p_email text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, academy_ops, class_pass, study_hall, interview
as $$
declare
  v_branch_id bigint;
  v_division_id text;
  v_operator_account_id bigint;
  v_login_id text;
  v_admin_id text;
  v_study_hall_admin_id text;
begin
  case p_app_key
    when 'academy-ops' then
      if p_role_key = 'super_admin' then
        insert into academy_ops.admin_users (id, email, name, role, is_active)
        values (p_user_id, coalesce(p_email, ''), coalesce(p_full_name, coalesce(p_email, '운영자')), 'SUPER_ADMIN', true)
        on conflict (id) do update
        set
          email = excluded.email,
          name = excluded.name,
          role = excluded.role,
          is_active = true,
          updated_at = timezone('utc', now());
      else
        insert into academy_ops.admin_users (id, email, name, role, is_active)
        values (p_user_id, coalesce(p_email, ''), coalesce(p_full_name, coalesce(p_email, '운영자')), 'MANAGER', true)
        on conflict (id) do update
        set
          email = excluded.email,
          name = excluded.name,
          role = excluded.role,
          is_active = true,
          updated_at = timezone('utc', now());
      end if;

    when 'study-hall' then
      select id
      into v_division_id
      from study_hall.divisions
      where slug = p_division_slug
      limit 1;

      select id
      into v_study_hall_admin_id
      from study_hall.admins
      where user_id = p_user_id::text
      limit 1;

      if v_study_hall_admin_id is null then
        v_study_hall_admin_id := 'c' || substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 24);
      end if;

      if p_role_key = 'super_admin' then
        insert into study_hall.admins (id, user_id, name, role, division_id, is_active)
        values (v_study_hall_admin_id, p_user_id::text, coalesce(p_full_name, coalesce(p_email, '운영자')), 'SUPER_ADMIN', null, true)
        on conflict (user_id) do update
        set
          name = excluded.name,
          role = excluded.role,
          division_id = excluded.division_id,
          is_active = true;
      elsif p_role_key = 'assistant' then
        insert into study_hall.admins (id, user_id, name, role, division_id, is_active)
        values (v_study_hall_admin_id, p_user_id::text, coalesce(p_full_name, coalesce(p_email, '운영자')), 'ASSISTANT', v_division_id, true)
        on conflict (user_id) do update
        set
          name = excluded.name,
          role = excluded.role,
          division_id = excluded.division_id,
          is_active = true;
      else
        insert into study_hall.admins (id, user_id, name, role, division_id, is_active)
        values (v_study_hall_admin_id, p_user_id::text, coalesce(p_full_name, coalesce(p_email, '운영자')), 'ADMIN', v_division_id, true)
        on conflict (user_id) do update
        set
          name = excluded.name,
          role = excluded.role,
          division_id = excluded.division_id,
          is_active = true;
      end if;

    when 'class-pass' then
      select id
      into v_operator_account_id
      from class_pass.operator_accounts
      where shared_user_id = p_user_id
      order by id asc
      limit 1;

      if v_operator_account_id is null then
        v_login_id := 'portal-' || replace(p_user_id::text, '-', '');

        insert into class_pass.operator_accounts (
          login_id,
          display_name,
          shared_user_id,
          is_active,
          updated_at
        )
        values (
          v_login_id,
          coalesce(p_full_name, coalesce(p_email, '운영자')),
          p_user_id,
          true,
          timezone('utc', now())
        )
        on conflict (login_id) do update
        set
          display_name = excluded.display_name,
          shared_user_id = excluded.shared_user_id,
          is_active = true,
          updated_at = timezone('utc', now())
        returning id into v_operator_account_id;
      else
        update class_pass.operator_accounts
        set
          display_name = coalesce(p_full_name, coalesce(p_email, '운영자')),
          shared_user_id = p_user_id,
          is_active = true,
          updated_at = timezone('utc', now())
        where id = v_operator_account_id;
      end if;

      if p_role_key = 'super_admin' then
        insert into class_pass.operator_memberships (
          operator_account_id,
          role,
          branch_id,
          is_active,
          updated_at
        )
        values (v_operator_account_id, 'SUPER_ADMIN', null, true, timezone('utc', now()))
        on conflict (operator_account_id, role, branch_id) do update
        set
          is_active = true,
          updated_at = timezone('utc', now());
      else
        select id
        into v_branch_id
        from class_pass.branches
        where slug = p_division_slug
        limit 1;

        insert into class_pass.operator_memberships (
          operator_account_id,
          role,
          branch_id,
          is_active,
          updated_at
        )
        values (
          v_operator_account_id,
          case when p_role_key = 'staff' then 'STAFF' else 'BRANCH_ADMIN' end,
          v_branch_id,
          true,
          timezone('utc', now())
        )
        on conflict (operator_account_id, role, branch_id) do update
        set
          is_active = true,
          updated_at = timezone('utc', now());
      end if;

    when 'interview-pass' then
      select coalesce(
        (
          select config_value
          from interview.app_config
          where config_key = coalesce(p_division_slug, '') || '::admin_id'
          limit 1
        ),
        (
          select config_value
          from interview.app_config
          where config_key = 'admin_id'
          limit 1
        )
      )
      into v_admin_id;

      if p_role_key = 'admin' and v_admin_id is not null and coalesce(trim(v_admin_id), '') <> '' then
        insert into public.identity_claim_reservations (
          app_key,
          division_slug,
          alias_type,
          alias_value,
          role_key,
          status,
          claimed_user_id,
          metadata
        )
        values (
          'interview-pass',
          coalesce(p_division_slug, ''),
          'admin_id',
          trim(v_admin_id),
          'admin',
          'claimed',
          p_user_id,
          jsonb_build_object(
            'source', 'portal.staff_management',
            'display_name', p_full_name,
            'email', p_email
          )
        )
        on conflict (app_key, division_slug, alias_type, alias_value) do update
        set
          role_key = excluded.role_key,
          status = 'claimed',
          claimed_user_id = excluded.claimed_user_id,
          metadata = coalesce(public.identity_claim_reservations.metadata, '{}'::jsonb) || excluded.metadata,
          updated_at = timezone('utc', now());
      end if;

    else
      null;
  end case;

  return jsonb_build_object('ok', true, 'appKey', p_app_key, 'roleKey', p_role_key);
end;
$$;
