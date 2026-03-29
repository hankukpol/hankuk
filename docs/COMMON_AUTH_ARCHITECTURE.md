# Common Auth Architecture

Last updated: 2026-03-29

## Current State

- `score-predict`
  - Uses NextAuth credentials against its own Prisma user table.
  - Session cookies are still app-local.
  - Successful login, registration, password reset, admin password reset, and admin account deletion now sync the shared identity layer in `public`.
- `study-hall`
  - Uses Supabase Auth for admin identities, then issues app-local JWT cookies.
  - Student login is still app-local.
- `interview-pass`
  - Keeps app-local PIN login with JWT cookies for admin and staff flows.
  - Division context is resolved at runtime by path and cookie.
  - Division admin IDs can now be claimed into shared auth from the admin config screen.
  - Admin login now reads the claimed shared identity and carries that link into the app session.
  - Claimed admins can now also log in with shared auth email and password while PIN login remains as fallback.
  - Staff can now use named operator accounts stored in `interview.staff_accounts`.
  - Shared staff PIN still exists as a fallback path for kiosk-style operations.
- `interview-mate`
  - Uses `ADMIN_KEY` request validation for admin APIs.
  - Participant access is phone and reservation based, not account based.

This means `hankuk-main` is already unified at the database level, while browser authentication is moving app by app through adapter layers instead of a risky full cutover.

## Target Model

The shared identity source should be:

1. `auth.users`
2. `public.user_profiles`
3. `public.user_app_memberships`
4. `public.user_division_memberships`
5. `public.user_login_aliases`
6. `public.identity_claim_reservations`

## Shared Public Tables

- `public.user_profiles`
  - Stores shared person-level profile data.
- `public.user_app_memberships`
  - Maps one authenticated user to one or more service-level roles.
  - Example: `study-hall / super_admin`, `score-predict / admin`
- `public.user_division_memberships`
  - Maps one authenticated user to one or more division-level roles.
  - Example: `study-hall / police / admin`, `interview-pass / fire / admin`
- `public.user_login_aliases`
  - Keeps legacy identifiers that need to survive migration.
  - Example: phone number, username, student number, admin ID
- `public.identity_claim_reservations`
  - Holds reserved legacy identifiers before a real shared auth user exists.
  - Example: `interview-pass` admin IDs that still log in with PIN only

## Phase Order

1. Foundation
  - Add shared membership and alias tables to `public`.
  - Keep all existing app auth flows running.
2. Backfill
  - Backfill current admin and staff identities from app schemas into shared membership tables.
  - Do this app by app, starting with `study-hall`.
  - For apps that do not yet have real shared auth users, reserve their legacy identifiers first.
3. Adapter Layer
  - Each app reads shared memberships before issuing its own app session.
  - This keeps runtime behavior stable while moving identity ownership to `hankuk-main`.
4. Auth Unification
  - Replace app-local primary login flows where it makes sense.
  - Keep kiosk or PIN-only flows as secondary app-specific session mechanisms if needed.
5. Cross-App Session
  - Only after the above is stable should `.hankukpol.co.kr` cookie sharing be treated as actual SSO.

## App-Specific Direction

- `study-hall`
  - Best candidate for the first full shared-auth cutover because admin records already point to Supabase Auth users.
- `interview-pass`
  - Keep named staff operator accounts and shared staff PIN fallback for operations.
  - Division admin IDs are now reserved and claimable.
  - Admin PIN login now acts as an adapter session that can carry a claimed shared user ID.
  - The next larger cutover would be replacing admin PIN-first login with shared-auth-first login while keeping PIN as a recovery or kiosk path.
  - The next staff cutover would be linking named operator accounts to shared auth users instead of stopping at app-local identity.
- `score-predict`
  - A live adapter now claims reserved legacy identities into `auth.users` on successful login and registration.
  - Password reset and admin deletion flows now keep shared identity state in sync.
  - The app should eventually trust shared identity and app membership data from `public` instead of owning primary credentials in Prisma.
- `interview-mate`
  - Keep `ADMIN_KEY` temporarily.
  - Move admin UI access to shared auth later.

## What This Turn Adds

- `score-predict`
  - Shared-auth sync now covers password reset, admin-triggered password reset, and account deletion.
- `interview-pass`
  - A live admin claim API and config UI for linking division admin IDs to shared auth users.
  - Admin login/bootstrap now resolve and carry shared identity linkage into the app JWT session.
  - A shared-auth-first admin login endpoint and login-screen entry point now exist for claimed admin identities.
  - A named operator account model now exists for staff, with admin CRUD, staff login support, and operator-aware distribution logs.

## What Is Not Live Yet

- Cross-app SSO is not live.
- App login pages still use their existing local mechanisms.
- `score-predict` still issues its own NextAuth session after syncing shared memberships.
- `study-hall` student login is still app-local.
- `interview-pass` staff operator accounts are still app-local and not linked to shared auth yet.
- `interview-mate` does not yet have a live shared-auth adapter.
