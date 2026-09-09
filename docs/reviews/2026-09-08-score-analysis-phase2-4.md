# Score analysis — Phases 2–4

Worktree: `D:\Codex\worktrees\study-hall-score-phase1`
Branch: `codex/study-hall-score-phase1`
Release policy: local commits only; no production migration, deployment tag, push or deployment.

## Phase 2 — complete

Regular analysis shares its assembler between mock and DB loaders, uses anonymous external histograms, and masks student-view identity and all competitors on the server. Historical item points determine full marks. Untaken alternate subjects are excluded. The first imported exam explicitly explains why previous-exam comparisons are unavailable.

The reference algorithm's fixed descriptive bands follow handoff §5.1. Configurable decline and question difficulty thresholds come from division settings. No prediction zones or operational warning integrations exist.

Validation: typecheck 0, lint 0, unit 459/459, integration PASS (`.local/test-92de0cad/integration.log`). Tests cover mock/DB equality, scope, student masking and authorization. Browser cohort and personal drawer at 390/768/1280: nested borders 0, Pretendard only, offScale [], no document overflow. Anonymous regular fixture: 5 internal participants, 12 external, 250 full marks; first-exam comparison cells display dashes and an explanation.

## Phase 3 — complete

Subject-specific morning analysis uses attended-session windows, same-date peer comparisons and fresh configurable thresholds. Low attendance suppresses decline judgment. Historical alternate choice evidence is scoped to tenant/type and excludes future records; no unchosen sibling is counted as absence. Cumulative comparisons use paired weeks only. Students receive full grading and external ranks with server-side identity masking. Cohort, student, topic, weekly rank and empty-state views are connected.

Validation: typecheck 0, lint 0, 510/510 tests, integration PASS (`.local/test-1f7c1aec/integration.log`). Reviewer reproduced and rechecked two corrected regressions: graded-count rank denominator and prior-window alternate choice. Settings 20→15→20 changes class-gap detection immediately. Browser cohort and personal drawer at 390/768/1280: nested borders 0, Pretendard only, offScale [], no document overflow. One imported session shows explicit insufficient-sample explanations.

## Phase 4 — complete

The reporting page now downloads administrator-only regular and morning analysis workbooks. Both contain three sheets. Regular exports include ranking, subject averages and wrong-answer TOP20; the screen retains TOP10. Morning exports use student/subject summaries, date/subject averages and topic averages without per-student service calls. The existing report service is untouched; an owned export service and guarded route provide the workbook. Date-backed legacy score labels in the report UI now display a date instead of an eight-digit round.

Validation: typecheck 0, lint 0, 540/540 tests. Initial full integration passed (`.local/test-60d3b475/integration.log`), including actual downloaded workbook reopening, three sheets, administrator names and the TOP20 row count. Final integration PASS (`.local/test-f8684d74/integration.log`) includes the last display-only date-label correction. Workbook unit tests also preserve leading-zero identifiers, literal formula-like text, numeric zeros and blank cells.

Browser: regular and morning download controls at 390/768/1280 have nested borders 0, Pretendard only, offScale [], and no document overflow. Both buttons report successful download. Student morning and regular pages were checked at the same widths with their entire grading tables expanded (20 and 100 taken items). The first-session report explains missing trends and previous comparisons.

## Local handoff

All commits are on the isolated `codex/study-hall-score-phase1` branch; the concurrently edited original checkout has not been merged or overwritten. Local preview uses port 17093 with mock data and unreachable database credentials. It is not production persistence evidence.

Before the first production import, use the administrator settings checklist in the Phase 1 report: correct regular points, configure the alternate group, consolidate the morning type, and align five-digit student numbers. These operating settings are not embedded in migrations.

Concurrency boundary: attendance, interview, warnings, chat, dashboards and the concurrently modified report service are not opened or edited. Export logic will use a separate owned service. ReportsDashboard wiring is permitted only if it remains untouched by the other session.

## Verification limits

Morning original XLS files remain unavailable at the documented paths. Synthetic fixtures do not establish real-source morning compatibility. Production migration and persistence remain unverified.



## Individual regular history follow-up (2026-09-09)

Regular and morning analysis remain separate; no pass prediction is implemented. The regular cohort view now provides a student selector. Individual reports show six calendar months ending on the selected exam date, with totals, subjects, internal/external ranks, external top percentages and explicit missing-month rows. Historical records remain stored; comparisons exclude future and older dates. Mock and DB paths share the scoped session selector.

Validation: typecheck 0, lint 0, 542/542 tests; integration PASS at `.local/test-c5343499/integration.log`. Added boundary, tenant, zero-score, record-preservation and missing-month rendering coverage. Browser confirmed six rows for March-August 2026 and 6/6 covered months for the selected demo student. At 390/768/1280 widths, document overflow is absent; wide tables scroll within the report.

Local-only demo was regenerated after tests: 12 synthetic students, six monthly regular sessions and 48 morning subject sessions (54 total). The isolated mock preview remains on port 17093 with the individual regular report open. No production migration, deployment or original-checkout merge was performed.
## A4 individual report output (2026-09-09)

Regular and morning personal reports now offer A4 print/PDF preview in a separate local window. Only the selected report is cloned; all details are expanded, charts are serialized with computed colors and rendered as scalable SVG images, and print waits for image/font readiness. A4 portrait, 12mm margins, repeated table headers and intact rows/charts support multiple pages. No backend or permission changes.

Validation: TypeScript and lint passed; existing 542 tests passed. Chromium generated actual PDFs from both report buttons: regular 8 pages; morning 89 pages with all 40 exams and full grading tables included. All pages have A4 media boxes and extracted text stays inside content bounds. Screenshots inspected first pages and regular charts. Physical printer output is not verified. Local PDF samples are under apps/study-hall/.local; no production deployment.
