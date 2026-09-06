# Payment integrity pagination and lifecycle evidence

Date: 2026-09-05
Owner: integrity_pagination_fix subagent
Scope: `src/lib/payments/integrity.ts`, `src/lib/payments/read-pages.ts`, `tests/payments/integrity-pagination.test.ts`.

## Reproduced defect and change

- Local Supabase configuration has `max_rows = 1000` in both app and root configurations.
- The original integrity consumer issued one enrollment `limit(maxEnrollments + 1)` with a default cap of 2000. A capped response silently contained only 1000 rows, and `truncated` was false.
- Added a payment read helper that requests inclusive ranges of at most 1000 rows, advances by the actual returned length (including servers with a lower cap), stops on an empty page or the requested maximum, and propagates every page error.
- All integrity reads now paginate with a unique `id` ordering key: courses, enrollments, billing, payments, refunds. Every `in` ID list is chunked to at most 200 IDs.
- Enrollment ordering remains newest `created_at` first, with descending `id` as the tie-breaker. Course chunks contribute their newest `max + 1` candidates, which are merged, globally sorted, and trimmed to the same cap plus overflow probe. The default 2000 and hard maximum 5000 remain unchanged.
- The existing distribution helper was inspected but left untouched. A payment-local helper was used because this consumer also requires a bounded max-plus-one read.

## Test method and TDD evidence

The tests import the real `checkPaymentIntegrity`, real server-client factory, and installed Supabase query builder. Only `globalThis.fetch` is replaced with an in-memory PostgREST-shaped transport using a reserved `.invalid` host and synthetic fixture data. No DB writes or production reads occur. Assertions cover consumer totals, issue IDs and amounts, truncation, tenant/course filtering, emitted GET query ranges and ordering, and propagated errors; there are no source-text assertions.

1. Read the TDD skill and `writing-good-tests.md` before writing tests.
2. Initial RED run: 19 tests, 5 passed / 14 failed, exit 1. Examples: actual 1000 vs expected 1001/2000; `truncated=false` vs expected true; missing rejection for the second enrollment page; course and dependent totals silently capped at 1000.
3. After paging implementation: 19/19 passed, exit 0.
4. Expanded regression checks: 24/24 passed, covering errors on both first and second pages of every queried table and bounded requests.
5. Parent-authorized cancelled/closed lifecycle fixtures initially failed 4/4: the original consumer reported spurious `partial`, `unpaid`, or `exempt` billing status mismatches. After the lifecycle adjustment, final dedicated suite passed 28/28, exit 0.

Final dedicated command:

```powershell
pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --test tests/payments/integrity-pagination.test.ts
```

Coverage includes enrollment counts 0, 1001, 2000, 2001, and 5001; custom caps 0, 3, 1000, 2001, 9000; server caps 1000 and 400; 1001 courses across six ID chunks; 1001 billing/payment/refund rows within a single relation-ID chunk; division and courseId isolation; first/second-page failures on all five tables.

## Cancelled/closed integration requested by parent

- A cancelled enrollment expects a closed billing obligation regardless of retained paid amount or original payable amount.
- Terminated exempt enrollments do not require a currently active free-payment row.
- Billing calculation mismatches and incorrect billing/payment course IDs remain checked. Existing payment/refund totals are preserved.
- No partial-payment acceptance policy was introduced. Existing active/refunded calculation paths were not broadened.
- This change depends on the parent's pending `EnrollmentStatus`/`BillingStatus` and DB lifecycle integration. No type casts were added to bypass that integration.

## Verification boundaries

- Scoped `git diff --check` passed (only the repository's LF/CRLF advisory appeared).
- Before concurrent import-test expansion, `tests/payments/*.test.ts` passed 41/41. Latest full-suite snapshot after expansion: 53/59 passed; six failures are in concurrently authored `bulk-payment-import.test.ts`, while all 28 integrity tests passed. Parent was notified. This is not a claim that the final combined branch passes.
- `pnpm exec tsc --noEmit --incremental false` was attempted before lifecycle integration and failed outside the owned files: refund route missing `requestId`, missing EnrollmentMemoDialog test import, and branded TenantType values in auth tests. Parent was notified. Parent must rerun after concurrent work and cancelled/closed type integration are complete.
- No build server, production DB request, schema change, commit, or distribution-helper modification was performed by this subagent.
- There are no remaining unpaginated reads in this integrity function. Broader `service.ts` billing snapshot reads belong to the parent.
- Deterministic offset pagination is not a transaction snapshot: concurrent inserts/deletes or changes to enrollment ordering during a multi-request audit can still change its view. This change addresses silent row-cap loss, not database snapshot isolation.

Supabase reference checked: [range uses zero-based inclusive bounds and respects ordering](https://supabase.com/docs/reference/javascript/using-modifiers-range). The current changelog was also fetched and scanned for relevant breaking changes.
