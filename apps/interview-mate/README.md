# Interview Mate

`interview-mate` is now a single Next.js app at the folder root.

It combines:

- mock interview reservation flows
- study-group application and room operations
- admin session and roster management
- the legacy study-group builder as `/study-groups`

## Run

```bash
npm install
npm run dev
```

Additional checks:

```bash
npm run lint
npm run typecheck
npm run build
```

## Active App Structure

- `src/app`: routes for reservation, apply, room, admin, and study groups
- `src/components/study-group`: migrated study-group UI
- `src/lib/study-group`: migrated grouping algorithm and file parsing logic
- `supabase`: local database assets for the reservation/admin app

## Legacy Source Folders

These folders are retained only as migration references and should not be treated as deploy targets:

- `모의면접 예약`
- `면접 조 편성`
