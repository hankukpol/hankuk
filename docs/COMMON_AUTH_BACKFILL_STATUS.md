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
  - Division admin IDs can now be claimed into real shared auth users from the admin config screen.
  - Claimed admin IDs are now read at login time and attached to the local admin session.
  - Claimed admin IDs can now use shared auth email/password login in addition to legacy PIN login.
- `score-predict`
  - Legacy users are preserved in:
    - `public.identity_claim_reservations`
  - Fire login identifier is stored as `phone`
  - Police login identifier is stored as `username`
  - Successful login, registration, password reset, admin password reset, and admin account deletion now sync the shared identity layer.

## Auto Sync

- `study-hall`
  - Active admin insert or update should sync shared memberships.
  - Deactivation should archive the matching shared memberships.
- `interview-pass`
  - `app_config` changes for `*::admin_id` should sync reservation rows.
  - Claimed admin logins now read shared linkage during session issuance.
- `score-predict`
  - Successful login refreshes shared profile, app membership, division membership, and alias rows.
  - Role changes from the admin user screen refresh shared memberships immediately.
  - Password reset and admin-triggered deletion now keep shared shadow identity state aligned.

## Current Limitation

- `interview-pass` staff access still uses shared division PINs, not person-level operator accounts.
- Because there is no stable user identity per staff member yet, those staff PINs were not backfilled into shared auth tables.
- `score-predict` users still authenticate against local tenant tables.
- Reservation rows only prepare later claim and cutover steps; they do not enable SSO by themselves.
- `study-hall` student auth is still separate from shared auth.

## Next Recommended Step

1. `interview-pass`
   - Introduce named operator accounts for staff.
   - Keep moving admin auth toward shared-auth-first while retaining PIN as fallback and recovery.
2. `score-predict`
   - Replace NextAuth credential ownership with shared-auth-first login once the adapter layer is stable.
3. `study-hall`
   - Extend shared auth from admin identities into student-facing flows only if there is a real cross-app need.
