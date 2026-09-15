# Design Fix Stage Progress

## Scope and ownership

- Follow `docs/design-fix-2026-09-14.md` in order, with verification before moving stages.
- Stages1-7 verified and reported below. Older partial reports are retained as history. Supplemental performance/static-analysis findings are not counted as resolved design defects.
- `scripts/design-ui-audit.mjs` had concurrent Claude changes. Stages1-6 did not edit it. Stage7 preserves Claude's load/bounded-networkidle/per-width-recovery changes while correcting the explicitly requested stale expectations and adding coverage checks.
- No commit, push, deployment or operating DB changes. Shared local Docker was restarted during verification; the original mock volume is preserved. Temporary production-build QA containers use a copied mock database.
- Updated instruction section 3.6 read: obsolete audit expectations must not cause UI changes. Attendance defects and announcement hydration errors remain stage 3 work; audit expectations remain stage 7 work.

## Operator decisions

- Student reports: all analysis sections with anchor navigation.
- Reports mobile: collapsible conditions and export drawer.
- Mobile table links: 44px targets, taller rows allowed.
- Mobile admin panels: divider rows, no exterior card.
- Assistant bottom navigation: keep it and document exception.
- Graduated status: neutral `admin-text-secondary`.
- DESIGN section9 console measurements were aligned with the existing visible-element/report-scope rules during stage2; both prior raw and corrected results are retained below. The separate audit script was first updated in stage7.

## Stage 1: accepted

- `app/[division]/admin/loading.tsx`: DESIGN 5.7 skeleton and help text; removed broken spinner and forced viewport height.
- `app/[division]/admin/[...slug]/page.tsx`: DESIGN 1, 5.2, 5.7 flat layout, page title, empty state. No 404 behavior change.
- `scripts/design-loading-preview.tsx`: QA-only rendering of the actual loading component in the actual shell and styles. Its temporary server was stopped.
- Docker typecheck, production build and settings layout tests 4/4 passed. Subsequent host typecheck including the fixture passed.
- Fallback measured at 390/768/1280: layout n=0, one Pretendard font, offScale empty, overflow 0. Content widths 358/720/960. Mobile first data top 112.8px, header 52px, padding 16px, small targets 0, small text 0, cards/shadows 0.
- Actual loading route transition observed at 1280. Stable QA fixture measured at all three widths, n=0 and offScale empty. Skeletons were 32px and 48px high. Loading has no data, so first-data position is not applicable.

## Stage 2: implementation and partial verification

### Changed files and rules

- `components/exams/ExamTabLayout.tsx`: DESIGN 5.4/5.5, primary default and secondary variant for the student portal.
- `app/[division]/student/exams/page.tsx`: explicit secondary exam tabs.
- `components/exams/ExamSecondaryTabs.tsx` and `MorningExamScoreManager.tsx`: daily and weekly views promoted into the same secondary navigation. One mounted manager preserves draft state. Import callbacks and score refresh keys retained.
- `components/phones/PhoneCheckForm.tsx` and `PhoneSubmissionsWorkspace.tsx`: DESIGN 5.6 view-choice chips; removed `viewTabsVariant`. Period navigation retained.
- `components/exams/analysis/LearningActionSummary.tsx`: subject choice chips with aria-pressed, preserving hidden print DOM.
- `components/exams/analysis/PersonalReportTabs.tsx`, `MorningStudentReport.tsx`, `RegularStudentReport.tsx`: student-only anchor navigation, all analysis sections retained; administrator report tabs retained.
- `DESIGN.md` section 9: recorded the approved student portal decision.
- `scripts/fixtures/design-morning-workspace.tsx`: adapted the existing QA fixture to the actual two-level workspace.
- `tests/render/settings-tab-layout.test.ts`: staff route now checked for the shared settings shell. Staff UI unchanged.

### Checks completed

- Isolated Docker `pnpm run typecheck`: exit 0.
- Isolated Docker `pnpm run build`: exit 0, icon SSR verification passed. Existing Browserslist warning and sanitized build-time authentication logs appeared; not a log-clean claim.
- Settings layout tests 4/4, import selection tests 3/3, regular/morning report tests 26/26 passed (33 total).
- Admin exams: actual visible primary/secondary rows 1/1 at 390, 768, 1280. Overflow 0 at all three widths. Daily -> weekly -> daily retained test draft 73. Draft then cleared without saving.
- Admin phones: actual visible primary/secondary rows 1/1 at 390, 768, 1280. Raw layout n=0. Table -> seats -> table rendered successfully without saving.

| Page | Width | Content width | First data top | Raw small targets |
| --- | ---: | ---: | ---: | ---: |
| admin/exams | 390 | 343 | 762.3 | 0 |
| admin/exams | 768 | 705 | 761.2 | 0 |
| admin/exams | 1280 | 945 | 670.7 | 0 |
| admin/phone-submissions | 390 | 343 | 484.1 | 17 |
| admin/phone-submissions | 768 | 705 | 833 | 15 |
| admin/phone-submissions | 1280 | 945 | 709 | 15 |

All positions in the table above are at scrollY=0. An earlier admin/exams mobile measurement while scrolled was discarded. Native scrollbars reduce content width by 15px compared with the previous browser environment.

### Counts and preserved behavior

- Current 429 source files: out-of-token palette 360 -> 360; off-grid half-step spacing 240 -> 240. Stages 4/5 not started.
- Stage 1 raw unused CSS candidates were 13, not proven dead. Classification and removal remain stage 6; no CSS classes deleted in stage 2.
- Mobile phone raw small targets: 15 existing name links plus 2 compliant 36px chips. Effective hit regions still require separate verification in stage 3. No chip height change.
- Mobile header 52px, left/right padding 16px, overflow 0, text below 13px 0, cards/shadows 0 preserved on the two measured pages. Visible tabs do not wrap.
- First data top remains above the final mobile target; stage 3 markup work not yet performed. Prior instruction baselines: exams 829px, phones 485px, measured with a different scrollbar environment.
- No API, scoring, attendance, tenancy, permissions or saved operating values changed.

### Unresolved validation, not a completion claim

- The DESIGN 9 raw script reports admin/exams n=1 because it counts the hidden regular-exam secondary row. The visible count is 1. Removing hidden DOM would risk draft preservation and is not being used to silence the test.
- Raw type checker flags mobile `.admin-subtab` at 14px/700. This is explicitly prescribed by MOBILE_DESIGN 2.2; desktop offScale is empty and all fonts are Pretendard. No UI change made for this warning.
- Student exams anchor flow, admin personal report diagnosis flow and assistant phones still need full three-width browser verification. Student mock login succeeded; no state was saved beyond the local login session.
- Stage 2 must be verified and reported as complete before stage 3 starts.

## Stage 2 follow-up: student report verification

### Fixes made after browser inspection

- `app/globals.css`: extend hidden handling to `[data-report-panel][hidden]`. Removing tab semantics had exposed unselected subject sections because `.admin-section { display: flex }` overrode native hidden styling. Browser measured nonselected subject height 158.8px before and 0px after. Print still clears hidden attributes on the cloned report.
- `components/exams/analysis/PersonalReportTabs.tsx`: mobile anchor targets use the existing 64px spacing scale (`scroll-mt-16 md:scroll-mt-0`). Measured target top changed from approximately 0px behind the fixed header to 64.2px.
- `app/globals.css`: report status text weight 500 -> 400, DESIGN section 3 body scale. This is a real off-scale value, not the compliant 14px mobile subtab exception.
- `components/exams/MorningExamScoreManager.tsx`: empty-template state now retains both daily/weekly tab-panel targets after promoting the view tabs.
- `tests/render/exam-analysis-ui.test.ts` and `exam-import-selection.test.ts`: added anchor visibility, subject hidden/print semantics, and empty-template panel regression cases.

### Verification

- Latest focused tests: 36/36 passed, including settings layout 4/4.
- Isolated Docker typecheck passed after hidden CSS, anchor offset and weight changes.
- Isolated Docker production build passed after those changes, before the final empty-template markup patch. Full build must be rerun on the final snapshot before stage 2 completion.
- Student exams morning view measured at 390/768/1280: document overflow 0; visible exam secondary navigation 1; all anchor targets exist. Both morning and regular analysis sections render. Subject selection changes pressed state and shows only the selected subject.
- Student desktop fonts: one Pretendard, offScale empty after status weight fix. Mobile raw type exception remains the documented 14px subtab.
- Student morning first-data positions: 390=682.8px, 768=904.3px, 1280=856.3px. Content widths: 343/705/1201px. The student portal has no desktop sidebar. Mobile header 52px, padding 16px, cards/shadows/overflow/small-text counts 0. First-data optimization is not yet done.
- Raw document layout script reports n=13 mobile and n=14 desktop: repeated subject headings across separately named analysis sections, hidden regular-report headings, aggregate section counts, and a nested regular-record target summary. Do not claim n=0. The nested target summary needs an actual scoped review; the other entries need raw-versus-visible/context-aware classification.

### Current blocker and remaining work

- Browser navigation to `/police/admin/students` was blocked with `ERR_BLOCKED_BY_CLIENT`; visible page says the page was blocked by Naver Whale. Did not bypass the browser block or change browser security settings.
- Administrator personal diagnosis and assistant phone browser verification remain incomplete. Stage 3 has not started.
- The public audit script remains untouched. Other sessions' changes preserved. No scores were saved during UI testing, no commit/push/deploy.

## Stage 2 final verification and handoff to stage 3

- Final source snapshot: Docker typecheck and production build exited 0, including empty-template panels and student-only target rows. Build emitted the existing static-render authentication logs; this is not a clean-log claim.
- Re-ran settings-tab-layout, exam-analysis-ui and exam-import-selection: 27/27 passed (settings layout 4/4).
- ScoreTargetPanel adds an optional rows presentation for student/exams only; the default administrator editor remains unchanged. Nested target-card finding removed. Basis: DESIGN 5.3, instruction 2.6.
- DESIGN 9 console validators now check rendered elements, compare report headings within their own analysis scope, count loose sections per parent, exclude bottom portal navigation, and allow MOBILE_DESIGN 2.2 mobile secondary-tab 14px. Previous raw findings above are retained. This changes measurement, not UI tokens. Claude-owned scripts/design-ui-audit.mjs was not modified.
- Final visible layout n=0 and offScale=[] at 390/768/1280 for admin/exams, administrator personal diagnosis and student/exams. Fonts: Pretendard only. Admin/assistant phone raw layout n=0 at all three widths; desktop offScale=[] and mobile exceptions were only the prescribed 14px secondary tabs.
- Assistant phones first-data top: 390=379.3, 768=730.5, 1280=629; content width 343/705/945. Overflow 0. At 390: header52, padding16, small text0, shadows0, cards0. Raw small targets17 (two 36px chips and fifteen 16.9px name buttons). These are stage3 items, not changed here.
- Administrator morning diagnosis first-data top: 390=913.8, 768=842.7, 1280=796.8. Overflow0. Subject choice switched to criminal law successfully, only that subject remained visible. The student search input22.5px remains the documented stage3 defect.
- Assistant seat loading initially raised ChunkLoadError. A normal reload recovered it; seats and table both rendered afterward without saving. The earlier browser block applied to admin/students, not all localhost routes. Administrator exam personal reports were reached through the exam UI, without bypassing that block.
- No token/spacing cleanup: palette360 and off-grid spacing240 baseline unchanged; unused-class classification deferred to stage6. Final first-data targets and input/name hit areas belong to stage3.
- Stage2 report delivered before starting stage3. All six operator choices recorded above remain in force. No new operator decision pending for stage2.

## Stage 3 partial report (2026-09-15)

### Files and design basis

- `components/ui/AdminTabs.tsx`: optional shared panel ID for views that replace the contents of one panel; default per-tab IDs unchanged. DESIGN 5.4/5.5 and instruction 3.6.
- `components/attendance/MobileCheckForm.tsx`: period tabs now resolve to the rendered period panel, including empty-student states. View tabs reference their rendered view. No attendance save, calculation or navigation guard changes.
- `components/attendance/AdminAttendanceBoard.tsx`: active view and all seat-period tabs reference existing panels; empty search results retain the period panel. Reason inputs use standard class, accessible names, 44px height and 12px horizontal padding.
- `components/announcements/AnnouncementManager.tsx`: host-independent KST numeric date/time labels resolve the hydration mismatch. Mobile controls collapse without unmounting filters; statistics remain accessible when expanded. Mobile announcements use existing list-row classes with scope/date label, title, preview and author/status metadata. Existing desktop table and detail/edit drawers retained. DESIGN 5.8, MOBILE_DESIGN 2.1/2.4.
- `app/[division]/admin/announcements/page.tsx`: duplicate mobile body title becomes screen-reader-only; desktop unchanged.
- `components/dashboard/AdminDashboard.tsx`: metrics ordered first only below 768px. Desktop DOM and ordering unchanged. MOBILE_DESIGN 2.5 and instruction 3.2 home phase.
- `DESIGN.md`, `MOBILE_DESIGN.md`: recorded approved mobile panel/link and assistant-navigation exceptions before corresponding CSS changes.
- `app/globals.css`: mobile panels lose exterior card border/radius; table links get 44px minimum width/height; search-group inputs get 44px actual hit height without desktop changes. The previous 23px input was caused by `.admin-input-group input { min-height: 0; padding: 0 }`, not just utility specificity. MOBILE_DESIGN 2.4/2.6/2.7.
- `tests/render/attendance-design-panels.test.ts` and `announcement-timezone.test.ts`: shared/default tab references, empty attendance state, reason input class, identical announcement SSR across UTC/KST/Los Angeles, and KST midnight 00:00.

### Verification and measurements

- Isolated Docker app build passed, including icon SSR. Test-fixture missing fields were corrected afterward; final isolated typecheck exited 0. Latest five focused test files: 31/31 passed (including settings 4/4).
- Announcement error reproduced before correction: server `3. 18. AM 09:00`, client `3. 18. 오후 06:00`. New loads at 390/768/1280/1600 emitted no new hydration errors. KST row/details show `03-18 18:00` / `2026-03-18 18:00`.
- Announcement mobile first row: instruction baseline537 -> intermediate172.8 -> final132px. Final390: header52, padding16, overflow0, cards0, shadows0, text below13px0, small targets0. Query input44px. Search, collapse preserving search, and title -> detail drawer -> close verified without saving.
- Announcement DESIGN9 layout n=0, Pretendard only and offScale=[] at390/768/1280. Desktop filters remain shown after collapsing on mobile.
- Assistant phone390 sample name links measured44x44px (previous16.9px high). Choice chips remained36px with pseudo-element inset -4px vertically, yielding44px hit area; overflow0.
- Admin dashboard mobile first metrics: fresh pre-change607 ->72px (current exam-schedule data differs from instruction268 baseline). Overflow0, cards0, shadows0, header52, padding16 preserved. One existing 15px student-name link remains for later mobile-list work.
- Assistant home unchanged: first metrics208.3, header52, padding16, overflow0, cards0, shadows0, small text0, small targets0. Student first route redirects to attendance; actual portal summary is already top72px. The old selector omitted `.admin-portal-summary` and counted only its table around270px. No student-home UI edits made for that false first-data result.
- Attendance reason input measured44px with12px padding at768 and1280. Period/view missing targets0 at390/768/1280, including desktop seat mode. 768 overflow0 and weight900 count0 before and after edits: original overflow/900 were not reproduced, so no speculative CSS fixes were applied.
- Public audit script executed unchanged with localhost3000, widths390/768/1280, route filter announcements|attendance|settings/features. Output: `.superloopy/evidence/frontend/2026-09-15-stage3-core/audit.json`. 67 snapshots, failed0, runtime-error states0. 171 findings are only the explicitly obsolete input-radius, page-padding, primary-tab-size and 14px type-size expectations. No missing-tabpanel, input-padding, control-height, type-weight, document-overflow or hydration findings remained in this run.
- Out-of-token palette360 ->360, half-step spacing240 ->240. No token-cleanup claims. Five formerly unused list classes now have announcement consumers (`admin-list-row`, `-stack`, `-title`, `-label`, `-meta`); no unused-class deletion. Full classification remains stage6.

### Remaining stage 3 work

- This is not a stage3 completion report. Continue mobile lists (points, payments, leave, interviews, exams), check-page chrome, remaining settings/detail routes and approved report-condition/export drawer. Verify name-link hit regions across consumers.
- Complete required three-width checks on each subsequent edit and retain already-passed desktop layouts. Do not begin stage4 before stage3 completion report.
- Stage7 must update obsolete audit expectations and extend first-data detection to actual portal summaries. Claude still owns `scripts/design-ui-audit.mjs`; its concurrent diff is14 additions/4 deletions, not authored by this task.
- Shared dev server had transient ChunkLoadError and useContext SSR errors; ordinary reloads recovered. Error-page zero measurements were discarded. No server restart, persisted business changes, commit, push or deployment.

## Stage 3 continuation (2026-09-15, not complete)

- Docker was unavailable on resume. Preserved stale temporary IPC directories by renaming them, then started Docker Desktop and the existing study-hall dev service. Persistent volumes and operating data were not deleted. Local port 3000 is available again. The prior no-restart statement applies only to the earlier verification batch.
- Added `MobileWorkspaceTools` with a shared header trigger host, inactive-tab scopes, Escape/focus restoration and one continuously mounted form. Desktop wrappers use display:contents; mobile tools use the existing dialog tokens. Student portal uses an explicit header host. Basis: MOBILE_DESIGN 2.1, 2.4, 2.8 and DESIGN 5.10.
- Points, payments, leave and interviews use mobile list rows and detail drawers while retaining desktop tables/actions. Payment date hydration mismatch was reproduced and fixed by explicit KST formatting; leave/interview dates also use KST. No save handler, request payload, permission, calculation or business limit was changed.
- Points 390 first data=152. Leave/payments/interviews each=152. Three-width list audit initially passed layout n=0, offScale=[], Pretendard only, overflow=0, runtime errors=0 and blocked business writes=0. Evidence: `2026-09-15-points-mobile` and `2026-09-15-mobile-lists` under `.superloopy/evidence/frontend`.
- Exam input filters/import/search moved to mobile tools, with active-category scopes preventing hidden-tab header actions. Default morning exam first data=160 after removing stacked mobile tab gaps, retaining 44px tabs. Three-width core audit passed. Evidence: `2026-09-15-exams-core`.
- Check pages: assistant attendance first live summary=160, assistant phones live summary=72, admin phones live summary=136, all three widths layout n=0 and no runtime errors in the first check-final run. Phone period tabs now reference the rendered shared panel. Mobile phone summary repeats the three immediately useful counts above navigation; full status/exclusion information remains in the check toolbar. The summary has since been moved outside the space-y wrapper to avoid affecting desktop sibling margins; final rerun is still required.
- Settings shared mobile title chrome and tab gaps were reduced. Mobile query/action tools added to staff, tuition, exam templates/schedules, periods, seat list and point rules. General/features/rules/periods/point-rules first data=160; seats/templates/tuition/schedules/staff=116; admin study ranking=72. Desktop settings verification found a duplicated "시험 일정" heading; the list heading is now "시험 일정 목록" without structural desktop changes. Latest complete three-width rerun is pending.
- Student ranking and personal reports are being checked. Student report anchors still expose every section, with mobile overview first. Admin personal-report filters and print controls use tools; print cloning excludes the tool chrome and preserves actual report content. These latest edits still require runtime and print verification.
- Focused tests passed 27/27 before the latest report edits. The latest run was 26/27 because a fixture's lucide override omitted the new tools icons; the fixture was corrected and must be rerun. Latest typecheck passed before student/report edits. An isolated same-drive build passed earlier, but does not verify the latest snapshot.
- Public `scripts/design-ui-audit.mjs` remains untouched by this task (concurrent diff 14 additions/4 deletions). Asked whether Claude has finished and ownership can transfer for stage7. The separate mobile audit reads the actual DESIGN9 validators, records screenshots, and blocks business API writes. Its networkidle wait is now bounded; an earlier long settings run timed out and was not counted as a completed audit.
- No stage4/5/6/7 completion claim. Remaining: final stage3 list/detail/tab/print checks, reports mobile disclosure/export drawer, full section10 build/typecheck/settings tests and section11 report. No commit, push or deployment.

## Stage 3 final report (2026-09-15)

- Supersedes the incomplete continuation above. Latest isolated production build and host typecheck exited 0. Focused tests passed 31/31, including settings 4/4. Build retains pre-existing unauthenticated static-render log messages; this is not a clean-log claim.
- Final serial browser audit: `2026-09-15-stage3-serial/audit.json`, 21 routes, 84 snapshots at390/768/1280. All layout n=0, offScale=[], Pretendard only, overflow0, runtime errors0, business writes0. At390 all ten mobile measurements pass. Home first73, warnings72, lists152, settings116-160, exams160, assistant check160, assistant phones72, administrator phones136.
- Reports: `2026-09-15-reports-resize` passed three widths and repeated disclosure closing/resizing with the June date preserved; first116. Native details toggle races were corrected with controlled summary clicks. `2026-09-15-personal-final` passed16 snapshots; `2026-09-15-personal-print` passed5 including actual A4 PDF generation with all analysis panels retained and tool/navigation chrome excluded. Student detail first136.3, student exams116, student ranking72.
- Final additions: `MobileDisclosure.tsx`, `ReportsDashboard.tsx`, `StudentAnalysisPage.tsx`, `MorningStudentReport.tsx`, `RegularStudentReport.tsx`, `PersonalReportTabs.tsx`, `ReportPrintButton.tsx`, `StudentDetailView.tsx`, student exams/detail route pages and `StudentPortalFrame.tsx`. Basis: DESIGN5.10/9, MOBILE_DESIGN2.1/2.4/2.8. WarningStudentsManager and warnings route now move mobile filters/actions to tools; desktop empty-state styling remains unchanged. Two dashboard student links gain mobile44px hit regions without changing desktop styles.
- Shared/source file groups previously recorded above remain part of this stage: MobileWorkspaceTools/AdminShell/AppSwitchMenu/globals; points/payments/leave/interviews managers and routes; ExamTabLayout/ExamSecondaryTabs/MorningExamScoreManager; PhoneCheckForm/PhoneWorkspaceTabs/PhoneSubmissionsWorkspace/MobileCheckForm; SettingsPageShell and general/features/rules/periods/seats/tuition/exam-template/exam-schedule/staff/point-rule managers; administrator/student study ranking. Tests: mobile-workspace-tools, exam-analysis-ui, attendance-design-panels, announcement-timezone and settings-tab-layout.
- Colors unchanged: prior prefix-based count360; full palette references including accent-rose count361. Half-step spacing240 unchanged. Six list-row classes now have consumers. Five requested unused utility classes remain for stage6; a fresh scan also found one unused student-detail summary selector. No cleanup was claimed here.
- Approved36px choice chips and assistant bottom navigation retained. Existing desktop layouts retained apart from the explicitly requested stage2 corrections and duplicated schedule heading text. No new operator decision blocks stage3. Public audit remains Claude's14+/4- change, untouched by this task.
- Environment: simultaneous dev/build exhausted the6GB WSL budget. Aborted audits and interrupted build are not passes. Docker restart encountered stale IPC socket errors; temporary IPC folders were renamed with0912 backup suffix, not deleted. Volumes preserved. Latest successful build ran with dev stopped and NODE_ENV=production; browser audit ran afterward alone. No operating DB change, commit, push or deployment.

## Stage 4 final report (2026-09-15)

- Basis: DESIGN2/3 and instruction4.1-4.5. Added four warning stages with base/soft/line hex and RGB tokens in globals.css, connected Tailwind warn palette and documented them in DESIGN. Student/interview/attendance/study-track/point/leave meta classes now use semantic tokens; graduated state is neutral. Source class substitutions cover dashboard, phones, seats, students, point/payment/report/settings and super-admin consumers. No API, calculation, permission or persisted data changes.
- Out-of-token palette361 ->0; off-grid spacing240 unchanged; actual unused CSS classes6 unchanged. Cyan category badges use success-family classification, not score-sign classification. Warning badge colors retain readable prior contrasts and remain independent of academy accent. Attendance status text uses attend tokens, not academy accent aliases. Error input CSS recognizes danger-token classes, including focus.
- Latest isolated production build passed (session27748); current typecheck passed. Full render suite120/120 passed, including settings4/4 and four new semantic-token tests. Updated VM test loaders and missing icon fixtures without dropping behavioral assertions; two old blue-class assertions now expect attend-excused.
- Browser evidence: stage4/audit.json has completed24-route390 checks; stage4-tail has48 passed snapshots at768/1280. Student exams/profile extra three-width checks and super-admin three-width measurements are in stage4-extra; final super-admin1280 retry is stage4-super-final (3 snapshots). Layout n=0, overflow0, Pretendard only; completed runs have no runtime errors or business writes. Attendance's raw offScale contains only documented14px names/selects, explicitly ignored under instruction3.6 until stage7 repairs the validator. Other offScale arrays are empty.
- Mobile first-data and hit regions stayed at stage3 values (core lists152, exam160, settings116-160; no new small targets). Super-admin is outside the34-route mobile restructuring baseline and retains its separate shell: no52px-header/first160 claim. It was measured for color, typography, layout and overflow only; no desktop restructuring.
- Actual warning class RGB/bg/border and focused error input verified in-browser at all three widths. Screenshots inspected for attendance768 and super-admin390. One final super-admin batch hit Next's documented memory-threshold auto-restart; those fetch-error snapshots were discarded and the three1280 routes remeasured after recovery. Docker remained running and volumes were preserved.
- No pending operator choice for stage4; approved neutral graduated color used. Staff/passing desktop structures, choice36px and academy settings preserved. Public audit script remains unmodified by this task at this stage. No commit, push or deployment.

## Stage 5 final report (2026-09-15)

- Basis: DESIGN3/4/5.6/5.7 and MOBILE_DESIGN2.4. AttendanceSeatView, PhoneCheckSeatMap and SeatStatusBoard now share admin-seat-card interaction CSS. Kept each component's layout/events instead of adding a React wrapper across three different modal/drag lifecycles. Selected/drop-target borders replace rings; hover uses semantic surfaces without fading the whole card. Assigned-seat inline colors resolve the shared custom properties, so inline precedence cannot suppress selection/hover.
- SeatMap highlighted border and expiration colors use tokens; date/expiration calculations unchanged. PhoneStatusCheckButton, attendance/phone badges no longer use shadow rings. Dashboard, super-admin and study-time progress bars use the standard radius. Toast close uses Lucide X and44px hit area, without changing timers. Plain muted helpers use admin-help; primary text/status labels were not indiscriminately made captions.
- Mechanical spacing normalization across46 source files: half-step padding/margin/gap/space utilities240 ->0 (rounded to the next4px step). Icon/dot dimensions and seat geometry retained. Token-outside colors0 ->0; ring-N0; hover-opacity0; border-3 remains0. Rounded-full17 ->10, all remaining uses are dots/avatars. Unused CSS6 unchanged for stage6.
- Seat runtime audit exposed12 mobile unassigned-student cards below the phone seat map. Added a mobile-only unassigned-row modifier to remove the exterior card shape; desktop and all phone actions retained. This is a newly exercised view, not a waiver of the mobile requirement. Selected-border measurement now waits for the existing transition; neutral hover is checked against its token even when the resting surface already equals it.
- Current typecheck and settings/seat tests6/6 passed; full render suite122/122 passed before the final CSS-only unassigned-row adjustment. Latest complete production build36900 includes that adjustment and passed. Earlier build89244 also passed. Build logs retain existing unauthenticated prerender messages, not runtime failures.
- Evidence: stage5-seats27 snapshots (all three widths, hover/selected border/dialog; administrator mobile intentionally has no seat layout, so assistant/check covers AttendanceSeatView at390). Stage5-pages121 snapshots cover the other30 core routes, including actual personal A4 print and date-draft retention. Combined34 core routes pass layout n=0, overflow0, fonts Pretendard only, no errors/writes; raw attendance14 remains the explicitly deferred validator exception. Mobile first data<=160 (home<=240), small targets0, cards/shadows/tiny text/wrapped tabs/folder tabs0. Student profile145.5 ->147.5 stays within160. Super-admin12 separate-shell snapshots pass layout/type/overflow/runtime checks; no first-data/header restructuring claim.
- To avoid Next development memory restarts, final broad checks run against a local production build in study-hall-design-stage5 atlocalhost3000. The mock DB is a copy in /tmp/design-qa; original dev-state volume is untouched and dev container stopped, not deleted. No operating DB, API, permission, payload, calculation, commit, push or deployment changes. No operator decision pending.

## Stage 6 final report (2026-09-15)

- Files: globals.css and DESIGN5.6. Removed admin-tab-count, admin-panel-row-link, admin-panel-row-link-label, admin-print-only, admin-mobile-topbar-action, and the additional unused admin-student-detail-summary selector. Repository source and dynamic-string checks found no consumers. The removed panel-link template belongs to the retired settings hub; fixed destinations now use route tabs and real mobile lists use admin-list-row. The unused print helper had no consumer because the print window owns its stylesheet. The mobile header uses actual icon/button classes. Keeping speculative templates would hide later dead-style drift.
- Preserved all six consumed admin-list-row classes and existing panel/check-summary selectors. Corrected the stale shell-locked comment (not an actual CSS rule). PostCSS rule traversal found157 defined admin classes and unused0, down from6. Palette0, off-grid spacing0, ring0 and hover-opacity0 unchanged.
- Current typecheck passed, settings4/4 passed, isolated production build13652 passed including icon SSR. Browser stage6/audit.json:25 passed snapshots across six representative routes at390/768/1280, with personal print and tool-draft retention. Layout n=0, offScale=[], Pretendard only, overflow0, errors0, writes0. Mobile first-data116-160, all mobile measurements unchanged/passing.
- No new UI structure, data or business logic changes; no operator decision pending. Local snapshot-backed stage6 container serves port3000 for verification. No commit, push, deployment or operating DB change. Next: stage7 static ratchets and corrected audit expectations, preserving Claude's existing public-audit navigation/recovery changes.

## Stage 7 final report (2026-09-15)

- Basis: instruction7, DESIGN2/3/5.3/5.7/5.10/9 and MOBILE_DESIGN2.3/2.7/4. Added tests/render/design-regression.test.ts: palette, half-step spacing, hover-opacity, numbered rings, border-3 and unused admin-class ratchets. Starting measurements361/240/6 were lowered in stages4/5/6; all caps are now0. In-memory negative fixtures prove failures are detected. settings-tab-layout.test.ts covers staff. Added duplicate-report-ID and desktop tool-heading regression tests; existing form/draft tests retained.
- Public audit: preserved Claude's load/bounded-networkidle/per-width recovery edits. Corrected mobile radius4, top padding20, primary tabs44/15, metric20, and attendance-only14px. Correct desktop table text links and36px choices with44px hit regions remain allowed. Added zero-route failure, actual student-ID resolution, loading settlement, per-width error reset, nonzero exit on findings and explicit page-only smoke mode (full interaction traversal remains the default). DESIGN9 now permits only the documented attendance14px selectors. Aligned the final administrator-report paragraph with the already-approved tabs; students retain anchors.
- Other verification files: design-dialog-audit.mjs, design-workflow-audit.mjs, design-workspace-audit.mjs, mobile-audit.js and design-points-mobile-audit.mjs. They cover current mobile tool disclosure, real mock student fixtures, visible record details and read-only/no-persisted-write flows. Mobile audit measures actual labels/pseudo hit regions, not arbitrary parent heights. Flat row/title/disclosure surfaces remain square; ordinary controls are4px. Local-host guards prevent accidental remote execution.
- Actual defects found during final broad validation: removed redundant fixed personal-* IDs from LearningActionSummary/MorningStudentReport/RegularStudentReport; existing useId anchor targets remain unique. ScoreTargetPanel now has an unframed three-column internal summary, not a nested card. Mobile icon/legacy rounded buttons now use the existing4px token. A manual screenshot found the mobile tool heading/close button leaking onto desktop through CSS cascade order; globals.css now hides that chrome at768+ with a stronger selector. Both browser scripts now assert that it stays hidden. No calculation, permissions, payloads, operating DB or schema changes.
- Static totals: palette361->0, off-grid spacing240->0, unused CSS6->0 across the full cleanup; all remain0 after the final fixes. ring/hover-opacity/border-3 remain0. Latest full test run800/800 passed with the isolated tests/.mock-db directory, not the development data. Current typecheck passed; settings tests4/4 and combined settings/ratchet/responsive tests11/11 passed. Final production build37855 passed, including icon SSR. Existing unauthenticated prerender log messages and outdated Browserslist notice remain; this is not a clean-build-log claim. UTF-8 and diff whitespace checks passed.
- Broad interaction evidence: stage7-final/audit.json,45 requested routes including redirects,730 states at390/768/1280/1600,0 script issues/errors/failed routes. This run preceded the final desktop-chrome correction and does not by itself prove that correction. After the correction, stage7-final-chrome/audit.json rechecks all45 routes at all4 widths:180 page-only states,0 issues/errors/failed routes, including the newly added desktop-chrome rule. These180 states are not presented as another full tab/modal traversal.
- DESIGN9 and mobile evidence: stage7-layout has148 states across34 core routes at390/768/1280; n=0, offScale=[], Pretendard only, overflow0, errors0 and writes0. All72 mobile states pass all12 reported checks (the ten required checks plus two tab checks). After the desktop-only chrome correction, stage7-final-desktop rechecks all34 routes at768/1280 including seat hover/selected states:76 passing states and no visible desktop tool headings. Mobile final appearance is unchanged by that min-width-only rule, and was rechecked in the180-state final smoke. Subpage first-data top72-160px; home73 and assistant home209.3, within240. Mobile small hit targets0; approved choice chips remain36px with44px hit areas. The160px bound is not claimed for desktop or the separate super-admin shell.
- Dialog/flow evidence: stage7-dialogs-final passes at390/768/1280/1600 with568px height, focus trap/return, required-field validation, pending guards and nested dialogs. stage7-workflow-final contains46 checks, including16 actual staff/rule add/edit drawers, June-date point submissions intercepted with a500 response, pending-close protection, preserved values, seat tabs and student warning/withdraw drawers. stage7-workspace has50 tab/filter/long-record/detail states with0 runtime errors and0 persisted writes. Actual A4 PDF is in stage7-layout/personal-print.pdf. Representative final staff, point-rule, student-detail and reports screenshots were manually inspected; automated measurements, not manual inspection of every screenshot, supply the full-route coverage.
- Preserved by design: passing desktop structures, semester/score/permission behavior, attendance/warning meaning,36px choices, assistant bottom navigation, desktop text links, all print sections and existing font glyph coverage. No unresolved operator choice in the seven-stage scope. A fresh server startup caused one socket-hang-up before readiness; the empty failed attempt was not a pass, and the complete180-state retry supersedes it.
- Supplemental quality is NOT all green: installed Chrome/Lighthouse12.8.2, three runs per form factor on the authenticated staff route, median performance75 mobile/88 desktop; accessibility/best-practices/SEO100. Full Pretendard transfer is about2MB; mobile simulated LCP12.81s. React Doctor0.9.14 exits1 with14 error-level/624 warning-level static findings, including historical ignored build artifacts. These are untriaged and not638 reproduced defects. Font delivery and React behavior need a separate review, not silent font/glyph or business changes under this design instruction. Details and limitations: .superloopy/evidence/frontend/2026-09-15-stage7/PERF.md. No production performance certification.
- Original dev-state mock SHA-256 matches the pre-QA copy:4136858B82490E8BDB35B371D067421F8DBCE4D5003E1D1085FE602659A508D4. QA used isolated copies. Verification containers are stopped, no volumes removed. No commit, push, deployment or operating DB application.
- Local close-out: normal study-hall-dev-1 restored at127.0.0.1:3000 using the preserved volume and current source mount. Docker reports healthy, OOMKilled=false. stage7-dev-smoke rechecked announcements, attendance, point rules and staff at390/1280:8 page states,0 issues/errors. The app browser open request for the staff URL was queued. This is local availability, not production deployment.

## Post-stage overlap recheck (2026-09-15)

- The user's1137px personal-analysis screenshot exposed an internal-field-overlap gap in the earlier audit. Rechecked the current47 requested routes at six widths, including1024/1137. Fixed the fixed-width student search, the student-list table escaping the page, and the activity-export drawer trapped inside collapsed filters. Existing passing structures and concurrent work were preserved.
- Full findings, DESIGN/MOBILE_DESIGN basis, final-build72-state recheck, effective2,489-state coverage, regression tests, preserved data and restored dev-server verification are in [design-overlap-recheck-2026-09-15.md](design-overlap-recheck-2026-09-15.md). The earlier zero-issue counts did not include internal input containment and must not be read as proof of that check.
