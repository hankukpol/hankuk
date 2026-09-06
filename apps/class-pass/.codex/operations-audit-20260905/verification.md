# Operations audit verification — 2026-09-05

Scope: current local class-pass working tree, not production. No application-source edits, deployment, or real payment/refund/enrollment/settlement writes were performed by this audit. Existing unrelated and concurrent changes were preserved.

## Commands and final results

Run from `D:\코딩\학원 포탈 프로그램\hankuk\apps\class-pass`.

```powershell
node node_modules/tsx/dist/cli.mjs --require ./tests/_setup/stub-server-only.cjs --test --test-reporter=spec tests/payments/*.test.ts tests/bulk/*.test.ts tests/enrollments/*.test.ts tests/attendance/*.test.ts tests/distribution/*.test.ts tests/courses/*.test.ts tests/designated-seat/*.test.ts
```

Exit 0. Tests 85; pass 85; fail 0; skipped 0.

```powershell
node node_modules/tsx/dist/cli.mjs --require ./tests/_setup/stub-server-only.cjs --require ./tests/_setup/react-jsx.cjs --test --test-reporter=spec tests/admin/*.test.ts tests/admin/*.test.tsx
```

Exit 0. Final run: tests 52; pass 52; fail 0; skipped 0. Earlier run had 50 tests; the workspace changed concurrently. Reduced-motion warnings were emitted, without test failures.

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Exit 0, no diagnostics. This is not a production build.

```powershell
node .codex/operations-audit-20260905/reproduce.cjs
```

Exit 0. Final output:

```text
REPRO auth: revoked admin session accepted when legacy version=1
REPRO auth: revoked staff session accepted when legacy version=1
CONTROL auth: legacy version=2 rejects the same revoked staff session
REPRO cancellation: 100000 paid - 70000 refunded; retained 30000 blocks course cancellation (409), enrollment remains active
REPRO refund: caller receives failure after committed 10000 refund; the refund remains in the ledger
REPRO retry: retrying the same 10000 refund produces total 20000 in two ledger records
REPRO edit: rejected item-total mismatch still leaves payment amount=200000, items=100000, audit events=0
REPRO import: valid mixed payment split into card 60000 + cash 40000; second row rejected as duplicate student
Audit reproductions complete. All persistence was in memory; no real records were modified.
```

The script executes real application functions with in-memory substitutes for database, auth payload readers/session validation, and cache invalidation. The refund RPC substitute models a successful committed refund followed by an injected read failure; it does not execute PostgreSQL. Authentication checks start after token verification and test rejection fallback, not JWT cryptography. Success means the adverse behavior was reproduced, not fixed.

## Read-only browser observations

Environment: existing localhost:3002 preview and synthetic local test data. UI navigation used the in-app browser. No submit/save/confirm actions were performed for payments, refunds, enrollment mutations, or settlement confirmations.

1. Dashboard and course roster opened. The roster exposes enrollment state; receivable amount and payment-state columns were not visible. Name opens student history; the detail action opens the payment drawer.
2. Opening refund from a 30,000 KRW bank-transfer payment preselected three same-enrollment/category payments. Remaining refund amounts: bank transfer 30,000; card 40,000; cash 30,000. The proposed refund total was 100,000. The modal was inspected and dismissed without saving.
3. Daily settlement at `/police/dashboard/settlements/daily?date=2026-05-11` displayed 4,445,000 collected, 820,000 refunded, 3,625,000 net, 62 payment rows, 16 refund rows, and 42 payers. These are local fixture amounts, not production revenue.
4. On that date, multiple transaction-level confirmation buttons remained pending while the day-level confirmation button was enabled. No confirmation button was activated.

No claim is made that every mobile breakpoint, student device, camera flow, production financial integration, or concurrent-write scenario was exercised.
