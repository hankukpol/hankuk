# Refund and manual termination UI safety

## Owned files

- `src/components/payments/EnrollmentPaymentDrawer.tsx`
- `src/components/payments/RefundModal.tsx`
- `tests/admin/refund-safety.test.tsx`
- `tests/admin/refund-drawer-safety.test.tsx`
- `tests/admin/refund-test-fixtures.ts`

Only narrow changes were made in the existing drawer/modal. Concurrent administrator layout, dialog accessibility and error-display changes were retained. Full-collection policy is unchanged; no guessed roster receivable DTO was added.

## Behavior

- A successful refund requires a matching request ID, explicit matching enrollment-ended flag and committed payment/refund snapshots. Null JSON, invalid JSON, missing or stale snapshot, mismatched ID and interrupted HTTP response keep the modal and original request ID open for retry.
- Valid committed payment snapshots merge immediately before any refresh. A failed GET keeps the corrected refundable balance, and failed GET/parent refresh reports that saving completed but the screen refresh failed.
- Separate `수강 종료` action opens the existing confirmation dialog with required trimmed reason and an explanation that retained tuition and payment/refund records remain unchanged. It calls the dedicated end endpoint, including after a partial refund.
- Confirmed termination is remembered locally even when refresh fails. Additional payment and refund/recollection correction are disabled; both correction layouts explain why in their title. Existing refund/void policy is unchanged.
- While payment history loads, totals display `확인 중`; write actions remain unavailable. Cancelled enrollments stay blocked after loading.
- The same-checkout selector label is shortened to `동일 결제 모두 선택`, preserving its selection logic.
- Test fixtures supply every required Enrollment, EnrollmentPayment and EnrollmentRefund field instead of asserting an incomplete object to a production type.

## TDD and verification

All worker tests used real components and native DOM interactions with HTTP mocked. No operating database/network writes, deployments or commits were performed by this worker.

Initial RED command:

`pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --require ./tests/_setup/react-jsx.cjs --test --test-reporter=tap tests/admin/refund-drawer-safety.test.tsx`

Before production edits: **6 tests, 1 passed, 5 failed**. Failures were the three invalid successful-response cases closing the modal, stale refundable amount `30000` instead of `20000`, and missing manual end action. Existing network-failure ID reuse passed.

After root browser QA identified the still-enabled correction action, the `already cancelled` regression was expanded and run before its fix:

`pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --require ./tests/_setup/react-jsx.cjs --test --test-name-pattern="already cancelled" tests/admin/refund-drawer-safety.test.tsx`

RED: **1 failed**, `ended enrollments cannot open a refund-and-recollection correction`. Both desktop/mobile correction guards and explanatory titles were then added.

Final GREEN:

`pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --require ./tests/_setup/react-jsx.cjs --test --test-reporter=tap tests/admin/refund-drawer-safety.test.tsx tests/admin/refund-safety.test.tsx`

**14 passed, 0 failed, exit 0**. Includes six ambiguous-response retry variants, successful snapshot retention after GET failure, loading totals/actions, cancelled actions, unconfirmed manual-end preservation, successful manual end with GET and parent refresh failure, clicked-only refund, checkout-group selection and explicit termination choice.

- `pnpm exec tsc --noEmit --pretty false`: exit 0, no diagnostics.
- Scoped `git diff --check`: exit 0, only existing LF-to-CRLF notices.

Root owns actual browser and database-backed QA evidence. Root reported its local fixture course 30/enrollment 128 passed partial refund, keep-active, manual end, `cancelled`/`closed` persistence with preserved payable amount, one refund event plus one end event, and disabled additional-payment action. This worker did not independently produce browser screenshots or query the database.

## Final reviewer follow-up: stale read and student-switch isolation

The earlier test that reopened a refund after GET failure was deliberately replaced: a committed idempotency response may be older than another transaction, so it is retained for display only and must not authorize another write.

- Failed latest reads now clear `loadedEnrollmentId`, locking every new payment/refund/correction/void/end action. Separate snapshot identity keeps the committed amounts visible. Existing error notice tells the user to refresh; no new retry control was introduced.
- Opening/closing or selecting a different enrollment clears payment cards and snapshot identity. Refreshing the same enrollment does not clear the committed snapshot.
- Read generation guards prevent a late success, late failure or late `finally` from an earlier request changing the current student's payments, readiness, loading or error.
- All writing handlers check readiness and current enrollment/course identity; void buttons in both layouts and the void confirmation now have the same readiness guard.
- Replaced one undeclared raw warning background `bg-[#fffbeb]` with existing `bg-amber-50`, per root's design-compliance finding.

RED command:

`pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --require ./tests/_setup/react-jsx.cjs --test --test-timeout=15000 --test-name-pattern="successful refund keeps|switching students|late previous-student" tests/admin/refund-drawer-safety.test.tsx`

**4 failed before production edits:** cached snapshot still allowed new writes; student A payment cards remained under student B after B's failed read; late A success replaced B's readiness/data; late A failure created an error for B. Initial diagnostic runs encountered expensive assertion serialization of a live React DOM element; changing absence assertions to booleans produced the four specific failures above.

GREEN: the full two-file UI command above now reports **17 passed, 0 failed, exit 0**. Separate `pnpm exec tsc --noEmit --pretty false` and scoped `git diff --check` both exit 0. Production edits are complete; root owns final build/browser/design-compliance rechecks.
