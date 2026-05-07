create or replace function class_pass.set_staff_accounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_staff_accounts_updated_at
  on class_pass.staff_accounts;

create trigger set_staff_accounts_updated_at
  before update on class_pass.staff_accounts
  for each row
  execute function class_pass.set_staff_accounts_updated_at();
