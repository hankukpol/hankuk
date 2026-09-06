# Materials workflow fixes — local only

Approved scope: S1, C1–C4, D1–D6 in `_workspace/materials-review-20260905/04_review_summary.md`.
Preserve concurrent edits, full tuition collection, tenant projects and production data.
No deployment, commit, push, new staff permissions, QR assignment feature or cancellation-audit redesign.

1. Auth: signed cookies/sessions, API middleware coverage, canonical IDs; defensive regression tests.
2. Staff: immutable student selection, session guards, stale-response rejection, explicit quick confirmation.
3. Database: missing local subject gate, serialized receipt/unassignment/deletion, privileges and pagination.
4. Admin: current-context matrix loading, write guards, authoritative ambiguous-response recovery.
5. API: lower-cap pagination and committed results survive cache failure.
6. Verify: RED/GREEN, isolated PostgreSQL concurrency, fresh suite/build, browser and independent review.

Owners: auth worker; staff worker; DB worker; root owns admin matrix and distribution API/service.
Default Superloopy state concerns a July badge change and is not evidence for this task.
