# Monorepo Migration Status

Last updated: 2026-03-29

## What Is Done

- Root `.git` is active and linked to GitHub.
- Root `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, and `turbo.json` are in place.
- `score-predict`, `study-hall`, `interview-pass`, and `interview-mate` now live under `apps/`.
- Root workspace scripts now target `apps/*` paths and use `pnpm`.
- Root `pnpm install` completed and `pnpm-lock.yaml` was generated.
- Migrated apps now use the single root lockfile instead of per-app `package-lock.json`.
- `score-predict`, `study-hall`, and `interview-pass` all pass build verification from the new workspace layout.
- Vercel `Root Directory` was updated to `apps/score-predict`, `apps/study-hall`, and `apps/interview-pass`.
- All three migrated apps were manually redeployed from the monorepo root and promoted back to production aliases.
- The first dependency-light shared workspace package, `@hankuk/config`, is now in `packages/config`.
- The migrated apps now ship `ignoreCommand` rules so `packages/config`, `supabase`, and root workspace config changes are treated as deployment-relevant.
- `study-hall`, `interview-pass`, and `score-predict` now declare `pnpm build` in `vercel.json` instead of app-local `npm run build`.

## Deployment-Sensitive Follow-Up

- Root Vercel archive deployments are currently large, so manual redeploys should use `vercel deploy --archive=tgz`.

## Still Not Done

- Version alignment for shared framework-dependent packages
- Shared package extraction beyond dependency-light utilities

## Current Shared-Package Constraint

These app versions are still intentionally unaligned:

- `score-predict`: Next 16 / React 19 / Prisma 5
- `study-hall`: Next 14 / React 18 / Prisma 6
- `interview-pass`: Next 15 / React 19
- `interview-mate`: Next 14 / React 18

Partial alignment already done:

- `@supabase/supabase-js` is now aligned at `^2.100.1` across `score-predict`, `study-hall`, and `interview-pass`.
- `interview-pass` no longer carries an unused `@supabase/ssr` dependency.

Because of the remaining Next.js, React, and Prisma major-version gaps, only dependency-light shared packages should be extracted for now.
