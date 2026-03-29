# Project Rules -- Hankuk Monorepo

> This document defines the development rules for the hankuk repository.
> All AI assistants (Claude, Codex, Copilot, Cursor, etc.) MUST read and follow these rules before making any changes.

---

## Current Status

IMPORTANT: The monorepo migration is IN PROGRESS.
Read this section first to understand where things actually are.

### Current structure (as of 2026-03-29)

```
d:\hankuk/
  apps/
    academy-ops/        # migrated app path
    score-predict/       # migrated app path
    study-hall/          # migrated app path
    interview-pass/      # migrated app path
    interview-mate/      # migrated app path
  docs/
  supabase/
  .git/
  package.json
  pnpm-workspace.yaml
  turbo.json
  AGENTS.md              # This file
  CLAUDE.md              # Claude-specific rules (Korean)
```

- Root Git is initialized and linked to GitHub.
- Root `package.json`, `turbo.json`, `.nvmrc`, and `pnpm-workspace.yaml` exist.
- `academy-ops`, `score-predict`, `study-hall`, `interview-pass`, and `interview-mate` now live under `apps/`.
- Use root-level pnpm workspace commands. Do NOT add or restore per-app lockfiles.

### Target structure (after migration)

```
d:\hankuk/
  apps/
    academy-ops/
    score-predict/
    study-hall/
    interview-pass/
  packages/
    ui/
    db/
    config/
  turbo.json
  pnpm-workspace.yaml
  package.json
  AGENTS.md
  CLAUDE.md
```

### Which rules apply when

- Migrated apps: work in `apps/<app-name>/`.
- All other rules (isolation, shared code, naming, safety) apply regardless of migration status.
- When creating a brand new app, place it under `apps/`.

---

## Architecture (Target)

This repository will become a Turborepo monorepo with pnpm workspaces.

- `apps/` holds deployable Next.js applications.
- `packages/` holds shared libraries. They are NOT deployed independently.
- Each app in `apps/` is deployed as a separate Vercel project.
- Apps represent SERVICE boundaries, not police/fire/branch variants.
- Police/fire/branch/campus variations inside the same service are handled as runtime tenants/divisions/workspaces inside one app.
- All apps share a single Supabase project with schema-level separation.
- All apps use subdomain-based custom domains under one parent domain for shared authentication.
- Each app has an explicit subdomain alias under `hankukpol.co.kr` (not necessarily the same as the folder name).
- Tenant-aware behavior inside an app should prefer request-scoped routing and lookup, not separate builds per tenant.

---

## Core Rules

### 1. One Repo, Multiple Apps
- All code lives in this single GitHub repository.
- App-level `.git` directories must not be reintroduced.
- Each app is deployed as a separate Vercel project.
- NEVER create a separate repository for a new feature.

### 2. Adding a New Feature
- Create a new folder (under `apps/` after migration, or at root before migration) ONLY when the work is a new service/app boundary.
- Initialize it as a Next.js App Router project with TypeScript.
- Import shared code from `packages/` via `@hankuk/*` imports (after migration).
- New apps should be created under `apps/`.
- Connect the same repo on Vercel and set Root Directory to the app folder.

### 2A. Service Boundary vs Tenant Boundary
- Create a NEW APP when the feature is a different service with meaningfully different workflow, deployment lifecycle, ownership, or product direction.
- Extend an EXISTING APP when the difference is police/fire/branch/campus variation of the same service.
- Do NOT create a separate app, Vercel project, or Supabase project just to represent police/fire variants of the same service unless it is explicitly treated as a new product boundary.
- `study-hall` style runtime division routing is the reference pattern for multi-tenant service behavior in this repository.
- `academy-ops` style runtime academy/hostname lookup is also acceptable when one deployed app instance serves multiple academies or tracks without separate builds.

### 3. Shared Code
- Code used by 2+ apps --> move to `packages/`.
- Code used by 1 app only --> keep inside that app.
- Package naming: `@hankuk/<package-name>` (e.g., `@hankuk/ui`, `@hankuk/db`).
- `packages/` may remain empty until version alignment allows safe extraction.

### 4. Package Dependencies
- One-way (layered) dependencies between packages ARE allowed.
  - OK: `@hankuk/auth` depends on `@hankuk/db`
  - OK: `@hankuk/ui` depends on `@hankuk/config`
- Circular dependencies are NEVER allowed.
  - NOT OK: `@hankuk/db` depends on `@hankuk/auth` while `@hankuk/auth` depends on `@hankuk/db`

### 5. App Isolation
- One app MUST NOT import from another app directly, whether apps are at the root or under `apps/`.
- All cross-app sharing goes through `packages/` (after migration).
- A change in one app MUST NOT break another app.
- Each app has independent build, test, and deploy.
- Tenant/division separation inside an app is handled by routing, auth context, and data filters -- not by creating sibling apps for the same service.

### 6. No Secrets in Code
- `.env` and `.env.local` are NEVER committed.
- Use `.env.example` or `.env.local.example` for templates.
- Secrets go in Vercel dashboard environment variables.

---

## Package Manager Rules

### Current state
- Use pnpm ONLY across the entire repo. npm and yarn are forbidden.
- Do NOT run `npm install` or `yarn install` anywhere.
- Install dependencies from the repository root only (`pnpm install` at root).
- There must be exactly ONE `pnpm-lock.yaml` at the repository root.
- Do NOT create or allow nested lockfiles inside apps/ or packages/.
- Remove all per-app package-lock.json files as part of the migration and do not reintroduce them.

---

## Node.js and Framework Version Policy

### Node.js
- Node version must be pinned at the repository root during migration (.nvmrc + engines.node in root package.json).
- Migration completion condition: all apps must pass build on the chosen single Node version.
- No .nvmrc or engines exist in any app today. This must be resolved during migration.

### Framework and Library Versions (Current State)
- academy-ops: Next.js 14, React 18, Prisma 6, @supabase/supabase-js ^2.98, @supabase/ssr ^0.9
- score-predict: Next.js 16, React 19, Prisma 5, no Supabase client
- study-hall: Next.js 14, React 18, Prisma 6, @supabase/supabase-js ^2.99, @supabase/ssr ^0.9
- interview-pass: Next.js 15, React 19, no Prisma, @supabase/supabase-js ^2.49, @supabase/ssr ^0.6
- These are incompatible for shared code that depends on any of these libraries.

### Shared Package Restrictions
- Shared packages that depend on framework or library APIs are FORBIDDEN until version policy for ALL of the following is decided and all affected apps are aligned:
  - Next.js and React (major versions differ: 14/15/16, 18/19)
  - Prisma (major versions differ: 5 vs 6)
  - Supabase client (@supabase/ssr versions differ: 0.6 vs 0.9)
- Until then, only dependency-free packages are allowed in `packages/`:
  - OK: utils, config, types, validation schemas, constants, pure TypeScript helpers
  - NOT OK: UI components (React-dependent), auth (Next.js/Supabase-dependent), db (Prisma/Supabase-dependent)
- This restriction is lifted per-library as each library version is aligned across all apps that use it.

---

## Environment Variables Policy

### Shared Supabase credentials (after Supabase consolidation)
- All apps use the SAME Supabase URL and anon key since they share one Supabase project.
- These shared variables can be placed in root `.env` or each app's `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL` (same for all apps)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same for all apps)
  - `SUPABASE_SERVICE_ROLE_KEY` (same for all apps; one key per Supabase project)

### App-specific secrets
- Non-Supabase secrets (third-party API keys, app-specific configs) stay in `apps/<app>/.env.local` and that app's Vercel env settings.

### Root env files
- Root `.env` is for monorepo tooling (e.g., Turborepo remote cache token) and shared Supabase credentials.
- Root `.env.example` may document variable names for reference, but must not contain actual values.

### Before migration
- Each app manages its own env files independently at root level.

### Tenant resolution env policy
- Build-time tenant env vars like `NEXT_PUBLIC_TENANT_TYPE` are transitional for existing apps only.
- New apps and new tenant work MUST NOT rely on a single fixed tenant build as the default architecture.
- Prefer request-scoped tenant resolution using path slug, hostname, or runtime workspace/division lookup.

---

## Tenant and Routing Strategy

- App-level domain/subdomain decides the SERVICE.
  - Example: `academy.hankukpol.co.kr`, `study.hankukpol.co.kr`, `score.hankukpol.co.kr`, `interview.hankukpol.co.kr`
- Tenant/division/workspace inside the app decides the OPERATIONAL UNIT.
  - Example: `/police/...`, `/fire/...`, `/gangnam/...`
- Default preference for tenant-aware apps:
  1. path slug
  2. runtime hostname lookup
  3. other request-scoped lookup
- `academy-ops` may use academy/track lookup by hostname and `academyId` as long as one deployed app instance serves multiple academies or tracks at runtime.
- Every tenant-aware DB query must include the relevant tenant/division/workspace boundary.
- Auth/session for tenant-aware apps should carry enough context to enforce tenant access rules.
- One running app instance should be able to serve multiple tenants at runtime.

## Tech Stack

| Item | Choice |
|------|--------|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Monorepo | Turborepo + pnpm workspaces |
| Package Manager | pnpm |
| Database | Supabase (PostgreSQL) |
| ORM | Prisma (where needed) |
| Styling | Tailwind CSS |
| Deployment | Vercel |
| Repository | GitHub |

---

## Naming Conventions

| Target | Convention | Example |
|--------|-----------|---------|
| App folder | kebab-case | `score-predict`, `study-hall` |
| Package name | `@hankuk/` + kebab-case | `@hankuk/ui`, `@hankuk/db` |
| Vercel project | same as app folder | `score-predict` |
| Custom domain | `<alias>.hankukpol.co.kr` (alias per app, see Domain Mapping) | `score.hankukpol.co.kr` |
| Supabase schema | snake_case of app name | `score_predict`, `study_hall` |
| Tenant / division slug | kebab-case | `police`, `fire`, `gangnam` |
| Environment vars | UPPER_SNAKE_CASE | `NEXT_PUBLIC_SUPABASE_URL` |

---

## Workflow

### Modifying an Existing App
1. Work inside the app folder (`apps/<name>/` for migrated apps).
2. If the change touches more than one app, verify each affected app independently.
3. Run build/lint/tests inside every affected app and use `turbo run build` for cross-app verification when needed.
4. Push to GitHub from the repository root. Vercel deploys affected projects.
5. If an app path changed, verify that its Vercel Root Directory still matches the new folder.

### Adding a New App
1. Create the app folder under `apps/` with Next.js.
2. Add `"@hankuk/*": "workspace:*"` dependencies as needed once the relevant shared package exists.
3. Add it to Vercel using the same repo and set Root Directory to the app folder.
4. Set environment variables on the Vercel dashboard.

### Adding a New Tenant / Division to an Existing App
1. Do NOT create a new app if the work is still the same service boundary.
2. Choose the runtime identifier (`division`, `workspace`, or `tenant`) for that app.
3. Prefer path-based routing or request-scoped lookup inside the existing app.
4. Keep tenant-specific branding, labels, and limited business-rule differences in app-level config/data, not separate builds.
5. Ensure auth, middleware, and API guards enforce tenant boundaries.
6. Ensure every tenant-aware query filters by the relevant tenant/division/workspace key.
7. Verify one app instance can serve multiple tenants without rebuild.

### Adding a New Shared Package (after migration only)
1. Create `packages/<name>/` with `package.json`.
2. Set `"name": "@hankuk/<name>"`.
3. In consuming apps: `"@hankuk/<name>": "workspace:*"`.
4. Run `pnpm install` at root to link.

---

## Safety Rules

- Do NOT delete running Vercel/Supabase projects until new deployment is verified AND stable for 30 days.
- Existing 5 Vercel projects and 5 Supabase projects must remain active until Phase 5 of migration.
- When migrating databases, keep existing DB in paused state for 30 days before deletion.
- Do NOT modify multiple apps in a single commit if changes are unrelated.
- Do NOT add app-specific code to `packages/`.
- Do NOT create circular dependencies between packages.
- Do NOT run root-level git commands until root Git is initialized.
- Do NOT convert individual apps from npm to pnpm before the monorepo migration.
- Do NOT create `packages/` directory before the monorepo migration.
- Do NOT create additional Supabase projects for new apps. Add a new schema to the unified project instead.
- Do NOT create a separate app/Vercel project/Supabase project only for police/fire/branch variants of the same service unless explicitly approved as a new service boundary.
- Do NOT use build-time tenant env as the target architecture for new apps.
- Always preserve existing functionality when refactoring.

---

## Migration Decisions

These decisions are prerequisites for the monorepo migration. They are final.

### 1. Vercel Project Transition (UPDATED 2026-03-26)
- Create NEW Vercel projects (score-predict, study-hall, interview-pass) linked to the monorepo.
- Existing 5 Vercel projects (fire, police, fire-interview, police-interview, studyhall-manager) remain active during migration.
- Delete existing Vercel projects ONLY after new projects are fully verified and production-stable.
- Each new Vercel project:
  - Links to the single GitHub repo (hankuk).
  - Sets Root Directory to the app folder (e.g., `apps/score-predict`).
  - Uses subdomain custom domain (e.g., `score.hankukpol.co.kr`).
  - Configures Ignored Build Step to only build when its own app folder changes.
- Domain mapping (target):
  - Recommended target rows:

  | App folder | Subdomain alias | Custom domain |
  |------------|----------------|---------------|
  | academy-ops | academy | `academy.hankukpol.co.kr` |
  | score-predict | score | `score.hankukpol.co.kr` |
  | study-hall | studyhall | `studyhall.hankukpol.co.kr` |
  | interview-pass | interview | `interview.hankukpol.co.kr` |

  - New apps: choose an explicit subdomain alias (does not have to match the folder name). Document it in this table.

### 2. Sub-level .git Directories
- App-level .git directories (e.g., `interview-pass/.git`) are temporary.
- Final target: a single root `.git` only. Submodules are not allowed.
- If commit history is important, back up before deletion (git log, git format-patch, or subtree/filter-repo).
- Order: (1) back up history if needed, (2) delete per-app .git directories, (3) initialize root Git.

### 3. Supabase Strategy (UPDATED 2026-03-26)
- ALL apps share a SINGLE Supabase project. One project per app is no longer the strategy.
- Reason: users are the same people across all apps; shared authentication and user data is required.
- Schema separation is used to isolate app-specific data within the single project:
  - `public` schema: shared tables (users, profiles, roles, authentication).
  - `academy_ops` schema: academy-ops app tables.
  - `score_predict` schema: score-predict app tables.
  - `study_hall` schema: study-hall app tables.
  - `interview` schema: interview-pass app tables.
  - New app = new schema added to the same project. No new Supabase project needed.
- All apps share the same NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.
- There is ONE service role key per Supabase project. It grants full access and bypasses RLS. All apps use this single key for server-side operations.
- Within each app schema, runtime tenant/division/workspace separation is handled by table design and query filters. New tenant/division inside the same app does NOT create a new schema by default.
- Existing 5 Supabase projects (fire-exam-predictio, police-exam-predictio, fire-interview, police_interview, studyhall-manager) remain active during migration. Delete ONLY after new unified project is fully verified and production-stable for 30 days.

### 4. Service vs Tenant Strategy (UPDATED 2026-03-26)
- Apps represent service boundaries.
- Police/fire/branch/campus variants of the same service are runtime tenants/divisions/workspaces inside one app.
- Default preference is path/slug-based tenant routing inside the app.
- Hostname-based tenant routing is allowed if the SAME app instance handles multiple hostnames at runtime.
- `study-hall` is the reference pattern for runtime tenant-aware architecture.
- `academy-ops` is also a single service boundary. Police/fire/branch/campus differences inside it should stay as runtime academies/divisions, not sibling apps.
- Current build-time tenant env patterns in `score-predict` and `interview-pass` are transitional and should be migrated toward request-scoped runtime tenant resolution.
- New tenant/division inside an existing app = new config/data/routes within that app, not a new app, not a new Vercel project, and not a new Supabase schema by default.
- New app = new service boundary. New app implies a new app folder, a new Vercel project, and usually a new app schema in the unified Supabase project.

---

## Migration Order

### Phase 1: Repository Setup
1. Back up interview-pass/.git history if needed, then delete all per-app .git directories.
2. Initialize root Git, link to GitHub.
3. Create monorepo config files at root (package.json, turbo.json, pnpm-workspace.yaml).
4. Pin Node.js version (.nvmrc + engines.node in root package.json).
5. Move service apps into `apps/` and flatten nested `web/` roots when migrating independent projects such as `academy-ops`.
6. Remove per-app package-lock.json files, switch to pnpm.

### Phase 2: Supabase Consolidation
7. Create a single new Supabase project (hankuk-main, region: ap-northeast-2).
8. Design unified schema: `public` (shared auth/users) + per-app schemas (`academy_ops`, `score_predict`, `study_hall`, `interview`).
   - For tenant-aware apps, also design runtime tenant/division/workspace boundaries inside each app schema.
9. Set up Supabase Auth on the new project (shared authentication).
10. Migrate data from existing 5 Supabase projects to the new unified project.
11. Update all apps to use the new Supabase project credentials.
12. Verify all apps work correctly with the new unified Supabase.

### Phase 3: Vercel & Domain Setup
13. Create new Vercel projects (academy-ops, score-predict, study-hall, interview-pass) linked to the monorepo GitHub repo.
14. Configure subdomain custom domains (`academy.hankukpol.co.kr`, `score.hankukpol.co.kr`, `studyhall.hankukpol.co.kr`, `interview.hankukpol.co.kr`).
15. Configure cookie-based session sharing across subdomains (`.hankukpol.co.kr`).
16. Set up Ignored Build Step on each Vercel project for selective builds.
17. Verify preview and production deployments for all apps.

### Phase 4: Framework Alignment & Shared Code
18. Decide and align version policy across all apps for: Next.js/React, Prisma, and @supabase/supabase-js/@supabase/ssr.
   - For `score-predict` and `interview-pass`, plan migration away from build-time fixed tenant env toward request-scoped runtime tenant resolution.
   - For `academy-ops`, keep police/fire/branch differences as runtime academy or division scope, not separate builds.
19. Extract shared code into packages/ (framework-independent packages first; framework-dependent packages like @hankuk/db, @hankuk/auth, @hankuk/ui are allowed ONLY after step 18 aligns the relevant library versions).

### Phase 5: Cleanup (after 30 days of stable operation)
20. Pause existing 5 Supabase projects (keep for 30 days as backup).
21. Delete existing 5 Vercel projects (fire, police, fire-interview, police-interview, studyhall-manager).
22. Delete existing 5 Supabase projects (fire-exam-predictio, police-exam-predictio, fire-interview, police_interview, studyhall-manager).

### Existing projects (DO NOT delete until Phase 5)
- Vercel: fire, police, fire-interview, police-interview, studyhall-manager
- Supabase: fire-exam-predictio (iqhkmcxeuwueiqopkwfd), police-exam-predictio (qsdufgjxepzvgkrcumcq), fire-interview (xylhptelczfrvjhvdfdy), police_interview (vxjpapdjnkrmotcrfxsv), studyhall-manager (jbiuwadpnbunwuollohn)
