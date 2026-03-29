# AGENTS.md - interview-mate

This folder now runs as a single root-level Next.js application.

## Active App

- Treat `D:\\hankuk\\interview-mate` as the only executable app folder.
- Use `npm` in this folder. Do not run package commands inside the legacy subfolders.
- The active source of truth is `src/`, `public/`, `supabase/`, and the root `package.json`.

## Legacy Reference Folders

These folders remain only as migration references. Do not treat them as separate deployable apps unless the user explicitly asks for archival work.

- `D:\\hankuk\\interview-mate\\모의면접 예약`
- `D:\\hankuk\\interview-mate\\면접 조 편성`

## Route Ownership

- `src/app/reservation`, `src/app/apply`, `src/app/my-reservation`, `src/app/room`, `src/app/admin`:
  reservation and operations flows
- `src/app/study-groups`:
  the integrated study-group builder route
- `src/components/study-group`, `src/lib/study-group`:
  migrated grouping UI and algorithm code

## Design And Safety

- Prefer the root `디자인_가이드.md` when changing UI.
- Keep police/fire differences request-scoped via route/query context, not separate builds.
- Preserve the admin CSV export/import contract used by the study-group sync flow.
