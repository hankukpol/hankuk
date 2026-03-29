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
- `score-predict`
  - Legacy users are preserved in:
    - `public.identity_claim_reservations`
  - Fire login identifier is stored as `phone`
  - Police login identifier is stored as `username`
  - Changes to legacy users can be mirrored automatically through DB sync triggers
  - Successful login and registration now claim those reservations into shared memberships on demand

## Auto Sync

- `study-hall`
  - Active admin insert or update should sync shared memberships.
  - Deactivation should archive the matching shared memberships.
- `interview-pass`
  - `app_config` changes for `*::admin_id` should sync reservation rows.
- `score-predict`
  - Successful login refreshes shared profile, app membership, division membership, and alias rows.
  - Role changes from the admin user screen refresh shared memberships immediately.

## Current Limitation

- `interview-pass` staff access still uses shared division PINs, not person-level operator accounts.
- Because there is no stable user identity per staff member yet, those staff PINs were not backfilled into shared auth tables.
- `score-predict` users still authenticate against local tenant tables.
- `score-predict` password resets do not yet update any shared-auth shadow credential.
- Reservation rows only prepare the later claim and cutover step; they do not enable SSO by themselves.

## Next Recommended Step

1. `study-hall`
   - Whenever new division admins are created, insert matching shared memberships at the same time.
2. `interview-pass`
   - Introduce named operator accounts for staff or link admin setup to a real shared auth user.
3. `score-predict`
   - Extend the adapter to password-reset and account-deletion paths.
   - Then replace app-local NextAuth ownership with shared memberships.
