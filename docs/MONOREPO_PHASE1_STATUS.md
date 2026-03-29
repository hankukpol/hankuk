# Monorepo Migration Status

Last updated: 2026-03-29

## What Is Done

- Root `.git` is active and linked to GitHub.
- Root `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, and `turbo.json` are in place.
- `score-predict`, `study-hall`, and `interview-pass` were moved into `apps/`.
- Root workspace scripts now target `apps/*` paths and use `pnpm`.
- Root `pnpm install` completed and `pnpm-lock.yaml` was generated.
- Migrated apps now use the single root lockfile instead of per-app `package-lock.json`.
- `score-predict`, `study-hall`, and `interview-pass` all pass build verification from the new workspace layout.
- Vercel `Root Directory` was updated to `apps/score-predict`, `apps/study-hall`, and `apps/interview-pass`.
- All three migrated apps were manually redeployed from the monorepo root and promoted back to production aliases.

## Temporary Exception

- `interview-mate` is still at the repository root.
- Reason: there is active local work in that folder, and moving it now would mix in-progress user changes into the migration commit.
- It is still included in the root pnpm workspace so dependency installation and turbo discovery can work from the repository root.

## Deployment-Sensitive Follow-Up

- `interview-mate` should keep its current root-level Vercel path until that folder is clean and ready to move.
- Root Vercel archive deployments are currently large, so manual redeploys should use `vercel deploy --archive=tgz`.

## Still Not Done

- `interview-mate` path migration into `apps/`
- Version alignment for shared framework-dependent packages
- Shared package extraction beyond dependency-light utilities

## Current Shared-Package Constraint

These app versions are still intentionally unaligned:

- `score-predict`: Next 16 / React 19 / Prisma 5
- `study-hall`: Next 14 / React 18 / Prisma 6
- `interview-pass`: Next 15 / React 19 / Supabase SSR 0.6
- `interview-mate`: Next 14 / React 18

Because of that, only dependency-light shared packages should be extracted for now.
