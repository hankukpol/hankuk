# Monorepo Phase 1 Status

Last updated: 2026-03-29

## What Was Added

- Root `.nvmrc`
- Root `package.json`
- Root `pnpm-workspace.yaml`
- Root `turbo.json`

## Why The Apps Were Not Moved Yet

The current Vercel projects still point at root-level app directories:

- `score-predict`
- `study-hall`
- `interview-pass`
- `interview-mate`

If the folders are moved to `apps/` before those Vercel root directories are updated, production deployments will break.

## Safe Current State

- Root-level apps remain where they are.
- The repository now has the initial root monorepo scaffold.
- Existing app-local npm workflows still work.
- Future root-level Turbo and pnpm workflows now have a place to start from.

## Next Migration Step

1. Install pnpm through Corepack.
2. Update each new Vercel project to the future app path.
3. Move the app folders into `apps/`.
4. Remove per-app `package-lock.json` files.
5. Run root `pnpm install`.
6. Verify root `turbo` workflows.

## Important Constraint

This repository still has mixed framework majors:

- `score-predict`: Next 16 / React 19 / Prisma 5
- `study-hall`: Next 14 / React 18 / Prisma 6
- `interview-pass`: Next 15 / React 19 / Supabase SSR 0.6
- `interview-mate`: Next 14 / React 18

Because of that, shared packages should remain dependency-light until version alignment is decided.
