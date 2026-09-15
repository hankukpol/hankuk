# 디자인 규격 정리 지시서 (2026-09-14 전수 실측)

> study-hall 관리자·조교·학생 화면을 `DESIGN.md`·`MOBILE_DESIGN.md` 현행 규격에 맞추고자 함

## 0. 읽고 시작할 것

- [ACADEMY_TEMPLATES.md](../ACADEMY_TEMPLATES.md) — 모든 개발·수정 전에 따른다. 학원별 독립 템플릿, 기존 운영 기록 보호, 작업·배포 승인 규칙.
- [DESIGN.md](../DESIGN.md) — 2026-09-14 개정. §5.2 화면 골격, §5.4 1차 탭 두 종류, §5.5 2차 탭 겹침 금지, §5.10 드로어·모달 경계가 이번 개정분이다.
- [MOBILE_DESIGN.md](../MOBILE_DESIGN.md) — 768px 미만 규격. §2 세부 규격, §4 검증 기준, §5 적용 순서.
- [CLAUDE.md](../CLAUDE.md) — 학원별 독립 설정 원칙, 하드코딩 금지.
- 토큰 원본은 `app/globals.css`의 `--admin-*` 하나뿐이다. `tailwind.config.ts`는 연결만 한다.

### 측정 조건

| 항목 | 값 |
| --- | --- |
| 서버 | 로컬 도커 `study-hall-dev-1`, `MOCK_MODE=true`, `localhost:3000` |
| 계정 | `admin-police@mock.local` · `assistant-police@mock.local` · 학생 `90001 김지훈` (모두 mock) |
| 데스크톱 | 1280×900 |
| 모바일 | 390×844 |
| 화면 수 | 관리자 26 · 조교 3 · 학생 5 = **34개**, 두 폭 모두 |
| 방식 | `getComputedStyle` · `getBoundingClientRect` 실측 |

**이 문서의 모든 수치는 위 조건에서 실제로 잰 값이다. 코드를 읽고 추정한 값은 없다.**

### 측정하며 걸러낸 것

- **패널 폭 0 상태의 측정은 전부 버렸다.** `MOBILE_DESIGN.md` §4가 경고한 rAF 정지 함정이다. 브라우저 패널을 띄운 상태로만 쟀다.
- **개발 서버가 간헐적으로 500을 냈다**(`__webpack_modules__[moduleId] is not a function`). 다른 세션이 파일을 고치는 중 HMR이 깨진 것이다. 0값이 나온 화면은 모두 재측정했고 `admin/points`·`admin/reports`·`admin/settings/tuition`·`admin/students/[id]` 네 화면이 여기 해당했다. 전부 정상이었다.
- **`.admin-action-menu-panel`(작업 메뉴)은 카드·그림자 계수에서 제외했다.** `MOBILE_DESIGN.md` §4가 모달·작업 메뉴를 명시적으로 허용한다.
- **`.admin-portal-nav`(하단 탐색)는 1차 탭 계수에서 제외했다.** 같은 `.admin-tabs` 클래스를 쓰지만 화면 하단(y=787)의 별도 탐색이다.

### 이 레포는 다른 세션이 동시에 작업 중이다

2026-09-14 21:00 이후 `components/admin/StaffManager.tsx`·`lib/attendance-meta.ts`·`lib/study-time-meta.ts`·설정 화면 다수가 바뀌었다. §2.1은 조사 중에 해결되어 철회했다. **각 단계 착수 직전에 해당 파일을 다시 읽고 수치를 다시 센다.** 다른 세션의 작업을 되돌리지 않는다.

---

## 1. 즉시 수정 — 화면이 깨져 있음

### 1.1 관리자 로딩 화면 스피너가 보이지 않는다

`app/[division]/admin/loading.tsx`

```
<div className="w-8 h-8 border-3 border-gray-200 border-t-[var(--division-color)] rounded-full animate-spin" />
```

- **실측: `borderTopWidth: "0px"`.** `border-3`은 Tailwind 기본 클래스가 아니고, Preflight가 모든 요소의 `border-width`를 0으로 두므로 테두리가 아예 그려지지 않는다.
- 지금 관리자 전 경로가 로딩 중에 빈 상자와 `로딩 중...` 글자만 보인다.
- `.admin-skeleton`(§5.7)으로 교체한다. 자체 스피너를 만들지 않는다.
- `text-sm text-gray-500` → `.admin-help`.
- `min-h-[50vh]` 제거. 높이는 내용이 정한다.

### 1.2 미구현 경로 플레이스홀더

`app/[division]/admin/[...slug]/page.tsx`

- `<p className="admin-label">Placeholder</p>` 삭제. `DESIGN.md` §1이 장식용 영문 라벨을 금지한다.
- `text-2xl font-bold text-slate-950` → `.admin-page-title`.
- 루트를 `.admin-flat-page`로 두고 본문은 `.admin-empty-state`를 쓴다. `p-8` 제거.
- 사이드바 메뉴 10개는 전부 실제 라우트가 있다. 이 화면은 오타 URL만 도달한다.
- **404로 바꿀지는 운영자 확인 사항이다.** 확인 전에는 위 규격 정리만 한다.

---

## 2. 데스크톱 1280px — 구조 위반 4개 화면

### 2.1 ~~직원 설정 2열 구조~~ — 철회

조사 중(2026-09-14 21:59) 다른 세션이 `components/admin/StaffManager.tsx`를 다시 썼다. 재측정 결과 **이미 규격에 맞다.**

- `grid-cols-[` 0건, `SlideOver` 5건. 추가·수정과 비밀번호 재설정이 모두 우측 드로어다.
- 1280px 실측: 1차 탭 1 · 2차 탭 0 · 제목 1 · 전체 폭 표 · `<form>` 0개 · `grid` 0개 · 가로 넘침 0.
- **작업하지 않는다.**
- 남는 일은 하나다 — `tests/render/settings-tab-layout.test.ts`의 검사 대상에 `staff`를 추가한다. 지금 빠져 있어 이 화면의 회귀를 잡지 못한다.

### 2.2 1280px 전수 측정표

`.admin-tabs`(1차) / `.admin-subtabs`(2차) 중 `getBoundingClientRect().height > 0` 인 것만 셌다.

| 화면 | 1차 | 2차 | 제목 | 가로넘침 | 판정 |
| --- | --- | --- | --- | --- | --- |
| `admin/exams` | **0** | **3** | 1 | 0 | **위반** |
| `admin/phone-submissions` | 1 | **2** | 1 | 0 | **위반** |
| `admin/exams/students/[id]` (학습 진단 탭) | 1 | **2** | 1 | 0 | **위반** |
| `student/exams` | 1 | **2** | 1 | 0 | **위반** |
| `admin` · `announcements` · `seats` · `students` · `study-ranking` · `warnings` · `assistant` | 0 | 0 | 1 | 0 | 통과 |
| `admin/attendance` · `interviews` · `leave` · `payments` · `points` · `points/rules` · `reports` · `staff` · `students/[id]` · `exams/students/[id]`(기본) | 1 | 0 | 1 | 0 | 통과 |
| `admin/settings/general` · `features` · `periods` · `rules` · `seats` | 1 | 1 | 1 | 0 | 통과 |
| `admin/settings/tuition` · `exams` · `exam-schedules` | 1 | 0 | 1 | 0 | 통과 |
| `assistant/check` · `assistant/phones` | 1 | 1 | 1 | 0 | 통과 |
| `student/attendance` · `points` · `profile` · `study-ranking` | 1 | 0 | 1 | 0 | 통과 |

**전 화면 통과 항목**: `.admin-page-title` 34개 화면 모두 1개씩 존재 · 가로 넘침 전부 0 · 13px 미만 글자 전부 0.

**조교 3개 화면과 설정 10개 탭은 데스크톱에서 전부 통과다. 건드리지 않는다.**

### 2.3 `admin/exams` — 1차 0줄인데 2차가 3줄

| y | aria-label | 항목 | 출처 |
| --- | --- | --- | --- |
| 185 | 시험 종류 | 아침 모의고사 / 정기 모의고사 | `components/exams/ExamTabLayout.tsx` |
| 255 | 아침 모의고사 작업 | 입력 / 가져오기 / 반 분석 / 학생별 | `components/exams/ExamSecondaryTabs.tsx` |
| 342 | 아침 모의고사 업무 | 일일 성적 입력 / 주간 성적 현황 | `components/exams/MorningExamScoreManager.tsx` |

390px에서도 같은 3줄이 측정된다.

**고치는 법**

- `ExamTabLayout`에 `variant?: "primary" | "secondary"`를 추가한다. 지금은 `variant="secondary"` 고정이다. 기본값은 `"primary"`.
- `app/[division]/admin/exams/page.tsx`는 기본값을 쓴다 → 첫 줄이 1차 폴더 탭이 된다.
- `app/[division]/student/exams/page.tsx`는 `variant="secondary"`를 명시한다. 학생 포털은 `StudentPortalFrame`이 이미 1차 탭을 쓴다.
- 세 번째 줄은 두 번째 줄 `입력` 탭 안에서만 쓰인다. **두 번째 줄의 항목으로 끌어올려 `일일 입력 / 주간 현황 / 가져오기 / 반 분석 / 학생별` 한 줄로 합친다.** 합치기 어려우면 칩으로 내린다. 어느 쪽을 골랐는지 보고한다.
- 목표: 1차 1줄 + 2차 1줄.

### 2.4 `admin/phone-submissions` — 1차 아래 2차가 2줄

| 구분 | aria-label | 항목 |
| --- | --- | --- |
| 1차 | 휴대폰 업무 | 교시별 체크 / 이력 조회 |
| 2차 | 휴대폰 체크 보기 | 테이블 / 좌석 |
| 2차 | 휴대폰 확인 교시 | 0~8교시 |

- **보기 전환(테이블·좌석)을 칩으로 내린다.** 같은 데이터의 표현 방식이므로 필터다(§5.6). 교시는 다른 데이터로 옮기는 탐색이므로 2차 탭을 유지한다.
- `PhoneCheckForm`의 `viewTabsVariant` prop과 `PhoneSubmissionsWorkspace`의 전달을 함께 제거한다.
- **조교 `assistant/phones`는 1280px 실측 1차 1 + 2차 1로 통과다.** 보기 전환이 칩이 되는 변경만 따라가고 그 외에는 손대지 않는다.

### 2.5 성적 개인 리포트 2개 — 분석 항목과 과목이 겹친다

`admin/exams/students/[id]`는 **기본 상태(성적 요약)에서는 1차 1 + 2차 1로 통과**이고, `학습 진단` 탭을 누르면 2차가 2줄이 된다.

| 상태 | 측정 |
| --- | --- |
| 성적 요약(기본) | 1차 분석할 시험 구분 @y210 · 2차 개인 성적 분석 항목 @y541 |
| **학습 진단 탭** | 위 두 줄 + **2차 학습 진단 과목 @y700** |

`student/exams`도 같은 구조다(1차 학생 메뉴 @y148 · 2차 시험 종류 @y228 · 2차 개인 성적 분석 항목 @y788).

- `components/exams/analysis/LearningActionSummary.tsx`의 `SubjectTabs`를 **`.admin-choice-group` + `.admin-choice-button`** 으로 바꾼다. 과목 선택은 탐색이 아니라 표시 대상 필터다(§5.6).
- 과목명은 길이를 알 수 없으므로 `.admin-choice-button-auto`를 함께 준다.
- `role="tablist"`를 버리므로 패널의 `aria-labelledby`를 정리하고 선택 상태는 `aria-pressed`로 둔다.
- 인쇄용 DOM 유지(`hidden` + `data-report-panel`)는 그대로 둔다. 전체 인쇄가 깨지면 안 된다.
- 768px 미만에서는 이미 칩 규격이 적용된다(MOBILE_DESIGN §2.3).

### 2.6 `student/exams`의 남은 한 줄 — 운영자 확인 후 착수

2.3과 2.5를 적용해도 학생 성적은 1차(학생 메뉴) + 2차(시험 종류) + 2차(개인 성적 분석 항목)로 **2차가 두 줄 남는다.** 두 안 중 하나를 골라야 하며 **임의로 정하지 않는다.**

- (가) 학생 포털 1차 메뉴의 `성적`을 `아침 모의고사`·`정기 모의고사` 두 항목으로 나눈다. 2차는 분석 항목 한 줄만 남는다. 포털 메뉴가 한 항목 길어진다.
- (나) 분석 항목을 탭이 아니라 **섹션 바로가기**(앵커 이동, 내용을 숨기지 않음)로 되돌린다. 2차는 시험 종류 한 줄만 남는다. `DESIGN.md` §9 "학생 개인 성적 전용 페이지"가 원래 기술한 방식이며, 현재 구현(`PersonalReportTabs`가 `hidden`으로 감춤)과 어긋나 있다.

두 안의 화면 영향을 정리해 보고하고 답을 받은 뒤 착수한다. 답을 받으면 `DESIGN.md` §9의 해당 문단도 결정에 맞춰 고친다.

---

## 3. 모바일 390×844 — 전수 측정 결과

### 3.1 전 화면이 통과한 항목

`MOBILE_DESIGN.md` §4 검증표 기준이다. **34개 화면 전부 아래를 만족한다.**

| 항목 | 기준 | 실측 |
| --- | --- | --- |
| 헤더 바 높이 | 52px | 전 화면 **52** |
| 좌우 여백 | 16px | 전 화면 **16** |
| 문서 가로 넘침 | 0 | 전 화면 **0** |
| 13px 미만 글자 | 0개 | 전 화면 **0** |
| 폴더 모양 탭 | 0개 | 전 화면 **0** |
| 두 줄로 접힌 탭 | 0개 | 전 화면 **0** |
| 그림자(모달·작업 메뉴 제외) | 0개 | 전 화면 **0** |

**`MOBILE_DESIGN.md` §2.1~2.9의 CSS 규격은 이미 다 적용돼 있다.** §5 적용 순서의 1단계·2단계는 끝난 상태다.

### 3.2 첫 데이터 top — 두 화면 빼고 전부 미달

기준은 서브 화면 **≤160px**, 홈 **≤240px**다. 첫 `table` · `.admin-list-row` · `.admin-record-card` · `.admin-empty-state` · `.admin-panel` · `.admin-metric-strip` · `.admin-dashboard-metrics` 중 화면에 보이는 첫 요소의 `top`을 `scrollY=0`에서 쟀다.

| 화면 | 실측 | 기준 | 초과 |
| --- | ---: | ---: | ---: |
| `admin/students` | **113** | 160 | 통과 |
| `assistant` (홈) | **208** | 240 | 통과 |
| `admin/settings/seats` | 177 | 160 | +17 |
| `admin` (홈) | 268 | 240 | +28 |
| `admin/settings/exam-schedules` | 237 | 160 | +77 |
| `admin/students/[id]` | 242 | 160 | +82 |
| `admin/settings/tuition` | 257 | 160 | +97 |
| `student/points` | 258 | 160 | +98 |
| `student/attendance` | 270 | 160 | +110 |
| `admin/settings/exams` | 272 | 160 | +112 |
| `admin/study-ranking` | 278 | 160 | +118 |
| `admin/staff` | 297 | 160 | +137 |
| `assistant/check` | 377 | 160 | +217 |
| `assistant/phones` | 379 | 160 | +219 |
| `admin/attendance` | 404 | 160 | +244 |
| `admin/settings/general` | 438 | 160 | +278 |
| `admin/settings/features` | 463 | 160 | +303 |
| `student/study-ranking` | 470 | 160 | +310 |
| `admin/leave` | 481 | 160 | +321 |
| `admin/phone-submissions` | 485 | 160 | +325 |
| `admin/announcements` | 537 | 160 | +377 |
| `admin/payments` | 581 | 160 | +421 |
| `admin/points` | 629 | 160 | +469 |
| `student/exams` | 700 | 160 | +540 |
| `admin/settings/rules` | 709 | 160 | +549 |
| `admin/exams` | 829 | 160 | +669 |
| `admin/reports` | **1736** | 160 | **+1576** |

**이것은 결함 목록이 아니다.** `MOBILE_DESIGN.md` §4가 이 항목에 대해 "**§5의 마크업 단계가 끝나야 달성된다. 그 전 측정에서 미달은 예정된 것이지 결함이 아니다**"라고 미리 적어 두었다. 즉 §5 적용 순서의 **3~5단계가 아직 남아 있다는 뜻**이다.

**착수 순서는 초과폭이 아니라 `MOBILE_DESIGN.md` §5의 단계 순서를 따른다.**

1. 홈 3개 — `admin`(268) · `assistant`(208) · `student` 첫 화면(270)
2. 목록 화면 — `points`(629) · `payments`(581) · `leave`(481) · `announcements`(537) · `interviews` · `exams`(829)
3. 조교 출석체크·휴대폰 체크 — `assistant/check`(377) · `assistant/phones`(379) · `admin/phone-submissions`(485)
4. 나머지 설정·상세 — `settings/rules`(709) 외
5. `admin/reports`(1736)는 별도다. 보고서 유형·기준 날짜·내보내기 5종·분석 구분이 표 위에 모두 펼쳐져 있다. **조회 조건을 `.admin-disclosure`로 접고 내보내기를 드로어로 옮기는 안을 먼저 제시하고 답을 받은 뒤 착수한다.**

각 단계 후 그 화면의 첫 데이터 top을 다시 재서 보고한다.

### 3.3 44px 미만 터치 대상 — 측정값과 분류

| 화면 | 실측 내역 |
| --- | --- |
| `admin/phone-submissions` | `.admin-table-link` 17px × **15** |
| `assistant/phones` | `.admin-table-link` 17px × **15** |
| `admin/settings/exams` | `button` 36px × 10, `.admin-table-link` × 5 |
| `admin/settings/tuition` | `button` 36px × 6, `.admin-table-link` × 3 |
| `admin/students` | `.admin-choice-button` 36px × 7 |
| `admin/settings/exam-schedules` | `.admin-table-link` × 4 |
| `admin/staff` · `admin/settings/seats` | `.admin-table-link` × 2 |
| `admin/seats` | `.admin-table-link` 35px × 1 |
| `admin/leave` · `admin/announcements` · `admin/exams/students/[id]` | `input` 23px × 1 |
| `admin/students/[id]` | `a` 23px × 1 |
| `admin/warnings` | 클래스 없는 요소 20px × 1 |
| 그 외 전 화면 | 0 |

**세 가지를 구분해서 처리한다.**

- **`.admin-choice-button` 36px는 규격대로다. 고치지 않는다.** `MOBILE_DESIGN.md` §2.3이 "높이 36px(44는 칩에 과함, 대신 세로 padding으로 터치 44 확보)"라고 정했다. 세로 padding으로 실제 터치 영역이 44인지만 확인하고 보고한다.
- **`input` 23px 3건은 실제 결함이다.** `admin/leave`의 `<input class="w-full bg-transparent text-sm text-slate-700">`가 대표다. `.admin-shell` 정규화의 입력 최소 높이 44px가 `:where()`(특정도 0)라 화면별 유틸에 밀린 것으로 보인다. **원인을 확인해 보고하고, 정규화 레이어를 고칠지 해당 마크업을 고칠지 판단한다.** 같은 자리의 `text-sm text-slate-700`도 `.admin-help` 규격으로 정리한다.
- **`.admin-table-link` 17px는 판단이 필요하다.** 표 안의 이름·제목 링크이고, `DESIGN.md` §5.8은 표 셀 padding 12px(모바일 10/8)를 정했을 뿐 표 안 링크의 44px를 요구하지 않는다. `MOBILE_DESIGN.md` §4의 "44px 미만 터치 대상 0개"와 충돌한다. **어느 쪽을 기준으로 삼을지 운영자 확인을 받고, 정해지면 두 문서 중 해당 문단을 고친다.** 임의로 링크 높이를 키우지 않는다 — 표 행이 높아져 화면당 인원이 줄어든다.

### 3.4 문서끼리 충돌하는 항목 두 개 — 코드보다 문서를 먼저 정해야 한다

**① `.admin-panel`이 모바일에서 카드로 잡힌다**

실측: `admin/settings/general` · `settings/features` · `settings/rules` · `admin/students/[id]` 네 화면에서 `border + border-radius 8px` 컨테이너가 각 1개씩 나온다. 전부 `.admin-panel`이다.

- `DESIGN.md` §5.3은 패널 외곽 8px를 규격으로 정한다.
- `MOBILE_DESIGN.md` §4는 "카드형 컨테이너 0개(이미지·모달·안내 상자 제외)"를 요구한다.
- 두 문장이 `.admin-panel`에서 충돌한다. §2.5는 `.admin-dashboard-metric`과 `.admin-metric-box`만 지목했고 `.admin-panel`은 언급이 없다.
- **`.admin-panel`을 768px 미만에서 구분 행으로 낮출지, §4의 예외로 명시할지 운영자 확인을 받는다.** 정해지면 해당 문서를 고치고 그다음에 코드를 만진다.

**② 조교 화면에 하단 고정 탐색이 있다**

실측: `assistant/check`·`assistant/phones` 390px에서 `.admin-tabs.admin-portal-nav.lg:hidden`이 y=787, 높이 57px, 항목 `홈 / 출석체크 / 휴대폰`으로 존재한다.

- `DESIGN.md` §8은 "조교 전용 하단 고정 탐색은 두지 않는다 — 관리자와 다른 껍데기를 쓰면 같은 제품으로 보이지 않는다"고 적혀 있다.
- `MOBILE_DESIGN.md` §3은 학생 포털의 1차 탭이 화면 이동이라고만 적었고 조교 하단 탐색은 언급이 없다.
- **문서가 금지한 것이 화면에 있다.** 지우는 것이 맞는지 §8을 고치는 것이 맞는지 운영자 확인을 받는다. 확인 전에 지우지 않는다.

### 3.5 모바일에서 확인된 구조 위반

데스크톱과 동일하다. 새로 생긴 것은 없다.

- `admin/exams` — 390px에서도 1차 0 · 2차 3.
- `student/exams` — 390px에서도 1차 1 · 2차 2.
- `admin/phone-submissions` — 390px에서도 1차 1 · 2차 2.

§2의 수정이 두 폭을 함께 해결한다. 모바일 전용 분기를 따로 만들지 않는다.

### 3.6 레포 감사 스크립트(Playwright) 실행 결과

2026-09-14 `pnpm add -D playwright`(1.58.2)로 설치했다. 스크립트가 모두 `channel: "msedge"`를 쓰므로 브라우저 다운로드 없이 설치된 Edge를 쓴다.

```bash
MSYS_NO_PATHCONV=1 DESIGN_AUDIT_URL=http://localhost:3000 DESIGN_AUDIT_OUTPUT=.superloopy/evidence/frontend/2026-09-14-design-audit DESIGN_AUDIT_WIDTHS=390,768,1280,1600 DESIGN_AUDIT_FILTER=police node scripts/design-ui-audit.mjs
```

- **`MSYS_NO_PATHCONV=1`이 없으면 Git Bash가 `^/police`를 `^C:/Program Files/Git/police`로 바꾼다.** 필터가 아무 라우트에도 안 맞고 스크립트는 정상 종료하며 빈 `[]`만 남긴다. 로그가 비고 exit 0이라 성공처럼 보인다. **앞 슬래시 없는 패턴을 쓴다.**
- 스크립트는 화면을 열고 **대화상자·1차 탭·2차 탭을 차례로 열어 상태마다 다시 잰다**(`state: page / dialog-N / tab-N / tab-N-subtab-M`). §2·§3의 기본 상태 측정으로는 볼 수 없는 것이 여기서 나온다.

**커버리지: 8개 라우트 / 200 레코드까지 진행하고 중단됐다.** `page.goto`의 `waitUntil: "networkidle"`이 이 개발 서버에서 안 풀려 `TimeoutError`로 죽는다(`scripts/design-ui-audit.mjs:127`). 완주하려면 그 대기 조건을 `domcontentloaded`로 낮추거나 타임아웃을 올려야 한다. **공용 도구 변경이므로 운영자 확인을 받고 고친다.**

#### 폭별 합계 (8개 라우트)

| 폭 | issue |
| ---: | ---: |
| 390 | 823 |
| 768 | 15 |
| 1280 | 10 |
| 1600 | 10 |

#### 스크립트 규칙 4개가 낡았다 — 화면이 아니라 스크립트를 고친다

문서가 개정됐는데 `scripts/design-ui-audit.mjs`의 기대값이 옛 기준이다. **아래는 결함이 아니다.**

| 규칙 | 건수 | 스크립트 기대 | 현행 문서 | 실측 |
| --- | ---: | --- | --- | --- |
| `input-radius` | 435 | `radius === 8` | `MOBILE_DESIGN.md` §2.7 768px 미만 **4px** | 4 |
| `page-padding` | 48 | `paddingTop === "24px"` | §2.8 섹션 상단 **20px** · 좌우 16px | `["20px","16px"]` |
| `primary-tab-size` | 18 | 16px · 높이 ≥55 | §2.2 모바일 1차 탭 **44px · 15px/600** | 44 |
| `metric-size` | 4 | 32px | §2.5 390px에서 KPI **20px** | 20 |
| `type-size` (출석부분) | 대다수 | `allowedSizes`에 14px 없음 | `DESIGN.md` §3이 `--admin-type-attendance` **14px**를 출석부 규격으로 명시 | 14 |

- 실측값이 전부 **현행 문서와 정확히 일치**한다. 스크립트만 과거를 보고 있다.
- **`scripts/design-ui-audit.mjs`의 위 다섯 기대값을 현행 문서에 맞춰 고친다.** 폭에 따라 갈리는 규칙(`input-radius`·`primary-tab-size`·`metric-size`·`page-padding`)은 `innerWidth < 768` 분기를 둔다. `allowedSizes`에 `14px`를 더하되 `.admin-attendance-*`에 한정한다.
- 고치기 전까지 이 다섯 규칙의 출력은 무시한다. 이 작업을 §7 회귀 방지와 같은 단계에서 한다.

#### 실제 결함 — §2·§3의 기본 상태 측정으로는 못 본 것

| 항목 | 측정값 | 화면 |
| --- | --- | --- |
| **문서 가로 넘침** | 768px에서 `scrollWidth` **908** (뷰포트 768) | `/police/admin/attendance` |
| **`missing-tabpanel`** | 390px에서 **20건** | `/police/admin/attendance` |
| **`input-padding`** | 768·1280·1600px에서 각 2건, `paddingLeft` **8px** (규격 12px) | `/police/admin/attendance` |
| **`type-weight`** | 768px에서 **900** (허용 400/600/700) | `/police/admin/attendance` |
| **`control-height`** | 768px에서 **40px** (기준 43) | `/police/admin/attendance` |
| **하이드레이션 오류** | 390·768·1280·1600px 전부 | `/police/admin/announcements` |

**다섯 개가 전부 `/police/admin/attendance` 한 화면이다. 이 화면을 먼저 잡는다.**

- **768px 가로 넘침 908px** — `DESIGN.md` §9가 390·768·1280을 확인 폭으로 지정했는데 768px이 이 조사에서 빠져 있었다. 표가 `.admin-table-frame` 밖으로 나가는지 먼저 확인한다.
- **`missing-tabpanel` 20건** — 교시 탭의 `aria-controls`가 가리키는 `attendance-period-panel-mock-period-police-0~8`이 DOM에 없다. `AdminTabs`는 `aria-controls`를 항상 붙이는데 이 화면은 `AdminTabPanel`을 쓰지 않는다. 패널을 두거나 `aria-controls`를 떼거나 둘 중 하나다. 키보드·스크린리더 사용자가 탭을 눌러도 갈 곳이 없다.
- **`input-padding` 8px** — `INPUT.block h-7 w-full min-w-0 rounded-lg border border-slate-200`. 높이는 정규화가 44px로 올려 주지만 좌우 padding은 유틸에 밀려 8px로 남는다. `DESIGN.md` §5.7은 입력 padding 8px 12px다. `h-7`(28px)과 `rounded-lg`도 함께 정리한다.
- **`type-weight` 900** — `tailwind.config.ts`가 `black`을 700으로 흡수하는데 900이 빠져나왔다. 인라인 style이나 토큰 밖 경로를 찾는다.
- **하이드레이션 오류** — `Text content does not match server-rendered HTML`. 서버·클라이언트 렌더 결과가 다르다. 날짜·시간 포맷이나 `Math.random`·로캘 의존 값을 의심한다. **디자인 문제가 아니라 정확성 문제이므로 별도로 보고한다.**

#### 남은 라우트

super-admin 5개와 경찰 3개만 돌았다. **관리자 나머지 23개 · 조교 3개 · 학생 6개는 아직 스크립트로 돌리지 않았다.** 위 대기 조건을 고친 뒤 완주하고 결과를 이 절에 덧붙인다.

#### 2026-09-15 완료 재검증

위의 중단·미실행 수치는 착수 전 기록이다. 최신 단계별 결과는 [단계별 보고서](qa/design-fix-stage-progress-2026-09-14.md)의 Stage7을 기준으로 한다.

- Claude가 수정한 load/짧은 networkidle/폭별 실패 기록은 보존했다. 낡은 다섯 기대값은 화면이 아닌 스크립트에서 수정했다. 필터0경로, 로딩 화면 및 실제 오류가 성공으로 처리되지 않도록 검사를 보강했다.
- `design-ui-audit.mjs`: 관리자·조교·학생·최고관리자 및 소방 표본을 포함한45경로, 네 폭730상태 완주. issue0, 런타임 오류0, 실패 경로0. 출석부의 다섯 결함과 공지사항 하이드레이션 오류가 재발하지 않았다.
- 추가로 학생 분석 ID 중복, 목표 요약의 카드 중첩, 모바일 컨트롤 모서리를 수정했다. 스크린샷에서 발견한 데스크톱의 모바일 도구 제목 노출도 수정하고 검사 항목을 추가했다. 마지막 수정 후45경로 네 폭의 기본 상태180개를 재검사해0건을 확인했다. 이180개는 탭/모달 전체 재순회가 아닌 기본 상태 재검사다.
- `DESIGN.md` §9와 모바일 검증: 핵심34경로 세 폭148상태 통과. 모바일72상태에서 요구10항목과 추가 탭2항목 모두 통과. 마지막 데스크톱 전용 수정 후34경로의768/1280px76상태도 재검사했다. n0, offScale빈 배열, Pretendard, 문서 넘침0. 모바일 첫 데이터는 서브72-160px, 홈73px, 조교 홈209.3px이다.
- 나머지 스크립트도 실행했다. 공통 모달 네 폭 통과, 실제 폼/좌석/직원·규칙 드로어46검사, 작업 탭·필터·상세50상태, 저장 요청은 차단 또는 테스트 응답으로 처리했다. 실제 데이터 쓰기0. 개인 보고서 A4 PDF도 생성해 확인했다.
- 회귀 테스트와 관련 전체 테스트800/800, typecheck, build, 설정 테스트4/4 통과. 색361→0, 반단계 간격 실측240→0, 미사용 클래스6→0. 원래 시연 데이터는 해시 일치로 보존을 확인했다.
- 별도 품질 진단은 미해결 후속 항목이다: 직원 화면 Lighthouse 중앙값 성능75(모바일)/88(데스크톱), 접근성·권장사항·SEO100. 약2MB 전체 폰트 전달과 React 정적 경고는 별도 검토가 필요하다. 디자인 단계 완료를 앱 전체 무결함·성능 최적화·운영 배포 완료로 해석하지 않는다.


---

## 4. 토큰 정리 — 토큰 밖 색 361건

### 4.1 먼저 `lib/*-meta.ts` 6개를 고친다

이 파일들이 클래스 문자열을 만들어 전 화면에 뿌린다. 파급이 가장 크다. **아래 건수는 2026-09-14 22시 기준이고 다른 세션이 `attendance-meta.ts`·`study-time-meta.ts`를 건드리는 중이므로 착수 직전에 다시 센다.**

| 파일 | 건수 |
| --- | ---: |
| `lib/student-meta.ts` | 32 |
| `lib/study-track-meta.ts` | 15 |
| `lib/sonner.tsx` | 12 |
| `lib/interview-meta.ts` | 12 |
| `lib/point-meta.ts` | 9 |
| `lib/leave-meta.ts` · `lib/attendance-meta.ts` | 9 |

`tailwind.config.ts`의 `content` 글로브에 `lib/**`가 들어 있어야 클래스가 생성된다. 이미 있으므로 지우지 않는다.

### 4.2 바꿀 곳 대응표

| 현재 | 바꿀 것 |
| --- | --- |
| `emerald-*` · `green-*` · `lime-*` | `admin-success` / `-soft` / `-line` |
| `rose-*` · `red-*` | `admin-danger` / `-soft` / `-line` |
| `amber-*` · `yellow-*` · `orange-*` | `admin-warning` / `-soft` / `-line` |
| 출결 상태 | `attend-present` · `-tardy` · `-absent` · `-excused` · `-holiday` · `-unprocessed` |
| `cyan-*` (`lib/point-meta.ts:64`) | 대응 토큰 없음. 의미를 확인해 위 셋 중 하나로 옮긴다 |

같은 뜻이 9개 색으로 갈려 있다. 계열별 건수: rose 92 · emerald 82 · amber 76 · red 62 · green 27 · orange 15 · yellow 7 · cyan 6 · lime 3.

### 4.3 경고 단계 토큰이 정의만 되고 사용 0건이다

`tailwind.config.ts`의 `warn-1` · `warn-2` · `warn-interview` · `warn-withdraw`가 **전 파일에서 0회 사용된다.** `lib/student-meta.ts:129~157`이 같은 단계를 손으로 쓴 팔레트로 칠한다.

| 단계 | 현재 글자색 | 현재 배지 | 바꿀 것 |
| --- | --- | --- | --- |
| `WARNING_1` | `text-yellow-700` | `border-yellow-200 bg-yellow-50` | `warn-1` 계열 |
| `WARNING_2` | `text-orange-700` | `border-orange-200 bg-orange-50` | `warn-2` 계열 |
| `INTERVIEW` | `text-red-700` | `border-red-200 bg-red-50` | `warn-interview` 계열 |
| `WITHDRAWAL` | `text-rose-900` | `border-rose-300 bg-rose-100` | `warn-withdraw` 계열 |

- 지금 `warn-*`는 글자색 hex 하나뿐이라 배지의 `-soft`(배경)·`-line`(테두리)가 없다.
- `app/globals.css`에 4단계 × (본색 · `-soft` · `-line`) 토큰을 추가한다. **hex와 `-rgb`를 반드시 함께 선언한다**(`DESIGN.md` §2). `-rgb`가 없으면 Tailwind 클래스가 조용히 아무 스타일도 만들지 않는다.
- `tailwind.config.ts`의 `warn` 팔레트를 그 토큰에 연결한다. 지금은 hex 직접 값이다.
- `DESIGN.md` §2 색 토큰 표에 추가한 토큰을 적는다. 문서와 `globals.css`는 같은 커밋에서 바뀐다(§9 작업 원칙 3).

### 4.4 졸업 상태가 직렬 강조색으로 칠해져 있다

- `lib/student-meta.ts:123` `GRADUATED` → `text-sky-700`.
- `sky`는 `tailwind.config.ts`에서 `accentScale`에 연결돼 있다. 즉 졸업 상태가 **직렬 강조색**으로 나온다. 직렬 색이 바뀌면 졸업 상태색도 같이 바뀐다.
- 상태색은 강조색과 분리한다(`DESIGN.md` §2).
- 중립(`admin-text-secondary`)으로 둘지 별도 상태 토큰을 만들지 **판단해 보고하고 진행한다.**

### 4.5 남은 화면별 정리

`lib/*-meta.ts`를 끝낸 뒤 아래 순서로 진행한다. 상위 파일이 절반을 차지한다.

| 파일 | 토큰 밖 색 | 4px 밖 간격 |
| --- | ---: | ---: |
| `components/dashboard/AdminDashboard.tsx` | 48 | 29 |
| `components/phones/PhoneCheckSeatMap.tsx` | 31 | 17 |
| `components/phones/PhoneCheckForm.tsx` | 23 | 9 |
| `components/phones/PhoneSubmissionManager.tsx` | 19 | 9 |
| `components/attendance/AttendanceSeatView.tsx` | 18 | 6 |
| `components/super-admin/SuperAdminOverview.tsx` | 12 | 8 |
| `components/attendance/AdminAttendanceBoard.tsx` | 8 | 13 |
| `components/students/StudentListManager.tsx` | 8 | 12 |
| `components/students/StudentDetailTabs.tsx` | 7 | 29 |
| `components/seats/SeatStatusBoard.tsx` | 7 | 13 |

---

## 5. 금지 패턴 제거

### 5.1 좌석 카드 3개 파일이 같은 마크업을 복붙했다

`components/attendance/AttendanceSeatView.tsx:275` · `components/phones/PhoneCheckSeatMap.tsx:250` · `components/seats/SeatStatusBoard.tsx:708`

- `hover:opacity-80` — `DESIGN.md` §5.6이 "전체를 흐리는 방식은 쓰지 않는다"고 금지한다. hover는 면 한 단계(`surface-soft` / `accent-soft`)로만 준다.
- `ring-2 ring-slate-900 ring-offset-1` — §5.7이 "떠 있는 shadow ring을 만들지 않는다"고 금지한다. 선택 표시는 테두리 색으로 준다.
- 세 파일이 같은 모양이므로 **공용 좌석 카드 컴포넌트로 묶는 것을 먼저 검토**하고, 비용이 크면 같은 값으로 각각 고친다.
- 좌석 지도의 고유 형상(`DESIGN.md` §4 모서리 결정표)은 유지한다.

### 5.2 나머지

| 항목 | 건수 | 조치 |
| --- | ---: | --- |
| `rounded-full` | 17 | 점·아바타만 남기고 8px(모바일 4px)로. `AdminDashboard.tsx:844~846` 출석률 진행바가 예 |
| 손으로 쓴 보조문구 (`text-sm text-slate-500` 계열) | 46 | `.admin-help` |
| 4px 밖 간격 | 241 | `px-2.5`(10px) 50 · `py-0.5`(2px) 32 · `mt-1.5`(6px) 31 · `py-2.5` 27 · `mt-0.5` 27. 스케일은 4/8/12/16/20/24/32/40/44/48/56/64px |
| shadow ring (`ring-N`) | 15 | 테두리 색으로 |
| `hover:opacity-*` | 3 | 5.1과 동일 |

---

## 6. 정의만 되고 화면에 없는 클래스 11개

`app/globals.css`에 있으나 `.tsx` 어디에서도 쓰이지 않는다. 문자열 조립으로 만들어지는지도 확인했고 **없었다.**

| 클래스 | 처리 |
| --- | --- |
| `admin-list-row` · `-title` · `-value` · `-stack` · `-label` · `-meta` | `MOBILE_DESIGN.md` §2.4 3단계 미착수. **지우지 않는다.** §3.2의 목록 화면 작업에서 적용한다 |
| `admin-panel-row-link` · `-label` | 설정 허브가 탭으로 바뀌며 소비자가 사라졌다. 다음 목록형 이동에 쓸지 지울지 판단해 보고한다 |
| `admin-tab-count` · `admin-print-only` · `admin-mobile-topbar-action` | 용도를 확인해 적용하거나 지운다. 판단 근거를 남긴다 |

---

## 7. 회귀 방지 — 이번 작업에 반드시 포함한다

지금 `tests/`에 색·간격 회귀를 막는 검사가 없다. 361건과 241건이 줄지 않는 이유다.

- `tests/render/`에 정적 검사 테스트를 추가한다.
  - 토큰 밖 팔레트(`red|rose|amber|emerald|yellow|green|orange|purple|teal|violet|pink|cyan|lime|fuchsia|stone`) 사용 건수 상한.
  - 4px 밖 간격 유틸(`*-N.5`) 사용 건수 상한.
  - `hover:opacity-*` · `ring-N` · `border-3` 사용 0건.
  - `globals.css`에만 있고 `.tsx`에 없는 `.admin-*` 클래스 목록 상한.
- **상한은 착수 시점의 실측값으로 고정하고, 고칠 때마다 낮춘다.** 한 번에 0으로 두면 작업이 끝날 때까지 테스트가 빨간 상태로 남는다.
- `tests/render/settings-tab-layout.test.ts`에 `staff`를 더한다(§2.1).

---

## 8. 지켜야 할 것

1. 코드를 고치기 전에 그 파일을 먼저 읽는다. 새 파일보다 기존 파일 수정을 우선한다.
2. 새 규격이 필요하면 **`DESIGN.md`(또는 `MOBILE_DESIGN.md`)와 `globals.css` 토큰을 같은 커밋에서** 바꾼다. 특정 화면에 임의 값만 덧씌우지 않는다.
3. 벌점 임계값·지각 기준·휴가 한도는 `division_settings`에서 읽는다. 직렬명·직렬 색상은 DB에서 읽는다. 하드코딩하지 않는다.
4. 경찰 전용 분기를 만들지 않는다. 공통 모듈로 개발하고 사용 여부는 학원 설정으로 나눈다(`CLAUDE.md` 학원별 독립 설정 원칙).
5. 모든 쿼리에 `division_id` 필터를 유지한다.
6. 한글 문자열과 문서는 UTF-8로 읽고 저장한다. 수정 전후 깨짐을 확인한다.
7. 코드·커밋 메시지·파일명은 영어, 사용자 대화는 한국어다.
8. **Git 커밋·푸시·운영 배포는 사용자의 명시적 승인 후에만 한다**(`ACADEMY_TEMPLATES.md`). 과거 승인을 새 작업의 승인으로 재사용하지 않는다. 로컬 구현·검증과 운영 반영을 나눠 보고한다.
9. 승인을 받아 배포할 때만 커밋 메시지에 `[deploy study-hall]`을 넣는다. 없으면 Vercel이 건너뛴다.
10. 다른 세션의 작업을 보존한다. 설정 리팩터 20개 파일과 `DESIGN.md`·`CLAUDE.md` 개정분이 미커밋 상태다. 되돌리지 않는다.

## 9. 하지 말 것

- 운영 DB를 직접 고치지 않는다. 마이그레이션이 필요하면 SQL을 문서로 남기고 보고한다.
- 폼 값·기능 제한·권한·API·계산 로직을 디자인 작업 중에 바꾸지 않는다. 이번 작업은 **표현만** 바꾼다.
- 출결 상태색·경고 단계색을 직렬 강조색으로 치환하지 않는다. 업무 의미가 있는 색이다.
- **규격을 이미 지키는 화면을 "일관성" 이유로 바꾸지 않는다.** 데스크톱 통과 30개 화면, 조교 3개 화면, 설정 10개 탭이 여기 해당한다. 바꾸고 싶으면 보고하고 답을 받는다.
- **§2.6 · §3.2의 `admin/reports` · §3.3의 `.admin-table-link` · §3.4의 두 항목 · §4.4는 운영자 확인 전에 착수하지 않는다.**
- `.admin-choice-button` 36px를 44px로 키우지 않는다. 규격대로다.
- 모바일 전용 분기를 새로 만들지 않는다. §2의 구조 수정이 두 폭을 함께 해결한다.
- 문서만 고치고 UI 수정 완료나 배포 완료라고 보고하지 않는다.
- 정적 검사나 과거 스크린샷만으로 모든 화면을 확인했다고 말하지 않는다.

---

## 10. 검증

각 단계를 끝낼 때마다 수행한다.

```bash
pnpm run typecheck
```

```bash
pnpm run build
```

```bash
npx tsx --test tests/render/settings-tab-layout.test.ts
```

### 브라우저 실측

**390px · 768px · 1280px** 세 폭에서 확인한다. 768px에서는 사이드바를 뺀 실제 콘텐츠 폭으로 판단한다.

- `DESIGN.md` §9의 **레이아웃 점검**과 **계산값 점검** 콘솔 스크립트를 고친 화면마다 돌린다. `n`이 0이 아니면 그 화면은 아직 미완성이다. `fonts`는 Pretendard 하나, `offScale`은 빈 배열이어야 한다.
- 레이아웃 점검 스크립트에는 2026-09-14 개정으로 탭 줄 겹침·2열 편집·낱개 섹션 검사가 추가돼 있다.
- 390px에서는 `MOBILE_DESIGN.md` §4 검증표 10개 항목을 전부 잰다. 이 문서 §3.1·§3.2·§3.3이 그 기준선이며, 고친 화면의 값이 나빠지지 않았는지 대조한다.

### mock 로그인

레포의 `scripts/design-ui-audit.mjs`가 쓰는 경로와 같다.

```
POST /api/auth/login          {"email":"admin-police@mock.local","password":"test1234"}
POST /api/auth/login          {"email":"assistant-police@mock.local","password":"test1234"}
POST /api/auth/student-login  {"division":"police","studentNumber":"90001","name":"김지훈"}
```

### 측정 함정 세 가지

- **브라우저 패널을 띄운 상태로 잰다.** 숨기거나 폭이 0이면 rAF가 멈춰 캐시된 computed style이 나온다. 이 조사에서 실제로 한 번 오측정했다.
- **CSS를 고친 뒤에는 새로고침하고 잰다.** 고치자마자 재면 이전 값이 나온다.
- **0값이 나오면 의심한다.** 개발 서버가 HMR 깨짐으로 500을 내면 빈 화면이 측정된다. 재측정 후에도 0이면 그때 결함으로 본다.

### 레포의 기존 감사 스크립트

`scripts/design-ui-audit.mjs` · `design-dialog-audit.mjs` · `design-workspace-audit.mjs` · `design-workflow-audit.mjs` · `mobile-audit.js`가 있다. **Playwright 1.58.2를 2026-09-14에 설치했다**(`apps/study-hall` devDependency). 실행법과 결과는 §3.6을 본다. 착수 당시 미실행이었던 나머지 네 스크립트도 2026-09-15에 실행했으며, 최신 결과는 §3.6의 완료 재검증과 단계별 보고서에 기록했다.

---

## 11. 보고 형식

단계마다 아래를 남긴다.

- 고친 파일과 그 근거가 되는 `DESIGN.md` / `MOBILE_DESIGN.md` 절 번호.
- 검사 수치의 변화 — 토큰 밖 색 · 4px 밖 간격 · 죽은 클래스 · 첫 데이터 top · 44px 미만 터치 대상.
- 운영자 판단이 필요해 멈춘 항목과 선택지.
- 규격 위반이 아니라서 일부러 두고 온 것.

출처: 2026-09-14 로컬 도커 개발 서버(MOCK_MODE) 1280×900 및 390×844 실측 34개 화면, `app`·`components`·`lib` 429개 파일 정적 검사, `DESIGN.md`·`MOBILE_DESIGN.md` 2026-09-14 개정판
