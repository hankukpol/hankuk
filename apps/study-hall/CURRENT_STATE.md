# 현재 구현·검증 상태

## 배포 — 2026-10-08 리팩토링 1~4단계 운영 반영 (오케스트라 메인, 운영자 승인)

- 리팩토링 브랜치 `refactor/study-hall-2026-10`(커밋 10개, 기준 3186dac)를 main 에 fast-forward 병합 후 이 배포 커밋으로 운영 반영. 상세는 `.orchestra/refactor-plan.md` 진행 기록.
- 공용 폴더 재검증: typecheck·lint 0, 테스트 995/995.
- 로컬 환경 주의: 이 PC에서는 한글·공백 경로(`학원 포탈 프로그램`)에서 Node 가 패키지 내부 `#` 별칭(package.json imports)을 못 찾는다. `prisma generate` 결과 `.prisma/client/default.js` 가 `require('#main-entry-point')` 로 나오면 테스트가 56개 실패한다 → 같은 파일을 `module.exports = { ...require('.') }` 로 맞추면 정상(로컬 node_modules 한정, 운영 무관).
- 배포 후 확인할 것: DB 연결 수 기본 1→4(`PRISMA_CONNECTION_LIMIT`). 공유 Supabase pooler 사용량과 다른 앱 연결 오류가 없는지 본다. 문제 시 환경변수로 낮춘다.

## 로컬 커밋(미배포) — 2026-10-07 study-hall 리팩토링 1~4단계 (Claude, 운영자 승인 · 오케스트라 협의)

- 위치: worktree `D:\코딩\학원 포탈 프로그램\hankuk-refactor`, 브랜치 `refactor/study-hall-2026-10`(기준 `3186dac`), 커밋 9개, 95파일 +1,156/−5,198. 계획·진행 기록 `.orchestra/refactor-plan.md`. 운영 DB 는 읽기 전용 `migrate status` 1회(35/35 적용, 운영자 승인)만, 쓰기 없음.
- 1단계 안정성: 스키마 호환 대체 경로·information_schema 확인 제거(결제 삭제 때 환불 연결 확인이 꺼질 수 있던 캐시, 기능 플래그 저장의 가짜 성공, 학생 저장이 칸을 버리고 다시 쓰던 경로), 대시보드·총괄 실패 표시(`unavailableSections`·`loadFailed`), 출결 자동 마감 오류 기록·오류 번호, 정책 이전 자동 상벌점 학원·날짜 잠금(advisory lock), 결제 직렬화 충돌 1회 재시도 후 409, 활동 기록·과정 시작일 한국 날짜, 좌석 문구.
- 2단계 성능: 시험 분석 원천 동시 호출 공유(`lib/inflight.ts`), 아침 주간 석차 일괄 읽기(`getMorningExamWeeklySummaries`), 템플릿 예약 확인 쿼리 1개·렌더당 1회, Prisma `connection_limit` 기본 4(`PRISMA_CONNECTION_LIMIT`), 대시보드 캐시 학원별 태그.
- 3단계 정리: 안 쓰는 `components/exams/analysis/*`·컴포넌트 3개·codemod 스크립트 10개·CSS 제거, 성적표 화면의 죽은 인쇄 분기 접기, 결제·상벌점 규칙·학생의 예전 스키마 분기 제거, 서비스 13곳의 학원 조회를 공용 `getDivisionBySlugOrThrow` 하나로, 서비스의 한글 일반 Error 89곳을 같은 상태 코드의 AppError 로(사용자에게 실제 사유가 보임), CLAUDE.md 디렉터리 지도.
- 4단계 테스트: `tests/unit/refactor-safety.test.ts`(동시 호출 공유·주간 석차 일괄=주별·목업 환불 한도와 원결제 삭제 차단·P2034 재시도), `tests/unit/attendance-close-run.test.ts`(자동 마감 실제 실행·실패일 체크포인트·학원별 계속). 서비스 가짜 모듈용 `tests/helpers/division-lookup.ts`.
- 검증: typecheck·lint 0, 테스트 995/995(죽은 화면 테스트 32개 제거, 새 테스트 7개), `next build` 성공(목업 환경변수). 로컬 실DB(별도 컨테이너 `study-hall-refactor-db`, 합성 데이터 경찰 40명·소방 30명): 기준 코드 대비 읽기 48호출 결과 동일(대시보드 `unavailableSections: []` 추가만), 쓰기 11장면 결과 동일, 총 쿼리 749→544(아침 미리보기 48→29, 면담 성적 신호 56→30, 상담 자료 94→68). 동시 저장 6회 자동 상벌점 중복 0(기준 코드도 로컬에서 재현 안 됨 — 예방 수정). 리팩토링 빌드 목업 3310 화면 순회: 관리자 32·조교 3·학생 7 화면 × 1440·390 = 84회, 오류·오류 화면·가로 넘침 0.
- 하지 않은 것(계획의 보류): 목업/Prisma 이중 경로 분리, 2,000줄급 서비스·대형 UI 분할, globals.css 덮어쓰기 레이어 통합, 학생 로그인 방식·전역 속도 제한, 관리규정 학원 학생 목록 상벌점 SQL 집계(합성 데이터에 관리규정이 없어 검증 불가), 공용 포맷 함수(lib/format.ts — 다른 세션이 고치는 화면 파일), 한 줄 JSX 파일 Prettier(Prettier 미설치).
- 운영 반영 전 남은 것: 운영자 배포 승인 → main 에 합치기(그 사이 main 변경과 충돌 확인) → push·배포 → 운영 스모크. connection_limit 4 는 운영 Supabase pooler 연결 수를 배포 후 확인.

## 배포 — 2026-10-07 상담 자료 항상 2쪽 + 인쇄 표 전체 폭 (Claude, 운영자 요청)

- 원인(표 폭): 휴대폰용 규칙 `@media (max-width: 767px) .student-report .report-table { display: block }` 이 인쇄에도 적용됐다(A4 인쇄 영역 ≈ 703px < 767px) → 실제 브라우저 인쇄에서 성적표·상담 자료 표가 내용 폭으로 줄어 가운데 몰림. `@media screen and (max-width: 767px)` 로 한정.
- 상담 자료 2쪽: ① 상담 기록을 한 표로 압축(상담 내용 26mm · 목표|과제 15mm · 다음 점검일 · 학생 확인|상담자, 서명 표 통합) ② 긴 목록 상한(지각·결석 최근 10, 사유결석류 6, 상벌점 최근 10, 최근 면담 3, 확인할 것 4, 생략 건수 줄 표기) ③ `ReportFitPages`: 화면 A4 미리보기를 인쇄와 같은 글자·여백으로 맞추고, 인쇄 직전 높이를 재어 2쪽(271mm×2×0.94)을 넘으면 인쇄에서만 `zoom: var(--report-fit)`(최소 0.72).
- 검증: 학생 4명 × 4·8·12주 7가지를 A4 PDF(인쇄 폭 703px 평가)로 만들어 모두 2쪽, 배율 0.72~0.91. 성적표 표 전체 폭 확인. typecheck·lint, 테스트 1020/1020(상담 자료 서명 표 기대값 갱신).

## 커밋(미배포) — 2026-10-07 인쇄물 A4 맞춤 점검·수정 (Claude, 운영자 요청)

- 점검(로컬 A4 PDF, `.local/print-tables-qa/`): 성적표·면담 일지는 정상. 상담 자료는 학습 진단 구획이 통째로 다음 쪽으로 넘어가 1쪽 아래 45%가 비고 상담 기록이 3쪽에 홀로 남음, 학생 정보 표 3번째 줄에 작성일 한 칸, 과정 종료일이 없으면 `2026-03-19 ~`로 끝남, 설명 글자 7.5pt.
- 수정: 학습 진단 `keep` 해제(행 단위로만 넘김), 작성일을 제목 줄 오른쪽으로(`PrintHeader side`, 상담 자료·면담 일지), 과정 `…부터`, 진단 참고 문장을 진단 표 `참고` 행으로, 종이 최소 글자 8pt, 성적표 칸 위아래 1.1mm(한 장 유지).
- 결과: 상담 자료 3쪽 → 2쪽, 성적표 1쪽, 면담 일지 1쪽, 모든 표 12~198mm. typecheck·lint 0, 테스트 1020/1020. 배포는 오케스트라 메인이 다른 세션 작업과 함께 한다(운영자 지시).

## 커밋(미배포) — 2026-10-07 상담 자료(면담용)·성적표(학생용) 중복 정리 (Claude, 운영자 승인)

- 운영자 지적: 관리자 아침 성적 화면의 `상담 자료 인쇄`·`성적표 인쇄` 내용이 겹친다. 비교: 학생 정보·결론 문장·과목별 표·먼저 공부할 것이 양쪽에 있었고, 상담 자료 안에서도 `먼저 공부할 것`과 `학습 진단` 할 일 표가 같은 시험을 두 번 보여 줌.
- 변경: 상담 자료에서 `먼저 공부할 것` 표 삭제(안내 문장으로 학습 진단·학생용 성적표를 가리킴, `student-report.service.ts` 의 `study`·`easyThreshold` 필드 제거). 버튼 이름 `상담 자료 인쇄 (면담용)`(아침·정기 성적 화면, 학생 상세), 관리자 `성적표 인쇄 (학생용)`(학생 화면은 그대로 `성적표 인쇄`).
- 검증: typecheck·lint 0, 테스트 1020/1020(상담 자료에 먼저 공부할 것 없음·관리자 버튼 이름 단언 추가).

## 배포 — 2026-10-07 면담 기록 학생별 일지를 표 + 슬라이드로 (Claude, 운영자 승인 1안)

- 운영자 지적: 면담 기록만 다른 화면과 디자인·노출 방식이 다르다(왼쪽 좁은 학생 목록 + 오른쪽 일지 2단, 검색이 상자 안, `면담 기록` 버튼 2개, PC·휴대폰 동작이 다름). 비교 캡처: 경고 대상자·외출/휴가는 필터 바 → 표 → 슬라이드.
- 변경(`InterviewManager.tsx`, `InterviewJournal.tsx`, `globals.css`): 학생별 일지 탭 = 필터 바(학생 검색) → 세그먼트 `면담한 학생 n · 확인일 지남 n · 전체` → 9열 표(이름 · 수험번호 · 면담 · 최근 면담 · 다음 확인일 · 지킬 약속 · 벌점 · 상태 · 작업). 이름 → 일지 슬라이드(`variant="drawer"`), 일지의 `면담 기록`은 일지를 닫고 입력 슬라이드. 다른 탭(후속 확인·권장 대상)의 이름도 같은 슬라이드를 연다(탭 전환 없음). 왼쪽 목록 컴포넌트(`JournalStudentList`)와 2단 CSS 삭제. DB 변경 없음, 면담 입력·인쇄·학생 상세 면담 탭은 그대로.
- 운영 배포(운영자 승인): 인쇄물 변경 `6112b28`은 다른 세션의 `5220103` 배포(`dpl_6JLqSVqf2tTPDBcPm8p1fEJMr3or`)에 함께 반영, 면담 표는 `f911049` → `dpl_5TTFpBFFLWQQocyvvJ3XkBza4fXh` READY(study-hall-six). 스모크 `/`·`/login` 200, 관리자·학생 경로 307, API 401, 운영 CSS에 `interview-journal-drawer`·`print-sheet-root`·`report-arrival-weeks` 포함, 최근 1시간 런타임 오류 0. 로그인한 운영 화면·실제 인쇄는 운영자 확인 필요.
- 검증: typecheck·lint 0, 테스트 1020/1020(일지 슬라이드 렌더 1 추가). 로컬 3300 Playwright(`.local/interview-table-qa.cjs`, 캡처 `.local/print-tables-qa/interviews-table.png`·`interviews-drawer.png`): 표 9열·10행, 세그먼트 건수, 2단 목록 0, 슬라이드 제목 `테스트 이서연 면담 일지`·패널 중첩 0, 일지 → 면담 기록 시 입력 슬라이드만 열림, 1440 표 폭 = 틀 폭(약속 칸 320px), 390px 가로 넘침 0.

## 배포 — 2026-10-07 인쇄물 표 서식 통일·상담 자료 출결 정리·성적표 인쇄 전용 서식 (Claude, 운영자 요청·승인)

- 운영자 지적: ① 상담 자료 출결이 교시마다 한 줄이라 `수업: 기본이론` 사유결석이 71줄 ② 등원 시각이 카드 20장 ③ 성적표 인쇄가 화면을 새 창에 통째로 복사해 안내 문구·버튼 창, 빈 `주요 지표` 표, `형사소송법10/7` 같은 휴대폰용 칸, `누르면 …` 화면 안내, 긴 분석 표가 찍힘 ④ 인쇄물을 표 형태로. 오케스트라 메인 전달: 성적표가 A4 좌우를 다 쓰지 않음, 상담 자료 `한눈에 보기` 6칸 표가 오른쪽으로 넘침.
- 공통 인쇄 조각 `components/print/PrintParts.tsx`(제목+학생 정보 표, 구획, 결론 표 줄, 기록 없음 칸, 확인할 것 표, 서명 표). 상담 자료(`StudentCounselingReport.tsx`)·면담 일지(`InterviewJournalPrint.tsx`)가 사용 — 카드(`report-kpis`)·색 상자(`report-callout`)·등원 카드(`report-arrivals`)·점선 상자·목록·서명 줄 제거. 표 숫자 가운데 정렬, 인쇄 시 표 폭 100%·칸 안 줄바꿈(낱말 유지), `한눈에 보기` 표 고정 폭.
- 출결 집계 `lib/student-report.ts`: `exceptions`(교시별) → `daily`(지각·결석, 날짜별 한 줄) + `grouped`(사유결석·휴무·반휴, 같은 상태·사유를 기간 한 줄: 교시 `1~4교시`·날짜 `9/14~18, 9/21~25`·일수·교시 수). `periodsText`·`datesText`·`arrivalWeeks`(등원 주 단위 표).
- 성적표 인쇄: `ScorePrintButton`이 인쇄 전용 서식 `ScorePrintSheet`(+ `lib/exam-preview/score-print.ts`)를 문서 끝에 그리고 바로 인쇄 창(중간 창 없음, `html[data-print-sheet]` 동안 서식 외 숨김, 쪽 아래 `성적표 · n / m`). 아침: 학생 정보 → 성적 요약 → 과목별 성적 → 먼저 공부할 것 → 시험 기록(시험마다 점수·평균·차이·틀린 문항). 정기: 학생 정보(석차) → 성적 요약(화면과 같은 문장) → 과목별(과목 석차는 관리자만) → 점수 변화 5회 → 먼저 공부할 것. `MorningPersonalReport`·`RegularPersonalReport`는 버튼 한 줄만 교체(다른 세션 미커밋 파일 — 예전 인쇄 상태 `printing` 은 `false` 고정, 펼침 분기 정리는 후속). 반 분석 인쇄(`PreviewReport`)는 아직 새 창 방식이며, 학생 요약 칸이 빈 `주요 지표`로 찍히던 변환을 고침(`PreviewPrintButton`).
- 검증: typecheck·lint 0, 테스트 1019/1019(출결 묶음·표기·등원 주 표 단위 3, 성적표 서식 아침·정기·상담 자료 표 전용 렌더 3 추가). 로컬 3300 A4 PDF(`.local/print-tables-qa/`): 상담 자료·면담 일지·아침 성적표(1쪽) 모두 표, 좌우 여백 12mm 안 전체 폭, `한눈에 보기` 넘침 없음. 운영 화면과 같은 모양의 가짜 자료로 사유결석 76교시 → 2줄, 등원 20장 → 주 5줄 확인(`sample.pdf`). 학생 포털(91001) 성적표 인쇄도 서식만 인쇄 대상. 정기 성적표는 로컬 목업에 전과목 성적 자료가 없어 렌더 테스트로만 확인.

## 배포 — 2026-10-07 검색칸·반 분석 과목 탭·학생별 취약점 표 정리 (Claude, 운영자 요청)

- 학생 선택 검색칸(`StudentSearchCombobox`)·공지 검색: 안쪽 input 에 공통 입력 규칙(모서리·그림자·초점 링)이 겹쳐 클릭하면 상자 안에 둥근 상자가 생겼다 → `app/globals.css` 입력 규칙 바로 뒤에 `.admin-input-group` 정규화(그룹이 40px·테두리·그림자·초점 링을 그리고 안쪽 input 은 비움). 글자는 공통 입력 규격(15px).
- 반 분석 `분석 과목` 탭: 상자형(`scopeTabs`) → 3차 밑줄 탭(`admin-subtabs-underline`, scrollable). `PreviewReport.tsx`, `preview.module.css`.
- `학생별 취약점` 표(`CohortWeaknessTable.tsx`): 이름·수험번호 열 분리(이름은 table-link), 전 칸 가운데 정렬, 필터 칩 → 세그먼트, `확인할 내용`은 문제 종류만 한 줄씩(+ `응시 부족`, `report-summary.ts` `lowAttendance` 추가), 행마다 있던 `과목별 판단 근거` 접힘 상자 제거.
- 검증: typecheck·lint 통과, 테스트 1013/1013(렌더 테스트 1개 추가·1개 수정), 로컬 3300 Playwright 캡처(`.local/study-diagnosis-qa/search-focus.png`, `cohort-top.png`): 검색칸 높이 40·초점 시 바깥 테두리만 accent+링, 과목 탭 한 줄·밑줄, 표 9열 모두 center, details 0.
- 커밋: `globals.css`·`DESIGN.md`·`CURRENT_STATE.md`에 함께 있던 다른 세션의 미커밋 작업(브레드크럼·화면 계층)은 빼고 이 변경 부분만 골라 넣었다. 운영 배포: 운영자 승인 후 `c76ae0b` push → Vercel `dpl_GH34o4zXEZxmsoYSE6uXr9fREQXe` READY(study-hall-six). 스모크 `/`·`/login` 200, 관리자 경로 307, API 401, 운영 CSS에 `.admin-input-group:focus-within` 포함, 최근 1시간 런타임 오류 0. 로그인한 운영 화면은 직접 보지 못했다.

## 최신 배포 — 2026-10-07 학습 면담 시작 지점·기간 맞춤 (Claude, 운영자 요청 1·2·3)

계획 대비 빠졌던 3가지를 넣었다. ① 반 분석 `학생별 취약점` 표에 `작업` 열 `학습 면담` 버튼(`CohortWeaknessTable.tsx`, 미리보기 데이터 제외) ② 면담 일지 머리 `학습 면담` 버튼(`InterviewJournal.tsx` `onCreateStudy`, 학원 시험 관리가 켜진 경우 `admin/interviews/page.tsx` → `studyInterviewEnabled`) ③ 면담 슬라이드의 성적 요약·학습 진단 조회와 `성적 분석 ↗`(`kind=morning&from&to`)·`상담 자료 ↗`(`from&to`) 링크가 같은 기간(`reportRange(오늘)`, 4주)을 쓴다(`InterviewManager.tsx`, `InterviewScorePanel.tsx`, `StudyInterviewEditor.tsx`). 계획에서 남은 차이: 상담 자료 `다음 주 과제` 칸은 빈칸 유지(운영자 결정 2026-10-07 — 상담 자료는 면담 전에 인쇄하고 새 할 일은 면담 중 손으로 적는다. 정해 둔 할 일은 `지난 할 일` 구획에 나온다), 정기 결론 문장의 `상위 n%`는 그대로.
검증: typecheck·lint 통과, 테스트 1008/1008(렌더 테스트 2개 추가), 로컬 목업 3300 Playwright(`.local/entry-points-qa.cjs`): 일지 버튼 → 학습 면담 선택 상태로 슬라이드 열림, 링크 기간 9/10~10/7 = 성적 요약 기간, 반 분석 표 학습 면담 버튼 38개. DB 변경 없음.

## 최신 배포 — 2026-10-07 학생 화면 단순화 + 규칙 기반 학습 진단·학습 면담 (Claude, 운영자 승인)

**운영 반영 완료**: 운영 DB `prisma migrate deploy`로 `20261007120000_study_interview_diagnosis_tasks` 적용(완료 2026-10-07 18:43 KST, rolled_back_at null, `migrate status` up to date). 읽기 전용 확인: 기존 면담 5건 모두 GENERAL, `interview_tasks` 0건, RLS 켜짐, `interviews.category`·`diagnosis_snapshot` 존재. 커밋 `3017f9f` 푸시 → Vercel `dpl_5LRSAPunVc6QjVB2tfAZHjhns67D` READY, `study-hall-six.vercel.app` 연결. 로그인 없는 운영 확인(`.local/prod-smoke.cjs`): 학생 로그인 200, `/police/student`·`/police/admin/interviews` → 로그인 307, 새 API `study-context`·`score-signals`·`tasks/[taskId]` PATCH·`interviews` POST 모두 401. **로그인 후 실제 화면(학생 홈·성적표·학습 면담 저장·상담 자료 인쇄)은 운영자 확인 필요.**

운영자 요청: 학생 성적·상벌점·등원 화면이 복잡하다. 중학생도 이해하고, 성적 분석 → 취약점·공부할 것 진단 → 학습 면담 → 기록까지 이어지게. 운영자 결정: **외부 AI 사용 안 함(규칙 기반)**, 공부할 것은 **과목·시험 범위·문항 번호 수준**(단원 연결 작업 없음), **쉬운 화면부터 단계별**. 작업 시작 기준 `4a25d38`. 작업 중 다른 세션이 `92491a3`(관리자 UI 기준·면담 일지 정돈, 배포 표시)를 커밋했고 이 변경은 그 커밋에 들어가지 않았다 — 지금 작업 트리의 차이가 이번 변경이다.

**1단계(DB 변경 없음)**
- 학생 홈 `/[division]/student`(리다이렉트 → 홈): 할 일 → 요약 4칸 → 알림(공지) → 시험 → 최근 상벌점. 메뉴 `관리규정` 자리를 `홈`으로(6개 유지). `app/[division]/student/page.tsx`, `StudentPortalTabs/Frame.tsx`.
- 쉬운 말 사전 `lib/student-words.ts`(판정·경고·출결·상벌점·원인·할 일 상태 말).
- 학생 성적표 축소(관리자 화면 유지): `components/exams/preview/ReportAudience.tsx` + `ReferenceItemTable`(학생용 3/5열 표), `RegularPersonalReport`, `MorningPersonalReport`, `RegularLongitudinal`, `PreviewWorkspace`(학생 조회 조건 축소). `detectRegularDecline` flag 에 `amount`·`subject` 추가(학생 문장용, 기존 detail 유지).
- 상벌점 기간 버그 수정 `lib/student-point-period.ts`(위 숫자와 표가 같은 기간, `?range=all`), 출석 `교시 출석/등원 시각` 칩, 관리규정 `벌점과 경고 단계` 표, 내 정보 중복 제거.
- 면담 슬라이드 성적 요약 `InterviewScorePanel` + `lib/interview-score-summary.ts`, 권장 대상에 성적 신호(과락·하락) `lib/interview-recommend.ts`, `interview-recommendation.service.ts`, `RecommendedStudents.tsx`, API `/api/[division]/interviews/{study-context,score-signals}`.

**2단계(스키마 변경 — 로컬만)**
- 진단 `lib/study-diagnosis.ts`(원인: 실수·시간 부족·개념·어려운 문제·결시, 기준은 학원 `examAnalysis` 설정) + 새 설정 `examAnalysis.diagnosis.{maxTasks,minWrongItems}`(운영 규칙 분석 탭, 템플릿 라벨).
- 스키마: `Interview.category`(GENERAL/STUDY)·`diagnosisSnapshot`, 새 표 `InterviewTask`. 마이그레이션 `prisma/migrations/20261007120000_study_interview_diagnosis_tasks`(멱등, RLS·권한 회수). 목업 저장소 `interviewTasksByDivision`. 마이그레이션 전 DB 에서도 기존 면담 조회는 되도록 `listInterviews` 에 스키마 불일치 대비 조회를 넣었다.
- 서비스·API: `interview.service.ts`(할 일 저장·지난 할 일 확인·`updateInterviewTask`·`listStudentVisibleTasks`), `study-diagnosis.service.ts`, `POST /interviews`(학습 면담은 서버에서 진단 재계산), `PATCH /interviews/tasks/[taskId]`.
- 화면: `StudyInterviewEditor.tsx`(면담 슬라이드 `일반/학습 면담` 칩), 일지·일지 인쇄·후속 확인은 할 일을 약속으로 보여 줌(`journalPromises`), 학생 홈·성적 `공부할 것` 탭 `선생님과 정한 이번 주 할 일`(`StudentStudyTasks.tsx`, `StudyTasksContext.tsx`), 상담 자료 A4 `지난 할 일`·`학습 진단`, 학생 상세·개인 성적 분석 `학습 면담` 버튼.

**검증(이번 실행)**: `npm run typecheck` 통과, `npm run lint` 경고·오류 0, `npm run test` 1007/1007(다른 세션의 새 테스트 포함, 이번 새 테스트 `tests/unit/student-simplify.test.ts`, `tests/study-interview.test.ts`, `tests/render/exam-analysis-ui.test.ts` 학생/관리자 비교 추가). 로컬 Docker 목업 3300에서 Playwright(`.local/study-diagnosis-qa.cjs`, 결과·캡처 `.local/study-diagnosis-qa/`): 학생 홈·상벌점·출석·등원·내 정보·성적(아침·정기) 375/1440px 가로 넘침 0, 학생 성적표에 선택비율·우리 학원 정답률·`많이 틀린 문제 5` 없음, 면담 권장 대상 `전체 33 · 벌점 14 · 성적 26`, 학습 면담 편집기 진단·질문·성적 요약 표시, **저장 201**(로컬 목업 DB 에 테스트 학생 91001 학습 면담 1건·할 일 3건 생성), 학생 홈에 할 일 표시·면담 내용 미노출, 상담 자료에 `지난 할 일`·`학습 진단` 구획. 개발 서버가 QA 중 메모리 한도로 한 번 자동 재시작했다(코드 오류 아님).

**운영 빌드·로컬 개발 서버(같은 날 추가)**: 목업 환경변수·분리 빌드 폴더(`NEXT_DIST_DIR=.next-dev-buildqa`, 확인 후 삭제)로 `next build` 성공(타입·lint 검사 포함, 정적 21쪽 생성, 새 경로 `/[division]/student`·`/api/[division]/interviews/{study-context,score-signals,tasks/[taskId]}` 포함), `verify-icon-ssr` 통과. 빌드 중 찍힌 `api-auth:super-admin` 오류 로그는 로그인 없는 정적 생성에서 나오는 기존 기록이다. 로컬 Docker 개발 서버가 성적 화면을 받는 중 메모리 한도로 스스로 재시작해 "화면을 불러오지 못했습니다"가 떴다 → `compose.yaml` dev 에 `NODE_OPTIONS=--max-old-space-size=3072`(힙 2096MB → 3120MB), 재시작 중 깨진 `.next-dev` 빌드 캐시(볼륨 `next-cache`)만 비우고 다시 띄웠다. `dev-state`(목업 DB) 볼륨은 유지. 이후 메모리 재시작 0건, 면담·성적 관리·전체 분석 200. 개발 모드 첫 컴파일이 겹치면 `useContext null` 오류 화면이 한 번 뜰 수 있고 새로고침하면 사라진다. 로컬 성적 분석은 16MB 목업 파일을 요청마다 읽어 첫 접속 1~3분 걸린다.

**미확인·남은 일**
- 운영 반영 경위: 첫 `migrate deploy` 시도는 자동 승인 모드에서 거부됐고, 운영자가 직접 하라고 지시한 뒤 다시 실행해 적용했다. 순서는 마이그레이션 → 확인 → 푸시였다.
- 이번 커밋에서 뺀 파일: `compose.yaml`(로컬 Docker 설정, 다른 세션 변경 + 이번 `NODE_OPTIONS`), `docs/LOCAL_DEMO.md`·`docs/docker-development.md`(다른 세션), `docs/qa/2026-10-07-manual-morning-scores.md`(다른 세션, 미추적), `tsconfig.json`(줄바꿈만 다름).
- 운영 실제 성적으로 진단 문장 확인, A4 실제 인쇄 쪽 나눔은 운영자 확인 필요.
- 학생 문항 탭 아래 `복습 예약과 재풀이`(LearningViews, 다른 세션 미커밋 파일)는 휴대폰에서 길다. 이번에는 손대지 않았다.
- 다른 세션 미커밋 파일에 한 줄씩 더한 곳: `InterviewManager.tsx`(성적 요약·학습 면담·권장 대상 연결), `InterviewJournal.tsx`(학습 면담 표시·할 일 약속), `StudentDetailView.tsx`(`학습 면담` 버튼), `DESIGN.md`. 커밋할 때 함께 정리해야 한다.


## 2026-10-07 운영 수기채점 성적 보완 완료
사용자 승인: 경찰 관리반 OMR 판독 오류 수기채점, 2026-09-28/29/30·10-02/06의 첫 번째 점수만 운영 반영. 해당 날짜/과목의 기존 시험5개와 학생9명을 읽기 확인하여 누락12건(기존 해당 점수/응시자 연결 모두 없음)을 보완했다. 9/28은 사용자 명시 및 실제 시험과 동일한 형법, 형소법은 기존 형사소송법 과목으로 매칭. 온라인 표시는 10/2 두 건의 메모에 기록.
운영 관리 데이터 트랜잭션으로 MorningExamScore12개·기존 ExamSession의 총점-only 참여12개·ExamCorrection 이력12개를 추가. 총점 외 문항 답안/정오답/원본 통계/외부석차는 생성하지 않음. 수기 기록은 notes에 출처/사유, derivedScoreId로 원장 연결하되 derivedScoreSnapshot은 null로 남겨 원본 import 삭제가 수기 성적을 자동 삭제하지 못하도록 보호한다. 모든 기존 참여/성적/문항답안·9~10월 출결/상벌점의 깊은 동등 비교 통과.
동일 운영 계산 서비스 syncDbExamPoints로 9·10월 재계산, 두 달 모두 추가0/회수0. 요청12건 아침 교시 출석은 기존 PRESENT 보존. 운영 DB 재조회 및 loadAnalysisSource/enrichSessions 실제 분석 조립 결과12/12 요청점수 일치, 미제공 문항의 correct=null 확인. 브라우저 로그인 후 화면 렌더링은 이번 미검증이며 기존 분석 캐시TTL300초는 유지. 제품 코드/스키마/운영배포 변경 없음. 현재 점수입력 서비스는 가져온 시험의 직접입력을 막으므로 운영자 일반 수기입력 UI를 지원했다고 선언하면 안 됨. 이번은 승인된 누락데이터 보완 작업이며 추후 가져오기 재수정에는 수기보존 계약을 유지해야 함.
학생 개인정보·백업·계획·실행결과·검증스크립트는 Git제외 .local/manual-scores-20261007-*에만 보관. 다른 담당자 면담/UI 수정 보존. 다음 운영 확인은 개인 성적 분석에서 해당날짜 조회. 상세 [운영 보완 QA](docs/qa/2026-10-07-manual-morning-scores.md).


## 2026-10-07 로컬 Docker 재실행·접속 포트 수정
기존 study-hall-dev-1이 Exited255 상태. 재시작 시 Windows TCP 제외 범위2997~3096/3097~3196에 포함된3000/3110이 차단되는 것을 netsh 읽기조회 및 Docker bind 오류로 확인. compose 호스트포트를 STUDY_HALL_PORT(기본3300)로 설정하고 NEXT_PUBLIC_APP_URL을 일치시켰다. 내부3000/기존 dev-state·의존성·캐시 볼륨 유지, 이미지 재빌드/데이터 재시드/삭제 없음. docker compose up -d --no-build dev 성공·healthy.
실제 브라우저 http://localhost:3300/login 관리자 mock로그인200, 학생명단 페이지/API 정상 로딩(로컬 전체40명·재원35명·테스트학생 포함). 소스 MorningPersonalReport의 호스트/컨테이너 SHA256동일 확인. MOCK_MODE=true, 기존 .local/mock-db.json 존재 확인. 운영 Supabase와 별개인 파일 목업 데이터이며 hankuk 그룹의 Supabase 실행만으로 웹서버가 켜지는 것은 아니다. 현재 클로드 미완료 면담 관련 파일은 보존. 앱브라우저 login열기는 queued 응답으로 실제탭 전환 확인과 구분한다. QA근거 .local/docker-3300-qa.cjs와 docker-3300-students.png. docs/docker-development.md·LOCAL_DEMO 주소/시작·종료·자동반영 안내 갱신. Git커밋/푸시/운영배포/운영DB쓰기 없음.


## 배포 — 2026-10-07 반 전체 순서 + 오늘 수정분 모바일 점검 + 인쇄 정리 합본 (Claude, 운영자 승인)

- 운영자 요청: 성적 분석 `반 전체`에서 `전체 과목 요약`(레이더·과목표)이 학생 명단 아래에 묻혀 보기 어려움 → 순서를 `전체 과목 요약 → 기간 평균 비교 → 학생별 취약점 표`로 변경(`components/exams/preview/PreviewReport.tsx`). 개인 분석 순서는 그대로.
- 모바일(390px, scratchpad/mobile-audit.mjs: 가로 넘침·화면 밖 요소·버튼 높이 44/36/48·13px 미만 글자): 관리자 16화면(대시보드, 면담 기록·학생별 일지, 학생 상세 운영 현황·출결 상세 이력, 경고 대상자, 출석, 휴대폰, 성적 입력·성적 분석·학생별·개인 분석, 설정 기본 정보·성적 분석 기준, 상벌점 규칙, 외출/휴가), 조교 3화면, 학생 홈·출석·상벌점·성적·내 정보 모두 이상 없음.
- 운영자 지시: 다른 세션 작업이 끝나면 확인 후 한 번에 커밋·push·운영 배포(관리자 페이지 세션에 별도 배포 보류 요청함).
- 합본 배포: 관리자 페이지 세션의 39acaa1(상담 자료·성적표 중복 정리)·a6e3ab7(상담 자료 A4 2쪽 맞춤)과 함께 한 번에 push·배포(운영자 지시).
- 검증: 합친 상태 typecheck·lint(app·components·lib), 테스트 1020/1020, 상담 자료·성적표 A4 PDF 넘침 0. 관찰: 학습 진단 행이 많은 학생(목업 91007)은 상담 자료가 3쪽이며 3쪽에는 빈 `상담 기록` 칸만 남음(통째 넘김 규칙) — 2쪽 맞춤 보완 여부 운영자 결정 필요.

## 배포 — 2026-10-07 페이지·모달·탭·버튼 계층 재점검 (Claude, 운영자 승인 · 인쇄 수정 6112b28 과 함께 배포)

- 정적 점검(scratchpad/layer_audit.py): 드로어 안 드로어 0, 드로어 폭 덮어쓰기 0, 대화상자 안 1차 탭 0, 같은 단계 탭 연속 0. 중앙 모달 안 입력 5곳 중 4곳은 규칙상 허용(학생 삭제 확인 2, 경고 안내 완료 기록, 설정 변경 확인), `적용일 정정`(편집)은 SlideOver 로 변경. 드로어 본문 채움 버튼 4건은 footer 로 확인(오탐).
- 화면 점검(scratchpad/tabs-audit.mjs): 대시보드~성적 분석 14개 화면 탭 단계 정상(L1→L2→L3). 개인 분석에서 성적표 탭(요약·공부할 것…)이 L2로 `아침/정기`와 같은 단계 → 관리자 화면에서 L3(얇은 밑줄). 반 전체 리포트 항목 탭도 L3, 아침 과목 선택은 관리자에서 정기와 같은 선택 상자. 등원 설정의 2차 탭 아래 2차 탭(같은 단계 연속) → L3. 설정 화면은 로컬 서버 중단으로 화면 점검 미완, 정적 점검으로 대신 확인.
- 운영자 지적(개인 분석 머리·우측 버튼이 조회 조건에 붙음): 학생별 보기 추가 때 감싼 div 가 admin-flat-page 간격(24px)을 끊음 → 감싼 div 에 admin-flat-page.
- 검증: typecheck·lint, 테스트 1013/1013, 로컬 개인 분석 간격 24px·탭 단계 확인. 인쇄 수정(6112b28) 합친 뒤 A4 PDF 확인(성적표·상담 자료 모두 여백 안 전체 폭, 기간 상벌점 넘침 없음, 표 넘침 0), 테스트 1019/1019.

## 배포 — 2026-10-07 화면 계층 정리 + 시험 성적 구조 (Claude, 운영자 승인)

- 점검 결과: ① 설정 탭 `상벌점 규칙`(/points/rules)에서 사이드바 `상벌점`이 켜지고 `직원`(/staff)은 아무 메뉴도 켜지지 않음 ② 메뉴 첫 화면 제목이 메뉴 이름과 다름 ③ 하위 화면 위치 표시 없음 ④ 시험 성적에서 분석으로 가는 길이 둘(`/exams` 2차 `반 분석·학생별`, 별도 `/exams/analysis`의 자체 메뉴).
- 수정: `getShellLocation`(가장 긴 경로 하나만 활성, `alsoMatches`) + 사이드바 강조 일원화, 위치 표시 `AdminBreadcrumb`·`lib/admin-breadcrumbs.ts`, 제목 = 메뉴 이름(설정 h1 `설정`, 대시보드 `대시보드`), 시험 성적 = 1차 `성적 입력|성적 분석`(`ExamRouteTabs`) → 2차 아침/정기 → 3차(입력: 일일 입력·주간 현황·가져오기 / 분석: 반 전체·학생별), 개인 분석은 하위 화면, `진도·학습 분석 설정` → `설정 › 성적 분석 기준`(/settings/exam-analysis), 예전 주소 자동 이동. DESIGN.md 0절 13항.
- 검증: typecheck·lint, 테스트 1013/1013(위치 표시 단위 테스트, 성적 입력 탭 구성 렌더 테스트 갱신), 로컬 /points/rules·/exams·/exams/analysis 에서 위치·메뉴 강조·탭 단계 확인.

## 배포 — 2026-10-07 운영 확인 후 수정 4건 (Claude, 운영자 승인)

- 버튼 hover 흰 글자: 앞 레이어 `.admin-button:hover`(밝은 면)가 `.admin-button-primary:hover`를 같은 특이도·뒤 순서로 덮어 채움 버튼이 흰 바탕+흰 글자가 됨. CSS 끝에 종류별 hover·누름 규칙 추가. 자동 점검(scratchpad/hover-audit.mjs, 강제 hover·대비 3:1)으로 자가 시험 통과(일부러 깨면 1.04:1 검출).
- 휴대폰 관리 `표시 학생 전원 반납/전원 미반납/일괄 대여` 줄: 위아래 선 사이 4px라 버튼이 끼어 보임 → gap 8 · 아래 16px · 아래 선만(`PhoneCheckForm.tsx`).
- 학생 상세 운영 현황 `출결`: 표 세 개가 한 화면에 쌓임 → 3차 밑줄 탭(이번 주 출결표 / 출결 상세 이력 / 외출·휴가, 외출·휴가는 5건 제한 제거), 날짜 입력 손 스타일 제거(`StudentDetailTabs.tsx`). `.admin-shell [hidden]` 전역 숨김 규칙 추가.
- 면담 기록 일관성: 다른 세션이 `InterviewManager.tsx`를 크게 바꾸는 중(학습 면담·DB 마이그레이션, 미커밋)이라 마크업은 건드리지 않고 CSS 끝 레이어로 학생 목록을 표 규격, 조회 조건을 필터 바, 일지 패널을 패널 규격에 맞춤.
- 로컬 Docker 개발 서버가 부하로 여러 번 재시작·`useContext null` 오류 → `docker restart study-hall-dev-1`로 복구(로컬 전용). 다른 세션의 `/interviews/score-signals`가 로컬에서 40초 걸림.
- 검증: typecheck·lint, 테스트 1007/1007, 로컬 화면 확인(면담 3탭, 학생 상세 출결 탭 전환, hover 색). 운영자 승인으로 커밋·배포.

## 배포 — 2026-10-07 전 화면 기준 확정 1~3단계 + 면담 일지 정돈 (Claude, 운영자 승인)

- 1단계(기준): DESIGN.md 0절 12항 + `app/globals.css` 끝 `화면 기준 확정 레이어`. 버튼·입력 40px / 작게 32px / 크게 48px(로그인), 768px 미만 44/36. 버튼 글자 14px. 페이지 제목 22, 구획 제목 17. 표 안 `.admin-button` 은 글자화하지 않고 32px 외곽 버튼(앞선 표 글자화 규칙에서 .admin-button 제외). 정의 없던 `admin-button-secondary` 18곳 제거. 입력·선택 값 굵기 400. `.admin-meta-line`(세로선 회색 한 줄) 공용화.
- 2단계(화면): 경고 대상자(행마다 채움 `학생 보기` 제거 → 이름 링크, 필터 바·라벨, 액션→작업), 출석부 머리(전체 폭 링크 → 오른쪽 보조 버튼, 회색 알약 인원수 → 글자), 교시 설정(필수/활성 배지 → 메타 글자), 학생 상세·명단 삭제 확인창 버튼(Tailwind → admin-button/danger), 대시보드·외출휴가·휴대폰·전체공지(슈퍼관리자) 손버튼·알약 라벨 정리, 학생 로그인·관리자 로그인 48px.
- 검증: 로컬 3300 목업에서 31개 관리자 화면 자동 점검(버튼 높이 32/40/48 외 0건, 손버튼 0건, 제목 22px), 화면 캡처 검토, typecheck·lint, 테스트 982/982. 점검 스크립트는 세션 scratchpad(ui-sweep.mjs, 목업 로그인 값은 scripts/design-ui-audit.mjs 에서 읽고 출력하지 않음).
- 3단계(남은 화면): 대시보드 `오늘 처리할 일` 카드 격자 → 패널 행 목록(`.admin-todo-row`, 모바일 전용 .admin-action-card 규칙 삭제), 설정 기본 정보 `현재 설정` → 라벨·값 행 패널(배지·요일 칩 제거), 조교 출석체크 표 좌석 칸 휴대폰 72px(출결 칸 잘림 해소)·인원 알약 → 글자, 학생 등원 달력 로딩 칸 `조회 필요` → `–`(글자 중간 줄바꿈 해소). 조교 3화면·학생 7화면 390px 점검: 버튼 44px(모바일 기준) 외 0건.
- 커밋·배포: 운영자 지시("남은 부분도 계속 진행하고 끝나면 커밋, 배포")로 진행. 이 절과 아래 `면담 일지 화면 정돈` 절이 같은 커밋이다.
- 회귀 방지(계획 3단계, 2026-10-07): `tests/render/ui-standard.test.ts` — 정의 없는 `.admin-button-*` 이름, 대화상자 하단 `취소 → 확인`·채움 버튼 하나, 손으로 만든 Tailwind 버튼 상한 10(콤보 선택지·사이드바·상태 지정 등 남은 수), 높이 토큰 40/32/48·모바일 44/36. DESIGN.md 5.6 크기 표 갱신. 앱 코드 변경 없음(배포 불필요).

## 배포 — 2026-10-07 면담 일지 화면 정돈 (Claude)

- 운영자 요청: 네이버 예약·카카오 비즈니스 파트너센터처럼 사람이 만든 업무 화면으로(색은 유지). 두 사이트는 로그인 필요라 직접 보지 않고 일반 구성으로 진행(운영자 선택).
- 변경: 알약 배지·회차별 상자 제거 → 패널 하나 + 1px 구분선, 상태는 글자색, 부가 정보는 세로선 회색 한 줄, 학생 목록은 머리 행 3열 표, 회차는 왼쪽 날짜 열 + 오른쪽 본문, 후속 확인·면담 권장 탭은 표, 경고 단계 글자 표시. 파일: `components/interviews/InterviewJournal.tsx`·`InterviewManager.tsx`, `app/globals.css`(면담 일지 블록), DESIGN.md 0절 11항.
- 검증: typecheck·lint 통과, 테스트 982/982, 로컬 3300 데스크톱·모바일 확인. 커밋·배포는 운영자 승인 대기.
- 다음: 운영자가 요구한 전 페이지 일관성(버튼·표·폼·카드·서브탭·글자 계층) 정리 계획 승인 대기.

## 최신 배포 — 2026-10-07 면담 기록을 학생별 일지로 재구성 (Claude, 사용자 승인 A안)

- 배경: 운영 면담 화면이 월별·전 학생 혼합 목록에 사유/내용/후속을 같은 폭 3칸으로 보여 긴 내용이 세로로 끝없이 늘어났다(강선구·신희정 등 실제 기록).
- 변경: 1차 탭 `학생별 일지`(왼쪽 학생 목록 + 오른쪽 일지), 맨 위 `지켜야 할 약속`(약속이 적힌 최근 면담, 번호 목록·확인 완료 버튼), 면담 회차 패널(`[소제목]` 줄 인식 → 소제목 행), 상태 말 `후속 확인 전/확인 완료`, 입력 폼 `기본 틀 넣기`·지난 약속 패널·면담 내용 칸 높이 300px, 후속 확인 탭은 약속 목록+`일지 보기`·`확인 완료`, 권장 탭 `일지 보기`. 학생 상세 면담 탭도 같은 패널 + `면담 일지 열기`(`/interviews?student=`)·`일지 인쇄`. 새 인쇄 경로 `/[division]/admin/students/[id]/interviews`(A4).
- 파일: `lib/interview-journal.ts`(파싱·요약 순수 함수), `components/interviews/InterviewJournal.tsx`·`InterviewJournalPrint.tsx`·`InterviewManager.tsx`, `app/[division]/admin/interviews/page.tsx`(월 필터 없이 전체 조회), `app/[division]/admin/students/[id]/interviews/page.tsx`, `components/students/StudentDetailTabs.tsx`, `lib/interview-meta.ts`(상태 말), `app/globals.css`, DESIGN.md 0절 11항, `tests/unit/interview-journal.test.ts`.
- **DB·API 변경 없음.** 기존 content/result 텍스트를 화면에서만 나눈다. 소제목 기본값(학습 현황·성적·생활·지도)은 입력 보조 틀일 뿐 계산 규칙이 아니며, 소제목은 자유롭게 바꿔 써도 같은 방식으로 나뉜다(학원별 설정 저장은 DB 칸이 필요해 이번에 하지 않음).
- 검증: typecheck 통과, 테스트 982/982, 로컬 목업(3300)에서 데스크톱 2단·모바일 SlideOver·폼 틀 넣기·지난 약속·인쇄 미리보기 확인, 콘솔 오류 없음. 실제 인쇄 쪽 나눔과 운영 데이터 화면은 운영자 확인 필요.

## 최신 배포 — 2026-10-05 개인 성적표 인쇄의 문항 기준 통일 (Claude, 사용자 승인)

- 원인: 성적표 인쇄의 문항 표가 학생마다 `가장 먼저 복습` 과목(없으면 최근 과목) 하나만 담아, 같은 날짜라도 학생마다 다른 과목의 정답률이 나왔다. 날짜 머리 줄에 과목명이 없어 같은 시험처럼 보였다(계산 자체는 회차별로 동일).
- 운영자 결정(10/5, 1안): 인쇄는 조회 기간 **전 과목에서 내가 틀린 문항만**(빈 답 포함), 날짜·과목·번호 순. 머리 줄은 `9/11(목) 헌법 · 채점 결과`처럼 날짜·요일·과목을 함께 쓴다(화면의 여러 날짜 표도 동일). 인쇄 위에 기준 안내 한 줄을 출력한다.
- 파일: `components/exams/preview/MorningPersonalReport.tsx`, `components/exams/preview/ReferenceItemTable.tsx`. 정기시험(Regular) 인쇄는 과목별 h3 제목이 이미 있어 바꾸지 않았다.
- 검증: typecheck 통과, 테스트 975/975. 운영 로그인 후 실제 인쇄 확인은 운영자 확인 필요. 운영 DB 변경 없음.

## 정리 기록 — 2026-10-04 (Claude)

- 삭제: 예시 서버 복사본 `.local/exam-preview/runtime-*` 10개(최신 `runtime-cafc0f1c`만 남김), main 에 이미 합쳐지고 변경이 없던 Codex worktree 7개와 그 브랜치(`restart-police-v31`, `study-hall-absence-count/attendance-audit/monthly-exam-merits/integrated-release/point-policy-41-42/release-20260914`).
- **사고와 복구**: 커밋 전 검증용 임시 worktree(`D:/tmp/sh-wt`)를 지울 때 그 안의 node_modules 링크를 따라가 `apps/study-hall/node_modules` 와 `packages/config` 3개 파일이 지워졌다. 루트에서 `pnpm install --frozen-lockfile --force`, `git restore packages/config`, study-hall `npx prisma generate` 로 복구했고 `npm run typecheck` 통과·테스트 975/975 확인. 이후 링크가 있는 폴더는 링크를 먼저 끊고(`Directory.Delete(link,false)`) 남은 링크가 없을 때만 지운다. **주의**: study-hall 과 academy-ops 는 같은 `@prisma/client@6.19.2` 경로를 공유하므로 마지막에 generate 한 앱의 타입이 남는다(기존 구조).
- 운영자 결정(10/4) 반영: 출석 `수업 일괄 해제` 기능 커밋 `d3cf753` 배포(Vercel READY, DB 변경 없음), 공용 지침·상태·QA 문서 커밋 `a018d32`, Codex worktree 11개·브랜치와 `D:/Codex/worktrees` 잔여물 전부 삭제(링크 먼저 끊고 삭제, 본 저장소 node_modules·packages/config 무손상 확인). 남은 것: `compose.yaml` 로컬 목업 설정 2줄(미커밋, 로컬 Docker 전용), worktree 없는 브랜치 `codex/class-pass-redeploy-20260417`·`codex/study-hall-exam-points-20260914`, score-predict 미추적 파일.

## 최신 배포 — 2026-10-04 관리자 화면 SaaS 정리 + 학생 상담 자료 A4 + 개인 성적표 개편 (Claude, 커밋 `262ce09`, 사용자 승인)

커밋 `262ce09`(main 푸시, `[deploy study-hall]`)에 아래 두 절(관리자 화면 정리·개인 성적표 개편)의 변경 39개 파일을 담았다. 제외: 다른 세션의 수업 해제(출석) 작업 — `AdminAttendanceBoard.tsx`, `attendance.service.ts`, `attendance/recurring/route.ts`, `class-attendance-release.*`, `policy-attendance-workflow.test.ts`, `compose.yaml`, DESIGN.md 의 `출석 일괄 적용…수업 해제` 한 줄 — 및 공용 문서(AGENTS/CLAUDE/HANDOFF/ORCHESTRA/ACADEMY_TEMPLATES/CURRENT_STATE/DEVELOPMENT_CONTRACT, docs/archive, Codex qa 문서). 커밋 전 깨끗한 worktree 에서 스테이지만으로 tsc 통과·테스트 969/969. **배포 확인**: Vercel `dpl_7VFdYURfwAk6WQPD8o9b2VbuZiqG` READY, 운영 별칭 `study-hall-six.vercel.app` 이 이 배포를 가리킴. 비로그인 `/police/admin/students/x/report` → 로그인으로 307. 운영 로그인 후 실제 화면·상담 자료 인쇄는 아직 확인 안 함(운영자 확인 필요). 운영 DB 변경 없음.

### (이전 제목) 관리자 화면 SaaS 정리 + 학생 상담 자료 A4

운영자 지시: "어설픈 디자인이 아니라 실제 운영 SaaS 수준으로, 순서대로 계속 수정" + "면담 때 학생별 성적·등원 시각·출결·상벌점을 A4에 잘림 없이 인쇄". 규칙은 `DESIGN.md` **0절**(이 절이 다른 절보다 우선), 점검 근거는 `docs/qa/2026-10-03-ui-consistency-audit.md`.

- 공통(`app/globals.css`): 중립색 토큰을 차가운 회색 계열로, `--admin-shadow-xs/sm`·`--admin-focus-ring` 추가. 파일 끝 `SaaS 정리 레이어`가 덮는다 — `.admin-text-action`=외곽 버튼, 표=가로선·중립 머리글·둥근 묶음, 1차 탭=밑줄, 2차=회색 트랙 세그먼트, 3차=`.admin-subtabs-underline`, 요약 값 왼쪽 정렬, 필터 바·빈 상태·입력 초점 통일. 768px 미만 규격은 건드리지 않음.
- 화면: 면담 요약 패널(`InterviewContextPanel`: 패널 머리 + 숫자 4칸 + 이름 붙은 행, `성적 분석 ↗`·`상담 자료 ↗` 버튼), 학생 상세(머리에 배지·`경고 조정`·`성적 분석`·`상담 자료 인쇄`, 메모 패널, 기본 정보 정렬, 퇴실 안내 danger notice), 학생 명단(필터 바 하나 + 상태 세그먼트 건수, 중복 필터 제거), 수납(작업 버튼 오른쪽 정렬), 좌석(배치 편집 버튼·검색 입력 표준화), 통계/보고서(조회 바 + `엑셀 내보내기` 패널, 성적 내보내기 폼 행), 운영 규칙(2단 세그먼트·3단 밑줄, 색 다른 카드 제거), 경고 대상자(빈 상태 통일).
- **학생 상담 자료(신규)** `/[division]/admin/students/[id]/report`: `lib/student-report.ts`(기간·출결·등원·상벌점 집계, 테스트 4) + `lib/services/student-report.service.ts`(현재 학원·학생으로 좁혀 조회, 실패 영역은 비우고 나머지 인쇄) + `components/students/StudentCounselingReport.tsx`. 내용: 한눈에 보기 6칸·결론 → 아침 성적(과목표·주별 점수·먼저 공부할 것 6줄) → 정기 최근 회차 → 출결(건수·예외 목록) → 등원 시각(날짜별 칩, 지각 표시, 평균/가장 이른/늦은) → 상벌점 → 최근 면담 3건 → 상담 기록 빈칸·서명. 기간 기본 4주(최대 186일), 화면 상단 기간·빠른 기간·인쇄 버튼(`data-print-hide`). 인쇄 CSS: A4 세로 12mm, 관리자 틀 숨김, 표 머리 반복·행 분할 없음, 요약·상담 기록 통째 넘김, 쪽 아래 `학생 상담 자료 · n / m`. Playwright PDF로 확인(목업 학생 1명에 등원 47일·지각 5·상벌점 7건 예시 기록을 **예시 런타임 mock DB에만** 추가): 3쪽, 잘림 없음.
- 개인 성적 분석의 이전 `상담지 인쇄`(CounselingSheet)는 삭제하고 같은 기간의 상담 자료로 연결.
- 출석부 `AdminAttendanceBoard.tsx`는 다른 세션(수업 해제) 미커밋 작업이 있어 **수정하지 않음** — 공통 스타일로 버튼·표만 바뀜. 학생 포털(모바일) 화면은 이번에 개별 정리하지 않음.
- 검증: `npm run test` 975/975, `tsc`, 수정 파일 eslint, 1440px·375px 실제 화면(목업), 상담 자료 A4 PDF. 개발 서버 첫 컴파일에서 `useContext null` 오류 화면이 두 번 떴다가 새로고침으로 사라짐(예시 런타임 핫리로드 현상). 목업 환경변수로 `next build`(NEXT_DIST_DIR 분리) 통과 — `/[division]/admin/students/[id]/report` 포함.
- 남은 일: 커밋·배포 승인 대기. 운영에서 상담 자료 인쇄 1회 확인. 출석부 화면 정리(다른 세션 작업 정리 후). 학생 포털 화면 점검.

## 최신 로컬 구현 — 2026-10-03 개인 성적표 개편 (Claude, 미커밋·미배포)

운영자 요청: 다음 주 학생 면담을 PC 화면으로 함께 보며 진행하므로, 중학교 1학년도 바로 이해하고 정보를 찾을 수 있어야 한다. 접힌 정보·복잡한 나열을 없앤다. 승인 범위 A(면담 전 필수)+B(상담지 인쇄)+개인 성적표 재구성. 계산·학원 설정·운영 DB는 바꾸지 않았다.

- 아침 개인 성적표(`MorningPersonalReport`, 학생·관리자 공통) 탭 5개 → 4개: `요약 · 공부할 것 · 점수 변화 · 문항`. 화면 값은 새 순수 모듈 `lib/exam-preview/morning-personal.ts`(과목별 내 평균/전체 평균/차이/상태, 결론 문장, 공부할 것 목록, ISO 주 → 월요일). 요약 = 결론 문장 → 4칸 → 과목표(최근 4주 점수 포함). `판단 보류` 대신 실제 비교 + `N회 기록 · 참고`. 상태 `과락 N회 / 가장 먼저 복습 / 복습 필요 / 평균 이상 / 잘하고 있음`(잘하고 있음 기준 = 학원 설정 `morning.classGapPercent`, 참고 기준 = `morning.movingAverageSessions`). 차이는 `5점 높음/8점 낮음`, 석차는 `N위 / M명`, 주는 `9/28 주`.
- 공부할 것 = 공용 `StudyTable`(전체 평균보다 많이 낮았던 시험부터, 많이 맞힌 문제의 오답 번호는 빨간 굵은 글자, 번호 클릭 → 문항 탭). 단원별 점검(`TopicLearning`)은 문항-단원 연결이 있을 때만(운영 police 는 0건이라 숨김).
- 정기 개인 성적표(`RegularPersonalReport`)도 같은 탭 이름 + 정기 전용 `석차 비교`: `요약 · 공부할 것 · 석차 비교 · 점수 변화 · 문항`. 등급 표시는 `과락 / 잘하고 있음 / 보통 / 복습 필요`. 접힌 영역(득점률 레이더, 상위 비율 그래프, 직접 입력 성적, 복습 예약, 상담 참고) 제거·펼침. `RegularLongitudinal` 표는 `차이 / 지난 시험보다 / 전체 석차 N위 / M명`.
- 관리자 아침 성적표: `상담지 인쇄`(새 `CounselingSheet`, A4 한 장: 결론·과목표·먼저 공부할 것 5줄·출결·상담 내용/다음 주 과제/다음 점검일 빈칸). 인쇄 버튼은 `성적표 인쇄` 하나(`PreviewPrintButton single`). 출결 표는 요약 탭 아래 관리자에게만 보이고 성적표 인쇄에서 빠진다.
- `PreviewWorkspace`: 주소에 시험 구분이 없으면 성적 있는 시험을 먼저 연다(`defaultKindDecision`, 정기 0회면 아침). 학생 화면 조회 영역 이름 `조회 조건`.
- 면담 기록 슬라이드(`InterviewContextPanel` `scoreHref`, 새 탭)와 학생 상세 성적 탭에 `성적 분석 보기` 링크.
- 기타: `ReferenceItemBrowser`는 시험일이 하나뿐이면 안쪽 시험일 선택을 숨김(같은 선택이 두 번 보이던 문제). 차트 범례도 `전체 평균`(`PreviewTrend externalLabel`). 음수 반올림을 대칭으로(-6.25 → 6.3점 낮음, 평균 표시와 일치). `LearningOverview.tsx` 삭제(대체됨).
- 검증: `npm run test` 971/971, `tsc --noEmit`, 수정 파일 eslint 통과. 새 테스트 `tests/unit/morning-personal.test.ts`(10), 렌더 테스트 아침·정기 재작성. 예시 서버(목업, `scripts/start-exam-preview.mjs`)에서 관리자 1440px 아침·정기 각 탭, 학생 375px 가로 넘침 없음(요약 1,329px), 면담 슬라이드 링크 확인. **상담지 인쇄 팝업은 미리보기 창이 팝업을 열지 못해 화면 확인 못 함**(숨은 상담지 DOM 내용만 확인). 운영 화면 미확인.
- 남은 일: 커밋·배포(운영자 승인 대기). 배포 후 운영에서 상담지 인쇄 1회 확인. 문항 탭(모바일 3,800px)·단원별 점검 표는 이번 범위 밖.

## 최신 운영 배포 — 2026-10-02 성적 화면
성적 개선 cd1d5c5 main 푸시 및 Vercel dpl_2iSSZzf6xRDdFsEYwzL3WZNMq23e READY, study-hall-six.vercel.app 연결 확인. 작업트리 테스트962건/lint/typecheck 및 운영 빌드 통과. 운영 로그인 HTTP200 확인, 로그인 후 성적 UI는 이번 미검증. 로컬 목업과 출석해제 작업 제외. [배포 기록](docs/releases/2026-10-02-score-usability.md).


## 2026-10-02 로컬 성적 메뉴·조회 기간 정리
사용자 선택 영역 PreviewWorkspace 상단 링크를 공통 admin-subtabs 메뉴로 변경했다. 성적 입력·가져오기 / 전체 분석 / 개인 분석(개인 화면만) / 진도·학습 분석 설정 순서이며 aria-current로 현재 위치를 표시한다. 메뉴는 페이지 이동 링크이며 탭 역할을 부여하지 않는다. 전체/개인 분석 이동은 시험종류·현재 조회기간을 보존한다. 학생 화면에는 관리자 메뉴를 노출하지 않는다.
아침 조회 월은 월별 선택으로 표시하고, 실제 범위가 해당 월 1일~말일과 일치할 때만 값을 표시한다. 여러 달/직접 지정 범위에서 종료일의 월을 전체 조회월처럼 표시하던 혼동을 제거했다. 월 선택은 시작일·종료일을 같이 변경하며 빠른 기간은 유지한다. 계산·저장·학원 설정 변경 없음.
검증: 타입검사, 해당 파일 lint, 성적 렌더 테스트25/25 통과. Docker localhost3000 실제 브라우저에서 현재 개인메뉴·전체분석 URL기간 보존·9월~10월의 월칸 비움·9월선택→9/1~9/30조회·390px 가로넘침 없음 확인. 데스크톱 화면 직접 검토. 근거 .local/score-menu-qa.cjs, score-menu-desktop.png, score-menu-mobile.png. 운영 배포/커밋/푸시 없음. 기존 4열 성적표/접힌 상세 구성을 유지하며 카드나 설명 영역을 늘리지 않았다.



## 2026-10-02 로컬 완료 — 수업 일괄 해제

기준 HEAD `4bb19a9`. 출석 관리의 학생 일괄 적용 패널에 ‘수업 해제’를 추가했다. 학생·기간·요일·교시 선택 → 건수 확인 → 확정이며 수업만 미처리로 변경한다. 다른 상태·시험 자동 출처 보호, 학원 분리·관리자 권한·미리보기 충돌 검사, 과거/오늘 파생 계산과 미래 계산 제외를 포함한다. 일반 반복의 미처리 선택 오류와 날짜 변경 시 요일 초기화도 정리했다.

전체 단위960/960, 추가 과거 재시도 포함 기능5/5, 출결 회귀40/40, 타입/lint 통과. 로컬 브라우저에서 수업79칸 해제·출석1칸 보존과 390/768/1280px 확인. HTTP 권한·실제 로컬 PostgreSQL 삭제/충돌 검증 통과. 기존 미커밋 작업 보존. 이번 기능의 운영 DB·마이그레이션·커밋·푸시·배포 없음. 다음 행동은 사용자 로컬 검토 후 별도 운영 반영 승인. [사용법·검증 범위](docs/qa/2026-10-02-class-release-feature.md).

## 최신 감사 — 2026-10-02 학습 면담 준비도

운영 읽기 전용 확인: 아침 실점수390건, 문항답안7,280건, 가져오기14회, 운영학생28명. 첫 진단 면담에 활용 가능하나 세부단원/문항연결0, 복습기록1, 면담0으로 정밀진단과 후속효과 검증은 미완성. 오늘 형법 회차25명 반영 확인. 브라우저 초기화 실패로 화면 렌더링은 이번 미검증. 제품/운영 쓰기 없음. 상세: [면담 준비도 감사](docs/qa/2026-10-02-counseling-readiness.md).


## 최신 진단 — 2026-10-02 아침모의고사 가져오기

사용자 제공 15-38-41 채점표/15-38-43 문항분석표를 일반 MORNING parseExamImportPair로 검사하여 INVALID_HEADER(열 이름이 비어 있거나 너무 깁니다)를 재현했다. 실제 원인은 Moon 정답 있는 20개 문항의 과목명이 모두 빈 값이어서 label 검증에서 실패하는 것이다. 시험일 2026-10-02, 응시인원 197명. 원본을 변경하지 않고 메모리에서만 빈 과목명을 진단용 값으로 채운 재검사에서는 파서 통과, Score/Errata 각 197건, 빈 수험번호 0건. 이는 파서 검증만이며 실제 과목 매칭·운영 성적 저장·출석 반영 성공을 의미하지 않는다. 실제 과목명은 아직 사용자 확인 필요. 운영 데이터/제품 코드/배포 변경 없음. 다음 담당자는 실제 과목을 확인한 뒤 해당 학원 시험 과목과 매칭하여 미리보기를 검증해야 하며 임의 과목으로 저장하면 안 된다.


## 운영 등록 완료 — 2026-10-01 / 10월 기본반

사용자 지정 21명을 2026-10-01~10-31 월~금 1~4교시에 수업: 기본반으로 등록했다. 기존 해당 1,848칸이 모두 수업(이름 미지정)이었고, 충돌/휴무/반휴/수강기간 예외 없음 확인 후 실제 applyRecurringAttendance 서비스로 수업명을 반영했다. 결과: 21명 × 22일 × 4교시 = 1,848칸 갱신, 파생 계산 경고 0. 전체 대상 DB 검증 통과, 대상 외 10월 출결(아침시험/주말/다른 학생/다른 교시) 불변 확인. 운영 UI 10/30 수업·기본반 표시 확인. 제품 코드·설정 변경이나 신규 배포 없음. 개인정보 포함 대상 명단/백업/결과는 Git 제외 .local/october-basic-class-* 에만 저장한다.

## 최신 배포 완료 — 2026-10-01

누적시험 수정 코드 9e17bfa를 main에 푸시하고 Vercel production dpl_DySe3oUncFKjyqJsVg9sBiHZAUm8 READY 및 운영 별칭 연결을 확인했다. 실제 원본 파일 첨부 미리보기 200, 기존 응시 27명 보호/누락 답안 2건 안내/미확인 1명 미선택을 운영 UI에서 확인했다. 오늘 출석 재저장 없음. 전체 955/955, production 빌드(lint/typecheck 포함), 목요일 HTTP 저장·재조회 통합 테스트 통과. 아래 이전 '미배포' 상태는 배포 전 기록이다. 자세한 결과는 [배포 QA](docs/qa/2026-10-01-cumulative-attendance-release.md)를 따른다.

## 최신 완료 — 2026-10-01 누적시험 출석 반영

사용자가 오늘 파일의 출석 반영을 승인했다. 누적 가져오기의 요일 판정을 성적 자동화 요일에서 학원 관리규정의 아침 교시 관리 요일로 분리하고, 식별번호 없는 정상 답안 블록은 제외 건수를 안내하도록 수정했다. 시작일·휴강일·설정 적용일·학원/교시 소유권·기존 사유 보호는 유지한다.

- 운영 원장: 수정된 실제 가져오기 서비스의 미리보기/확정 경로로 2026-10-01 아침모의고사 27명 PRESENT/MORNING_CUMULATIVE 저장. 운영 브라우저에서도 28명 중 응시 27명, 노예빈 1명 미처리 확인.
- 파일: 식별 가능 192명 중 학원 일치 27명, 불일치 165명, 수험번호 없는 답안 2건 제외. 노예빈은 파일에 없으므로 추정 결석/벌점을 부여하지 않음.
- 성적·시험 회차·학원 설정·다른 교시 출결 불변 확인. 파생 계산 재시도 후 경고 0건, 상벌점 원장도 불변.
- 검증: 관련 단위 테스트 10/10, 타입 검사 통과. 전체 955개 중 954 통과, 학생 상세 수업 표시 테스트 1건 실패(단독 실행에도 재현, 이번 수정 대상 외; 9월 fixture와 현재 월 필터 점검 필요).
- **오늘 데이터 반영 완료와 코드 배포는 별개**: 제품 코드 수정은 로컬만. Git 커밋·푸시·운영 배포하지 않음. 다음 배포 시 아래 QA 문서 참고.
- 실행·백업·미리보기 증거는 Git 제외 `.local/cumulative-*-20261001.*`, 상세는 [QA 기록](docs/qa/2026-10-01-cumulative-attendance-diagnosis.md). 아래 조사 당시 0건 기록은 반영 전 시점이다.

## 최신 추가 확인 — 2026-10-01

사용자 재확정: 누적은 성적을 저장하지 않고 출석만 반영한다. 후속 읽기 전용 재조회에서도 **10/1 아침모의고사 교시 출결 전체 0건**이므로 오늘 출석은 아직 반영되지 않았다. 오류 조회·진단 사본 검증은 출석 저장이 아니다. 운영 반영은 실행하지 않았다. 누적 성적 기능 추가는 범위에 포함하지 않는다.

전체 기간 추가 조회: 경찰 누적모의고사 과목은 비활성이고 해당 성적 0건, 누적 이름의 session 0건, 누적 응시 자동 출결 0건이다. 저장된 아침 단과 성적은 341행(실점수339), 가져오기12회이며 정기/일반 성적은 0행이다. 현재 남아 있는 기록에서 누적 성적 반영 성공을 확인할 수 없으며, 과거 삭제/원본 채점 프로그램 실행까지 조사한 것은 아니다. 누적 가져오기 화면은 응시 여부만 저장한다. 조사 기록 5절 참조.

추가 질문 검증: 실제 분석표는 3과목 × 25 = 75문항이며 문항 수가 오류 원인은 아니다. 진단용 메모리 사본에서 수험번호 누락 블록 2개를 제외하면 기존 파서가 나머지 192개 블록을 읽는다(원본/제품에는 반영하지 않음). 조회 DB의 9/17·9/24에는 성적 session·성적 행·누적 자동 출석 기록이 없고 날짜별 설정은 목요일 제외다. 과거 채점 프로그램 실행 여부나 다른 환경/날짜 저장 여부는 이 조회만으로 단정하지 않는다. 성적 가져오기와 누적 출석 가져오기의 교시 제한 처리 차이는 조사 기록 4절에 설명했다.

HEAD `a2c1f86`에서 누적시험 출석 가져오기 오류를 조사했다. 운영 UI 및 읽기 전용 설정 조회 결과, 10/1(목)은 자동 상벌점의 아침시험 요일 `[1,2,3,5]`에 포함되지 않아 출석 교시 resolver가 null이다. 관리규정의 교시 요일에는 목요일이 포함돼 두 설정이 다르다. 첨부 `18-45-42` 채점표는 별도로 Score 2·3행의 수험번호 누락 오류가 재현됐으며 화면의 `10-28-43` 파일과 동일하다고 가정하지 않는다. 단위 테스트 6/6 통과. 제품 코드·운영 데이터 변경 및 배포 없음. 세부 근거와 운영자가 결정할 적용 범위는 [조사 기록](docs/qa/2026-10-01-cumulative-attendance-diagnosis.md)에 기록했다.

아래는 9/25 기록이다. 미커밋 목록·승인 대기·배포 여부를 현재 상태로 간주하지 말고 시작 시 Git과 운영 환경을 재확인한다.

확인일: **2026-09-25, Asia/Seoul**. 로컬 기준 HEAD `0d1f8f4` (origin/main 보다 2 앞섬, 푸시하지 않음). 이 문서는 시점 기록이다. 다음 작업자는 Git·DB·배포 상태를 재확인한다. 영구 계약은 [DEVELOPMENT_CONTRACT.md](DEVELOPMENT_CONTRACT.md).

## 1. 이번 문서 정리의 범위

코드·미커밋 diff·과거 QA 문서를 읽고 전체 자동 테스트를 다시 실행했다. 운영 연결 대상의 테이블/마이그레이션 메타데이터와 Vercel 상태를 읽기 전용으로 조회했다. 제품 코드 수정, 운영 DB 쓰기, 마이그레이션 실행, 커밋·푸시·배포는 하지 않았다.

## 2. Claude 전달 내용과 대조 결과

| 전달 내용 | 현재 확인 결과 | 다음 조치 |
|---|---|---|
| 성적 분석이 전체 학원 시험 이력을 읽는다 | `lib/exam-preview/service.ts:getExamPreview` → `source.ts:loadAnalysisSource`가 학원 전체 session/item/participant/response를 읽는다. 해당 source 쿼리에는 기간 조건·take/skip·캐시가 없다. 학습 GET/POST도 learningSource를 호출한다. **9/25 실측: 누적 기간에 정비례해 1년치 2.0초·2년치 4.1초. §4-1 참조** | 범위 조회로 바꾸면 기간과 무관하게 약 30ms. §6-2 |
| 날짜 필터·캐시가 전혀 없다 | **일괄 단정은 부정확.** API에는 examDate/from/to 검증과 분석 단계의 필터가 있다. 기존 `services/exam-analysis.service.ts`, `morning-exam-analysis.service.ts`에는 학원·시험·기간별 300초 캐시가 있다. 다만 앞선 전체 source 로딩 비용은 남는다 | 화면 필터 유무와 SQL 필터 유무, 기존 캐시와 신규 source 경로를 구분 |
| LCP 14.3초 | 9/17 `exam-learning-review` 문서의 **로컬 서버 시작 직후 첫 정기 모바일 측정**. 반복 측정 중앙값 정기 모바일90/PC99, 아침 모바일93/PC99와 함께 기록돼 있다 | 운영 학생 화면의 현재 LCP로 인용하지 말 것. 전체 이력 쿼리가 14.3초의 원인이라는 인과는 아직 미검증 |
| 학습 문서가 JSONB 한 행에 계속 쌓인다 | `ExamLearningDocument.divisionId`가 PK, 학원당 JSONB 문서 하나. `learning-mutations.ts`는 audit/requests에 append하고 해당 배열의 총량 제한·분할·보관 정책은 확인되지 않음. 명령별 길이 제한과 트랜잭션/revision은 있음 | 성장 위험은 타당. 지금 장애라는 증거는 없음. 이력·중복 방지 보존하며 별도 설계 |
| exam_learning_documents 운영 마이그레이션 미적용 | **현재 조회 대상에서는 틀림.** 아래 읽기 전용 확인 참조 | 미적용을 전제로 재실행·resolve하지 말 것 |
| 테스트 13건 복구, 순위 대칭 미커밋 | 사용자 승인 후 해당 5개 파일만 `9f67adb` 로 커밋했다. 푸시·배포는 하지 않았다. 복구 전 ‘13건’ 수치는 Codex 가 독립 재현하지 않음 | 남은 미커밋은 §3 참조 |
| 931개 통과 | **이번 작업 트리에서 직접 재실행: 931 pass / 0 fail / 0 skip** | integration 폴더 및 실제 운영 QA까지 통과했다는 뜻은 아님 |

### DB 메타데이터 확인

기존 로컬 `.env.production.pull`이 지정한 DB에서 `SET TRANSACTION READ ONLY`로 조회했다. 이번에 운영 환경변수를 새로 내려받아 대조하지는 않았다.

- `to_regclass('study_hall.exam_learning_documents')`: 테이블 존재.
- migration: `20260916234314_exam_learning_documents`.
- `finished_at`: `2026-09-16T23:57:38.709Z` = **2026-09-17 08:57:38.709 KST**.
- `rolled_back_at`: null.
- 학생 데이터나 학습 문서 내용은 조회/수정하지 않았다.

따라서 이 연결 대상에 대해 “테이블이 없어 진도 설정이 깨졌다”는 가설은 성립하지 않는다. **9/25 실제 로그인 상태의 진도 설정 저장·재조회는 이번에 검증하지 않았다.** 다른 배포가 다른 DB를 쓰거나 화면이 실패하면 그 환경의 연결 대상·오류를 먼저 확인한다.

### 배포 상태

9/25 CLI에서 정식 별칭 `study-hall-six.vercel.app` 조회:

- READY: `dpl_7hvXYDPL9RdPBYgrc3CwoyKn1Q1k`.
- deployment URL: `study-hall-3hm6lg6ou-ikma-4087s-projects.vercel.app`.
- 정식 도메인 alias 포함 확인. 이번 조회만으로 배포 Git SHA와 미커밋 작업 포함 여부를 단정하지 않는다.
- 9/17 이 대화에서 등원 기기 숫자 키패드 변경 `6792736`의 READY/운영 문구를 확인한 이력이 있다. 9/25 실기기 키패드 재시험은 하지 않았다.

## 3. 커밋 상태 (9/25 갱신)

### 최신 커밋 — `a2c1f86`(9/25 Claude, 사용자 승인), 푸시·배포 안 함

성적 분석 개편 1~4단계와 시험 템플릿 과목 위로·아래로 버튼을 커밋했다(19개 파일: 아래 표의 ‘미커밋’ 표시 성적 분석 파일, `DESIGN.md`, `docs/exam-report-redesign.md`). 이 표에서 ‘미커밋’으로 적힌 성적 분석 행은 이제 `a2c1f86`에 들어 있다. **커밋에서 뺀 것**(Codex 작업 또는 공용 문서): `ACADEMY_TEMPLATES.md`, `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, `ORCHESTRA.md`, `CURRENT_STATE.md`, `DEVELOPMENT_CONTRACT.md`, `docs/archive/`, `docs/qa/2026-09-17-police-attendance-auto-points.md`, `tests/policy-attendance-workflow.test.ts`. 커밋 전 테스트 951/951, 타입체크 통과.

### 이번에 커밋한 것 — `9f67adb`, 푸시 안 함

| 파일 | 내용 |
|---|---|
| `lib/exam-analysis-assembler.ts` | 인접 순위 비교가 **위 5명·아래 4명**이던 비대칭을 **위 5·아래 5**로 맞췄다. `slice(index+1, index+5)` → `index+6`. 총 9명 → 10명. 위쪽은 원래부터 5명이었고 ‘전체 5명 제한’ 같은 것은 없었다 |
| `tests/unit/exam-analysis-assembler.test.ts` | 가운데·1위·최하위의 대칭 범위와 익명화 회귀 검사. 이전에는 개수를 고정한 검사가 없어 비대칭이 방치됐다 |
| `tests/render/exam-analysis-ui.test.ts` | 하네스에 `next/link`·외부 패키지·node 내장·CSS 모듈 처리 추가. 낡은 학생 SSR 검사 2건을 현행 `PreviewPage` 기준 1건으로 교체 |
| `tests/render/morning-analysis-ui.test.ts` | 하네스 동일 보강. 교체된 페이지를 검사하던 낡은 SSR 테스트 제거 |
| `tests/render/exam-import-wizard.test.ts` | `next/link` 스텁 추가 |

교체한 학생 SSR 테스트가 보장하는 것: 인증 세션의 학생이 params·query 로 주입된 id 를 이긴다, 학생 화면에서는 학생 명단을 읽지 않는다, 관리자 경로는 관리자 인증을 거친다. 두 변경 모두 코드를 일부러 되돌려 해당 테스트만 실패하는지 확인했다.

### 커밋 `0d1f8f4` — 버그 2건과 왼쪽 막대 제거, 푸시 안 함 (9/25 운영자 승인)

| 파일 | 내용 |
|---|---|
| `components/exams/preview/preview.module.css` | 9/25 Claude. 인쇄 전용 글자 숨김을 `.wrapCell` → 보고서 루트 `.reportTables` 로 넓힘(과목명 두 번 표시 버그). 본인 행 왼쪽 3px 막대와 선택 안내 상자 왼쪽 4px 막대 제거 |
| `components/exams/preview/RegularPersonalReport.tsx`, `lib/exam-preview/metrics.ts` | 9/25 Claude. 점수 분포표의 앞뒤 빈 구간 제거(`visibleDistributionBins`), ‘내 위치’ 열 대신 본인 구간 행 강조 |
| `tests/unit/exam-preview.test.ts`, `tests/render/exam-analysis-ui.test.ts` | 9/25 Claude. 위 두 버그와 왼쪽 막대 금지 회귀 테스트 |
| `DESIGN.md` | 9/25 Claude. §5.8·§9 에 ‘왼쪽 굵은 막대 금지’ 규칙(운영자 지시) |

### 아직 미커밋

| 파일 | 내용 |
|---|---|
| `docs/exam-report-redesign.md` | 9/25 Claude. 성적 분석표 재구성 기획. **운영자 승인(9/25)** — 탭 5개, 과락 40%, 아침 8주 |
| `lib/exam-analysis-settings.ts`, `components/settings/RulesSettingsManager.tsx` | 9/25 Claude, 1단계. `common.failCutoffPercent`(기본 40, 0=사용 안 함)와 설정 입력칸. 관리자 화면은 비밀번호 로그인이 필요해 브라우저 확인을 하지 못했다 |
| `lib/exam-preview/report-summary.ts`, `tests/unit/report-summary.test.ts` | 9/25 Claude, 1단계. 과락 판정·과목 판정(과락 아니면 기존 등급)·정기 한 줄 결론 순수 함수와 테스트 7개. 테스트 941/941, 타입체크 통과 |
| `components/exams/preview/RegularPersonalReport.tsx`, `RegularLongitudinal.tsx`, `PreviewWorkspace.tsx`, `lib/exam-preview/types.ts`, `service.ts`, `DESIGN.md`, `tests/render/exam-analysis-ui.test.ts` | 9/25 Claude, 2단계. 정기 개인 분석을 탭 5개로(학생·관리자 공통), 학생 정기/아침은 선택 칩, 한 줄 결론·과락 판정 표시, DESIGN.md 학생 성적 규칙 교체. 실측과 기획 차이는 `docs/exam-report-redesign.md` §9-2 |
| `components/exams/preview/MorningPersonalReport.tsx`(신규), `ReportTable.tsx`(신규), `PreviewReport.tsx`, `lib/morning-exam-analysis-schemas.ts`, `lib/exam-preview/report-summary.ts`, 테스트 | 9/25 Claude, 3단계. 아침 개인 분석 탭 5개, 기본 8주, 주간 성적표, 아침 한 줄 결론. 테스트 946/946, 타입체크 통과. 목표 초과 탭과 남은 일은 `docs/exam-report-redesign.md` §9-3 |
| `components/exams/preview/CohortWeaknessTable.tsx`(신규), `PreviewReport.tsx`, `ReportTable.tsx`(공용 칩), `lib/exam-preview/report-summary.ts`, 테스트 | 9/25 Claude, 4단계. 관리자 반 분석 첫 영역에 학생별 취약점 표. 관리자 화면은 비밀번호 로그인이 필요해 **브라우저 미확인**, 렌더 테스트로만 확인. 전체 테스트 949/949, 타입체크 통과 |
| `tests/unit/report-summary.test.ts` | 9/25 Claude. 경찰 정기 250점(헌법 50·형사법 100·경찰학 100) 조건 검증 테스트. **만점 출처**: 시험 전체 만점 = 가져온 파일에 있는 과목만 골라 시험 설정의 ‘문항 수 × 문항당 배점’ 합(`exam-import-assembler.ts:232`), 과목 만점 = 가져온 문항 배점 합(`exam-analysis-assembler.ts:108`). 과락선은 과목 만점 기준(헌법 20·형사법 40·경찰학 40). 테스트 서버의 300점은 합성 데이터(3과목 × 100점)다. 운영 police 정기 종류에 과목 4개가 등록돼 있어 설정값 확인 필요 |
| `components/exams/ExamTypeManager.tsx`, `tests/render/admin-settings-drawers.test.ts` | 9/25 Claude, 미커밋. 과목 위로·아래로 버튼. 편집 저장 시 과목 ID 유지·새 순서가 `displayOrder` 0..n 으로 반영되는지 JSDOM 테스트로 확인. 테스트 951/951, 타입체크 통과. 운영 DB 순서는 바꾸지 않았다 |
| (운영 설정 조회, 사용자 실행 읽기 전용 9/25) | police 정기 = 헌법 50·범죄학 50(**택1**) + 형사법 100 + 경찰학 100 = **250점** 확인. police 아침 설정 순서 = 헌법·형법·형사소송법·경찰학·누적모의고사(사용 안 함)로, 운영자가 말한 실제 순서(헌법·형소법·형법·누적·경찰학)와 **다르다**. 주간 성적표는 설정 순서를 따르므로 설정을 고쳐야 한다. 9/25 Claude 가 시험 템플릿 편집의 과목 행에 **위로·아래로 버튼**을 넣었다(`ExamTypeManager.moveSubject`, 첫 행 위로·끝 행 아래로 비활성). **운영 순서 변경은 운영자가 관리자 화면(설정 → 시험 템플릿 → 아침 모의고사 → 과목 구성)에서 직접** 헌법 → 형사소송법 → 형법 → 누적모의고사 → 경찰학으로 맞춰야 한다(배포 후). 저장은 과목 ID 를 유지하고 목록 위치를 `displayOrder` 로 쓴다(`exam.service.ts:710-721`, 폼 `id` 유지 70·109행) |
| `tests/policy-attendance-workflow.test.ts` | 9/17 자동 출결 부과·회수 회귀 검사 추가 |
| `docs/qa/2026-09-17-police-attendance-auto-points.md` | 9/17 운영 설정 변경·재계산 검증 기록, untracked. 운영 DB 를 바꾼 근거 문서이므로 저장소에 남기는 편이 좋다 |
| `ACADEMY_TEMPLATES.md`, `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, `ORCHESTRA.md`, `CURRENT_STATE.md`, `DEVELOPMENT_CONTRACT.md`, `docs/archive/` | 9/25 문서 정리분 |

형제 앱 score-predict 및 monorepo docs/scripts의 별도 untracked 파일도 있다. 이 작업의 대상이 아니며 보존했다. 위 변경이 전부 같은 담당자의 작업이라고 가정하지 않는다.

## 4. 재실행 증거

- 명령: `node scripts/run-tests.mjs`.
- 결과: **931개 통과, 실패0, 건너뜀0**, 약36초. TAP 최상위 `1..889`와 하위 검사 포함 총931을 혼동하지 않는다.
- 실행기는 `tests/integration`을 제외하고 격리 MOCK 저장소를 사용한다. 운영 DB에 연결하는 검증이 아니다.
- 로컬 로그: `.local/docs-refresh-tests-20260925.log` (Git에 포함하지 않음).
- 이번 문서 작업에서는 타입 검사·빌드·Lighthouse·운영 브라우저 전수 QA를 새로 실행하지 않았다. 이전 보고서의 실행 결과는 각 날짜/범위에 한정한다.

## 4-1. 분석 source 로딩 실측 (9/25, Claude)

`loadAnalysisSource` 한 함수만 잰 값이다. **페이지 LCP 나 운영 응답시간이 아니다.** 9/17 의 LCP 14.3초와의 인과도 이 측정으로 확인되지 않는다.

**환경**: 로컬 Supabase Postgres 17.6 에 측정 전용 DB `perf_measure` 를 새로 만들어 마이그레이션 전체 적용 → 합성 데이터 → 측정 → **삭제**. 기존 로컬 DB(`postgres`, `exam_release_qa`, `qa_studyhall_20260915`)는 건드리지 않았다. 운영 DB 에는 연결하지 않았다.

**합성 데이터 모형**: 학생 40명. 한 달 = 아침 모의고사 22회(회당 1과목 20문항) + 정기 모의고사 1회(5과목 100문항). 모든 학생이 모든 회차 응시. `external_stats`·`choice_rates` 는 빈 `{}` 로 넣었으므로 **실제 페이로드는 이보다 크다**.

**방법**: 실제 `lib/exam-preview/source.ts` 와 `lib/prisma.ts` 를 그대로 import 해 호출. 조건마다 9회 실행, 첫 회(연결 수립 포함)를 빼고 중앙값. `connection_limit=1`(운영 pgbouncer 와 같음)과 기본 풀을 모두 쟀다.

| 누적 | 읽는 행 | JSON 크기 | 현재 코드 중앙값 | 정기 1회분만 읽을 때 | 프로세스 RSS |
|---|---|---|---|---|---|
| 1개월 | 23,083 | 3.7 MB | 185 ms | 33 ms | — |
| 3개월 | 69,249 | 11.2 MB | 540 ms | 32 ms | — |
| 6개월 | 138,498 | 22.4 MB | 1,018 ms | 35 ms | — |
| 12개월 | 276,996 | 44.9 MB | **2,031 ms** | 31 ms | 322 MB |
| 24개월 | 553,992 | 90.2 MB | **4,132 ms** | 32 ms | 477 MB |

시간은 `connection_limit=1` 기준. RSS 기준선(시험 데이터 0건)은 82 MB, 12개월 값은 3회 재현(321~323 MB).

**읽을 것**

- 시간이 쌓인 기간에 **정비례**한다. 행당 약 7.5μs, 한 달 치당 약 170ms. 줄어들지 않는다.
- 정기 1회분만 읽으면 기간과 무관하게 **약 30ms 로 일정**하다. 1년치에서 필요한 행은 전체의 1.5%(4,140 / 276,996).
- `exam_item_responses` 가 전체 행의 93.6% 다. 비용 대부분이 여기서 나온다.
- `connection_limit=1` 과 기본 풀의 차이는 약 5% 다. **병목은 쿼리 병렬성이 아니라 읽는 양**이므로 풀 크기를 늘리는 것은 해법이 아니다.
- Vercel 함수 한도는 `maxDuration 30`s, `memory 1024` MB(`vercel.json`). 한 요청 단독으로는 24개월에도 한도 안이다. 같은 인스턴스의 동시 요청, Next.js 서버 자체의 기준 메모리, 운영 네트워크 전송 지연은 **측정하지 않았다**.

**운영 현재 위치 (9/25, 사용자가 직접 실행한 읽기 전용 조회)**: `.env.production.pull` 이 가리키는 DB 에서 `SET TRANSACTION READ ONLY` 확인 후 건수만 조회했다. 개인정보는 조회하지 않았다.

| 학원 | 학생 | 회차 | 문항 | 응시 | 문항 응답 | 기간 |
|---|---|---|---|---|---|---|
| police | 28 | 10 | 200 | 264 | 5,280 | 2026-09-08 ~ 09-23 |
| allpass | 73 | 0 | 0 | 0 | 0 | — |
| fire, hankyung-sparta | 0 | 0 | 0 | 0 | 0 | — |

police 합계 5,754행은 측정표의 1개월(23,083행)보다 작다. 측정 기울기(행당 약 7.5μs)로 **추정**하면 이 함수는 현재 약 40~50ms 이며, 운영에서 직접 잰 값은 아니다. 지금 속도(회차당 약 528응답, 정기 시험 아직 없음)가 이어진다는 **가정**에서 1초대는 대략 1년 뒤다. 정기 모의고사(회당 100문항)가 시작되면 증가가 빨라지므로 그때 다시 조회한다.

측정 스크립트는 세션 임시 폴더에 두었고 저장소에 넣지 않았다. 재현하려면 위 모형과 방법대로 다시 만든다.

## 4-2. 학생 성적 분석 화면 점검 (9/25, Claude)

코드 수정 없음. 실제 함수(`normalizeAnalysisSelection`, `defaultMorningAnalysisRange`, `assembleMorningStudentReport`)에 운영 조회 결과를 넣어 계산했다. 운영 조회는 사용자가 직접 실행한 읽기 전용 건수 조회이며 학생 이름·점수는 읽지 않았다.

**운영 police (9/25)**: 아침 모의고사 10회 = 헌법 3·형사소송법 3·형법 2·경찰학 2(과목 5개 등록, 1개 미시행). 전 회차 진도 입력됨. 정기 모의고사 종류 등록(4과목), 회차 0. 파일 응시자 192~220명 / 연결 학원생 23~28명. 분석 설정 저장됨, 아침 이동평균 4회. 학습 문서(`exam_learning_documents`) 없음.

| 확인 | 결과 | 근거 |
|---|---|---|
| 첫 진입 화면 | 기본 탭이 정기(회차 0)이고, 아침으로 바꿔도 기본 범위가 오늘 하루라 9/25 에는 0회가 잡힌다 | `PreviewWorkspace.tsx:32-42`, `service.ts:81-89`. 오늘 하루는 테스트 주석상 의도된 기본값 |
| 추세·하락 진단 | 이동평균 최소 4회가 **과목별**이라 4과목 모두 자료 부족. ‘이번 달’도 최대 92일도 같다 | `morning-exam-analysis-assembler.ts:85`. 과목당 주 1회 안팎이라 4회에 약 4주 걸리고, ‘이번 달’은 매월 초기화된다 |
| 진도별 취약점(우선 복습 등) | 학습 문서가 없어 과목 묶음·진도·문항 연결·분석 기준이 전부 미설정. 학생 복습 예약·재풀이 기록도 0건 | `learning-analytics.ts:50` 은 문항별 진도 지정이 있어야 판정한다 |
| 회차 단위 진도 비교 | 작동 조건 충족(전 회차 진도 입력) | `MorningProgress` |
| ‘시험 응시자’ 정답률 | 파일 응시자가 학원생의 약 8배라 쉬움·어려움 판단이 실제 비교 집단 기준이다. 문제 없음 | 운영 cohort 조회 |
| 계산 정확성 | 동점 같은 순위, 미응시·기록 없음을 0점/오답으로 세지 않음, 대응 회차끼리만 평균, 만점 다른 회차 통합 평균 미표시 | `exam-analysis-meta.ts`, `metrics.ts`, 기존 단위 테스트 |

기각한 의심: 옛 `easyMissed`(빈 답 포함)는 학생 화면에 쓰이지 않는다. ‘오답률 TOP 5’는 전체 오답률·내 결과·기록 없음을 구분해 표시한다.

**사용자 결정 필요**: 학생 기본 탭·기본 조회 범위, 과목별 최소 회차 기준, 진도별 분석 기능을 운영에서 쓸지 여부. 결정 전에는 코드를 바꾸지 않는다.

## 4-3. 학생 성적 화면 사용성 점검 (9/25, Claude)

코드 수정 없음. `scripts/start-exam-preview.mjs` 격리 런타임(합성 데이터: 학생 12명, 정기 3회·아침 9회, 학습 자료 포함)에 합성 학생(98001)으로 학생 로그인해 390×844 와 1280×900 에서 실측했다. 운영 데이터는 쓰지 않았다.

| 확인 | 실측 | 근거 |
|---|---|---|
| 정기 개인 분석 길이 | 모바일 12,312px(14.6화면)·표 20개·접이식 6개·버튼 50개. PC 7,245px(8.1화면) | `DESIGN.md:285` ‘섹션 다섯 초과 시 2차 탭’ 위반 |
| 경쟁자 분석(석차비교) 위치 | 모바일 10,546px(13번째 화면), PC 5,919px | 내용 자체(목표·상위 30%까지 점수, 앞뒤 응시자)는 충실 |
| 첫 화면 | 인쇄 버튼 2개 다음에 과거 ‘직접 입력 성적’(수기 기록)이 먼저 나오고, 핵심인 ‘전과목 종합 분석’은 919px(두 번째 화면) | `RegularPersonalReport` |
| 바로가기 | 있음(종합·과목별·6개월 추이·석차비교)이나 855px 로 첫 화면 밖, `position: static` 이라 스크롤하면 사라짐 | |
| 취약점 안내 | ‘무엇을 복습할지’를 답하는 표가 7개로 분산. ‘문항별 진도 비교’는 10열·3행이 모바일 1,132px | 과목별 학습 우선순위·전과목 성적 비교·문항별 진도 비교·진도별 복습 개선·최근 두 회차 진도 비교·복습 우선순위·복습 대상과 최근 결과 |
| 아침 탭 기본값 | 기간 오늘 하루 + 과목 탭 첫 과목 고정. 과목을 번갈아 치르면 시험일에도 대개 빈 화면 | `StandardReport` `options[0]`, §4-2 |
| **버그** 과목명 두 번 표시 | ‘1. 경찰학1. 경찰학’. 인쇄 전용 글자를 숨기는 규칙이 `.wrapCell` 안에만 있어 이 표에서는 화면에도 보임 | `preview.module.css:26`, `LearningViews.tsx:307` |
| 점수 분포표 | 12구간 중 9구간 0명, ‘내 위치’ 열은 표 안 가로 스크롤 밖(frame 358 / table 395px) | |
| **빠진 기능** 과락 | 코드 전체에 과락 개념 없음. 총점이 높아도 한 과목 과락이면 불합격인데 표시하지 않는다 | `grep 과락` 0건. 학원별 설정으로 둬야 함 |

정확히 작동한 것: 결시 회차는 ‘응시율 0%, 추세를 판단하지 않음’으로 표시, 익명 경쟁자 표, 동점 처리, 비교 집단 설명.

**후속(9/25)**: 버그 2건(과목명 중복, 분포표)은 수정·검증 완료(테스트 933/933, 타입체크 통과, 390px 실측). 재구성은 [docs/exam-report-redesign.md](docs/exam-report-redesign.md) 기획으로 넘겼다. 처음엔 9/14 확정 규칙(섹션 바로가기)을 지켜 한 페이지 5섹션으로 기획했으나, 운영자가 ‘한 페이지에 너무 많다’고 해 **탭 5개(요약·취약점·석차·추이·문항), 정기/아침은 조회 조건 칩**으로 바꿨다. 9/14 규칙 폐기와 함께 승인 대기이며, 승인 전에는 구현하지 않는다.

## 5. 중요한 구현·변경 이력

| 기준 | 내용 | 읽을 근거 |
|---|---|---|
| 학원별 설정 | 기존 설정 편집 + 독립 템플릿 사본, 적용일·이력 | ACADEMY_TEMPLATES, academy-template / configuration-history 서비스 |
| 9/14~15 | 월 성적 상점, 미응시 면제, 시험 출석 연동 | `docs/releases/2026-09-14-*.md`, `2026-09-15-*.md` |
| 9/17, `a13389a` | 기존 성적 경로에 정기·아침 학습 분석 연결 | `docs/qa/exam-analysis-release-2026-09-17.md` |
| 9/17, `515f7e9` | 개근 계산 호출 내 날짜 캐시, transaction timeout15초 | `docs/qa/2026-09-17-perfect-attendance-timeout.md` |
| 9/17 운영 조정 | 경찰 관리자 출결 확정 해제, 적용일9/8로 정정, 기존 5일분 자동 재계산 | `docs/qa/2026-09-17-police-attendance-auto-points.md`; 현재 정책을 새로 조회한 결과가 아닌 당시 기록 |
| 9/17, `6792736` | 등원 웹 숫자패드 제거, 기기 numeric 입력 | ArrivalKiosk, DESIGN |
| 9/18, `b708496` | 누적시험 응시 여부만 출석으로 가져오기 | `docs/qa/2026-09-18-cumulative-attendance-import.md`; 문서의 ‘배포하지 않음’은 당시 QA 단계 |

## 6. 다음 작업의 우선순위와 종료 조건

0. **면담용 성적 화면 개선 (10/3 Claude, 구현 완료·미커밋)**: 맨 위 `최신 로컬 구현 — 2026-10-03` 참조. 점검 근거 `docs/qa/2026-10-03-counseling-score-readability.md`. 다음 행동: 운영자 승인 후 커밋·배포, 운영에서 상담지 인쇄 확인.

1. **미커밋 변경 소유권/반영 범위 정리**: diff 검토 후 승인된 파일만 커밋. 테스트931 통과만으로 자동 배포하지 않는다.
2. **분석 조회 성능 (지금은 급하지 않음)**: §4-1 실측대로 `loadAnalysisSource` 는 누적 행 수에 정비례한다(1년치 모형 2.0초). 운영 police 는 9/25 기준 5,754행으로 추정 40~50ms 다. 정기 모의고사 도입 후 또는 응답이 10만 행을 넘기 전에 다시 조회하고, 그 전에 요청한 시험 종류·날짜 범위로 조회를 좁힌다(모형에서 기간과 무관하게 약 30ms). 고칠 때는 전체 이력·석차 모집단·직접입력 성적·권한·캐시 무효화의 전후 결과가 동일해야 하고, 같은 source 를 쓰는 학습 라우트도 함께 확인한다.
3. **학습 저장소 성장**: 행 크기·갱신 지연·동시 저장 측정, 분할/이관 설계와 승인 후 구현. audit/requests를 잘라 기존 재시도 의미를 훼손하지 않는다.
4. **진도 설정 실제 장애 여부**: 테이블 미적용이라고 단정하지 말고 인증된 운영 화면/API의 오류와 재조회 상태부터 확인한다.
5. **운영 자동화 확인**: Cron 배치·부분 실패 재시도·날짜별 처리 여부는 운영 로그로 검증해야 한다. 설정/예약 코드 존재만으로 매일 성공했다고 보고하지 않는다.

9/17 로컬 점검에서는 connection_limit=1 조건의 휴무 서비스 트랜잭션 연결 대기가 별도 이슈로 기록됐다. 이번에는 재현하지 않았으므로 현재 운영 장애로 단정하지 말고 관련 수정 시 재검증한다.

## 7. 문서 갱신 규칙

2026-09-25 사용자 추가 확정: 개발 후 문서 최신화를 항상 수행한다. AGENTS.md와 CLAUDE.md에 동일한 필수 완료 조건을 추가했고, DEVELOPMENT_CONTRACT 9절에 완료·중단 시 인계 항목을 정의했다. 이 추가 변경은 문서만 수정했으며 제품 코드·운영 데이터·배포 상태는 변경하지 않았다. 이 문서 수정 후 제품 테스트를 다시 실행한 것은 아니며 위 931개 결과는 앞선 검증 시점의 결과다.

변경 때마다 확인일·HEAD·미커밋 범위·실행 명령·환경·결과·미확인점·배포/DB 상태를 갱신한다. 오래된 QA는 삭제하지 않고 해당 시점 증거로 남긴다. 현재 상태의 안내는 이 문서를 우선하고, 의도/계약 변경은 DEVELOPMENT_CONTRACT와 ACADEMY_TEMPLATES를 함께 갱신한다.

## 2026-10-02 추가 — 개인 성적표 이해도 리뷰
기존 개인 아침 성적표의 요약/진도/복습 표현을 코드로 검토했다. 강점·보완행동의 분산, 8~9열 표, 동일주 다회시험 마지막값만 표시, 관리자 평균격차를 하락으로 표시하는 문제를 기록했다. 브라우저 초기화 실패로 시각/클릭 검증 미완료. 변경은 리뷰 문서만, 제품/운영 수정 없음. [리뷰](docs/qa/2026-10-02-score-report-usability.md).

## 2026-10-02 추가 — 지정 학생의 10월 수업 해제

사용자 요청에 따라 경찰 학생 1명의 10/5~10/30 평일 1~4교시 수업 80칸을 운영 DB에서 미처리로 전환했다. 원본 백업과 변경 충돌 검사를 거쳤으며, 대상 외 10월 출결 및 기존 점수는 전후 동일하다. 운영 DB 재조회와 실제 출결 조회 서비스에서 10/5·10/30 미처리, 10/2 기존 수업·아침 출석 보존을 확인했다. 기준 HEAD `4bb19a9`; 제품 코드·설정·배포 변경 없음. 기존 미커밋 작업 보존. 운영 브라우저 시각 검증은 미실시. 개인정보 없는 상세 근거: [운영 수업 해제](docs/qa/2026-10-02-class-attendance-release.md).

## 최신 로컬 구현 — 개인 아침 성적표 학습 요약
2026-10-02: LearningOverview 추가, 과목 비교막대/강점/확인범위/복습바로가기, 기존 수치표 상세접기, 취약범위표4열. 타입/lint통과,956테스트통과, 예시컴포넌트1280/390px 렌더검증. 실제앱 로그인/클릭 E2E미검증. localhost3000 Docker healthy. 운영/커밋/푸시없음. 상세: docs/qa/2026-10-02-score-report-usability.md.


## 2026-10-02 개인 성적표 후속 검증 완료
동일주 다회점수 모두 표시, 전체오답/우선복습 동선 분리, 강점 최소비교횟수 검증 보완. 독립 로컬5814 가상자료에서 관리자/학생 로그인과 복습탭 이동, 모바일390px 넘침없음/콘솔오류없음 확인. localhost3000 기존자료 보존. 코드와 문서 로컬만, 운영미배포. 상세 usability QA의 이어서 완료 절 참조.


## 2026-10-02 Docker3000 목업 보완
운영 과목구조만 읽어서 경찰 아침/정기 목업유형 추가. 기존자료/소방자료 보존 검증. 아침16회 가상점수·문항답안 제공, localhost3000 분석/학습API200확인. compose 로컬 목업 학습저장소 활성화. 검토유형 local-police-review-v2-MORNING. 운영자료/배포변경없음. 상세 usability QA 참조.


## 2026-10-02 전체 아침분석 표현 수정
학원평균미달을 점수하락으로 잘못 표시하던 classGap분류 수정. 별도필터/인원/과목별 근거펼침 제공, 기존 flag.detail재사용. 관련39테스트통과. 로컬수정만. 상세 usability QA 참조.


## 2026-10-02 최신 디자인 — 개인성적 표 중심으로 단순화
사용자 반복피드백 반영: LearningOverview 박스3개/막대를 제거, 과목·내점수·시험평균·상태4열 표. 상태상세는 기본접힘, 기존 과목/오답동선 유지. 타입/lint/렌더25통과. 로컬만, 운영미배포. 이전 박스형 UI기록 대체. 상세 usability QA참조.

