# Class-pass 디자인 시스템

기준일: 2026-09-06

기준: 현재 로컬 작업 트리의 실제 구현. 배포본이나 향후 시안이 아니다.

이 문서는 Class-pass의 현재 UI/UX 기준이다. 과거의 변경사항을 날짜순으로 덧붙이는 방식 대신, 현재 유효한 규칙 하나로 정리한다. 새 화면을 만들거나 기존 화면을 수정할 때 먼저 이 문서를 읽는다.

## 1. 적용 범위와 디자인 방향

### 관리자 기준

관리자 화면은 합격예측(score-predict)에서 가져온 **Pretendard, 흰색 작업 화면, 어두운 좌측 메뉴, 폴더형 1차 탭, 밑줄형 2차 탭, 얇은 표 그리드**를 사용한다. 정보 밀도는 높게 유지하되 화면 전체를 카드로 나누지 않는다.

| 범위 | 기준 |
| --- | --- |
| 대시보드, 강좌, 수강생, 수납·정산, 인증, 직원, 팝업, 지점 설정 | 이 문서의 관리자 규격 |
| 관리자 로그인·설정, 최고 관리자 | 같은 AdminTheme와 토큰. 사이드바 없는 별도 레이아웃 허용 |
| 관리자에서 여는 등록·결제·메모·확인 모달과 메뉴 | 같은 관리자 토큰과 모달 구조 |
| 학생 수강증, 직원 스캔, 공개 QR 디스플레이 | 관리자 CSS를 확장 적용하지 않음. 8절의 호환 경계 유지 |

관리자 CSS 원본은 [admin.css](src/app/%28admin%29/admin.css), 테마·로컬 폰트·포털 원본은 [AdminTheme.tsx](src/components/admin/AdminTheme.tsx)이다. 관리자 토큰은 globals.css가 아니라 **.admin-shell 안의 --admin-* 변수**에 있다. 학생 기본 스타일은 [globals.css](src/app/globals.css)에 있다.

디자인 판단 우선순위: 사용자가 승인한 최신 요구 → 현재 구현과 이 문서 → 기능별 개발 명세. 충돌 시 이전 Apple 홍보 사이트 예시나 과거 검토 보고서를 관리자 디자인 기준으로 사용하지 않는다. 형제 앱의 현재 변경을 자동으로 가져오지 않는다.

- 관리자 디자인에 장식용 영문 소제목, 히어로 이미지, 그라데이션, 카드 그림자를 추가하지 않는다.
- 제목 밑 course slug, 내부 ID, tenant 경로, Code 보조 문구는 표시하지 않는다.
- 실제 영문 강좌명은 사용자 데이터이므로 바꾸지 않는다.
- 영수증 번호, 응시번호, 출석기기 등록 코드, 명시적인 보고 코드 입력 등 업무 식별자는 유지한다.
- 값의 색상으로 상태를 전달하되 반드시 읽을 수 있는 상태 문구도 제공한다.

## 2. 색상과 라인 토큰

### 공통 토큰

아래 값은 .admin-shell의 실제 CSS 변수값이다.

| CSS 변수 | 값 | 용도 |
| --- | --- | --- |
| --admin-surface | #ffffff | 페이지, 모달, 활성 폴더 탭 |
| --admin-surface-soft | #fafafa | 중립 hover, 패널 머리글, 모달 footer |
| --admin-surface-muted | #f3f3f5 | 비활성 탭, 비활성 입력 |
| --admin-surface-strong | #e8e8ec | 확정 영역 강조 footer(admin-dialog-footer-accent) |
| --admin-text | #0a0a0a | 주요 글자, 사이드바 바탕 |
| --admin-sidebar-hover | #222222 | 사이드바 hover·활성 배경 |
| --admin-text-secondary | #4b4b4b | 보조 라벨, 비활성 정렬 화살표 |
| --admin-text-muted | #6b6b6b | 설명, 날짜, 보조 정보 |
| --admin-text-disabled | #9c9c9c | 비활성 글자, placeholder, 어두운 메뉴의 보조 글자 |
| --admin-line-soft | #e8e8ec | 섹션·리스트 구분선 |
| --admin-line | #d6d6dc | 입력·버튼·모달 외곽과 구분선 |
| --admin-grid | #dddddd | 표 외곽·가로·세로선 |
| --admin-danger | #b91c1c | 작은 오류·삭제 문구와 자료 위험 작업. 흰 바탕에서 읽을 수 있는 대비 |
| --admin-danger-soft | #fef2f2 | 위험 작업 hover 배경 |
| --admin-overlay | rgb(0 0 0 / 0.5) | 관리자 모달 뒤 배경 |
| --admin-dialog-shadow | 0 12px 32px rgb(10 10 10 / 0.14) | 모달·드롭다운의 한정된 그림자 |

### 테넌트 강조색

컴포넌트는 아래 변수명만 사용한다. 경찰·소방을 판단해 개별 버튼의 색을 하드코딩하지 않는다.

| CSS 변수 | 경찰 기본값 | 소방 data-tenant='fire' |
| --- | --- | --- |
| --admin-accent | #002ef6 | #dc2626 |
| --admin-accent-hover | #0024c8 | #b91c1c |
| --admin-accent-soft | #f2f5ff | #fef2f2 |
| --admin-accent-tint | #e3e9ff | #fee2e2 |
| --admin-accent-line | #c7d3ff | #fecaca |

강조색은 주요 실행 버튼, 선택·현재 위치, 정렬 활성 상태에 쓴다. 표 헤더는 accent-tint를 쓴다. 경고·환불·정지·성공 등 기존 red/rose/amber/emerald 상태색, 좌석 상태색, 강좌별 테마색은 업무 의미가 있으므로 일괄 강조색으로 치환하지 않는다.

### 라인의 역할

| 요소 | 선 |
| --- | --- |
| 표 | 1px admin-grid. border-collapse: collapse |
| 폼·중립 버튼·일반 모달 외곽 | 1px admin-line |
| 세로로 이어진 페이지 섹션·내부 목록 | 1px admin-line-soft |
| 폴더 탭 | 1px 외곽, 아래 연속 accent 선. 선택 탭 아래는 흰색 |
| 서브 탭 | 바탕 1px admin-line, 선택 항목 아래 2px accent 직선 |
| 좌측 메뉴 활성 표시 | 왼쪽 4px accent |
| 키보드 포커스 | 기본 2px accent outline. 입력창은 기존 테두리 색 변경 |

모든 선을 같은 회색으로 통일하지 않는다. 표 그리드·컨트롤 경계·섹션 구분의 세 단계가 현재 기준이다.

**접근성 검증 경계:** 이 팔레트 기록은 전체 색 조합의 WCAG 통과 선언이 아니다. 낮은 대비의 경계선이나 작은 빨간 글자, placeholder를 포함한 실제 전경/배경 조합은 변경 시 별도 측정한다. 읽어야 하는 상태 문구에 disabled 색을 쓰지 않는다. 이번 문서 갱신은 색상을 변경하지 않는다.

## 3. 폰트와 글자 계층

### 폰트

관리자는 next/font/local로 로드한 src/app/fonts/PretendardVariable.woff2를 사용한다. 변수명은 --font-admin, weight 범위는 100 900, display는 swap이다. 실제 기본 굵기는 400, 강조 600, 제목 700이다.

폰트 스택: var(--font-admin), 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif. SF Pro를 관리자 기본 폰트로 지정하거나 별도 웹 폰트를 화면별로 추가하지 않는다.

### 타입 규격

| 역할 | CSS 변수·클래스 | 크기 | 굵기 | 줄높이 |
| --- | --- | --- | --- | --- |
| 페이지·모달 제목 | --admin-type-title, admin-page-title, admin-dialog-title, h1 | 20px | 700 | 1.3 |
| 섹션 제목 | --admin-type-section, admin-section-title, h2/h3/h4 | 16px | 700 | 1.3 |
| 기본 본문 | --admin-type-body, admin-shell | 15px | 400 | 1.5 |
| 일반 실행 버튼 | admin-button | 15px | 600 | 1.3 |
| 입력·검색 | input/select/textarea | 15px, 모바일 16px | 기본 400 | 기본 1.5 |
| 기본 폼 라벨 | admin-material-label, 메모 label | 13px | 600 | 1.3 또는 상속 |
| 안내·보조 문구 | --admin-type-caption, admin-material-help, 메모 설명 | 13px | 400 | 1.5 |
| 폴더 탭 | admin-tab | 16px | 기본 400, 선택 700 | 1.3 |
| 서브 탭·조건 버튼 | admin-subtab, admin-choice-button | 15px | 600 | 1.3 |
| 기본 표 | table | 13px | 본문 400, 헤더 600 | 1.3 |
| 표 안 축약 버튼 | table button, 학생 행 작업 | 13px | 일반/작업별, 행 작업 600 | 1.3 |
| 대시보드 KPI | admin-dashboard-metric-value | 32px | 700 | 1.2 |
| 요약·리스트 숫자 | admin-metric-strip, admin-dashboard-row-value | 20px | 700 | 1.3 |

현재 코드의 **표 기본값과 개별 표의 실효값을 구분**한다. table.text-sm 등의 기존 유틸은 관리자 본문 매핑 때문에 15px이 된다. 현재 수강생 명단은 표 본문 15px, 헤더·상태 배지·행 작업·메모 미리보기 13px이다. 문서를 맞추기 위해 본문을 몰래 13px로 바꾸지 않는다. 새 표는 기본 13px을 사용하고 기존 본문 크기 변경은 별도 UI 변경으로 검증한다.

자간은 .admin-shell에서 -0.05em, 제목과 tracking 유틸에서도 -0.05em이다. 나머지는 상속된 계산값을 따른다. 실제 15px 루트 기준 상속 자간은 -0.75px이며, 20px 제목은 -1px이다. 표·페이지 번호·KPI는 tabular-nums를 사용한다. 식별 코드의 기존 monospace는 업무 용도로 유지한다.

긴 강좌명·학생명·모달 제목·오류는 줄바꿈한다. 폴더 탭과 표의 일반 짧은 값은 한 줄 유지, 강좌명·메모·이름은 명시적 줄바꿈 예외이다. 전체 제목을 truncate로 잘라내지 않는다.

## 4. 간격·규격·모서리

### 치수 토큰

간격 기본 단위는 4px이다. 간격 스케일은 4/8/12/16/20/24/32/40/44/48/56/64px이다. 0과 1px 선, 2px 포커스, 글자 크기·제한 폭은 간격 스케일의 예외다.

| CSS 변수 | 현재 값 | 용도 |
| --- | --- | --- |
| --admin-radius | 8px | 일반 컨트롤·허용된 외곽 박스 |
| --admin-control-height | 44px | 일반 버튼·입력·선택·닫기 최소 높이 |
| --admin-control-compact | 36px | 데스크톱 표 안 축약 작업 |
| --admin-control-padding-x / --admin-control-padding-y | 16px / 8px | 일반 버튼 가로/세로 안쪽 여백 |
| --admin-choice-width | 128px | 선택·필터 버튼 동일 폭 |
| --admin-roster-search-width | 320px | 데스크톱 명단 검색 최대·기준 폭 |
| --admin-roster-query-basis | 640px | 검색+전체 집계 그룹의 flex 기준 폭 |
| --admin-dialog-padding | 24px, 768px 미만 16px | 모달 가로 여백 |
| --admin-dialog-action-width | 80px | 모달 footer 버튼 최소 폭 |
| --admin-dialog-close-icon | 20px | 모달 X 아이콘 |
| --admin-material-preview-height | 240px | 회차 이름 미리보기 최대 높이 |

라벨과 입력 8px, 필드 사이 16px, 섹션 사이 24px을 사용한다. 입력 컨트롤 자체는 기본 8px 12px, 버튼은 8px 16px이다. 높이를 고정해 글자가 잘리지 않도록 min-height를 사용한다.

### 모서리 결정표

| 대상 | 최종 모서리 |
| --- | --- |
| 버튼, 검색, 입력, select, textarea, 배지, 일반 안내 박스 | 8px |
| 대시보드 개별 KPI·리스트 패널, 로그인 카드 | 외곽 8px |
| 중앙 모달, 드롭다운 메뉴 | 외곽 8px |
| 1차 폴더 탭·탭 바, 2차 서브 탭·활성 밑줄 | 0, 직각 |
| 표·표 프레임·표 내부 선·헤더 정렬 버튼 | 0, 직각 |
| 우측 슬라이드 모달 / Drawer | 0, 직각 |
| 모달 header/body/footer, 카드 내부 행·머리글·구분선 | 0, 직각 |
| 탭 페이지 전체를 감싼 섹션 | 박스 없음, 0 |
| native checkbox/radio, 좌석 지도와 기능성 마커 | 고유 형상 보존. 관리자 공통 박스로 재설계하지 않음 |

표 안의 일반 실행 버튼·입력창은 **8px 유지**한다. 표를 직각으로 만들기 위해 모든 자손을 일괄 0으로 만들지 않는다. 반대로 모든 요소에 8px을 주어 서브 탭 밑줄·내부 구분선이 둥글어지게 하지 않는다.

CSS 앞부분에 남은 border-radius: 0이나 JSX의 rounded-[12px]보다 admin.css 하단의 최종 외곽·예외 규칙이 우선할 수 있다. 소스 한 줄만 보고 결론 내리지 말고 최종 computed style을 확인한다.

## 5. 페이지와 컴포넌트 규격

### 5.1 전체 레이아웃과 사이드바

- .admin-shell은 min-height: 100dvh, 흰색 작업 화면이다.
- 데스크톱 사이드바는 1024px 이상에서 256px 폭. rail은 문서 끝까지 배경이 이어지고 내부 메뉴는 sticky top: 0, height: 100dvh이다.
- 메뉴 목록만 세로 스크롤한다. 아래 직원 화면·로그아웃에 접근할 수 있어야 한다.
- 메뉴 글자 15px/600, 아이콘 Lucide 20px, 최소 높이 44px, 항목 gap 4px.
- 1024px 미만은 검은 상단 헤더의 ‘관리자 메뉴’ 버튼으로 전체 메뉴를 펼친다. 접힌 메뉴는 초점 대상에서 제외하고, 선택 후 접으며 Escape로 닫을 수 있다. 상단 최소 64px, 메뉴 링크 최소 44px.
- 본문 최대 폭은 1440px, 가운데 배치. 본문 padding은 위 24px/아래 48px, 좌우 16px → 768px부터 24px → 1024px부터 32px.
- 앱 전환은 본문 상단 우측, 최소 높이 44px, 아래 여백 24px.
- 로그인 카드 최대 폭 480px, padding 24px, 모바일 20px. 관리자 공통 폰트·입력·버튼을 쓴다.

### 5.2 한 페이지형 탭 내용

강좌와 수납·정산 탭의 내용은 .admin-flat-page를 사용한다. 서브 패널 .admin-section-panel도 같은 평면 페이지 규칙을 따른다.

기본 순서: 페이지/강좌 제목 → 1차 탭 → 필요한 2차 서브 탭 → 섹션 제목과 관련 작업 → 검색/필터 → 표·폼 → 페이지 이동/저장 영역.

- section/article에 반복적인 카드 배경·외곽선·그림자·라운드를 넣지 않는다.
- 제목·검색창·표의 시작과 끝은 같은 콘텐츠 기준선에 둔다. 별도 가로 padding을 중복하지 않는다.
- 세로로 이어진 섹션은 필요한 곳에 1px line-soft와 위 24px 여백으로 구분한다.
- 좌우 컬럼 사이에 비대칭 구분선을 만들지 않는다. 일반적으로 gap을 사용한다.
- 저장 영역에는 저장 범위를 설명하고 위 line 경계를 둘 수 있다.
- 모달 내부, 모바일 명단 카드, 좌석 지도, 실제 데이터 표 프레임은 평면화 대상이 아니다.
- .admin-table-card의 20px/모바일 16px padding은 평면 페이지 밖의 박스에만 해당한다. 평면 정산 페이지에서는 가로 padding 0이 최종값이다.

### 5.3 카드가 필요한 경우

대시보드 요약·로그인·모바일 명단·모달 내부 안내처럼 독립된 의미가 있을 때만 사용한다. 카드형 UI가 탭 페이지 전체를 감싸는 기본 템플릿이 되어서는 안 된다.

대시보드는 제목/작업 → 개별 KPI 카드 → 확인할 일·기능 사용 패널 → 강좌 표 순서다.

- KPI는 **붙어 있는 한 개 스트립이 아니라 16px 간격의 개별 카드**. 외곽 8px, 1px line, padding 20px.
- 1280px 미만 KPI 2열, 이상 4열. KPI 숫자는 32px, 단위 13px.
- 확인할 일·기능 패널은 기본 1열, 1280px 이상 1.35fr/1fr, gap 24px.
- 패널 제목부 padding 16px 20px, 최소 높이 56px, soft 배경과 아래 1px line.
- 패널 내부는 좌우 20px, 행 위아래 12px, line-soft. 마지막 행의 아래 선은 없다.
- 외곽만 8px로 자르고 내부 행·헤더는 직각. header 배경이 라운드 경계 밖으로 나가지 않게 한다.
- 강좌 표를 담은 .admin-dashboard-courses는 직각이다. 표 최소 폭 1080px, 강좌명 최대 320px.
- .admin-metric-strip / .admin-course-summary는 페이지·모달 모두 **16px 간격의 독립 요약 박스**다. 각 항목에 닫힌 1px line 외곽과 8px 모서리, 16px padding을 적용한다. 그룹 자체에는 배경·외곽·클리핑을 두지 않는다. 레이블 13px 위, 값 20px 아래 오른쪽 정렬이며 긴 값은 줄바꿈한다. 768px 미만 2열, 그 이상 최소 160px 자동 열이다. 자료의 세 항목은 768px 이상 3열이다. 대시보드 KPI의 32px 숫자와 구분한다.
- 요약 박스만 평면 페이지 규칙의 예외다. 요약·폼·목록 전체를 둘러싼 중첩 카드로 만들지 않는다. 선 하나만 있는 section에 라운드를 적용하지 않는다.
- 강좌 설정의 다섯 요약은 768~1279px에서 3열, 1280px 이상에서 5열로 배치한다.

### 5.4 1차 폴더 탭

.admin-tabs / .admin-tab을 재사용한다.

- 높이 최소 56px, padding 16px, 항목 안 gap 8px, 직각.
- 기본 muted 배경·line 테두리·muted 글자, 아래 accent 1px 연속 선.
- 활성은 흰색 배경, 위/좌우 accent 테두리, 아래 흰색, 글자 text/700.
- hover는 soft 배경, text 글자. 비활성은 disabled 글자와 클릭 금지.
- 긴 메뉴는 라벨을 줄이거나 말줄임하지 않고 탭 영역 안에서 가로 스크롤한다.
- 경로 이동은 Link와 aria-current='page', 페이지 안 선택은 실제 역할에 맞는 button/선택 속성을 유지한다.

강좌 순서: **수강생 → 현황 → 좌석 배정 → 지정좌석 → 출결 → 자료 → 설정**. 강좌 기본 URL은 수강생으로 이동한다. 설정은 항상 마지막이며 /settings URL을 쓴다. 기능별 비활성 조건은 유지한다.

정산 순서: 정산 안내 → 일일 정산 → 월별 정산 → 엑셀 가져오기 → 정산 검증.

### 5.5 2차 서브 페이지

.admin-subtabs / .admin-subtab은 **밑줄형 텍스트 탭**이다. 두 번째 폴더 줄이나 선택 박스로 만들지 않는다.

- 바탕 흰색/투명, 아래 line 1px, 항목 gap 4px.
- 항목 최소 높이 44px, padding 12px 16px, 15px/600, 자연 폭.
- 활성은 accent 글자와 **2px 직선 밑줄**. hover 중에도 선택 색을 유지하며 배경을 박스로 채우지 않는다.
- 라운드는 모두 0. 좁은 화면에서 wrap하고 글자를 자르지 않는다.
- 긴 기능 묶음에만 추가한다. 짧은 화면에 불필요한 하위 단계나 세 번째 폴더 줄을 만들지 않는다.
- 공유 AdminSectionTabs는 tablist/tab/tabpanel, 좌우 방향키·Home·End, 선택 탭의 roving tabindex를 제공한다.
- 패널을 숨겨도 마운트 상태를 유지해 초안을 보존한다. 숨겨진 첫 오류 입력은 해당 패널을 연 뒤 포커스한다.
- 기존 명단 화면의 group/aria-pressed 기반 서브 메뉴도 같은 밑줄 디자인을 사용한다. 모든 구현이 동일 ARIA 컴포넌트라고 가정하지 않는다.

수강생 서브 메뉴: 명단 관리 / 배부자료 수령현황 / 교재 배정 / 교재 수령현황. 등록·명단 작업은 명단 관리에만 둔다.

### 5.6 조건 선택 버튼과 일반 버튼

탭은 탐색, .admin-choice-group / .admin-choice-button은 데이터 필터·폼 선택이다. 두 역할을 혼용하지 않는다.

- 조건 버튼은 **모두 폭 128px, 최소 높이 44px**, padding 8px 12px, gap 4px, 8px 모서리.
- 기본 흰색·line 테두리·secondary 글자. 선택은 accent 테두리/글자·accent-soft 배경, aria-pressed.
- 화면이 좁으면 버튼 폭을 글자 길이에 맞춰 줄이지 않고 줄바꿈한다. 768px 미만 그룹 기준 폭은 260px(128px 두 개+4px), max-width: 100%.
- 128px보다도 좁은 컨테이너에서는 max-width가 우선하며 행을 늘려 글자가 잘리지 않게 한다.
- 일반 실행 버튼은 내용에 맞는 폭이다. 128px 동일 폭 규칙은 모든 실행 버튼에 적용하지 않는다.
- primary는 accent/흰 글자, hover accent-hover. neutral은 흰색·line, hover soft.
- 버튼의 pending/disabled와 의미 있는 경고색을 보존한다. 중요 작업이 완료되기 전에 반복 실행되지 않도록 기존 guard를 유지한다.
- 직렬 등의 인접 select는 160px flex 기준·최소 폭, max-width: 100%로 줄바꿈한다.

### 5.7 폼·검색·상태 안내

강좌 설정의 일곱 서브페이지는 같은 글자 계층을 사용한다. 설정 항목명·편집 열 제목은 본문 15px/600, 주요 설명·위험 안내는 15px/1.5, 섹션 제목은 16px/700이다. 입력값·서브 탭은 기존 공통 규격을 유지한다. 이 화면의 항목명은 설정을 판단하는 주요 정보이므로 기본 축약 폼 라벨 13px 대신 본문 토큰을 사용한다. 짧은 부연·저장 범위 안내·표 헤더와 표 내부 축약 작업은 기존 13px을 유지한다. 라벨과 입력 사이 8px, 필드 사이 16px이며 native 위치 인증 선택도 운영 기능과 동일한 20px 체크박스·최소 44px 클릭 영역을 사용한다. 탭 페이지를 카드로 감싸거나 글자 크기를 전역 확대하지 않는다.

- 보이는 label을 제공한다. placeholder는 label을 대신하지 않는다.
- input/select/textarea 및 부모 grid/flex 항목에 min-width: 0, max-width: 100%를 보장한다.
- 흰 바탕, line 1px, 8px 라운드, 최소 44px. 일반 textarea 최소 112px.
- 비활성은 muted 배경/disabled 글자, 오류는 기존 rose/red border와 문구.
- **텍스트 입력 포커스는 기존 테두리가 accent로 바뀌는 방식**이다. 별도의 떠 있는 파란 shadow ring을 만들지 않는다. 버튼·링크·native 입력의 키보드 outline은 제거하지 않는다.
- .admin-input-group도 focus-within에서 기존 테두리만 accent로 강조한다. 입력 그룹 바깥 outline과 shadow를 추가하지 않는다.
- 검색창과 도구 모음은 표의 좌우 경계선에 맞춘다. 내부 검색 아이콘용 여백은 유지한다.
- 로딩, 오류/재시도, 실제 데이터 없음, 조건 검색 결과 없음, 저장 중을 구분한다. 전체 집계와 필터 후 결과 건수를 혼동하지 않는다.

강좌 설정의 운영 기능 선택은 안내문이 아닌 입력 컨트롤이다. 항목 글자는 본문 15px, 묶음 제목은 15px/600, 설명은 13px로 구분한다. native checkbox는 20px 크기로 고유 형상을 유지하고, 연결된 label 전체에 최소 44px 클릭 영역·8px 모서리·12px 간격을 둔다. 선택 행은 accent-soft, hover는 surface-soft를 사용한다. 수강증 표시·수업 기능·공지 안내·신청 운영은 카드 외곽 대신 24px 간격과 직선 line-soft로 구분하며, 선택 항목은 모바일 1열·640px 이상 2열·1280px 이상 3열로 배치한다. 비활성 신청에는 선행 기능 조건을 13px 도움말로 설명하고 기존 체크값을 자동 변경하지 않는다.

명단 검색은 왼쪽 최대 320px, 그 옆에 전체 등록·수강중·환불·수강종료 집계를 둔다. 검색+집계 그룹은 flex-basis 640px, gap 12px이고, 상태 필터는 별도 그룹으로 우측 끝에 정렬한다. 모두 한 줄에 들어가지 않으면 필터를 다음 줄 우측에 둔다. 768px 미만에서는 검색이 전체 폭, 그 다음 줄은 집계 왼쪽·상태 선택창(128px) 오른쪽이다. 다섯 상태의 데스크톱 버튼은 숨기되 선택창에 같은 옵션을 모두 제공한다.

### 5.8 표

| 영역·데이터 | 정렬·모양 |
| --- | --- |
| 모든 헤더 | 가운데, 세로 가운데 |
| 강좌명 셀 | 왼쪽, admin-table-course |
| 금액 셀 | 오른쪽, admin-table-amount |
| 나머지 기본 데이터·배지·행 작업 | 가운데 |
| 메모 미리보기 | 승인된 예외: 왼쪽, admin-table-memo |
| 표·스크롤 프레임 | 직각, 내부에서만 가로 스크롤 |

표는 width: 100%, 1px grid, 셀 padding 12px, header accent-tint/600, hover 행 accent-soft. 숫자는 tabular-nums. 금액 정렬을 text-right 하나로 덮어쓰지 말고 의미 클래스에 적용한다. 셀 바로 아래 flex/column 정렬도 같은 방향을 따른다. 확장 폼·팝오버·메뉴까지 가운데 정렬하지 않는다.

- 강좌명 grip은 이름 셀 안에 배치한다. 별도 순서 열과 위/아래 버튼을 재도입하지 않는다.
- grip 최소 44px, 드래그 시 accent-soft 행과 2px inset outline. 포인터·터치 및 ArrowUp/ArrowDown을 유지한다.
- 취소/저장 실패 시 순서를 복원하고, 저장 중 충돌 작업을 잠근다. 표시되지 않은 강좌의 원래 순서도 보존한다.
- 정렬은 SortableHeader의 native button + aria-sort. 클릭 영역 최소 44px, 화살표 16px/선 2px, 라벨과 8px 간격.
- 미선택 화살표는 secondary, 활성 라벨·화살표는 accent. 다음 정렬 동작을 tooltip으로 알린다.
- 스크롤/클리핑 전용 래퍼는 admin-table-frame. 빈 상태에서도 모서리 0.
- 학생명 버튼은 최소 120px/최대 240px 내에서 줄바꿈한다. 강좌명 셀 그룹 최소 240px, 글자 최대 320px.
- 모바일 명단은 기존 카드 레이아웃을 유지할 수 있다. 데스크톱 표 정렬을 강제로 이식하지 않는다.

### 5.9 표 하단 페이지 영역

공유 AdminPagination을 사용한다. 회색 카드 띠가 아니라 평면 footer다.

- 표 다음 margin-top 16px, 위 line-soft 1px, padding 16px 0.
- row/column gap 12px/24px, 글자 13px secondary.
- 왼쪽 조회 수·표시 범위·페이지당 개수, 오른쪽 이전/현재/다음.
- select 최소 폭 96px, 이전/다음 최소 80px, 현재 페이지 최소 64px.
- 컨트롤 최소 높이 44px, 8px 모서리, 이전/다음 버튼 동일 규격.
- 폭 부족 시 그룹별로 wrap. 모바일은 각 그룹 한 줄, 이동 그룹 가운데.
- 포커스 outline은 inset으로 두어 클리핑되지 않게 한다. 기존 페이지 크기 옵션·검색 후 페이지 초기화 동작은 유지한다.

### 5.10 중앙 모달·슬라이드 모달

저장·취소·확인 같은 창 전체 작업이 있는 경우 공통 구조는 admin-dialog-header → admin-dialog-body → admin-dialog-footer이다. footer는 스크롤 본문 밖에 둔다.

창 전체를 확정하는 작업이 없는 모달에는 footer를 만들지 않는다. 수납·환불 drawer, 학생 이력 drawer, PIN 표시 창이 여기 해당한다. 이들은 조회·관리 화면이며 실제 쓰기는 중첩 모달(환불·정정·수납 추가)이 담당하고, 닫기는 header의 공통 AdminDialogClose가 담당한다. footer를 억지로 만들어 닫기 버튼만 넣거나 섹션별 작업을 끌어내리지 않는다. 본문의 form 밖으로 제출 버튼을 옮길 때는 고유 form id와 버튼의 form 속성으로 연결하여 Enter 제출·브라우저 검증·기존 저장 처리를 유지한다.

조회 전용 PIN 표시·학생 이력·연속 결석 상세는 상단 닫기를 제공하면 footer를 생략할 수 있다. PIN별 복사·날짜별 사유 등록 같은 항목 작업은 해당 항목 옆 본문에 둔다. admin-dialog-actions는 본문 안에 별도 작업 그룹이 필요할 때만 쓰는 선택적 유틸이며, 모든 모달의 필수 요소가 아니다.

| 항목 | 중앙 모달 | 우측 슬라이드 / Drawer |
| --- | --- | --- |
| 외곽 | 흰색, line 1px, 8px | 흰색, 왼쪽 line 1px, **직각 0** |
| 폭 | 뷰포트 안, 업무별 max-width | min(760px, 100%) |
| 높이 | 최대 calc(100dvh - 32px) | 100dvh |
| 기본 안전 여백 | 뷰포트 기준 최소 16px, 일부 overlay는 20px | 화면 우측에 붙임 |
| 스크롤 | header/footer는 남고 body만 스크롤 | header/footer는 남고 body만 스크롤 |
| 그림자 | admin-dialog-shadow | admin-dialog-shadow |

입력·등록·편집·상세 조회 작업은 공통 AdminDrawer의 우측 슬라이드를 사용한다. 폭은 min(760px, 100%)이다. 중앙 모달은 삭제·변경 폐기·최종 실행 확인과 짧은 PIN/영수증 안내에만 사용하며 기존 업무별 제한 폭을 유지한다. 확인에 필요한 짧은 사유·확인 문구 입력은 중앙 확인창에 둘 수 있다.

- header: 상하 20px/좌우 24px(모바일 16px), gap 16px, 아래 line.
- body: 상하 20px/좌우 동일, min-height: 0, overflow-y: auto.
- footer: 상하 16px/좌우 동일, 위 line, soft 배경, gap 8px, 기본 우측 정렬.
- 모달 본문에서 **읽고 옮겨 적는 값**은 §5.8 표로 둔다. 학생 이력의 기본 정보·수강 강좌, PIN 발급 결과, 영수증 번호가 여기 해당한다. 키-값 표는 왼쪽 이름 칸을 `th[scope='row']`로 두어 accent-tint 머리글을 유지한다. 반대로 **입력 폼**(환불·정정처럼 행마다 체크박스·금액·방법을 받는 화면)은 표로 바꾸지 않는다. 표 정렬 규칙이 폼 컨트롤과 충돌한다.
- 모달 안 안내·경고는 `admin-notice`와 tone 변형(`admin-notice-warning`, `admin-notice-danger`)을 쓴다. 8px 모서리, 13px/1.5, `--admin-warning-*`·`--admin-danger-*` 토큰이다. `rounded-2xl`이나 `bg-amber-50 text-amber-800` 같은 팔레트 직접 지정으로 화면마다 다른 상자를 만들지 않는다.
- 확정 행동을 강조해야 하는 모달은 `admin-dialog-footer-accent`를 덧붙인다. **면만 `--admin-surface-strong`(#e8e8ec)로 한 단계 내린다.** 위 선은 공통 1px `--admin-line`을 그대로 쓰고 accent 선을 덧대지 않는다. 어두운 면도 새로 만들지 않는다. 사이드바의 검정은 탐색 전용이며, footer까지 어둡게 하면 회색 톤이 3단으로 늘고 짙은 accent 채움 버튼이 배경에 묻혀 위계가 무너진다.
- 이 footer의 금액은 20px/700이며 숫자만 accent로 둔다. 강조는 면 전체가 아니라 **읽어야 할 숫자**에 준다.
- 이 변형은 **footer가 실시간 금액 요약을 담을 때만** 쓴다. 버튼만 있는 footer(환불·정정·확인창 등)에 붙이면 진한 면이 아무 의미도 전달하지 않고 "일부만 회색"으로 보인다. 현재 대상은 수강생 등록 drawer 하나다.
- 버튼은 공통 footer 규격을 그대로 쓴다(accent 채움 primary / 흰색+line 보조 / 텍스트 취소). 면이 한 단계 진해지므로 텍스트 버튼만 `--admin-text-secondary`로 올려 대비 4.5:1을 확보한다.
- header/body/footer 자체 모서리는 모두 0. 외곽만 둥글게 한다.
- title 20px/700, 설명 13px/1.5 muted. 학생·강좌명이 길어도 줄바꿈.
- footer 버튼 최소 폭 80px, 최소 높이 44px, **글자 15px/600**. 취소는 흰색 outline, 저장/확인은 의미에 맞는 primary·danger·success. 일부 모달은 `.admin-button`, 일부는 인라인 Tailwind를 쓰므로 굵기는 `.admin-dialog-footer button`에서 한 번에 맞춘다. 개별 화면에서 `font-medium`·`font-bold`로 덮어쓰지 않는다.
- 공통 닫기 AdminDialogClose: **44×44px 버튼, 20px Lucide X, 8px 모서리, line 테두리, soft 배경**, aria-label/title='닫기'. 우측 상단 정렬, inset 포커스.
- 수강생 등록·편집·수납·이력·메모·정지, 자료·교재 생성·수정·회차 생성, 출결 사유·결석 상세, 좌석 편집·배정, 결제 정정·환불은 우측 drawer다. 직원·팝업·강좌 목록의 등록·편집 폼도 toolbar에서 drawer로 연다. 강좌/지점 설정이나 정산 가져오기처럼 독립 경로가 있는 주 작업 페이지는 평면 페이지로 유지한다.
- 새 관리자 모달과 이번에 구조를 변경하는 모달은 AdminPortal을 통해 AdminTheme 안의 #admin-portal-root로 렌더링한다. 나머지 기존 인라인 구현은 공통화가 남아 있는 대상으로 기록하며 규격 충족으로 간주하지 않는다. 포털 이전 시 중첩 우선순위·포커스 복귀·저장 잠금을 함께 검증한다. SSR·독립 컴포넌트 환경에 포털 root가 없으면 인라인을 유지하며 document.body로 옮기거나 관리자 CSS를 전역 적용하지 않는다.
- 공유 확인창을 학생 페이지에서 사용할 때는 기존 문자형 닫기를 유지한다. 관리자 CSS를 document.body 전체에 적용하지 않는다.

동작은 useModalDialog와 기존 pending guard를 사용한다. 첫 포커스는 모달 패널로 주어 모바일 키보드가 자동으로 뜨지 않게 한다. Tab/Shift+Tab 포커스 제한, 원래 trigger로 복귀, 배경 inert, 중첩 scroll lock, 가장 위 모달만 Escape 처리, 저장 중 닫기 방지를 유지한다. backdrop 클릭의 닫기 여부는 해당 업무 계약을 따른다.

### 5.11 학생 행 작업과 메모

현재 명단의 노출 작업은 **수납·환불 / 편집 / 더보기**이다. 이전 '상세' 작업의 현재 표시명이 수납·환불이며, 학생명 클릭 등 기존 상세 접근은 유지한다. 과거 스크린샷의 상세/편집/기기초기화/정지/삭제 5개를 한 줄로 복원하지 않는다.

더보기에는 해당 학생의 PIN 재설정, 기기 승인/초기화, 정지/해제, 삭제 등 가능한 동작만 둔다. 학생명·응시번호 맥락을 보여주고 삭제는 별도 구분선 아래 둔다. 버튼 최소 높이 데스크톱 36px/모바일 44px, gap 4px, 데스크톱 그룹 최소 176px.

메모는 관리 열 앞 **별도 열**이다. 최소 224px, 미리보기 최대 280px, 글자 13px/1.5, 두 줄, 날짜 앞 gap 4px. 빈 값은 '+ 메모 추가', 내용 클릭은 편집·삭제 창을 연다. 모바일도 작업 그룹 앞에 같은 내용을 보여준다.

메모 저장 단위는 student가 아닌 **수강등록(enrollment)**이다. 동일 학생의 다른 강좌 메모를 합치지 않는다. 최초 작성/마지막 수정 날짜를 한국 시간으로 표시한다.

메모 모달은 textarea 최소 160px, 최대 2000자, label gap 8px, 본문 gap 16px. 날짜·글자 수 영역은 위 line-soft와 padding-top 12px. 삭제는 왼쪽, 취소·저장은 오른쪽 그룹으로 분리하고 좁은 화면에서 wrap한다. 미저장 닫기 경고, 오류 재시도, 동시 수정 충돌, revision 기반 삭제 확인을 보존한다.

### 5.12 작업 메뉴와 자료 폼

공유 AdminActionMenu: 280px 기준 폭, viewport - 32px 제한, panel padding 8px, 8px 모서리, line과 dialog shadow, trigger 아래 8px, 기본 우측 정렬. 일반 메뉴 z-index 40, 최대 높이 min(480px, 100dvh - 160px), 내부 스크롤.

학생 행 메뉴는 표 클리핑 밖 포털에서 열고 viewport 경계 16px를 확보한다. 아래 공간이 없으면 위로 연다. 메뉴 항목 최소 44px, padding 12px 16px, 설명 13px. 키보드 방향키/Home/End/Escape, 외부 클릭, trigger 포커스 복귀를 보존한다.

자료 추가·수정은 공통 material-form-fields를 쓰고, 회차 생성은 같은 필드 규격과 AdminDrawer를 쓴다. 글자 계층은 3절과 같으며 이름 15px/600, label 13px/600. 필드 gap 16px, label gap 8px, section gap 24px. 신규 배부자료·교재 폼은 본문에 상시 노출하지 않고 목록 toolbar의 `새 배부자료` 또는 `새 교재` 버튼에서 우측 drawer로 연다. drawer 외곽은 0, header/body/footer를 분리하며 footer의 취소·생성 버튼은 고정한다. 저장 중에는 닫기·중복 제출을 막고, 실패 시 입력 초안과 drawer를 유지한다. 본문 목록은 전체 폭을 사용한다. 요약은 세 칸이며 1024px 미만은 각 칸의 라벨·값을 세로로 둔다.

회차 미리보기는 최대 높이 240px에서 스크롤한다. 상태 '미구매', '대상 아님'은 muted 글자, disabled 색은 금지한다. 처리 중 fieldset·선택·생성을 잠그는 기능 계약은 유지한다.

자료 목록 제목 행은 최소 44px로 맞추고 `새 자료`를 첫 번째 주요 작업, 여러 회차·새로고침을 보조 작업으로 둔다. 목록 시작·끝과 항목 사이는 직선 line-soft로 구분한다. 각 목록 항목은 정보 위·작업 아래의 두 줄이며, 작업 그룹은 우측 정렬과 8px 간격으로 긴 제목과 경쟁하지 않는다. 활성 checkbox는 native 형태와 접근성 이름을 유지하며, 선택된 부모 컨트롤에 accent 선·accent-soft 배경과 ‘활성/비활성’ 문구를 표시한다. 수정 버튼은 accent-soft 강조, 삭제는 danger outline이다.

학생 상세 drawer는 기본 정보 → 현재 수강중인 강좌 → 전체 수강 이력 순서의 평면 섹션이다. 기본 정보는 2열(640px 미만 1열), label 13px/value 15px이며 섹션 간 24px와 직선 line-soft를 사용한다. 강좌명·식별자·종료 사유를 자르지 않는다. 상태별 이력과 원래 링크는 유지한다.

수강종료 확인창은 최대 512px, 공통 제목·본문·footer·닫기 규격을 사용한다. 본문은 15px/1.5, 사유 label·글자 수는 13px, 사유 입력 최소 112px이다. 위험 확인 버튼은 admin-danger, hover는 같은 색으로 유지하고 비활성일 때는 중립 배경·disabled 글자로 구분한다. 이 관리자 색 규칙은 공유 확인창을 사용하는 학생 화면에 적용하지 않는다.

## 6. 모션

정적 운영 화면에 장식 애니메이션을 추가하지 않는다. 현재 메뉴/탭 색 피드백은 150ms ease-out이다. 기존 모달·drawer는 [motion.ts](src/lib/motion.ts)의 공유 spring과 useReducedMotion을 따른다.

| 용도 | stiffness / damping / mass |
| --- | --- |
| Drawer | 360 / 32 / 0.9 |
| Modal | 420 / 28 / 0.9 |
| Tab | 520 / 34 / 0.8 |

위치는 transform, 투명도는 opacity로 처리한다. reduced-motion이면 JS 전환 duration 0, CSS 전환·애니메이션 0.01ms/1회와 scroll-behavior: auto를 적용한다. 단순 메뉴에 새 모션을 넣을 필요는 없다.

## 7. 깊이와 그림자

페이지·표·카드의 구분은 배경과 얇은 선이 담당한다. 관리자 일반 섹션·대시보드 카드에 그림자를 사용하지 않는다. 모달·작업 메뉴만 admin-dialog-shadow를 사용한다. 관리자 overlay는 50% 검정이며 blur가 없다. 학생 전용 blur overlay와 섞지 않는다.

중첩 우선순위는 기존 모달 컨트롤러·컴포넌트의 priority 및 z-index 계약을 유지한다. 예를 들어 메모 기본 backdrop 50, 결제 drawer 패널 121, 공통 확인창 기본 priority 220은 서로 다른 역할이다. 모든 모달의 z-index를 일괄 50으로 바꾸지 않는다.

## 8. 학생·직원·공개 QR 호환 경계

이 절은 관리자 규격의 예외 범위를 설명한다. 현재 관리자 디자인으로 학생/직원/공개 화면까지 재설계하라는 지시가 아니다.

- globals.css의 student-*는 흰색/회색/검정 기반, 기존 Apple 계열 blue/link 색을 유지한다.
- 학생 폰트 선언은 --font-app-sans, Pretendard 계열, SF Pro 계열, Apple SD Gothic Neo 순의 fallback을 포함한다. 관리자처럼 --font-admin 로컬 폰트가 적용된다고 가정하지 않는다.
- 루트 layout의 Pretendard CDN 링크와 실제 적용 폰트는 구분한다. SF Pro가 모든 기기에 설치·로드된다는 전제도 금지한다.
- 현재 student-frame 최대 폭 768px, student-card 계열 12px, student-input 12px, student-pill-button / student-chip 980px.
- student-display는 clamp(24px, 5vw, 32px), compact는 clamp(20px, 4vw, 24px), 본문 14px/1.47. 374px 이하의 별도 작은 화면 규칙을 유지한다.
- student-input 기본 15px, 최소 44px. 기존 focus의 3px 파란 shadow와 student overlay의 검정 48%/blur 20px은 관리자 예외로 한정한다.
- 학생 기본 palette: --student-blue #0071e3, hover #0077ed, link #0066cc, dark #000000, dark-soft/text #1d1d1f, surface #ffffff, muted/soft #f5f5f7, muted text rgba(0, 0, 0, 0.56), line rgba(0, 0, 0, 0.08), strong line rgba(0, 0, 0, 0.16).
- 직원 스캔·공개 QR은 해당 기능의 코드가 기준이다. 기하·카메라·QR 규칙을 일반 버튼 라운드나 관리자 탭 규칙으로 덮어쓰지 않는다.
- 강좌별 테마색 미설정 시 기존 폼 기본값은 #1A237E이다. 이는 강좌 데이터의 테마색 fallback이며 관리자 버튼·탭의 강조색을 대체하는 UI 토큰이 아니다.

지정좌석 QR 치수는 [display-layout.ts](src/lib/designated-seat/display-layout.ts)가 소유한다: 단일 520px, 2개 멀티 420px, 3개 이상 340px, compact fallback 최소 260px, frame 총 padding 40px, 세로 예약 280px. compact 표시 표면은 상단 등 96px 공간을 예약한다. SVG는 폭 100% 안에서 비율 유지. 이 값은 선호 크기/제약식이며 모든 뷰포트의 실측 크기나 스캔 성공률을 보장하는 수치가 아니다.

기존 관리자 호환 alias가 참조하는 #0071e3 / #0066cc / #2997ff → accent, #1d1d1f → text, #86868b → muted, #f5f5f7 / #f0f0f2 / #e8e8ed → neutral, #d2d2d7 → line은 레거시를 안전하게 연결하기 위한 규칙이다. 새 관리자 색상 후보가 아니다.

## 9. 변경·검증·문서 운영

### 작업 원칙

1. 같은 역할의 기존 클래스와 컴포넌트를 먼저 찾는다.
2. 정확한 토큰·최종 cascade·화면의 computed style을 확인한다.
3. 새 규격이 필요하면 문서와 CSS 토큰을 함께 변경한다. 특정 화면에 임의 값만 덧씌우지 않는다.
4. 폼 값·기능 제한·테넌트·API·데이터를 디자인 작업 중 바꾸지 않는다.
5. 폰트·색·치수 규칙은 이 문서 한 곳에 유지한다. 기능 문서는 이 문서를 링크한다.
6. 과거 QA 보고서·개발 계획의 검증 결과를 최신 결과로 덮어쓰지 않는다.
7. 문서만 갱신한 경우 UI 수정/전체 기능 검증/배포 완료라고 보고하지 않는다.

### 시각 확인 기준

의미 있는 UI 변경은 실제 로컬 브라우저에서 390px, 768px, 1280px와 실제 운영 데스크톱 폭을 확인한다. 특히 768px에서는 사이드바를 뺀 실제 콘텐츠 폭을 기준으로 판단한다.

- 폴더·서브 탭·표·drawer 모서리 0, 일반 입력·버튼·중앙 모달 8px.
- 대시보드 카드 사이 gap 16px, 내부 행·헤더 선의 꺾임 없음.
- 표 헤더 가운데, 강좌명 왼쪽, 금액 오른쪽, 나머지 가운데, 메모만 왼쪽 예외.
- 검색+집계 왼쪽, 상태 필터 오른쪽. 표 기준선과 일치.
- 표·허용된 탐색 영역 외 문서 가로 넘침 없음. 폼 긴 텍스트·줄바꿈·확대 글꼴 확인.
- 중앙/슬라이드 모달 모두 닫기·footer가 짧은 화면에서도 도달 가능.
- focus, keyboard, pending, empty, error, retry, 미저장 초안, 중첩 모달 확인.
- 학생·직원·QR 화면으로 관리자 CSS가 새어나가지 않음.

### 2026-09-05 리뷰 보완 규칙

- 명단의 기본 표는 응시번호·이름·연락처·상태·메모·관리로 구성한다. `상세 열 표시`를 켜면 기수·성별·직렬·학원구분·등록일·출석 기기·추가 필드를 함께 확인한다. 데이터나 검색 조건은 변경하지 않는다. 학생 이름 열은 가로 스크롤에서 고정하고, 표의 세로 스크롤 영역은 최대 `min(640px, 70dvh)`로 헤더를 고정한다.
- 768px 미만에서 상태 필터는 다섯 상태를 모두 제공하는 단일 선택창이다. 폴더·서브 탭은 한 줄 가로 탐색을 유지하며 모서리와 선택선은 직각이다. 1024px 미만의 관리자 메뉴는 기본 접힘이다.
- 강좌 설정의 보이는 label은 입력과 `htmlFor`/`id`로 연결한다. 반복 행은 고유 키를 포함한 접근성 이름을 제공한다. 기존 값·검증·저장 방식은 유지한다.
- 수강생 정보 필드의 데스크톱 편집 행은 순서 96px, 유형 128px, 삭제 64px, 필드명·선택지는 동일한 가변 폭이다. 헤더와 입력 행이 같은 트랙을 사용한다.
- 수강생 정보의 순서 이동은 44px 정사각 버튼에 20px Lucide 위·아래 화살표를 쓴다. 한국어 접근성 이름에 필드 순서와 이동 방향을 포함하고 첫 행의 위·마지막 행의 아래 버튼은 비활성화한다. `UP/DN` 글자가 좁은 트랙에서 꺾이게 두지 않는다.
- 대시보드 경고는 해당 관리 화면으로 이동하거나 관련 강좌만 추려 보여준다. 이동만으로 출석·좌석 설정을 변경하지 않는다.
- 정산 필터의 고정 트랙은 날짜 160px/월 200px, 금액 128px/160px, 나머지는 `minmax(0, 1fr)`를 사용한다. 1280px 미만에서는 2열, 640px 미만에서는 1열이다. CSS grid 트랙 사이에는 쉼표가 아닌 공백(Tailwind에서는 `_`)을 사용한다.

### 실행 가능한 로컬 검사

앱 루트에서 pnpm을 사용한다.

~~~powershell
pnpm verify:admin-presentation
pnpm test:admin-ui
pnpm exec tsc --noEmit --incremental false
git diff --check
~~~

화면 치수 검증 도구와 경로 대응표는 [로컬 디자인 검증·구현 안내](docs/DESIGN_IMPLEMENTATION.md)에 정리한다. 정적 검사나 과거 측정 JSON만으로 현재 모든 화면을 확인했다고 주장하지 않는다. 디자인 문서 갱신은 운영 DB·마이그레이션·Git 푸시·Vercel 배포를 포함하지 않는다.
