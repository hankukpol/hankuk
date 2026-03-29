# Common Auth Architecture

Last updated: 2026-03-29

## Current State

- `score-predict`
  - Uses NextAuth credentials against its own Prisma user table.
  - Session cookies are app-local.
  - Successful login and registration now claim or refresh shared identity membership in `public`.
- `study-hall`
  - Uses Supabase Auth for admin identities, then issues app-local JWT cookies.
  - Student login is still app-local.
- `interview-pass`
  - Uses app-local PIN login with JWT cookies for admin and staff flows.
  - Division context is resolved at runtime by path and cookie.
- `interview-mate`
  - Uses `ADMIN_KEY` request validation for admin APIs.
  - Participant access is phone and reservation based, not account based.

This means `hankuk-main` is already unified at the database level, but browser authentication is still fragmented by app.

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
  - Already exists.
  - Stores shared person-level profile data.
- `public.user_app_memberships`
  - Maps one authenticated user to one or more service-level roles.
  - Example: `study-hall / super_admin`, `score-predict / admin`
- `public.user_division_memberships`
  - Maps one authenticated user to one or more division-level roles.
  - Example: `study-hall / police / admin`, `interview-pass / fire / staff`
- `public.user_login_aliases`
  - Keeps legacy identifiers that need to survive migration.
  - Example: phone number, username, student number, admin id
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
  - Best candidate for the first backfill because admin records already point to Supabase Auth users.
- `interview-pass`
  - Keep staff PIN flow for operations.
  - Reserve division admin IDs first, then attach them to shared users later.
- `score-predict`
  - Reserve existing legacy accounts first.
  - A live adapter now claims reserved legacy identities into `auth.users` on successful login and registration.
  - Replace NextAuth credential ownership gradually after the adapter layer is stable.
  - The app should eventually trust shared identity and app membership data from `public`.
- `interview-mate`
  - Keep `ADMIN_KEY` temporarily.
  - Move admin UI access to shared auth later.

## What This Turn Adds

- Root monorepo scaffold files: `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`
- A new additive SQL migration for common auth foundation in `public`
- This architecture note for the next backfill and app cutover work

## Backfill Status

- `study-hall`
  - Active admins can be backfilled directly because they already reference Supabase Auth user IDs.
- `interview-pass`
  - Division admin IDs can be reserved now.
  - Staff PIN-only access still cannot map to a person until named operator accounts exist.
- `score-predict`
  - Existing legacy users can be reserved now because login identifiers already exist in the tenant schemas.
  - Fire uses phone login.
  - Police uses username-style login stored in the legacy `phone` column.
  - Runtime claim is now live for successful login and registration flows.

## What Is Not Live Yet

- Cross-app SSO is not live.
- App login pages still use their existing local mechanisms.
- `score-predict` still issues its own NextAuth session after syncing shared memberships.
- `interview-pass` and `interview-mate` do not have a live shared-auth adapter yet.
