# Payment import operations fix — 2026-09-05

## Scope and ownership

- Changed `src/lib/payments/bulk-import.ts`.
- Added `src/lib/payments/import-registration.ts` with parent approval.
- Added `tests/payments/bulk-payment-import.test.ts`.
- Did not change `service.ts`, SQL, deployment configuration, or `.superloopy`.
- No real database writes, migrations applied, deploy, or commit performed by this worker.

## Implemented behavior

1. Normalize rows and group aliases by matched enrollment, exam number, or name/full phone. Identity disagreements fail the student group instead of selecting the first row.
2. Card 60,000 + cash 40,000 for one student remains two valid receipts. Existing enrollment receives one `createPaymentBundle` request with a shared checkout group.
3. File duplicates use the normalized transaction tuple: timestamp, amount, method, category, applicable card/depositor details, and memo. A duplicate/error in any row holds the whole student's group.
4. Existing records use the same available persisted tuple and are explicitly labelled possible duplicates requiring original-transaction review. The lookup is paginated beyond 1,000 records; distinct card/cash records do not conflict simply because date and amount match.
5. Missing enrollment uses the existing `create_enrollment_batch_atomic` RPC with a single registration and all payment rows. Billing is synthesized from tuition rows only; textbook/etc. are excluded from the tuition payable amount.
6. Current full-collection policy is preserved. Existing-enrollment tuition must satisfy real `createPaymentBundle` remaining-payable checks. No deposit/partial-collection flag was introduced.
7. Textbook-only receipts do not silently create a new enrollment with invented zero tuition. New free enrollment requires a single tuition/free/zero row and an explicit, non-point exemption reason in memo.
8. Date-only input is normalized to Korean midnight before the RPC. Invalid dates fail preview and hold the group.
9. Cancelled enrollment is explicitly rejected in preview.
10. Existing student master/auth settings are reused unchanged. Only new student masters are prepared with birth-date authentication. If the enrollment RPC fails, no count-then-delete cleanup is attempted; the row message explains that student basic information may remain and instructs original-record lookup before retry.

## TDD evidence

All tests execute real `previewPaymentImportRows`, `runPaymentImport`, payment service, and student-profile functions. Only the DB transport and unavailable Next cache runtime are stubbed. No payment service/import function is replaced.

| Stage | Observed result |
| --- | --- |
| Initial reproductions | 5/5 failed: second split row was duplicate, a duplicate student's first row still saved, bundle was not used |
| Initial grouping/bundle fix | 5/5 passed |
| Registration/date/new billing tests | 6 failures observed before helper/date/billing implementation |
| Registration/date/new billing implementation | 14/14 passed |
| Timestamp/profile preservation/cancellation tests | 4 failures observed: raw date-only RPC value, existing auth changed, new profile deleted, cancelled preview accepted |
| Boundary correction | 17/17 passed |
| Pagination regression | Failed with `duplicateCount` 0 instead of 1 for record 1,001, then passed after pagination |
| Checkout-group regression | Failed with `p_checkout_group_id` null, then passed after shared checkout ID |
| Final focused + settlement regression run | 31/31 passed (20 import + 11 settlement tests) |

Final command:

```powershell
pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --test tests/payments/bulk-payment-import.test.ts tests/payments/course-settlement.test.ts
```

Result: `tests 31`, `pass 31`, `fail 0`, exit 0.

`git diff --check -- src/lib/payments/bulk-import.ts src/lib/payments/import-registration.ts tests/payments/bulk-payment-import.test.ts` exited 0 (only Git's LF/CRLF informational warning).

`pnpm exec tsc --noEmit --incremental false` reported no errors in owned files, but the concurrent workspace check was not green:

- `src/components/admin/student-history-panel.tsx(160,11)`: new `cancelled` key missing from grouped record.
- `src/lib/payments/integrity.ts(202,5)`: `closed` not yet in `BillingStatus`.

These belong to parent/concurrent integration, not this worker's edits; re-run the full typecheck after integration.

## Required integration and limits

- Parent must provide and verify the planned migration permitting 1..8 registrations in `create_enrollment_batch_atomic`. The current historical SQL otherwise requires 2..8. HTTP batch registration's existing 2..8 contract need not change.
- DB mocks prove emitted atomic-boundary payloads and importer behavior, not actual PostgreSQL transaction rollback or production deployment. The migration/RPC must be exercised separately in an approved local DB test.
- Student master preparation is not in the enrollment/financial transaction. A new standalone profile may remain after failure; preserving it avoids a destructive cleanup race. Existing master/auth fields are left unchanged.
- Source transactions have no stable external transaction ID. The tuple conflict is a conservative review gate, not cross-import or concurrent-import idempotency. Omitting a receipt timestamp also prevents a stable cross-import timestamp key.
- Preview validates row structure, identity, exact duplicate conflicts, and new-registration billing rules. Existing financial balance is rechecked by the real payment service at execution; dry-run is not a reservation or a guarantee against concurrent balance changes.
- Atomicity is per student's enrollment/financial bundle, not the entire upload file. Other valid student groups may proceed when one group fails.
- Post-commit cache invalidation failure in the new registration helper is logged but does not turn committed enrollment/payments into a false failed import. A malformed successful RPC response is reported as uncertain with an instruction to inspect records before re-upload; no rollback/delete is guessed.
