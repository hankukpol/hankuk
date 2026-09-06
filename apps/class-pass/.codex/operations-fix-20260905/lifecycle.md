# Separate enrollment termination lifecycle

## Changes

- Added `cancelled` to enrollment status and optional `ended_at` / `ended_reason` fields. Existing `getEnrollmentLifecycleStatus` already returns non-active statuses without reclassification and needed no implementation change.
- Added `POST /api/enrollments/:id/end`, gated by administrator authentication and `admin_student_management_enabled`. Validates safe positive ID and trimmed 1–1000-character reason. Calls only `end_enrollment_atomic(p_division,p_enrollment_id,p_reason,p_actor_staff_id)`, maps P0002/22023/P0001 to 404/400/409, and preserves success if cache invalidation fails after commit.
- Added cancelled filtering/counting to `listCourseEnrollmentsPaged` and enrollment GET, preserving active/suspended isolation.
- Roster uses a separate `수강종료` filter/count/badge on desktop and mobile; CSV status label distinguishes termination from refund. Existing styles and concurrent row-action/memo work were preserved.
- Student history retains a separate cancelled group and optional termination date/reason, ahead of stale suspension/archived labels. Enrollment select uses `*` so optional termination columns need not exist before the migration; response still explicitly shapes history fields.
- Single registration rejects cancelled duplicates with a recovery message. Bulk roster import returns an actionable row error before enrollment writes. Existing general PATCH already prevents direct status changes and was left unchanged.
- Extended scope: dashboard KPIs exclude cancelled enrollments from both active and suspended counts. Legacy enrollment refund endpoint rejects cancelled status and uses a conditional write to avoid overwriting a concurrent cancellation. StudentRowActions changed only the visible `상세` label to `수납·환불`; its existing click-handler test was updated, preserving external concurrent edits.

## TDD evidence

All commands ran in `apps/class-pass`, without DB/network writes.

- `pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --require ./tests/_setup/react-jsx.cjs --test --test-reporter=tap tests/enrollments/end-enrollment-route.test.ts tests/admin/cancelled-enrollment-status.test.tsx`: initial **11 failed, 0 passed** (new endpoint missing; cancelled roster shown as refund and omitted from total).
- `pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --test --test-reporter=tap tests/enrollments/cancelled-enrollment-read-model.test.ts`: before data/history edits **1 passed, 2 failed** (cancelled filter returned active row; history classified cancellation as suspension).
- Additional history component test caught missing cancelled group with `Cannot read properties of undefined (reading 'push')`; passed after adding the group. Test-only browser globals were then completed for real Next Link rendering in JSDOM.
- `pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --test --test-reporter=tap tests/enrollments/cancelled-reregistration.test.ts`: before guard edits **2 failed** (single route returned 201 instead of 409; bulk imported 1 instead of 0), after edits **2 passed**.
- Final combined command: `pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --require ./tests/_setup/react-jsx.cjs --test --test-reporter=tap tests/auth/operator-session-revocation.test.ts tests/enrollments/end-enrollment-route.test.ts tests/enrollments/cancelled-enrollment-read-model.test.ts tests/enrollments/cancelled-reregistration.test.ts tests/admin/cancelled-enrollment-status.test.tsx tests/admin/table-ux.test.tsx tests/admin/student-row-actions.test.tsx tests/bulk/*.test.ts` — **140 passed, 0 failed, exit 0**.
- Scoped `git diff --check` — exit 0, only repository LF-to-CRLF notices.
- Extended test file `tests/enrollments/cancelled-dashboard-refund-guard.test.ts`: **3 failed before edit → 3 passed after** (inflated KPI, legacy overwrite, concurrent cancellation overwrite). Roster label test also failed before the label change and passed afterward.
- Final expanded combined command adds `tests/enrollments/cancelled-dashboard-refund-guard.test.ts` to the preceding combined run: **143 passed, 0 failed, exit 0**.

Tests execute actual route functions, real roster/history components, query/filter builders and production validation. External database/security/tenant services and HTTP history fetch are controlled doubles. SQL atomicity/idempotency belongs to the root agent's migration verification, not these mocked-RPC tests.

## Remaining integration verification

- `pnpm exec tsc --noEmit --incremental false` had no errors in this slice. At the final local run, other concurrent files still failed: `tests/admin/refund-safety.test.tsx` incomplete payment cast; `tests/payments/settlement-confirmation-safety.test.ts` missing expectedManifest/currentManifest implementation. Rerun after those finish.
- No real-browser screenshots produced by this worker. Root must verify the fifth status filter wraps at 390/768/1280 and cancelled history renders using actual local UI. Existing DESIGN.md administrator tokens and neutral badge recipe were retained; no new style tokens or `.superloopy` files were written.
- Parent owns SQL migration, drawer action/checkbox, payment service and atomic batch cancellation guards. Not deployed or applied to any database.
- Dashboard and legacy refund consumers were fixed in the extended scope. Seat page remains a flagged cosmetic gap: cancelled rows still receive the old `환불 수강생` caption at lines 733/788; no seat-render eligibility changes were made.
- Exact receivable amounts are not present in the existing roster DTO: Enrollment.billing contains payable amount and billing status, but no payment/refund net summary. Parent was offered an explicit batched payment-summary query rather than N+1 queries or an inferred amount. No guessed receivable numbers were added.
