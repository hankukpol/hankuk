# Settlement confirmation safety and historical filters

Date: 2026-09-05. Owner: integrity_pagination_fix subagent.

## Implemented boundary

- Actual API route: `src/app/api/settlements/confirmation/route.ts` (not under `/api/payments`).
- The existing POST now requires the manifest of the rows actually displayed by the daily page. Client-supplied summaries are ignored; the service computes the current summary from fresh detail data.
- Unconfirmed or canceled payment/refund confirmations, including wrong-date confirmation records, prevent daily confirmation with a 409 and pending count. Refunds are checked on their own refund date; voided payment rows do not create pending obligations.
- The service compares the displayed manifest against freshly fetched data before any write. The SQL RPC compares the manifest and summary again under write-blocking table locks before it changes anything.
- Exact manifest fields include sorted payment identity, amounts/method/status/category/dates/updated version, associated items, target-day refunds, and target-day transaction confirmation records. Timestamps normalize to UTC while retaining all six PostgreSQL fractional digits. Equal totals alone cannot conceal replaced transactions or changed items.
- One RPC commits the daily row and the prior/new confirmation history. Display-name lookup is best effort after commit and cannot turn a successful confirmation into a failure response.
- Existing records keep their outward fields; `manifest_json` is an additive internal current-row column. GET adds `currentManifest` and `pendingEntryCount`. Legacy daily rows without a manifest need a first re-confirmation before being treated as version-checked.
- Daily confirmation is disabled on pending displayed entries, failed/loading detail reads, and changed query dates/filters until the current conditions have been loaded. The actual displayed raw rows, not a separate confirmation-status response, produce the submitted manifest.
- Daily and monthly filters fetch all course statuses and label archived courses `이름 (보관)`. Existing totals and rendering tokens are unchanged. No template flag exists: copies and actual archived courses currently share `status=archived`, so no speculative template exclusion was introduced.

## SQL contract and operational tradeoff

Migration: `supabase/migrations/20260905075836_settlement_confirmation_safety.sql`.
Created using `pnpm exec supabase migration new settlement_confirmation_safety`; this subagent did not apply it.

```sql
class_pass.confirm_daily_settlement_atomic(
  p_settlement_date date,
  p_division text,
  p_actor_staff_id bigint,
  p_expected_manifest jsonb,
  p_snapshot_json jsonb,
  p_memo text default null
) returns jsonb
```

The function is security-invoker and callable only by service_role. It acquires SHARE ROW EXCLUSIVE locks on payments, refunds, payment items, and entry confirmations, in that order. This blocks phantom INSERTs as well as edits during the short confirmation transaction; normal reads remain available. It intentionally trades a short application-wide financial-write pause for a narrow change that does not require every existing writer to adopt a new advisory-lock protocol. Function settings request `lock_timeout=2s` and `statement_timeout=10s`; SQL and concurrent-session execution must verify the effective runtime boundary.

Current course names/status and enrollment metadata are not part of the manifest and are not table-locked. Course division is read as the existing tenant boundary; the application does not expose course-division reassignment. Do not claim this snapshot guards arbitrary out-of-band tenant reassignments.

History has SELECT/INSERT only for service_role, no public access, and a trigger rejecting UPDATE/DELETE. A history INSERT failure rolls back the daily upsert. Parent owns local SQL application and final validation.

## TDD and verification evidence

- Main service/API tests: initial 6/6 RED against the old implementation (stale display accepted, pending accepted, upsert rather than RPC, postcommit name failure, transaction conflict ignored, date-only POST accepted), then 6/6 GREEN.
- Actual React daily/monthly pages run in JSDOM with their real report builder, tenant provider, state and handlers. HTTP responses are controlled at the fetch boundary. First corrected-harness UI run had four expected RED assertions (archived absent, absent displayed manifest, pending button enabled); the separate changed-date test also went RED before the scope guard.
- Final dedicated suite: 17/17 GREEN, including microsecond changes, same-total replacement, refund-date behavior, canceled/wrong-date entry state, voided records, and route rejection/forwarding. No source-text assertions.
- Latest full payment-suite run: 82 tests / 7 suites, 82 PASS, 0 FAIL, exit 0. The working tree is shared and other payment tests changed during execution; this is the latest explicit summary, not an earlier dot-count snapshot.

Commands:

```powershell
pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --test --test-reporter spec tests/payments/settlement-confirmation-safety.test.ts
pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --test --test-reporter spec tests/payments/*.test.ts
```

`tests/payments/settlement-confirmation-safety.sql` is a rollback-only integration fixture for parent execution: pending payments/refunds, stale manifest, incorrect aggregate, fixed microsecond timestamps, successful exact totals, same-total item edits, prior/new reconfirmation history, append-only grants/trigger, and injected history failure atomic rollback. It uses real tables/RPC, not textual SQL assertions. This subagent has not run it.

Scoped `git diff --check` passed with only LF/CRLF advisory messages. A typecheck initially found one concurrently changing test fixture error outside this slice (`tests/admin/refund-safety.test.tsx:12`); parent was notified, and a final repeat is in progress at evidence creation.

## Follow-up / not claimed

- Parent must verify the migration and SQL fixture on local PostgreSQL, including concurrent insert/edit races, and perform final combined typecheck/build/browser QA.
- The course-list API itself still uses one list query and may cap options beyond 1000 courses; this lies in `class-pass-data.ts` outside this slice and was reported to parent.
- DESIGN.md was read completely. This slice changes functional request/state behavior and archived labels only; no style/token/layout redesign or superloopy changes occurred. JSDOM exercises UI behavior but is not real-browser visual QA.
- Full-payment policy is unchanged. No multi-role approval, new report UI, production operation, deployment, commit, or direct DB write was performed by this subagent.
