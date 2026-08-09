# Frontend evidence ledger

## 2026-08-08 경찰·소방 계산 분리 및 결과 안내 검증

- Scope: 경찰·소방 사용자 메인, 합격예측, 성적 결과, 관리자 통계·모집인원 화면
- Environment: Docker Next.js + local Supabase schemas `score_predict_police`, `score_predict_fire`
- Automated visual QA: PASS, 32 checks, browser runtime errors 0
- Viewports: 390×844, 768×1024, 1280×900
- States: unauthenticated public landing, authenticated normal data, API error, no active exam
- Tenant checks: police blue `#2563eb`, fire red `#dc2626`; cross-tenant subjects and labels absent
- Result checks: police global written-bonus decision and fire per-subject 40% written-bonus decision rendered separately
- Layout checks: no page-level horizontal overflow at all tested user viewports; admin checked at 1280px
- Design system check: existing `DESIGN.md` tokens and component structure retained; no arbitrary color or layout replacement introduced

Artifacts:

- QA report: `.superloopy/evidence/frontend/20260807-score-predict-tenant-split/QA_REPORT.md`
- Machine report: `.superloopy/evidence/frontend/20260807-score-predict-tenant-split/report.json`
- Screenshots: `.superloopy/evidence/frontend/20260807-score-predict-tenant-split/screenshots/`
- Representative files: `police-result-390.png`, `fire-result-390.png`, `police-prediction-1280.png`, `fire-prediction-1280.png`
