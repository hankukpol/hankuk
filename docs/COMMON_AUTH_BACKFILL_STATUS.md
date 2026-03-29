# Common Auth Backfill Status

Last updated: 2026-03-29

## Applied

- `study-hall`
  - Active admin accounts are backfilled into:
    - `public.user_profiles`
    - `public.user_app_memberships`
    - `public.user_division_memberships`
    - `public.user_login_aliases`
- `interview-pass`
  - Division admin IDs are preserved in:
    - `public.identity_claim_reservations`
  - Changes to division admin IDs can be mirrored automatically through DB sync triggers

## Auto Sync

- `study-hall`
  - Active admin insert or update should sync shared memberships.
  - Deactivation should archive the matching shared memberships.
- `interview-pass`
  - `app_config` changes for `*::admin_id` should sync reservation rows.

## Current Limitation

- `interview-pass` staff access still uses shared division PINs, not person-level operator accounts.
- Because there is no stable user identity per staff member yet, those staff PINs were not backfilled into shared auth tables.

## Next Recommended Step

1. `study-hall`
   - Whenever new division admins are created, insert matching shared memberships at the same time.
2. `interview-pass`
   - Introduce named operator accounts for staff or link admin setup to a real shared auth user.
3. `score-predict`
   - Plan migration from app-local NextAuth credentials to shared public memberships.
