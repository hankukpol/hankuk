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
  - Division staff can now use named operator accounts in `interview.staff_accounts`.
  - Staff operator login IDs are now preserved in:
    - `public.identity_claim_reservations`
  - Named operator accounts can now be claimed into real shared auth users from the admin config screen.
  - Claimed operator accounts can now use shared auth email/password login in addition to operator PIN login.
  - Staff operator sessions now carry person-level display names into 배부 로그.
- `score-predict`
  - Legacy users are preserved in:
    - `public.identity_claim_reservations`
  - Fire login identifier is stored as `phone`
  - Police login identifier is stored as `username`
  - Linked identities now authenticate against shared auth first at login time.
  - Successful login, registration, password reset, admin password reset, and admin account deletion now sync the shared identity layer.

## Auto Sync

- `study-hall`
  - Active admin insert or update should sync shared memberships.
  - Deactivation should archive the matching shared memberships.
- `interview-pass`
  - `app_config` changes for `*::admin_id` should sync reservation rows.
  - Claimed admin logins now read shared linkage during session issuance.
  - Staff operator sessions update `interview.staff_accounts.last_login_at`.
  - `interview.staff_accounts` insert, update, and delete now sync `staff_id` reservation rows automatically.
  - Claimed operator logins now read shared linkage during session issuance.
  - Shared-auth operator logins now refresh `interview.staff_accounts.last_login_at` and common membership linkage on success.
- `score-predict`
  - Linked shared identities are now checked before the local password path at login time.
  - Successful login refreshes shared profile, app membership, division membership, and alias rows.
  - Role changes from the admin user screen refresh shared memberships immediately.
  - Password reset and admin-triggered deletion now keep shared shadow identity state aligned.

## Current Limitation

- Legacy shared staff PIN still exists as a fallback path and is not backfilled into shared auth tables.
- `interview-pass` staff shared login still requires both operator login ID and shared auth email/password.
- `score-predict` still falls back to local tenant passwords for users that are not yet linked into shared auth.
- Reservation rows only prepare later claim and cutover steps; they do not enable SSO by themselves.
- `study-hall` student auth is still separate from shared auth.

## Next Recommended Step

1. `interview-pass`
   - Decide when named operator accounts should prefer shared-auth login by default and where PIN fallback should remain.
   - Keep moving admin auth toward shared-auth-first while retaining PIN as fallback and recovery.
2. `score-predict`
   - Decide when local password fallback can be removed after enough legacy users have been linked into shared auth.
3. `study-hall`
   - Extend shared auth from admin identities into student-facing flows only if there is a real cross-app need.
