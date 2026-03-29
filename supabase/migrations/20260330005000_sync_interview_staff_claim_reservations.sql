create or replace function public.sync_interview_staff_account_reservations()
returns trigger
language plpgsql
security definer
set search_path = public, interview
as $$
declare
  v_old_claim_status text;
  v_new_claim_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if tg_op = 'DELETE'
      or old.division is distinct from new.division
      or old.login_id is distinct from new.login_id then
      update public.identity_claim_reservations
      set
        status = case
          when public.identity_claim_reservations.status = 'claimed' then 'claimed'
          else 'revoked'
        end,
        metadata = coalesce(public.identity_claim_reservations.metadata, '{}'::jsonb)
          || jsonb_build_object(
            'revoked_from', 'interview.staff_accounts',
            'revoked_at', timezone('utc', now())
          ),
        updated_at = timezone('utc', now())
      where app_key = 'interview-pass'
        and division_slug = old.division
        and alias_type = 'staff_id'
        and alias_value = old.login_id;
    end if;
  end if;

  if tg_op <> 'DELETE' then
    v_new_claim_status := case
      when new.shared_user_id is not null then 'claimed'
      else 'reserved'
    end;

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
      new.division,
      'staff_id',
      new.login_id,
      'staff',
      v_new_claim_status,
      new.shared_user_id,
      jsonb_build_object(
        'source', 'interview.staff_accounts',
        'staff_account_id', new.id,
        'display_name', new.display_name,
        'legacy_login', 'pin'
      )
    )
    on conflict (app_key, division_slug, alias_type, alias_value) do update
    set
      role_key = excluded.role_key,
      status = case
        when excluded.claimed_user_id is not null then 'claimed'
        when public.identity_claim_reservations.status = 'claimed' then 'claimed'
        else 'reserved'
      end,
      claimed_user_id = coalesce(excluded.claimed_user_id, public.identity_claim_reservations.claimed_user_id),
      metadata = coalesce(public.identity_claim_reservations.metadata, '{}'::jsonb) || excluded.metadata,
      updated_at = timezone('utc', now());
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_interview_staff_account_reservations on interview.staff_accounts;
create trigger trg_sync_interview_staff_account_reservations
after insert or update or delete on interview.staff_accounts
for each row
execute function public.sync_interview_staff_account_reservations();

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
select
  'interview-pass',
  staff_account.division,
  'staff_id',
  staff_account.login_id,
  'staff',
  case
    when staff_account.shared_user_id is not null then 'claimed'
    else 'reserved'
  end,
  staff_account.shared_user_id,
  jsonb_build_object(
    'source', 'interview.staff_accounts',
    'staff_account_id', staff_account.id,
    'display_name', staff_account.display_name,
    'legacy_login', 'pin'
  )
from interview.staff_accounts staff_account
on conflict (app_key, division_slug, alias_type, alias_value) do update
set
  role_key = excluded.role_key,
  status = case
    when excluded.claimed_user_id is not null then 'claimed'
    when public.identity_claim_reservations.status = 'claimed' then 'claimed'
    else 'reserved'
  end,
  claimed_user_id = coalesce(excluded.claimed_user_id, public.identity_claim_reservations.claimed_user_id),
  metadata = coalesce(public.identity_claim_reservations.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = timezone('utc', now());
