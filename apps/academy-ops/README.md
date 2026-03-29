# academy-ops

학원 통합 운영 메인 프로그램입니다. Next.js 14 App Router, Supabase, Prisma 6 기반이며 Hankuk monorepo의 `apps/academy-ops` 앱으로 편입되었습니다.

## Stack

- Next.js 14 App Router
- React 18
- Supabase Auth + PostgreSQL
- Prisma 6
- Tailwind CSS 3

## Run

루트에서:

```bash
pnpm --dir ./apps/academy-ops dev
```

앱 디렉터리에서:

```bash
pnpm run dev
```

## Verify

```bash
pnpm run typecheck
pnpm run lint
pnpm run build
```

## Environment

`.env.example`을 `.env.local`로 복사한 뒤 값을 채웁니다.

주요 값:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Database

- Prisma 스키마: `prisma/schema.prisma`
- Supabase 정책 SQL: `supabase/migrations/202603080002_admin_rls.sql`

Prisma client 생성:

```bash
pnpm run db:generate
```

직접 schema 반영:

```bash
pnpm run db:push
```

## Notes

- PRD와 상세 설계는 `개발계획/`을 참조합니다.
- 경찰/소방/지점 차이는 별도 앱이 아니라 runtime tenant 범위로 운영합니다.
