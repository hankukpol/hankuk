alter table public.admin_users enable row level security;

drop policy if exists "admin_users_select_self" on public.admin_users;
create policy "admin_users_select_self"
on public.admin_users
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "admin_users_service_role_all" on public.admin_users;
create policy "admin_users_service_role_all"
on public.admin_users
for all
to service_role
using (true)
with check (true);
