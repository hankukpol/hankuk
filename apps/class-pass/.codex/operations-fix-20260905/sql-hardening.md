# Financial SQL hardening — 2026-09-05

## Scope and local application

- Modified `20260905074256_payment_operations_safety.sql`: explicit internal RPC ACLs, enrollment lock in the payment INSERT guard, billing-aware full-tuition/exemption policy for financial payment edits, stable SQLSTATEs.
- CLI-created `20260905081334_payment_correction_enrollment_lock_order.sql`: preserve the existing correction transaction, explicitly lock enrollment before payment, revoke PUBLIC/anon/authenticated and grant service_role.
- Applied `.codex/operations-fix-20260905/sql-hardening-local.sql` once to **local Docker `supabase_db_class-pass` only**. It includes the correction migration. Do not reapply the original main migration to this existing local database.
- No production connection, deployment, commit, profile/auth mutation, or unrelated source edits.

## Error contract

| SQLSTATE | Meaning |
| --- | --- |
| CP001 | Payment financial edit conflicts with full agreed tuition or exemption; use registration/billing screen. |
| CP002 | Changed refund request body, stale expected timestamp, or editing a voided payment. |
| CP003 | New payment/reactivation after enrollment termination. |
| CP004 | Amount/category/free-state edit after refund, or amount below refunded total. |
| P0002 | Scoped enrollment/payment not found. |
| 22023 | Invalid request/patch/item/payment structure or value. |

Nonfinancial memo/instrument edits remain allowed after refund. Ordinary amount/category/free-state edits never change billing to manufacture an accepted partial receipt. The existing refund-and-repayment correction UI excludes free replacement payments and requires a positive refundable amount; its existing explicit billing correction behavior is preserved.

## Verification

TDD RED on the already-applied old local SQL: amount 100000 → 60000 with matching item 60000 unexpectedly succeeded; `expect_state(..., 'CP001')` failed. No policy implementation was applied before that run.

GREEN command:

```powershell
Get-Content -Raw -LiteralPath 'tests/payments/financial-write-safety.sql' | docker exec -i supabase_db_class-pass psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f -
```

Exit 0; all five PASS groups:

- Full tuition edits, tuition/category/free transitions, exemption, refund-history edit restrictions, metadata edits, legacy/new function ACLs including PUBLIC, tenant scope, stale timestamp.
- Refund replay and changed body, partial termination, closed billing, no auto-reactivation.
- Actual single-course batch RPC with 60000 card + 40000 cash, one enrollment, full billing, shared checkout UUID, exactly two atomic payment-created audits; full refund replay at zero balance; malformed/changed-body checks.
- Audit-trigger failure injection asserts the **exact** `injected audit write failure` message and unchanged financial snapshot/request ledger.
- Batch audit-trigger failure rolls back enrollment/billing/payments/items/audits while preserving the pre-existing student profile. All SQL fixtures and test trigger are rolled back.

```powershell
node --test tests/payments/financial-write-concurrency.test.cjs
```

3/3 PASS using separate PostgreSQL sessions plus a read-only lock observer:

1. Termination holds enrollment lock; waiting payment INSERT rechecks committed cancelled status and fails with CP003, not timeout/deadlock.
2. Payment holds enrollment lock; termination waits, then closes billing with exactly one lifecycle event.
3. Correction waits for enrollment; a third connection can still NOWAIT-lock the original payment, proving correction has not acquired payment first; correction then succeeds.

The concurrency harness uses Node child_process + local Docker psql because node-pg is unavailable. It reads no environment/DSN and names only the local container. Committed isolated fixtures are removed using exact IDs plus generated course slug in finally; no user data is selected for deletion.
