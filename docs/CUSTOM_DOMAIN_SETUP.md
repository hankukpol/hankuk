# Custom Domain Setup

Last updated: 2026-03-29

## Target Mapping

- `score-predict` -> `score.hankukpol.co.kr`
- `study-hall` -> `studyhall.hankukpol.co.kr`
- `interview-pass` -> `interview.hankukpol.co.kr`
- `interview-mate` -> choose and reserve a dedicated alias before public launch

## Current Vercel Projects

- `score-predict`
- `study-hall`
- `interview-pass`
- `interview-mate`

## Current Limitation

- The available Codex Vercel tools in this environment can read project status, but they cannot attach custom domains.
- The Vercel CLI is not installed in this shell.
- Domain attachment must be completed in the Vercel dashboard for now.

## Required Dashboard Steps

1. Open each new Vercel project.
2. Go to `Settings -> Domains`.
3. Add the target subdomain.
4. Follow the DNS instructions from Vercel.
5. After DNS is verified, update the project's `NEXT_PUBLIC_APP_URL`.

## Cookie-Domain Cutover

- `study-hall`, `interview-pass`, and `score-predict` now support an optional `COOKIE_DOMAIN` env var.
- Do not set `COOKIE_DOMAIN` while the app is still served primarily from `*.vercel.app`.
- Set `COOKIE_DOMAIN=.hankukpol.co.kr` only after the custom subdomain is connected and being used as the public URL.

## App Notes

- `study-hall`
  - Also update `NEXT_PUBLIC_APP_URL` to `https://studyhall.hankukpol.co.kr`.
- `interview-pass`
  - Also update `NEXT_PUBLIC_APP_URL` to `https://interview.hankukpol.co.kr`.
- `score-predict`
  - Also update `NEXTAUTH_URL` to `https://score.hankukpol.co.kr`.
  - `COOKIE_DOMAIN` now applies to both the tenant cookie and overridden NextAuth cookies.
- `interview-mate`
  - No session-cookie domain work was needed yet because admin access uses `ADMIN_KEY` request validation instead of browser login cookies.
