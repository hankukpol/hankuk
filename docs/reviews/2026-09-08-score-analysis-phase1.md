# Study-hall score import — Phase 1 review

Date: 2026-09-08
Branch: `codex/study-hall-score-phase1`
Worktree: `D:\Codex\worktrees\study-hall-score-phase1`
Base: `ad46b67`

## Scope and delivery boundary

This report covers Phase 1, including the latest operating-interview correction. Delivery continues through Phase 4, with a separate validation record for the analysis screens.
The original checkout had concurrent changes in schema, mock storage, settings and morning score UI. All work is isolated in this registered worktree; the original checkout was not edited. Integrating this branch must reconcile those concurrent changes; do not overwrite original files wholesale.
Phase 1 was committed locally as `aeb901a` after the user explicitly requested continuing Phases 2–4. No production database connection, `db:deploy`, deployment tag or push was performed. The release choices were requested once; without production approval, subsequent phases remain local and use no deployment tag.

## Implemented

- Alternate-subject group setting, shared grouped maximum calculation (`computeFullScore` in `lib/exam-analysis-meta.ts`; existing callers use a compatibility re-export), and four session/item/participant/response models.
- Idempotent SQL migration restricted to `study_hall`, with tenant-scoped foreign keys, RLS and no browser read/write grants. Student model is unchanged. No division-specific data correction is embedded in SQL.
- Analysis settings normalization and validation, with all defaults in `lib/exam-analysis-settings.ts`; administrator settings UI round-trip. Updated handoff ranges are enforced in schema and inputs, with a one-line explanation for each field. Dedicated read/write helpers update only the analysis JSON so concurrent changes to other rules are retained.
- SheetJS 0.20.3 from the exact vendor CDN tarball. The repository's pnpm workspace installer was needed; package.json retains the URL and the existing pnpm lockfile is updated. No client bundle parser import was found.
- Header-based BIFF parser; answer-key-based subject mapping; score and published-total reconstruction; five-digit matching; optional-subject and absent handling; metadata validation; bounded uploads and fixed safe parser errors.
- Shared mock/DB assembler, preview and confirmation APIs, transactional replacement plus legacy ExamScore/MorningExamScore generation, explicit overwrite consent and tenant authorization.
- Import wizard under both existing exam tabs. Successful import opens the corresponding exam type, date and morning subject in the score manager. Regular entry and analysis use a date, with no round input.
- Import history and transactional deletion. Each matched participant stores the exact generated score ID and scalar snapshot. Deletion removes only unchanged importer-owned scores, checks the snapshot again in the database DELETE to protect concurrent edits, and reports preserved manual/ambiguous records. A morning topic is required on confirmation; regular exams do not require one.
- No external examinee names or DOB are retained by parser outputs. Invalid student IDs do not suppress external cohort/subject statistics. Only matched students' detailed responses are stored; filenames are stored as generic provenance labels.

## Date identity and legacy compatibility

ExamSession has no examRound column. Its tuple is `(examTypeId, examDate, primarySubjectId)`, with an additional enforced identityKey for null-safe uniqueness: regular `regular:<date>`, morning `morning:<subjectId>:<date>`. Different dates remain different exams. Import and delete serialize on the tenant's exam-type row. Student stays unchanged.

The pre-existing required integer ExamScore.examRound column is retained for compatibility with existing callers. New date-based entries encode YYYYMMDD into that existing column; they do not allocate or display a new exam round. Existing manual rows are read by date and keep their original storage key when edited. Analysis contracts omit that legacy field.

Morning analysis windows now use attended sessions: movingAverageSessions and trendWindowSessions. Legacy day-valued settings are ignored rather than reinterpreted as counts.

## Evidence

- Regular original pair, rechecked read-only: Score 320, Errata 320, Moon 120; malformed IDs 6. The actual assembler classifies the remaining 314 as **306 fully attended + 8 partial/absent**, with **0 score mismatches** at 2.5 points. This corrects the earlier report's unverified “309 complete valid identifiers” wording. The handoff's 309-person reference count is not the same as the current strict five-digit/answered-block classification. Across all Errata rows, 311 have three answered blocks; five of those have malformed identifiers. No pairing by source position was introduced to force the expected count.
- Errata/Moon order disagreement correctly maps the two 40-item subjects by answer keys. Grouped full score is **250**, with 100 scored items selected from 120 published item columns.
- Anonymized regular fixture: 12 examinees (6/4 alternate cohorts, one partial, one absent). Separate tests generate six invalid identifiers. Regeneration script produces new workbooks, not copies of originals.
- External aggregates retain all 320 total scores and now include subject/region histograms. Subject top-group averages use cohorts ranked by total score and exclude untaken alternate subjects. Blank/duplicate identifiers are not joined by position: ambiguous regional subject statistics are explicitly unavailable (two regions in the original sample), while their total-score statistics remain exact.
- **Morning originals were absent from the documented Desktop paths.** The requested paths were asked for. Morning tests use a clearly named synthetic fixture (8 examinees, 20 items, 10 padding columns, five padding rows, multiple answers). This is not original morning-file verification.
- Test categories include parser malformed inputs, conflicting mappings, no-answer score contradictions, all-cohort statistics, mock/DB parity and transaction rollback, cross-division access, overwrite, legacy-score persistence, client races and imported selection.
- Local HTTP flow: five students seeded with five-digit IDs; regular and synthetic morning preview/confirm/overwrite persist five legacy scores each. Assistant/foreign-division import denied. Student own score returns 200, another student's ID returns 403, student import returns 401.
- Real browser: regular fixture upload → 250-point preview → confirmation → corresponding regular date and five saved scores visible; synthetic morning legacy scores visible. Analysis settings changed to four consecutive drops and persisted after reload in local mock only.
- Responsive checks at 390/768/1280 viewport overrides: new import and settings views have zero nested bordered cards and zero type-scale deviations. Visible content uses Pretendard. Existing paste-help code font was aligned with the same font while connecting the score manager.

## Remaining acceptance/release gates

1. Supply the two original morning-file paths to verify their actual format and reproduce their scores.
2. Reconcile this branch with the concurrent original-checkout changes before release.
3. Production `db:deploy` and deployment tags remain unapproved and deferred. SQL execution against a database has not been claimed; current DB-path tests use a scoped in-memory Prisma harness.
4. After an approved production migration, the administrator must correct the affected subject's points and alternate group in settings. Preview deliberately blocks incorrect points instead of applying hardcoded production changes.

## Final command results

| Check | Result |
|---|---|
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0; no warnings/errors |
| `npm test` | 455/455 pass after operating-interview corrections |
| `npm run test:integration` | PASS; production build in its own temporary runtime, existing smoke scenarios, HTTP matrix 349/349, import/history/IDOR scenarios 3/3, regular-analysis scenario 1/1 |
| `git diff --check` | No whitespace errors |
| Independent follow-up review | Both identified bugs resolved; no new P1 issue found within reviewed scope |

Updated-handoff evidence: `apps/study-hall/.local/phase1-alignment-typecheck.log`, `phase1-alignment-lint.log`, `phase1-alignment-tests.log`, `phase1-alignment-integration.log`; final integration runtime `apps/study-hall/.local/test-5a54f730/integration.log`. After the final changes, the analysis settings page was checked again at 390/768/1280: the exact DESIGN.md layout checks returned `n=0`, fonts contained only Pretendard, `offScale=[]`, and no body overflow. Browser viewport overrides and the temporary tab were cleared.

Added test files:
- `tests/unit/exam-import-parser.test.ts`
- `tests/unit/exam-import-assembler.test.ts`
- `tests/unit/exam-phase1-settings.test.ts`
- `tests/unit/exam-phase1-services.test.ts`
- `tests/performance/exam-import-service.test.ts`
- `tests/render/exam-import-wizard.test.ts`
- `tests/render/exam-import-selection.test.ts`
- `tests/integration/exam-import-http.test.ts`

## Operating-interview correction verification

Latest evidence: apps/study-hall/.local/phase1-date-{typecheck,lint,tests,integration}.log and .local/test-2fff59da/integration.log. Fresh local browser import/history view at 390/768/1280px: layout n=0, Pretendard only, offScale=[], no body overflow. Original-file verification remains regular-only; the two morning originals are still absent.

Before first production import, the administrator must: change the regular constitution subject from 5 to 2.5 points; add criminology 20 x 2.5; put those two in the same alternate group; unify the morning type with criminology 20 x 5 and disable its duplicate; align five-digit student numbers. These are manual settings, never hardcoded tenant migrations.
