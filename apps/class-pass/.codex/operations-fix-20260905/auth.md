# Operator-session revocation fix

Scope: `src/lib/auth/authenticate.ts` and `tests/auth/operator-session-revocation.test.ts` only. No DB/network writes, deployments, commits, or changes to other existing work.

## Behavior

- Legacy validators reject the presence of modern identity fields, including null/zero/incomplete claims and modern fields combined with `sessionScope: 'legacy'`.
- Explicit legacy scope without modern markers remains compatible. Current PIN-issued legacy credentials and legacy session-version rotation remain supported.
- Modern admin/staff authentication checks payload role, scope, division and optional branch slug before accepting the operator-session result.
- A rejected staff token cannot authenticate through legacy validation; a separately valid admin credential may still authorize that staff endpoint.

## RED / GREEN evidence

Command (app directory): `pnpm exec tsx --test --test-reporter=tap tests/auth/operator-session-revocation.test.ts`.

- Before production edit: **89 tests, 17 passed, 72 failed, exit 1**. Expected 401 was absent because rejected modern tokens were authenticated. Independent admin fallback tests instead returned the revoked staff identity.
- After production edit: **89 tests, 89 passed, 0 failed, exit 0**.
- Additional run: `pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --test --test-reporter=tap tests/auth/operator-session-revocation.test.ts tests/payments/batch-free-registration.test.ts tests/bulk/*.test.ts` — **124 passed, 0 failed, exit 0**.
- `git diff --check -- src/lib/auth/authenticate.ts` — exit 0 (Git emitted its configured LF-to-CRLF notice, not a whitespace error).

Tests execute real authentication functions, NextRequest, JWT signing/verification, verified-header parsing and origin checks. Only operator-session persistence validation, legacy-version DB lookup and request-scoped tenant resolution are mocked. This proves request authentication handles validator rejection; it does not independently prove database revocation/cache behavior or a deployed production environment.

## Type checking

`pnpm exec tsc --noEmit --incremental false` initially identified and then cleared two test fixture tenant-brand typing errors. The subsequent run contained no errors in the owned authentication files, but exited 1 on concurrent changes outside this slice: missing `requestId` in `src/app/api/payments/refunds/route.ts` and missing `EnrollmentMemoDialog` import in `tests/admin/enrollment-memo-dialog.test.tsx`. Root agent must rerun the global type check after those slices finish.
