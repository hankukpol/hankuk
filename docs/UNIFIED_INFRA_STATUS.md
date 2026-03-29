# Unified Infra Status

Last updated: 2026-03-30

## Shared Supabase

- Project: `hankuk-main`
- Region: `ap-northeast-2`
- Project ref: `pbonwjwbtqyrfrxqdwlu`
- Shared schemas:
  - `academy_ops`
  - `public`
  - `score_predict`
  - `study_hall`
  - `interview`
  - `interview_mate`
  - `score_predict_fire`
  - `score_predict_police`

## Current Production URLs

- `academy-ops`: `https://academy-ops.vercel.app`
- `score-predict`: `https://score-predict.vercel.app`
- `study-hall`: `https://study-hall-six.vercel.app`
- `interview-pass`: `https://interview-pass.vercel.app`
- `interview-mate`: `https://interview-mate-lime.vercel.app`

## Migration Status

- `academy-ops`
  - Legacy source database was deleted before migration.
  - Unified project was initialized from scratch in `academy_ops`.
  - Shared auth super-admin bootstrap now reuses the unified `ikma@hanmail.net` auth account.
- `score-predict`
  - Legacy police/fire data copied into unified project.
  - Runtime reads are routed through tenant-specific bridge schemas.
  - Legacy banner assets were copied into unified storage.
- `study-hall`
  - Original source database is gone.
  - Unified project was initialized from scratch in `study_hall`.
  - Base seed data and super-admin bootstrap are configured.
- `interview-pass`
  - Police and fire source data were copied into unified `interview` schema.
  - App now serves both divisions from one deployment.
- `interview-mate`
  - No legacy source database existed.
  - Unified `interview_mate` schema and initial session/slot seed are in place.

## Environment Notes

- All apps now share:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Prisma-based apps must include the target schema in `DATABASE_URL` and `DIRECT_URL`.
- Do not commit real secrets. Keep actual values only in local env files and Vercel project settings.

## Safety Notes

- Existing legacy Vercel and Supabase projects remain active.
- Do not delete legacy projects until the 30-day stability window in `AGENTS.md` is satisfied.
- Source databases were treated as read-only during migration work.
