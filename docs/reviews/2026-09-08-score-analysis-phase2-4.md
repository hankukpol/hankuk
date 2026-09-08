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

## Phase 4 — pending

Concurrency boundary: attendance, interview, warnings, chat, dashboards and the concurrently modified report service are not opened or edited. Export logic will use a separate owned service. ReportsDashboard wiring is permitted only if it remains untouched by the other session.

## Verification limits

Morning original XLS files remain unavailable at the documented paths. Synthetic fixtures do not establish real-source morning compatibility. Production migration and persistence remain unverified.

