# Overlap Recheck - 2026-09-15

## Scope and Fixes

The user's 1137x912 personal-analysis screenshot exposed a gap in the earlier document-overflow-only check. Rechecked all current page routes, including redirects, administrator/assistant/student/super-admin views and three fire-academy routes, at 390/768/1024/1137/1280/1600px.

| Actual defect | Fix | Design basis |
| --- | --- | --- |
| Personal analysis: a 288px student search occupied a 184.25px field at 1137px and overlapped the exam selector | `StudentAnalysisPage.tsx`: replace `sm:w-72` with `min-w-0`; retain full field width, values and navigation | DESIGN 5.3, 5.7 |
| Student list and registration redirect: desktop table expanded the document to 1274px at 1024/1137px | `StudentListManager.tsx`: use the existing `admin-table-frame` on the table wrapper | DESIGN 5.8 |
| Activity-log export: header trigger opened a drawer inside closed details; opening the conditions later unexpectedly exposed the drawer over them | `ReportsDashboard.tsx`: move mobile export outside the disclosure; retain the desktop link in its original action row | DESIGN 5.10; MOBILE_DESIGN 2.8 |

No shared style tokens, business calculations, forms' request payloads, permissions or schema were changed. Passing desktop structures, 36px choice chips, assistant bottom navigation and intentionally scrollable tables were retained. No operator decision remains pending.

## Verification

- Full first build audit: 47 distinct requested routes, 282 route/width pairs, 2,490 captured states. Found ten repeated table-overflow measurements and one failing activity-export interaction. These are not eleven separate defects. The personal-search fix was already present in this build.
- Latest production build passed, including lint/type checks and icon SSR. Build still emits the existing unauthenticated prerender log messages and Browserslist notice; this is not a clean-log claim.
- Rebuilt the final changes and reran all six widths for reports, students and the student-registration redirect: 72 states, no issues or runtime errors. The three changed route sets replace their earlier measurements in the effective report; the other routes were not changed afterward.
- Effective coverage: 47 routes, 282 route/width pairs, 2,489 states, 11,697 control observations, zero remaining audit issues/errors. Counts include repeated tab, disclosure and drawer states, not thousands of unique pages.
- Additional checks: 78 actual form/seat/student/staff/rule states; 66 setting create/edit/copy states; 30 selected/empty renewal/refund and nested-password states; 74 long-record/workspace states. No persistent business writes were sent.
- Exact user URL: six widths, morning and regular selections, loaded student value and dropdown bounds checked. The original fixed-width geometry fails the new negative fixture; corrected geometry passes.
- Student table at 1024/1137px: document width equals viewport; horizontal scroll offsets 282/169px reveal the final cell inside the frame.
- DESIGN 9: 13 states at 390/768/1280px, layout n=0, offScale=[], Pretendard only. All seven mobile states pass 12 checks. Initial mobile first data: reports116px, students113.8px, personal analysis160px; small touch targets0.
- Focused render tests32/32 and browser geometry regression1/1 passed; typecheck passed. Palette, off-grid spacing and unused-class caps remain0. No new sizing, color or spacing tokens.

## Evidence

All paths below are under `.superloopy/evidence/frontend/`:

- `2026-09-15-overlap-final/audit.json`: first full build audit, including the defects.
- `2026-09-15-overlap-fixed/audit.json`: final 72-state recheck.
- `2026-09-15-overlap-fixed/effective-audit.json` and `summary.json`: combined coverage with explicit source reports and replaced routes; original failures remain preserved separately.
- `2026-09-15-overlap-forms-complete`, `2026-09-15-overlap-settings`, `2026-09-15-overlap-extra-forms`, `2026-09-15-overlap-records`, `2026-09-15-overlap-design9`, `2026-09-15-analysis-filter`: supplemental measurements/screenshots.

Automation now checks control-to-field containment, sibling input overlap, mobile tool panels outside closed disclosures and expanded details. Closed native details can retain layout rectangles in Chromium; their unpainted controls are excluded, then measured when expanded. Input-group icons and separate dialog layers are not treated as sibling controls. Representative screenshots were manually inspected; full coverage comes from automated geometry, not manual inspection of every image.

The partial development-server run had transient SSR/navigation failures and is not a pass. Broad QA used an isolated local build and a copy of mock data, not operating data. This is verification of the reachable mock states and specified viewports, not every possible dataset/browser combination or production deployment.

## Local Close-Out

Normal `study-hall-dev-1` restored at localhost:3000: healthy, OOMKilled=false. The restored dev server passed six reports/student-list page checks at390/1024/1137 and all12 exact personal-analysis checks. These smoke checks are separate from the full build-server audit.

Original mock data is byte-for-byte unchanged; SHA-256 remains `4136858B82490E8BDB35B371D067421F8DBCE4D5003E1D1085FE602659A508D4`. Both overlap QA containers are stopped. No commit, push, deployment or volume deletion.
