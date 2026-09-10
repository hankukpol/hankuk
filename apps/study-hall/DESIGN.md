# Study Hall 디자인 시스템

기준일: 2026-09-08

Spacing base: 4px (간격 스케일의 기본 단위).

기준: 현재 로컬 작업 트리의 실제 구현. 배포본이나 향후 시안이 아니다.

이 문서는 시간통제 자습반 관리 시스템(study-hall)의 현재 UI/UX 기준이다. 과거 변경사항을 날짜순으로 덧붙이지 않고, 현재 유효한 규칙 하나로 정리한다. **새 화면을 만들거나 기존 화면을 수정할 때 먼저 이 문서를 읽는다.**

형제 앱 class-pass의 [DESIGN.md](../class-pass/DESIGN.md) 규격을 이식했다. 두 앱은 같은 토큰 이름(`--admin-*`)과 같은 클래스 이름(`.admin-*`)을 쓰지만, **각 앱의 문서와 구현이 각자의 기준**이다. 형제 앱의 변경을 자동으로 가져오지 않는다.

---

## 1. 적용 범위와 디자인 방향

**흰색 작업 화면, 어두운 좌측 메뉴, 폴더형 1차 탭, 밑줄형 2차 탭, 얇은 표 그리드.** 정보 밀도는 높게 유지하되 화면 전체를 카드로 나누지 않는다.

| 범위 | 기준 |
| --- | --- |
| 관리자 전체 (`/[division]/admin/*`) | 이 문서의 전 규격 |
| 조교 (`/[division]/assistant/*`) | 같은 토큰·타입·모서리. 모바일 우선 레이아웃과 하단 탐색 유지 |
| 학생 포털 (`/[division]/student/*`) | 같은 토큰·타입·모서리. 카드형 모바일 레이아웃과 넓은 터치 영역 유지 |
| 로그인, 최고 관리자 | 같은 토큰. 사이드바 없는 별도 레이아웃 허용 |

토큰 원본은 [app/globals.css](app/globals.css) 하나뿐이다. 팔레트 연결은 [tailwind.config.ts](tailwind.config.ts), 직렬 강조색 파생은 [app/[division]/layout.tsx](app/%5Bdivision%5D/layout.tsx)에 있다.

디자인 판단 우선순위: 사용자가 승인한 최신 요구 → 현재 구현과 이 문서 → 기능별 개발 명세.

- 장식용 영문 소제목, 히어로 이미지, 그라데이션, 카드 그림자를 추가하지 않는다.
- 제목 바로 위에 같은 뜻의 라벨을 중복해서 넣지 않는다.
- 값의 색상으로 상태를 전달하되 **반드시 읽을 수 있는 상태 문구도 함께** 제공한다.
- 수험번호, 좌석 라벨, 영수증 번호 같은 업무 식별자는 유지한다.
- **하드코딩 금지**: 벌점 임계값·지각 기준·휴가 한도는 `division_settings`에서, 직렬명·직렬 색상은 DB에서 읽는다. (`CLAUDE.md` 참조)

---

## 2. 색상과 라인 토큰

### 공통 토큰

아래 값은 `:root`의 실제 CSS 변수값이다. 각 토큰은 `-rgb` 삼원색 변수도 함께 갖는다(Tailwind 투명도 수식어 지원용).

| CSS 변수 | 값 | 용도 |
| --- | --- | --- |
| `--admin-surface` | `#ffffff` | 페이지, 모달, 활성 폴더 탭 |
| `--admin-surface-soft` | `#fafafa` | 중립 hover, 패널 머리글, 모달 footer |
| `--admin-surface-muted` | `#f3f3f5` | 비활성 탭, 비활성 입력 |
| `--admin-surface-strong` | `#e8e8ec` | 확정 영역 강조 |
| `--admin-line-soft` | `#e8e8ec` | 섹션·리스트 구분선 |
| `--admin-line` | `#d6d6dc` | 입력·버튼·모달 외곽과 구분선 |
| `--admin-grid` | `#dddddd` | 표 외곽·가로·세로선 |
| `--admin-text` | `#0a0a0a` | 주요 글자, 사이드바 바탕 |
| `--admin-sidebar-hover` | `#222222` | 사이드바 hover·활성 배경 |
| `--admin-text-secondary` | `#4b4b4b` | 보조 라벨 |
| `--admin-text-muted` | `#6b6b6b` | 설명, 날짜, 보조 정보 |
| `--admin-text-disabled` | `#9c9c9c` | 비활성 글자, placeholder |
| `--admin-danger` | `#b91c1c` | 오류·삭제 문구와 자료 위험 작업 |
| `--admin-danger-soft` / `--admin-danger-line` | `#fef2f2` / `#f2c2c2` | 위험 상태 배경·경계 |
| `--admin-warning` | `#8a5a00` | 주의 안내 |
| `--admin-warning-soft` / `--admin-warning-line` | `#fff8e6` / `#f0dca8` | 주의 상태 배경·경계 |
| `--admin-success` | `#1b7a1b` | 완료 안내 |
| `--admin-success-soft` / `--admin-success-line` | `#eef8ee` / `#c5e3c5` | 완료 상태 배경·경계 |
| `--admin-overlay` | `rgb(0 0 0 / 0.5)` | 모달 뒤 배경. blur 없음 |
| `--admin-dialog-shadow` | `0 12px 32px rgb(10 10 10 / 0.14)` | 모달·작업 메뉴의 한정된 그림자 |

### 직렬 강조색

컴포넌트는 아래 변수명만 사용한다. **경찰·소방을 판단해 개별 버튼의 색을 하드코딩하지 않는다.**

강조색은 DB의 `division.color` 하나에서 `app/[division]/layout.tsx`가 파생한다.

| CSS 변수 | 파생식 | 경찰 실제값 |
| --- | --- | --- |
| `--admin-accent` | `division.color` | `#1B4FBB` |
| `--admin-accent-hover` | 검정 15% 혼합 | `#17439f` |
| `--admin-accent-soft` | 흰색 95% 혼합 | `#f3f6fc` |
| `--admin-accent-tint` | 흰색 88% 혼합 | `#e4eaf7` |
| `--admin-accent-line` | 흰색 75% 혼합 | `#c5d3ee` |
| `--admin-on-accent` | 대비 계산으로 흑/백 선택 | `#ffffff` |

강조색은 주요 실행 버튼, 선택·현재 위치, 표 헤더(`accent-tint`), 행 hover(`accent-soft`)에 쓴다. **출결 상태색(`attend-*`), 경고 단계색(`warn-*`), red/rose/amber/emerald 상태색은 업무 의미가 있으므로 일괄 강조색으로 치환하지 않는다.**

서로 다른 과목을 동시에 비교하는 차트만 범주색을 사용한다. `--admin-chart-1`은 직렬 강조색, `--admin-chart-2`~`--admin-chart-6`은 각각 `#0f766e`, `#c2410c`, `#7c3aed`, `#be123c`, `#0a0a0a`이다. 배경 장식에는 사용하지 않는다.

### Tailwind 팔레트 연결

기존 마크업이 쓰는 팔레트를 토큰에 연결해 두었다(`tailwind.config.ts`). 새 코드에서는 `admin-*` 색을 직접 쓰는 편이 뜻이 분명하다.

| Tailwind | 연결된 토큰 |
| --- | --- |
| `slate/gray/zinc/neutral` 50→950 | `surface-soft` → `surface-muted` → `line-soft` → `line` → `text-muted` → `text-secondary` → `sidebar-hover` → `text` |
| `blue/indigo/sky` 50→900 | `accent-soft` → `accent-tint` → `accent-line` → `accent` → `accent-hover` |
| `admin-*` | 토큰 직접 접근 (`bg-admin-surface-soft`, `text-admin-text-muted`, `border-admin-line` …) |

**Tailwind 는 소스에 적힌 클래스 문자열만 생성한다.** 상태색 클래스를 만들어 돌려주는 `lib/*-meta.ts` 가 `content` 글로브에 들어 있어야 한다. 빠지면 그 클래스는 오류 없이 조용히 사라진다(`text-yellow-700` 이 검정으로 나오던 원인).

상태색도 `admin-*` 로 직접 쓴다: `text-admin-danger`, `bg-admin-warning-soft`, `border-admin-success-line` 처럼 `danger` / `warning` / `success` 와 각 `-soft` · `-line` 이 팔레트에 연결되어 있다. **Tailwind 연결은 `--admin-<이름>-rgb` 변수를 읽으므로, 토큰을 추가할 때 hex 와 `-rgb` 를 함께 선언한다.** `-rgb` 가 없으면 클래스가 조용히 아무 스타일도 만들지 않는다.

### 라인의 역할

| 요소 | 선 |
| --- | --- |
| 표 | 1px `admin-grid`, `border-collapse: collapse` |
| 폼·중립 버튼·일반 모달 외곽 | 1px `admin-line` |
| 세로로 이어진 페이지 섹션·내부 목록 | 1px `admin-line-soft` |
| 폴더 탭 | 1px 외곽, 아래 연속 accent 선. 선택 탭 아래는 흰색 |
| 서브 탭 | 바탕 1px `admin-line`, 선택 항목 아래 2px accent 직선 |
| 좌측 메뉴 활성 표시 | 왼쪽 4px accent |
| 키보드 포커스 | 2px accent outline. 입력창은 기존 테두리 색이 accent로 바뀜 |

모든 선을 같은 회색으로 통일하지 않는다. **표 그리드 · 컨트롤 경계 · 섹션 구분의 세 단계**가 기준이다.

**접근성 검증 경계:** 이 팔레트 기록은 전체 색 조합의 WCAG 통과 선언이 아니다. 낮은 대비의 경계선이나 작은 빨간 글자, placeholder를 포함한 실제 전경/배경 조합은 변경 시 별도 측정한다. 읽어야 하는 상태 문구에 disabled 색을 쓰지 않는다.

---

## 3. 폰트와 글자 계층

### 폰트

`next/font/local`로 로드한 `app/fonts/PretendardVariable.woff2`를 쓴다. 변수명은 `--font-pretendard`, weight 범위 100~900, display `swap`이다.

폰트 스택: `var(--font-pretendard), Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`.

**웹폰트는 Pretendard 하나뿐이다.** 화면별로 다른 웹폰트를 추가하지 않는다. 숫자를 세로로 맞춰야 하는 곳은 별도 폰트가 아니라 `tabular-nums`를 쓴다. `font-mono`는 아침 모의고사 점수를 표에서 붙여넣는 입력 한 곳만 업무 목적으로 남겨두었다.

### 타입 규격

| 역할 | 클래스·변수 | 크기 | 굵기 | 줄높이 |
| --- | --- | --- | --- | --- |
| 페이지·모달 제목 | `.admin-page-title`, `.admin-dialog-title`, `h1` | 20px | 700 | 1.3 |
| 섹션 제목 | `.admin-section-title`, `h2`/`h3`/`h4` | 16px | 700 | 1.3 |
| 기본 본문 | `body`, `--admin-type-body` | 15px | 400 | 1.5 |
| 페이지 설명 | `.admin-page-description` | 15px | 400 | 1.5 |
| 일반 실행 버튼 | `.admin-button` | 15px | 600 | 1.3 |
| 보조 실행(텍스트) | `.admin-text-action` | 15px | 600 | 1.3 |
| 입력·검색 | `input`/`select`/`textarea` | 15px | 400 | 1.5 |
| 폼 라벨 | `.admin-label` | 13px | 600 | 1.3 |
| 안내·보조 문구 | `.admin-help`, `--admin-type-caption` | 13px | 400 | 1.5 |
| 폴더 탭 | `.admin-tab` | 16px | 기본 400, 선택 700 | 1.3 |
| 서브 탭·조건 버튼 | `.admin-subtab`, `.admin-choice-button` | 15px | 600 | 1.3 |
| 표 | `table` | 13px | 본문 400, 헤더 600 | 1.3 |
| 표 안 상태 지정 | `.admin-status-button` | 13px | 600 | 1.3 |
| 대시보드 KPI | `.admin-dashboard-metric-value` | 32px | 700 | 1.2 |
| 요약 박스 값 | `.admin-metric-box-value` | 20px | 700 | 1.3 |

기존 Tailwind 글자 유틸도 이 스케일에 매핑되어 있다: `text-xs`=13px, `text-sm`/`text-base`=15px, `text-lg`/`text-xl`=16px, `text-2xl`/`text-3xl`=20px, `text-4xl`/`text-5xl`=32px. **13px 미만은 쓰지 않는다.**

굵기도 마찬가지로 **본문 400 / 강조 600 / 제목 700 세 단계뿐**이다. `font-medium`(500)과 `font-extrabold`(800)는 `tailwind.config.ts`에서 각각 600·700으로 흡수되므로 화면에 네 번째 굵기가 생기지 않는다.

실제 화면에서 확인하는 방법은 9절의 계산값 점검을 참고한다.

자간은 `body`에서 `0`이며 전 요소가 상속한다. `tracking-*` 유틸도 모두 `0`으로 매핑한다. 표·페이지 번호·KPI는 `tabular-nums`를 쓴다.

긴 강좌명·학생명·모달 제목·오류는 줄바꿈한다(`break-keep`). **전체 제목을 truncate로 잘라내지 않는다.**

### 같은 역할에는 같은 클래스

크기와 색을 화면마다 손으로 고르면, 같은 뜻의 글자가 `slate-400` · `slate-500` · `slate-600`로 갈려 페이지마다 톤이 달라진다. 그 상태가 바로 "디자인이 덜 입혀진" 느낌이다. 아래 넷을 먼저 찾아 쓰고, 없을 때만 새로 만든다.

| 역할 | 클래스 | 쓰지 말 것 |
| --- | --- | --- |
| 섹션 제목 | `.admin-section-title` (`h2`) | `<p className="text-xl font-bold">` |
| 설명·보조 문구 | `.admin-help` | `text-sm text-slate-500`, `text-xs text-slate-400` |
| 폼·묶음 라벨 | `.admin-label` | `text-sm font-medium text-slate-700` |
| 안내·경고 상자 | `.admin-notice` (+ tone) | `rounded-lg border bg-white px-4 py-4 text-sm` |

**본문보다 작은 제목을 만들지 않는다.** 안내 상자 안에서 `<strong>`으로 소제목을 만들면 13px/700 이 되어 규격에 없는 네 번째 제목 단계가 생긴다. 라벨이 필요하면 `.admin-label`(13px/600)과 본문(15px)의 짝으로 두고, 진짜 제목이면 `.admin-section-title`을 쓴다.

제목은 반드시 `h1`~`h4`로 쓴다. `<p>`에 굵은 글씨를 주면 크기는 비슷해도 문서 구조와 접근성이 사라지고, 섹션에 이름이 없는 것처럼 보인다.

**반대로 제목이 아닌 것을 제목 태그로 쓰지 않는다.** `0/4` 같은 진행 수치를 `h2`로 두면 문서에 `0/4`라는 이름의 섹션이 생긴다. 수치는 `.admin-metric-box-value`(20px) 또는 KPI(32px)로 둔다.

**모든 페이지에는 `.admin-page-title`(20px) 하나가 있어야 한다.** 한 화면만 이것을 빠뜨리면 그 페이지의 가장 큰 글자가 16px 섹션 제목이 되어, 다른 페이지와 계층이 어긋나 보인다.

**KPI 값은 수치다.** `5교시`처럼 글자를 32px 칸에 넣으면 화면이 그 한 칸에 눌린다. 상태 문구는 KPI가 아니라 캡션이나 안내 줄에 둔다.

**`.admin-help`를 제목 안에 넣을 때 굵기를 확인한다.** `h2` 안의 보조 문구는 700을 물려받아 제목처럼 굵어진다. `.admin-help`는 굵기 400을 스스로 고정한다.

---

## 4. 간격·규격·모서리

### 치수 토큰

간격 기본 단위는 4px이다. 스케일은 4/8/12/16/20/24/32/40/44/48/56/64px이다.

| CSS 변수 | 값 | 용도 |
| --- | --- | --- |
| `--admin-radius` | 8px | 일반 컨트롤·허용된 외곽 박스 |
| `--admin-control-height` | 44px | 일반 버튼·입력·선택·닫기 최소 높이 |
| `--admin-control-compact` | 36px | 표 안 축약 작업 |
| `--admin-control-padding-x` / `-y` | 16px / 8px | 일반 버튼 안쪽 여백 |
| `--admin-choice-width` | 128px | 조건·필터 버튼 동일 폭 |
| `--admin-search-width` | 320px | 데스크톱 명단 검색 기준 폭 |
| `--admin-dialog-padding` | 24px (768px 미만 16px) | 모달 가로 여백 |
| `--admin-dialog-action-width` | 80px | 모달 footer 버튼 최소 폭 |
| `--admin-dialog-close-icon` | 20px | 모달 X 아이콘 |
| `--admin-sidebar-width` | 256px | 데스크톱 좌측 메뉴 |
| `--admin-content-max` | 1440px | 본문 최대 폭 |

라벨과 입력 8px, 필드 사이 16px, 섹션 사이 24px. 입력 컨트롤은 8px 12px, 버튼은 8px 16px. 글자가 잘리지 않도록 높이는 `min-height`로 준다.

### 모서리 결정표

| 대상 | 최종 모서리 |
| --- | --- |
| 버튼, 검색, 입력, select, textarea, 배지, 안내 박스 | 8px |
| 대시보드 KPI·리스트 패널, 요약 박스, 로그인 카드 | 8px |
| 중앙 모달, 드롭다운 메뉴 | 8px |
| 1차 폴더 탭·탭 바, 2차 서브 탭·활성 밑줄 | **0** |
| 표·표 프레임·표 내부 선 | **0** |
| 우측 슬라이드 모달 / Drawer | **0** |
| 모달 header/body/footer, 패널 내부 행·머리글·구분선 | **0** |
| 탭 페이지 전체를 감싼 섹션 | 박스 없음 |
| native checkbox/radio, 좌석 지도와 기능성 마커 | 고유 형상 보존 |

Tailwind의 `rounded-sm`~`rounded-3xl`은 모두 8px로 매핑되어 있다. 직각이 필요한 곳은 `rounded-none`을 명시한다. **알약형(`rounded-full`) 버튼·칩은 쓰지 않는다.** 점·아바타 같은 원형 마커에만 `rounded-full`을 남긴다.

---

## 5. 페이지와 컴포넌트 규격

### 5.1 전체 레이아웃과 사이드바

> **768px 미만은 [MOBILE_DESIGN.md](MOBILE_DESIGN.md) §2.1 을 따른다.** 페이지 제목은 본문이 아니라 `.admin-mobile-topbar`(52px sticky, 좌 `←`/`≡` · 제목 16px/700 가운데 · 우측 텍스트 액션 15px/600) 안에 들어가고, `.admin-page-description` 은 숨기며, `.admin-utility-row` 는 그 바의 우측 액션으로 합쳐진다. 검은 64px 헤더는 홈 화면에만 남는다. 본문 여백은 20px 16px 32px. **상단 크롬이 200px 이면 첫 화면의 4분의 1 이 크롬이다.**

- `.admin-shell`은 `min-height: 100dvh`, 흰색 작업 화면이다.
- 데스크톱 사이드바는 **1024px 이상**에서 256px 폭. rail 배경이 문서 끝까지 이어지고 내부 메뉴는 `sticky top: 0`, `height: 100dvh`이다.
- 메뉴 목록만 세로 스크롤한다. 아래 로그아웃에 접근할 수 있어야 한다.
- 그 스크롤바는 감춘다(`scrollbar-width: none`, `::-webkit-scrollbar { width: 0 }`). 검은 레일 위에서 시각적 잡음이 되기 때문이며, 휠·키보드·터치 스크롤은 그대로 동작해야 한다.
- 메뉴 글자 15px/600, 아이콘 Lucide 20px, 최소 높이 44px, 항목 gap 4px, **활성은 왼쪽 4px accent + `#222` 배경**.
- 1024px 미만은 검은 상단 헤더의 `관리자 메뉴` 버튼으로 전체 메뉴를 펼친다. 선택 후 접히고 Escape로 닫힌다. 상단 최소 64px, 메뉴 링크 최소 44px.
- 본문 최대 폭 1440px, 가운데 배치. 본문 padding은 위 24px / 아래 48px / 좌우 16px → 768px부터 24px → 1024px부터 32px.
- 앱 전환은 본문 상단 우측(`.admin-utility-row`), 최소 높이 44px, 아래 여백 24px.

관련 파일: [AdminShell.tsx](components/layout/AdminShell.tsx), [AdminSidebar.tsx](components/layout/AdminSidebar.tsx)

### 5.2 평면 페이지

페이지 루트는 `.admin-flat-page`(세로 24px 간격)를 쓴다.

기본 순서: **페이지 제목 → 1차 탭 → 필요한 2차 서브 탭 → 섹션 제목과 관련 작업 → 검색/필터 → 표·폼 → 페이지 이동/저장 영역.**

- `section`/`article`에 반복적인 카드 배경·외곽선·그림자·라운드를 넣지 않는다.
- 제목·검색창·표의 시작과 끝은 같은 콘텐츠 기준선에 둔다. 가로 padding을 중복하지 않는다.
- 세로로 이어진 섹션은 `.admin-section`으로 두고 필요한 곳에 1px `line-soft`와 위 24px 여백으로 구분한다.
- **이 구분선은 `.admin-flat-page`의 직속 자식일 때만 붙는다.** grid·flex 안에서 가로로 나란히 놓인 `.admin-section` 형제에까지 위쪽 선이 생기면, 요약 박스들이 반쯤 잘린 카드처럼 겹쳐 보인다. 가로로 배치할 요약은 `.admin-section`이 아니라 §5.3의 KPI·요약 박스를 쓴다.
- **카드 안에 카드를 넣지 않는다.** 테두리 있는 카드 안의 빈 상태·안내는 상자 대신 `.admin-help` 문구로 둔다. 반대로 카드들을 묶는 바깥 래퍼에는 테두리를 두지 않는다(대시보드의 `오늘 처리할 일`이 그 예다).
- 좌우 컬럼 사이에 비대칭 구분선을 만들지 않는다. 일반적으로 `gap`을 쓴다.
- 모달 내부, 모바일 명단 카드, 좌석 지도, 실제 데이터 표 프레임은 평면화 대상이 아니다.

### 5.3 카드가 필요한 경우

대시보드 요약·로그인·모바일 명단·모달 내부 안내처럼 **독립된 의미가 있을 때만** 쓴다. 카드형 UI가 페이지 전체를 감싸는 기본 템플릿이 되어서는 안 된다.

대시보드 순서: 제목/작업 → 개별 KPI 카드 → 확인할 일·기능 패널 → 표.

- KPI는 붙어 있는 스트립이 아니라 **16px 간격의 개별 카드**(`.admin-dashboard-metric`). 외곽 8px, 1px line, padding 20px.
- 1280px 미만 2열, 이상 4열. KPI 숫자 32px, 단위 13px. **768px 미만에서는 숫자 20px·padding 16px로 낮춘다** — 32px 숫자 넷이면 휴대폰 한 화면을 요약만으로 다 쓴다.
- 패널(`.admin-panel`) 제목부는 padding 16px 20px, 최소 높이 56px, soft 배경과 아래 1px line.
- 패널 내부 행(`.admin-panel-row`)은 좌우 20px, 위아래 12px, `line-soft`. 마지막 행의 아래 선은 없다.
- 외곽만 8px로 자르고 **내부 행·헤더는 직각**. header 배경이 라운드 경계 밖으로 나가지 않게 한다.
- **768px 미만에서 요약은 상자가 아니라 선으로 나눈다([MOBILE_DESIGN.md](MOBILE_DESIGN.md) §2.5).** `.admin-dashboard-metric` 과 `.admin-metric-box` 는 테두리·모서리를 버리고 `.admin-portal-summary` 와 같은 1px 간격 격자가 되며, KPI 32px 숫자는 20px 로 내려간다. 학생 포털이 이미 이 방식이라 관리자·조교를 거기에 맞춘다.
- `.admin-metric-strip` / `.admin-metric-box`는 **16px 간격의 독립 요약 박스**다. 각 항목에 닫힌 1px line 외곽과 8px 모서리, 16px padding. 그룹 자체에는 배경·외곽·클리핑을 두지 않는다. 레이블 13px 위, 값 20px 아래 오른쪽 정렬. 768px 미만 2열, 그 이상 최소 160px 자동 열. 대시보드 KPI의 32px 숫자와 구분한다.

### 업무별 화면 구성과 기록 카드

- 공지사항은 간결한 집계/필터와 전체 폭 목록을 기본으로 한다. 768px 미만은 기록 카드, 그 이상은 제목·범위/상태/발행 일시/작성자 표를 쓴다. 제목 버튼은 줄바꿈하고 상세 drawer를 연다. 상세에서 수정·삭제하며, 공개/예약 상태와 상단 고정은 독립 배지로 표시한다. 제목 버튼은 기존 accent와 8px 세로 여백을 사용한다.

- 서로 독립된 업무는 1차 탭으로 분리한다. 상벌점의 부여 내역/순위, 외출·휴가의 내역/학생별 사용 현황/미사용 정산, 면담의 기록/권장 대상, 수납의 월별 현황/수납 내역/일일 정산이 이에 해당한다.
- 휴대폰은 교시별 체크/이력 조회, 아침 모의고사는 일일 입력/주간 현황, 최고관리자는 지점/운영 계정으로 구분한다. 아침 모의고사·최고관리자는 상위 경로 탭이 있으므로 2차 탐색으로 표시한다.
- 기본 탭은 일상적인 조회·처리 업무다. 월말 정산처럼 별도 기준과 실행 시점이 있는 작업은 자체 필터와 실행 버튼을 갖는다. 다른 탭의 집계 숫자를 공통 요약처럼 보여주지 않는다.
- 학생별 기록·권장 대상처럼 독립된 항목은 `.admin-record-card`로 묶는다. 표로 비교해야 하는 금액·날짜·순위는 전체 폭 표를 사용한다. 대시보드의 동시 비교, 목록과 편집 폼의 연결은 2열을 유지할 수 있다.
- 기록 카드: 1px line, 8px 모서리, padding 20px, 그림자 없음. 학생명·상태·날짜를 상단에 두고 사유/내용/결과는 이름이 있는 `dl`로 구분한다. 카드 안에 다른 외곽 박스를 넣지 않는다.
- ~~모바일(768px 미만)의 상벌점·수납·외출/휴가 내역은 기록 카드로 제공한다.~~ **폐기했다([MOBILE_DESIGN.md](MOBILE_DESIGN.md) §2.4).** 전체 폭 카드가 세로로 쌓이면 그것이 곧 "카드 1행 나열"이다. 768px 미만에서는 `.admin-record-card` 가 테두리·모서리를 버리고 1px `line-soft` 구분 행이 되며, 단순 항목은 `.admin-list-row`(48px, 좌 제목 15px/400 · 우 값 15px/600), 제목·메타가 여러 줄이면 `.admin-list-row-stack` 을 쓴다. 데스크톱 표와 같은 필터·선택·처리 함수를 쓰는 것은 그대로다.
- `.admin-workspace-toolbar`는 작업 제목/조회 건수와 버튼을 16px 간격으로 배치하고 좁은 폭에서 줄바꿈한다. `.admin-filter-bar`는 soft 배경의 평면 필터 띠로 padding/gap 16px, 입력 최소 폭 160px를 사용한다.
- 모바일 필터 필드는 한 줄 전체 폭으로 정렬하고 실행 버튼끼리 다음 줄에 모은다. 프로그램에서 활성 탭을 바꾸어도 선택 탭이 가로 스크롤 영역 안에 온전히 보이도록 위치를 맞춘다.
- `.admin-empty-state`는 데이터가 없는 이유와 현재 조회 범위를 보여주는 평면 soft 영역이다. 높이를 채우기 위한 가짜 기록이나 장식을 넣지 않는다.
- 탭 전환 시 필터·선택·입력 초안을 유지한다. 중첩 업무 탐색은 `AdminTabs`의 `variant="secondary"`를 사용하며 2차 탭 규격을 따른다.

### 5.4 1차 폴더 탭

> **768px 미만에서는 폴더 모양을 버린다([MOBILE_DESIGN.md](MOBILE_DESIGN.md) §2.2).** 가로 스크롤 텍스트 탭 44px, 15px/600, gap 12, 좌측 16px 시작, `flex: 0 0 auto`. 활성은 `text` 700 + 아래 2px accent 막대이고 배경·테두리는 없다. 폴더 탭 56px 을 그대로 줄이면 데스크톱 탭을 축소한 모양이 된다. 2차 탭(§5.5)은 모바일에서 43px · 14px/700 로 한 단계 줄인다.

공용 [`AdminTabs`](components/ui/AdminTabs.tsx)를 쓴다. 클래스는 `.admin-tabs` / `.admin-tab`이다.

- **탭은 `flex: 1 0 auto`로 탭 바 전체 폭을 나눠 채운다.** 왼쪽에 작은 칩 몇 개가 몰려 있으면 폴더 탭이 아니다. 아래 accent 선이 화면 폭 전체로 이어져야 한다.
- 탭끼리는 `margin-left: -1px`로 테두리를 겹치고, 첫 탭만 `margin-left: 0`이다. 활성 탭은 `z-index: 1`로 겹친 선 위에 올라온다.
- 높이 최소 56px, padding 16px, 항목 안 gap 8px, **직각**.
- 기본 muted 배경·line 테두리·muted 글자, 아래 accent 1px 연속 선.
- 활성은 흰색 배경, 위/좌우 accent 테두리, 아래 흰색, 글자 `text`/700 (`data-active="true"`).
- hover는 soft 배경. 비활성은 disabled 글자와 클릭 금지.
- 긴 메뉴는 라벨을 줄이거나 말줄임하지 않고 탭 영역 안에서 가로 스크롤한다.
- 경로 이동은 `Link`와 `aria-current="page"`, 페이지 안 선택은 `role="tablist"` / `role="tab"` / `aria-selected`를 쓴다.

### 5.5 2차 서브 탭

`.admin-subtabs` / `.admin-subtab`은 **밑줄형 텍스트 탭**이다. 두 번째 폴더 줄이나 선택 박스로 만들지 않는다.

- 바탕 흰색/투명, 아래 line 1px, 항목 gap 4px.
- 항목 최소 높이 44px, padding 12px 16px, 15px/600, 자연 폭.
- 활성은 accent 글자와 **2px 직선 밑줄**(`data-active="true"` / `aria-selected` / `aria-pressed`). hover 중에도 선택 색을 유지하며 배경을 박스로 채우지 않는다.
- 라운드는 모두 0. 기본은 좁은 화면에서 wrap하고 글자를 자르지 않는다.
- **항목이 많아 여러 줄로 접히면 `.admin-subtabs-scroll`(`AdminTabs`의 `scrollable`)을 쓴다.** 마지막 줄에 한두 개만 남으면 좌측에 몰린 조각처럼 보여 정렬이 깨진 화면이 된다. 이 변형은 줄바꿈 대신 탭 영역 안에서만 가로로 밀고, 스크롤바는 감춘다. 선택 탭은 **가운데로** 보낸다 — 가장자리에 붙이면 뒤에 항목이 더 있는지 보이지 않는다. 휴대폰 체크의 9개 교시가 이 경우다.
- 짧은 화면에 불필요한 하위 단계나 세 번째 폴더 줄을 만들지 않는다.
- 페이지 안 탭은 `role="tablist"` / `role="tab"` / `aria-selected` 와 roving tabindex(선택 탭만 `tabIndex=0`)를 쓴다. 좌우 방향키·Home·End 이동은 [useTabListKeys.ts](lib/useTabListKeys.ts) 가 담당한다.

**학생 포털 메뉴는 1차 폴더 탭이다**(§5.4). 화면을 오가는 최상위 이동이므로 밑줄형으로 두지 않는다. 그 안에서 나뉘는 시험 종류(아침·정기 모의고사)가 이 절의 2차 밑줄 탭이다. 조교 하단 탐색도 같은 밑줄 디자인을 쓴다(하단 탐색은 밑줄이 위쪽 2px).

### 5.6 조건 선택 버튼과 일반 버튼

> **768px 미만에서 `.admin-choice-button` 은 칩이 된다([MOBILE_DESIGN.md](MOBILE_DESIGN.md) §2.3).** 36px · radius 999 · 13px/600 · 좌우 12 · 가로 스크롤이고 줄바꿈하지 않는다. 활성은 `text` 배경 + `surface` 글자(검정 반전)이며 직렬 accent 를 쓰지 않는다 — 검정이 어디서나 같은 뜻이다. 128px 고정폭을 모바일에 그대로 두면 버튼이 두세 줄로 쌓인다. 터치 44 는 세로 padding 으로 확보한다.
> `.admin-choice-card` 도 768px 미만에서는 카드를 버리고 구분 행이 된다. 선택은 `accent-soft` 배경 + **왼쪽 3px accent 막대**(§5.1 사이드바 활성 표시와 같은 방식)로 알린다.
> **`.admin-status-button`(§8 표 안 상태 지정)은 칩이 되지 않는다.** 칩은 표 밖의 조회 조건에만 쓴다.
> 컨트롤 모서리는 768px 미만에서 `--admin-radius-mobile`(4px)이다. 8px 은 이미지·배너·모달에만 남는다.

**탭은 탐색, `.admin-choice-group` / `.admin-choice-button`은 데이터 필터·폼 선택이다. 두 역할을 혼용하지 않는다.**

- 조건 버튼은 **모두 폭 128px, 최소 높이 44px**, padding 8px 12px, gap 4px, 8px 모서리, `flex-shrink: 0`.
- 기본 흰색·line 테두리·secondary 글자. 선택은 accent 테두리/글자 + `accent-soft` 배경, `aria-pressed` 또는 `data-active`.
- 화면이 좁으면 버튼 폭을 글자 길이에 맞춰 줄이지 않고 **줄바꿈**한다. 768px 미만 그룹 기준 폭 260px(128px 두 개 + 4px), `max-width: 100%`.
- **자습실 이름처럼 길이를 미리 알 수 없는 데이터 라벨에는 `.admin-choice-button-auto`를 함께 준다.** 128px 고정 폭에 넣으면 이름이 두 줄로 쪼개진다. 이 변형은 내용에 맞춰 128~260px로 늘어나고 넘치면 말줄임한다. 한 줄 유지(`white-space: nowrap`)는 §5.12 버튼 규격의 `white-space: normal`을 되돌려야 하므로 정규화 레이어에서 `.admin-shell .admin-choice-button-auto`로 다시 지정한다.
- **한 줄에 안 들어가는 선택지에는 `.admin-choice-button`을 쓰지 않는다.** 128px 고정 폭이라 제목이 글자 단위로 쪼개진다. 제목·보조설명이 여러 줄인 목록 선택은 `.admin-choice-card`(전체 폭, 세로 배치, 왼쪽 정렬, 선택 시 accent 테두리 + `accent-soft` 배경)를 쓰고 제목은 `.admin-choice-card-title`로 둔다. `button` 안에는 `div`·`p`를 넣을 수 없으므로 자식은 `span`으로 쓴다.
- 이동만 하는 목록(설정 허브 등)은 선택 버튼이 아니라 `.admin-panel` + `.admin-panel-row.admin-panel-row-link` 평면 목록이다. **카드 격자를 메뉴 템플릿으로 쓰지 않는다**(§5.3).
**버튼은 세 가지 위계뿐이다.** 화면마다 손으로 색과 여백을 정하면 전부 같은 회색 버튼이 되어 무엇을 눌러야 할지 사라진다.

| 위계 | 클래스 | 모양 | 쓰는 곳 |
| --- | --- | --- | --- |
| 주 실행 | `.admin-button .admin-button-primary` | accent 채움 + `--admin-on-accent` 글자 | 화면의 주 작업 하나 (등록, 저장, 부여) |
| 보조 | `.admin-button` | 흰 바탕 + 1px line | 조회, 새로고침, 이동, 취소 |
| 위험 | `.admin-button .admin-button-danger` / `-danger-outline` | danger 채움 / danger outline | 삭제, 퇴실, 환불 |
| 축약 | `+ .admin-button-compact` | 36px / 13px | 표 안 행 작업 |

hover는 면 한 단계(`surface-soft` / `accent-hover`), 누름은 한 단계 더(`surface-muted`)로만 준다. `hover:opacity-90` 처럼 전체를 흐리는 방식은 쓰지 않는다.

**한 화면에 버튼 상자를 서너 개 세우지 않는다.** 채움·외곽 버튼이 나란히 서면 전부 같은 무게가 되어 무엇이 주 작업인지 사라진다. 화면(또는 한 구획)의 **주 실행 하나만 버튼으로 두고, 보조 실행은 `.admin-text-action`**(테두리·배경 없는 accent 글자, hover 밑줄, 최소 높이 44px)으로 내린다. 조교 휴대폰 체크의 `전원 반납`·`전원 미반납`·`일괄 대여`가 그 예이며 `저장`만 채움 버튼이다.

**집계 수치도 배지 상자에 담지 않는다.** 다섯 개가 넘어가면 작은 상자가 두 줄로 접혀 화면이 부서져 보인다. `라벨 + 숫자`를 한 줄 문구로 두고 숫자에만 업무색과 `tabular-nums`를 준다. 배지는 상태 하나를 가리킬 때만 쓴다(§5.11).

- 일반 실행 버튼(`.admin-button`)은 내용에 맞는 폭이다. 128px 동일 폭 규칙을 실행 버튼에 적용하지 않는다.
- `admin-button-primary`는 accent 채움 + `--admin-on-accent` 글자, hover는 `accent-hover`. 기본형은 흰색 + line, hover soft.
- 위험 작업은 `admin-button-danger`(채움) 또는 `admin-button-danger-outline`.
- 버튼의 pending/disabled와 의미 있는 경고색을 보존한다. 저장 중 중복 제출을 막는 기존 guard를 유지한다.
- **비활성 버튼은 위계와 상관없이 한 모양으로 모인다.** `muted` 배경 · `text-disabled` 글자 · `line-soft` 테두리다. 테두리를 함께 되돌리지 않으면 primary·danger 는 회색 면에 강조색 윤곽만 남아 칠하다 만 버튼처럼 보인다. `opacity`로 전체를 흐리지 않는다. 토큰 색이 이미 비활성을 말하는데 그 위에 반투명을 겹치면 글자가 두 번 옅어져 읽히지 않는다.
- 실행 버튼에 붙는 안내는 버튼 줄과 8px로 묶는다. 섹션 기본 간격(16px) 사이에 홀로 두면 위 폼에 걸린 말인지 아래 실행에 걸린 말인지 알 수 없다.

### 5.7 폼·검색·상태 안내

- 라벨(`.admin-label`) 13px/600, 라벨과 입력 사이 8px, 필드 사이 16px, 섹션 사이 24px.
- 입력은 최소 높이 44px, 8px 모서리, 15px 글자, padding 8px 12px. textarea 최소 112px.
- 비활성은 muted 배경 / disabled 글자. 오류는 기존 rose/red border와 문구.
- **텍스트 입력 포커스는 기존 테두리가 accent로 바뀌는 방식**이다. 떠 있는 shadow ring을 만들지 않는다. 버튼·링크·native 입력의 키보드 outline은 제거하지 않는다.
- 입력 기본값은 태그 선택자와 `:where()`를 조합한다. Preflight의 0px 여백을 덮되, 검색 아이콘 여백(`pl-11`) 같은 화면별 Tailwind 유틸이 항상 이긴다.
- native checkbox/radio는 20px 크기로 고유 형상을 유지하고 `accent-color`를 쓴다.
- **파일 선택도 다른 입력과 같은 상자다.** 정규화 레이어의 입력 기본값에서 `[type="file"]`을 빼면 브라우저 기본 컨트롤이 그대로 남아 화면 하나만 미완성으로 보인다. 바깥 상자는 44px·1px line·8px 모서리로 두고, 안쪽 기본 버튼은 `::file-selector-button`을 32px 보조 버튼 모양으로 맞춘다. 허용 확장자와 용량 한도는 그 칸 아래 `.admin-help` 한 줄로 적는다.
- **항목이 서넛 이상인 폼은 표처럼 세운다.** 라벨 위·입력 아래로만 쌓으면 어디까지가 한 항목인지 알 수 없어 밋밋해진다. `.admin-panel`이 바깥 테두리를 그리고, 항목마다 `.admin-form-row`(라벨 열 `.admin-form-row-label` 160px 고정 + 입력 열 `.admin-form-row-control` 가변, 행 사이 1px `line-soft`, 마지막 행은 선 없음)를 둔다. 라벨 첫 줄은 44px 컨트롤에 맞춘다. 768px 미만은 라벨이 위로 올라가고 간격이 8px가 된다.
- 이 반응형 규칙은 **기본 규칙보다 뒤에** 둔다. 특이도가 같아 앞에 두면 `gap`과 `padding`이 기본값에 되덮여 방향만 바뀐 채로 남는다.
- 라벨과 입력이 좌우로 갈라지므로 보조 설명은 `aria-describedby`로 입력에 묶는다.
- **접이식 영역은 `.admin-disclosure`다.** `summary`에 `.admin-button`을 씌우면 여는 손잡이가 실행 버튼처럼 보여 화면의 주 작업이 무엇인지 흐려진다(§5.6). 손잡이는 화살표가 붙은 44px 전체 폭 줄로 두고, 열렸을 때만 아래 1px `line-soft`를 그린다. 내용은 `.admin-disclosure-body`(padding 16px)에 담는다.
- 접이식 안의 접이식은 상자를 하나 더 만들지 않는다(§5.2 카드 안 카드 금지). 테두리·모서리·배경을 지우고 항목 사이 1px `line-soft`만 남겨 줄로 나뉜 목록이 되게 한다.
- **로딩 자리표시자는 `.admin-skeleton`이다.** 화면마다 `bg-slate-100` 같은 토큰 밖 색을 쓰면 테마와 직렬색이 바뀌어도 그 회색만 남는다. `surface-muted` 바탕에 8px 모서리이고, 맥박은 `prefers-reduced-motion` 블록이 함께 멈춘다. 실제 화면의 모든 상자를 그대로 흉내 내지 않는다 — 자리표시자가 카드 안 카드를 재현하면 로딩 중에만 다른 구조가 보인다.
- 로딩, 오류/재시도, 데이터 없음, 조건 검색 결과 없음, 저장 중을 구분한다. 전체 집계와 필터 후 결과 건수를 혼동하지 않는다.
- **학생 검색은 두 가지 중 하나를 쓴다.** 표를 걸러내는 자리에는 `StudentSearchField`(최대 320px, 왼쪽 돋보기, 오른쪽 지우기, 검색 중일 때 결과 건수를 옆에 적는다), 한 명을 골라 다른 화면으로 넘기는 자리에는 `StudentSearchCombobox`를 쓴다. 새 검색 입력을 화면마다 다시 만들지 않는다.
- `input[type="search"]`의 브라우저 기본 지우기 표시는 정규화 레이어에서 없앤다. 우리 지우기 버튼과 같은 자리에 겹쳐 X 가 두 개로 보인다.

### 5.8 표

| 영역·데이터 | 정렬·모양 |
| --- | --- |
| 모든 헤더 | 가운데, 세로 가운데 |
| 금액·성적처럼 자릿수를 맞춰 읽는 숫자 셀 | 오른쪽, `.admin-table-amount` |
| **그 밖의 모든 셀** — 이름·강좌명·배지·행 작업·행 머리글 | 가운데 |
| 이름·강좌명 셀 | `.admin-table-name` — 정렬이 아니라 **폭(120~240px)과 줄바꿈**을 정한다 |
| 행 머리글 `th[scope="row"]` | 가운데, 흰 배경, 본문 굵기 |
| 표·스크롤 프레임 | 직각, 내부에서만 가로 스크롤(`.admin-table-frame`) |

표는 `width: 100%`, 셀 padding 12px, 헤더 `accent-tint`/600, 행 hover `accent-soft`, 본문 13px, `tabular-nums`, 셀 `white-space: nowrap`.

표 안에서 상세 화면으로 이동하는 이름·제목은 **`.admin-table-link`**(accent 글자, hover 밑줄)를 쓴다. `.admin-button`을 셀에 넣으면 이름마다 테두리 상자가 생겨 표가 버튼 격자처럼 보인다. 행 전체에 `onClick`을 걸지 않는다. 키보드로 도달할 수 없고 어디를 눌러야 하는지 알 수 없다.

**정렬은 오른쪽이거나 가운데다. 왼쪽은 없다.** 오른쪽은 자릿수를 맞춰 위아래로 읽는 숫자(금액·점수)의 것이고, 그 밖의 모든 칸은 가운데다. 한 열만 왼쪽에 붙으면 그 열이 격자에서 빠져 보인다. 이름 열도 가운데이며, `.admin-table-name`은 이제 정렬이 아니라 폭과 줄바꿈만 담당한다.

`th`의 `accent-tint` 배경은 **표 머리글(`thead`)의 규격**이다. 과목명·날짜처럼 각 행을 가리키는 이름 열을 `th[scope="row"]`로 두면 접근성에는 맞지만 첫 열 전체가 머리글 색으로 칠해져 다른 표와 어긋난다. 정규화 레이어의 `.admin-shell tbody th`가 이 배경과 굵기를 본문 셀 규격으로 되돌리므로, **행 머리글은 `th[scope="row"]` 그대로 두고 별도 유틸을 붙이지 않는다.**

**선 긋는 방식이 중요하다.** 셀이 **사방을 모두** 1px `admin-grid`로 그리고, `table` 자체에는 테두리를 두지 않는다. `border-collapse: collapse`가 맞닿은 선을 하나로 합치므로 격자 안쪽도 바깥쪽도 1px로 유지된다. **표와 셀에 동시에 테두리를 주면 같은 자리에 선이 두 번 놓인다.**

```css
table  { border: 0; border-collapse: collapse; }
th, td { border: 1px solid var(--admin-grid); }
```

**표를 감싼 컨테이너에 테두리를 두지 않는다.** 래퍼 선과 표 외곽선이 나란히 놓여 이중선이 된다. 가로 스크롤이 필요하면 `.admin-table-frame`(테두리 없음, 직각)으로 감싼다.

머리글은 `position: sticky; top: 0`으로 붙이고 `accent-tint` 배경을 셀이 직접 칠한다.

가로로 넓은 표에서 첫 열을 붙일 때는 `th`·`td` 모두에 `.admin-table-sticky-col`을 준다.

- **고정 열에는 반드시 불투명 배경을 준다.** 투명하면 밀려 들어온 다른 셀이 그 자리를 그대로 통과해 글자가 겹친다.
- **머리글의 z-index가 본문 셀보다 높아야 한다.** 고정 열의 머리글은 가로·세로 양쪽으로 붙는 모서리 칸이라 표에서 가장 위다. 순서는 일반 머리글 2 < 고정 열 본문 3 < 고정 열 머리글 4.
- 행 hover 색이 고정 열만 비껴가지 않도록 hover 배경도 함께 지정한다.

이 값들은 모두 `globals.css`가 담당한다. **개별 표에 padding·배경·글자 크기·테두리 유틸을 다시 붙이지 않는다.** 셀 안에 남은 `text-left`/`text-right` 유틸은 표 규칙이 덮으므로, 오른쪽 정렬은 반드시 `.admin-table-amount` 로 준다. 셀 안 flex 자식의 정렬도 같은 방향으로 따라간다.

- 모바일에서도 명단은 표를 유지한다. 좁은 화면에서는 열을 숨기거나 다른 칸으로 접어 가로 스크롤을 피하고, 카드 격자로 바꾸지 않는다.

### 5.9 표 하단 페이지 영역과 더 불러오기

**표에는 페이지 나누기가 없다.** 명단·내역은 전체를 한 번에 표시한다.

예외는 **직원 채팅의 과거 메시지**뿐이다. 대화는 끝없이 쌓이므로 최근 50건만 먼저 보내고 나머지는 `.admin-chat-dock-more`로 거슬러 올라간다. 목록 **위쪽**에 두고(과거는 위에 있다) 버튼은 `.admin-button.admin-button-compact`를 쓴다.

나중에 표에 페이지 나누기를 넣는다면 회색 카드 띠가 아니라 평면 footer로 만든다: 표 다음 `margin-top` 16px, 위 `line-soft` 1px, padding 16px 0, 글자 13px secondary, 왼쪽 조회 수·표시 범위, 오른쪽 이전/현재/다음, 컨트롤 최소 높이 44px·8px 모서리. 그때 이 절과 `globals.css`를 함께 갱신한다.

### 5.10 중앙 모달·슬라이드 모달

공통 구조는 `admin-dialog-header` → `admin-dialog-body` → `admin-dialog-footer`이다. **footer는 스크롤 본문 밖에 둔다.** `footer` prop 또는 공용 `DialogActions`를 사용한다. `DialogActions`는 중첩 폼의 작업 버튼도 본문 밖에 배치하며, 제출 버튼에는 `useId()`로 만든 폼 ID를 `form` 속성으로 연결해 입력 검증과 제출을 유지한다. 모달 밖에서 쓰는 폼에서는 일반 작업 행으로 표시한다.

| 항목 | 중앙 모달 (`Modal`) | 우측 슬라이드 (`SlideOver`) |
| --- | --- | --- |
| 외곽 | 흰색, line 1px, **8px** | 흰색, 왼쪽 line 1px, **직각 0** |
| 폭 | 뷰포트 안, 업무별 max-width | `min(760px, 100%)` |
| 높이 | 최대 `calc(100dvh - 32px)` | `100dvh` |
| 스크롤 | header/footer는 남고 body만 스크롤 | 동일 |
| 그림자 | `--admin-dialog-shadow` | 동일 |

- **입력·등록·편집·상세 조회는 `SlideOver`(우측 drawer)를 쓴다.** 중앙 `Modal`은 삭제·변경 폐기·최종 실행 확인과 짧은 안내에 쓴다.
- drawer는 학생 등록, 상벌점 부여·이력, 수납·환불·연장, 좌석 편집·배정·이동, 면담, 외출/휴가, 공지, 휴대폰 대여, 출결 일괄 적용에 사용한다. 중앙 모달은 학생 삭제, 퇴실 처리, 경고 단계 조정, 저장 완료와 공통 확인창에 사용한다. 실제 사용처 목록은 검증 보고서에 기록한다.
- drawer 는 폭이 규격으로 고정되므로 `widthClassName` 을 넘기지 않는다.
- 창 전체를 확정하는 작업이 없는 모달에는 footer를 만들지 않는다. 닫기는 header의 공통 닫기 버튼이 담당한다. footer를 억지로 만들어 닫기 버튼만 넣지 않는다.
- header: 상하 20px / 좌우 24px(모바일 16px), gap 16px, 아래 line.
- body: 상하 20px / 좌우 동일, `min-height: 0`, `overflow-y: auto`.
- footer: 상하 16px / 좌우 동일, 위 line, soft 배경, gap 8px, 우측 정렬.
- footer 버튼 최소 폭 80px, 최소 높이 44px, 글자 15px/600.
- 공통 닫기(`.admin-dialog-close`): **44×44px, 20px Lucide X, 8px 모서리, line 테두리, soft 배경**, `aria-label`/`title`='닫기'.
- header/body/footer 자체 모서리는 모두 0. 외곽만 둥글게 한다.
- 모달 안 안내·경고는 `.admin-notice`와 tone 변형(`-warning`, `-danger`, `-success`)을 쓴다. `bg-amber-50 text-amber-800` 같은 팔레트 직접 지정으로 화면마다 다른 상자를 만들지 않는다.
- overlay는 50% 검정이며 **blur 없음**.
- 동작: body 스크롤 잠금, Escape 닫기, 저장 중 중복 제출 방지를 유지한다.
- 포커스는 [useDialogFocus.ts](lib/useDialogFocus.ts) 가 담당한다. 첫 포커스는 패널 자체에 주어 모바일 키보드가 자동으로 뜨지 않게 하고, Tab/Shift+Tab 을 패널 안으로 제한하며, 닫을 때 열었던 trigger 로 되돌린다. 중첩 창에서는 맨 위 창만 Escape·Tab을 처리하고, 마지막 창이 닫힐 때 본문 스크롤을 복구한다.

관련 파일: [Modal.tsx](components/ui/Modal.tsx), [SlideOver.tsx](components/ui/SlideOver.tsx), [ConfirmDialog.tsx](components/ui/ConfirmDialog.tsx), [ActionCompleteModal.tsx](components/ui/ActionCompleteModal.tsx)

### 5.11 배지와 안내 상자

- `.admin-badge`: 8px 모서리, 1px line, 13px/600, padding 2px 8px.
- `.admin-notice`: 8px 모서리, 13px/1.5, 12px 16px padding. tone은 `--admin-warning-*` / `--admin-danger-*` / `--admin-success-*` 토큰을 쓴다.
- 출결 상태 배지(`attend-*`)와 경고 단계 배지(`warn-*`)는 업무 색을 유지한다.

---

### 5.12 정규화 레이어

`globals.css` 끝에는 **관리자 셸 정규화** 블록이 있다. 화면마다 흩어진 기존 Tailwind 마크업을 규격 안으로 끌어오고, 나중에 누가 임의 값을 다시 붙여도 시스템이 이기게 하는 층이다. 새 화면을 만들 때 이 규칙들을 다시 쓸 필요는 없지만, **왜 내 유틸이 안 먹는지** 궁금할 때 여기를 본다.

| 대상 | 하는 일 |
| --- | --- |
| 제목 | `h1`~`h4`의 색·굵기·자간·크기를 토큰으로 고정 |
| 본문 유틸 | `.text-sm` / `.text-base` → 15px, `text-[9~12px]` → 13px |
| 자간 | `tracking-*` 전부 `0` |
| 그림자 | 모달·드로어·작업 메뉴 밖의 `shadow-*`를 `none` |
| blur | `backdrop-blur-*`를 `none` |
| 입력 | 높이 44px, 1px line, 15px, placeholder·disabled·오류(rose) 상태 |
| 포커스 | 입력은 테두리만 accent(shadow ring 제거), 버튼·링크는 2px outline / offset 2px |
| 버튼 | 최소 44px·15px/1.3·줄바꿈 허용. 표 안은 36px·13px·nowrap |
| 표 | 위 5.8의 선 모델, sticky 머리글, 셀 안 flex 정렬 보정 |
| 모달 | 패널·머리글·본문·닫기의 최소 폭 0과 `overflow-wrap`, 제목 truncate 해제 |
| 모서리 | 탭·표·드로어·tablist를 `border-radius: 0`으로 최종 고정 |

특정도 때문에 화면별 유틸이 져야 할 때만 `.admin-shell x` 형태로 쓰고, 유틸이 이겨야 하는 기본값(입력 padding 등)은 `:where()`로 특정도 0에 둔다.

---

### 5.13 직원 채팅 도크

관리자와 조교가 함께 쓰는 지점 단위 단체방이다. 학생 화면에는 없다.

**별도 페이지를 두지 않는다.** 헤더의 채팅 아이콘으로 여는 오른쪽 도킹 패널이며, 레이아웃에 상주하므로 어느 화면에서든 열린다. 사이드바·하단 탐색에 메뉴 항목을 만들지 않는다.

- **모달이 아니다.** 어두운 오버레이, 포커스 트랩, 본문 스크롤 잠금을 두지 않는다. 열어 둔 채로 뒤 화면을 계속 쓸 수 있어야 한다. 닫기는 X 버튼과 Escape뿐이다.
- 패널은 **`.admin-shell` 직속으로 포털**한다. 트리거가 놓인 헤더가 `z-index`로 쌓임 맥락을 만들기 때문에 그 안에 두면 하단 탐색(z-40)이 패널 위로 그려진다. `body`가 아니라 `.admin-shell`로 보내야 §5.12 정규화 레이어가 그대로 적용된다.
- 768px 이상은 오른쪽 400px 세로 전체(`.admin-chat-dock`), 미만은 전체 화면 시트다. 시트가 하단 탐색을 덮으므로 작성창과 탐색이 겹칠 일이 없다.
- 트리거 `.admin-chat-trigger`는 44×44, 안읽음은 `.admin-chat-trigger-badge`로 우상단에 붙이고 100 이상은 `99+`로 접는다. 검은 헤더 위에서는 테두리·글자를 헤더에 맞춘다.
- 구조는 **머리 / 스크롤 본문 / 작성창** 3단 flex다. 스크롤 영역은 `.admin-chat-dock-body` **하나뿐**이며 문서 스크롤과 겹치지 않는다.
- 메시지는 `.admin-chat-bubble`(1px line, 8px 모서리, 최대 `min(85%, 520px)`, `white-space: pre-wrap`). **내가 보낸 것만 오른쪽 정렬 + `accent-soft` 배경**으로 구분하고, 그 외에는 색으로 사람을 구분하지 않는다.
- 날짜가 바뀌는 첫 메시지에만 `.admin-chat-day` 구분선을 넣는다.
- 삭제된 메시지는 지우지 않고 자리에 남긴다. 점선 테두리 `.admin-chat-bubble-deleted`로 `삭제된 메시지`만 표시하고, 서버는 본문을 아예 내려보내지 않는다.
- textarea는 44px 한 줄에서 시작해 120px까지 자란다(`resize: none`). §5.12의 `textarea { min-height: 112px }`보다 **특정도가 높아야** 이긴다.
- **한글 입력**: Enter 전송은 `!event.shiftKey && !event.nativeEvent.isComposing`일 때만이다. `isComposing` 가드가 없으면 전송할 때마다 마지막 자모가 삼켜진다.
- 새 메시지로 따라가는 스크롤은 **이미 하단 120px 안에 있을 때만** 한다. 과거를 읽는 중인 사용자를 끌어내리지 않는다. `이전 메시지 더 보기`로 위를 채운 뒤에는 늘어난 높이만큼 `scrollTop`을 밀어 읽던 위치를 지킨다.

관련 파일: [StaffChatDock.tsx](components/chat/StaffChatDock.tsx), [StaffChatRoom.tsx](components/chat/StaffChatRoom.tsx), [StaffChatWatcher.tsx](components/chat/StaffChatWatcher.tsx), [chat-meta.ts](lib/chat-meta.ts)

## 6. 모션

정적 운영 화면에 장식 애니메이션을 추가하지 않는다. 메뉴/탭 색 피드백은 150ms ease-out이다. 모달·drawer는 [lib/motion.ts](lib/motion.ts)의 공유 spring과 `useReducedMotion`을 따른다.

| 용도 | stiffness / damping / mass |
| --- | --- |
| Drawer | 360 / 32 / 0.9 |
| Modal | 420 / 28 / 0.9 |
| Tab | 520 / 34 / 0.8 |

위치는 `transform`, 투명도는 `opacity`로 처리한다. reduced-motion이면 JS 전환 duration 0, CSS 전환·애니메이션 0.01ms/1회와 `scroll-behavior: auto`를 적용한다.

**버튼 누름 scale 효과는 쓰지 않는다.** 밀도 높은 표 화면에서 시선을 흔든다.

---

## 7. 깊이와 그림자

페이지·표·카드의 구분은 배경과 얇은 선이 담당한다. **일반 섹션·대시보드 카드에 그림자를 사용하지 않는다.** 모달·작업 메뉴만 `--admin-dialog-shadow`(`shadow-dialog`)를 쓴다.

Tailwind의 `shadow-card` / `shadow-card-hover` / `shadow-header`는 `none`으로 매핑되어 있다. 그라데이션, glass/blur, glow는 쓰지 않는다.

---

## 8. 조교·학생 화면의 경계

> **모바일 배치는 세 역할이 같다([MOBILE_DESIGN.md](MOBILE_DESIGN.md) §3).** 조교·학생만의 모바일 규격을 따로 만들지 않는다. 관리자와 다른 것은 메뉴 항목과 데이터뿐이다. 조교 출석체크·휴대폰 체크의 하단 sticky 저장 바는 이 절 그대로 유지한다.

관리자 규격을 그대로 쓰되 아래는 유지한다.

- **조교**: 관리자와 **같은 셸(`AdminShell`)**을 쓴다. 1024px 이상은 256px 검은 사이드바, 미만은 상단 헤더의 `조교 메뉴` 버튼으로 펼친다. 본문 폭·여백·유틸리티 행도 §5.1과 같다. 조교 전용 하단 고정 탐색은 두지 않는다 — 관리자와 다른 껍데기를 쓰면 같은 제품으로 보이지 않는다.
- 조교 메뉴는 `AdminSidebar`의 `role="assistant"` 목록(조교 홈·출석체크·휴대폰 체크)이다. 관리자 메뉴를 권한으로 가리지 않고 애초에 다른 목록을 둔다.
- 현장에서 서서 쓰는 화면이므로 터치 영역을 44px 아래로 줄이지 않는다.
- 조교 홈의 요약은 관리자 대시보드와 같은 `.admin-dashboard-metrics` 격자다(768px 미만 2열, 1280px 이상 4열). 조교 전용 요약 박스를 따로 만들지 않는다.
- **출결 명단은 카드가 아니라 표다**(§5.8). 카드 격자는 한 학생이 한 덩어리를 차지해 화면당 인원이 줄고, 관리자 출석부(학생 × 교시 매트릭스)와도 다른 물건처럼 보인다.
  - 열은 `좌석 · 학생 · 출결 · 기타 상태`이고, 640px 미만에서는 `기타 상태` 열을 출결 칸 아래로 접어 가로 스크롤을 없앤다.
  - 자습실이 하나뿐인 지점에서는 좌석 라벨만 쓴다. 행마다 같은 자습실 이름을 반복하지 않는다.
  - 스와이프 입력은 행(`tr`) 단위로 유지한다.
- 표 안의 출석/지각/결석 버튼은 `.admin-status-button`이다. **표 안의 글자를 테두리 상자로 감싸지 않는다** — 셀마다 작은 박스가 서면 표가 다시 카드처럼 보인다. 테두리·배경 없이 글자만 두고 선택은 §5.5 서브탭과 같은 **2px 밑줄**로 표시한다(`aria-pressed`).
  - 선택 글자색은 출결 상태색(`attend-*`)을 그대로 쓰고 밑줄은 `currentColor`로 따라간다. 색만으로 상태를 전달하지 않도록 밑줄을 함께 둔다.
  - 높이는 44px를 유지한다. 기본 버튼의 15px·좌우 16px로는 두 글자가 세로로 쪼개지고, 표 안 버튼 기본값(36px 축약)은 조교 터치 규격에 못 미치므로 글자 13px·좌우 4px로만 줄인다.
  - 선택 색은 화면 쪽 Tailwind 유틸이 정한다. 정규화 레이어에서 `color`를 잡으면 레이어 밖 규칙이라 그 유틸을 이겨버리므로, 비활성(`aria-pressed="false"`)에만 색을 지정한다.
- 표 셀은 `white-space: nowrap`이라 `select`·`input` 같은 inline-block 컨트롤을 그냥 두면 한 줄에 붙어 셀을 넘친다. 세로로 쌓아야 하면 `block`을 함께 준다.
- **행마다 늘 펼쳐 두는 컨트롤을 만들지 않는다.** 빈도가 낮은 선택지(사유결석·휴무·반휴·해당없음)는 같은 줄의 `기타` 토글 뒤에 접고, 이미 지정된 행만 펼쳐 둔다. 행마다 select 를 세워 두면 한 화면에 들어오는 학생이 절반으로 준다.
- **`tr` 에 `transform` 을 상시로 걸지 않는다.** 표 행이 containing block 이 되어 열 정렬이 흔들린다. 스와이프처럼 실제로 움직일 때만 style 을 붙이고, 끝나면 예약된 `requestAnimationFrame` 을 **반드시 취소한다** — 취소하지 않으면 초기화 뒤에 옛 값이 다시 쓰여 행이 밀린 채 굳는다.
- 컨트롤이 여러 단으로 쌓이는 화면(휴대폰 체크)은 **768px 미만에서 조회 조건을 접는다.** 날짜·검색·필터는 접고, 늘 봐야 하는 보기 탭·교시·집계·명단은 펼쳐 둔다. 768px 이상에서는 CSS 로 항상 펼쳐 데스크톱 동작을 바꾸지 않는다.
- **학생 포털 화면은 넷이다**: 출석 상세·학습 랭킹·상벌점 상세·성적 상세. 대시보드와 공지사항은 두지 않는다. `/[division]/student` 는 로그인 직후 도착하는 경로이므로 라우트는 남기고 켜져 있는 첫 화면으로 넘긴다.
- **학생 포털**: 조교와 같은 이유로 관리자와 **같은 셸(`.admin-shell`)**을 쓴다. 루트가 `.admin-shell`, 본문이 `.admin-main` + `.admin-content-frame` + `.admin-flat-page`이고, 상단은 지점명·학생명·로그아웃을 담은 검은 헤더다. 학생은 좌측 메뉴 대신 **1차 폴더 탭**(§5.4)으로 화면을 옮기고, 화면 안에서 갈리는 구분만 2차 밑줄 탭(§5.5)으로 둔다.
- **셸 밖에 두지 않는다.** 셸 밖이면 §5.12 정규화 레이어가 걸리지 않아 입력 높이·버튼 규격·표 선 모델·모서리를 화면마다 손으로 다시 구현하게 되고, 그 순간부터 관리자와 다른 UI가 된다. 새 화면에서 가장 먼저 확인할 것은 `.admin-shell` 안에 있는지다.
- 학생 화면도 관리자 클래스를 그대로 쓴다. 페이지 제목 `.admin-page-title`, 표 `.admin-table-frame`, 안내 `.admin-notice`, 배지 `.admin-badge`, 빈 상태 `.admin-empty-state`다. **화면 전체를 카드로 감싸지 않는다.**
- **요약은 테두리 상자가 아니라 선으로만 나눈다.** 신원(학번·좌석·상벌점·직렬)과 지표는 `.admin-portal-summary` 격자다. 칸 사이 1px 간격에 `line-soft`가 비쳐 격자선이 되고, 표와 같이 **사방을 선으로 닫는다**(좌우가 열려 있으면 옆 표와 끝선이 어긋나 보인다). 390px 2열, 768px 이상 자동 열이며, 요약이 3개면 `-3`(항상 3열), 대시보드 지표는 `-kpi`(1280px 이상 4열, 숫자 32px)를 함께 준다. **관리자 대시보드의 `.admin-dashboard-metric` 카드를 학생 화면에 이식하지 않는다.**
- **표는 사방에 격자선을 긋는다.** 5.8절의 "오른쪽·아래만" 모델과 달리 `.admin-portal` 안의 표는 셀 사방에 1px `admin-grid`를 준다. `border-collapse: collapse` 가 인접한 선을 하나로 합치므로 외곽이 2px 로 겹치지 않는다.
- **칸이 많은 표는 줄여 넣지 않고 가로로 스크롤한다.** 좁은 폭에서 모든 칸을 욱여넣으면 `2026. 3. 15.` 가 네 줄로 쪼개져 값을 읽을 수 없다. 셀은 `white-space: nowrap` 을 유지해 자연 폭을 갖고, `.admin-table-frame` 안에서만 가로로 스크롤한다(문서 전체는 넘치지 않는다). 제목·사유처럼 긴 문장이 들어가는 `.admin-table-name` 칸만 줄바꿈하고 140~220px 로 묶는다 — 이 칸까지 nowrap 이면 표 하나가 화면 몇 배로 늘어난다. 표에 `min-width` 를 걸어 폭을 강제하지도 않는다.
- **주간 출석표는 모바일에서 행과 열을 뒤집는다.** 날짜를 행으로 두면 교시 9개가 열이 되어 13px 하한을 지키면서는 390px 안에 들어오지 않는다. 교시를 행, 날짜를 열로 두면 8열이 되어 한 화면에 담긴다. 칸이 많으므로 `.admin-portal-grid-table` 로 여백을 8px 2px 까지 줄이고, 오늘 열은 강조색과 `오늘` 문구를 함께 표시한다(1절).
- **표 안에서는 상태를 상자로 감싸지 않는다.** 출결·상벌점 점수·공지 구분처럼 셀 안에 들어가는 값은 `.admin-badge`/`.admin-status-chip` 이라도 `.admin-portal table` 안에서 테두리·배경·여백을 걷고 **업무 색을 글자색으로만 남긴다**(5.11절의 상태색은 그대로 유지된다). 표가 이미 격자선을 그으므로 칸마다 상자를 또 그리면 선이 두 겹이 된다. 범례도 같은 표기를 쓴다. 표 밖의 배지(학생 상태·경고 단계)는 배지 모양을 유지한다.
- **목록은 폭에 상관없이 표다.** 상벌점 내역·성적 회차 모두 `.admin-table-frame` 안의 표다. 5.3절의 "768px 미만은 기록 카드" 규칙은 관리자·조교 화면에만 적용한다.
- 기록 카드를 쓰는 곳이 남으면 카드 안 항목은 **`.admin-portal-details`** 로 2열(`-3` 변형은 3열)로 나눈다. 관리자의 `.admin-record-details`가 768px 미만에서 1열로 접히는 것과 달리 **모바일에서도 접지 않는다.**
- 학생 메뉴는 경로를 오가므로 `AdminTabs`(button/onChange) 대신 `Link` + `aria-current="page"` 로 만든다.
- **학생 메뉴 탭은 한 화면에 다 보인다.** 항목이 넷뿐이므로 `flex: 1 1 0` 으로 폭을 나눠 채우고, 5.4절의 "라벨을 줄이거나 말줄임하지 않는다"를 지키려고 자르는 대신 `word-break: keep-all` 로 어절 단위 두 줄까지 흘린다. 탭 바의 오버레이 스크롤바는 감춘다 — 아래 accent 연속선을 덮어 이중 굵은 선처럼 보인다(5.1절 사이드바와 같은 이유).
- **학생 상태·경고 단계는 배지로 두지 않는다.** 버튼처럼 보이는 상자 대신 요약 격자의 항목(`상태`, `경고 단계`)으로 넣고 값에만 업무 색을 준다. 라벨이 함께 읽히므로 색에 기대지 않는다(1절).
- 학생 화면의 D-Day·수강 기간처럼 **긴급도를 색으로 전달하는 블록**은 상태색을 유지하되 반드시 읽을 수 있는 문구를 함께 둔다. 이 블록은 `.admin-notice`와 tone 변형을 쓰고, 남은 일수는 `.admin-badge`로 따로 보여준다.
- 좌석 지도와 QR/기능성 마커는 고유 형상을 보존한다. 일반 버튼 라운드나 탭 규칙으로 덮어쓰지 않는다.

관련 파일: [StudentPortalFrame.tsx](components/student-view/StudentPortalFrame.tsx), [StudentPortalTabs.tsx](components/student-view/StudentPortalTabs.tsx), [StudentPortalUi.tsx](components/student-view/StudentPortalUi.tsx)

---

## 9. 변경·검증·문서 운영

### 작업 원칙

1. 같은 역할의 기존 클래스와 컴포넌트를 먼저 찾는다.
2. 정확한 토큰·최종 cascade·화면의 computed style을 확인한다.
3. 새 규격이 필요하면 **이 문서와 `globals.css` 토큰을 함께** 변경한다. 특정 화면에 임의 값만 덧씌우지 않는다.
4. 폼 값·기능 제한·직렬·API·데이터를 디자인 작업 중 바꾸지 않는다.
5. 폰트·색·치수 규칙은 이 문서 한 곳에 유지한다. 기능 문서는 이 문서를 링크한다.
6. 문서만 갱신한 경우 UI 수정 완료나 배포 완료라고 보고하지 않는다.

### 시각 확인 기준

의미 있는 UI 변경은 실제 로컬 브라우저에서 **390px, 768px, 1280px**와 실제 운영 데스크톱 폭을 확인한다. 768px에서는 사이드바를 뺀 실제 콘텐츠 폭을 기준으로 판단한다.

- 폴더·서브 탭·표·drawer 모서리 0, 일반 입력·버튼·중앙 모달 8px.
- 대시보드 카드 사이 gap 16px, 내부 행·헤더 선의 꺾임 없음.
- 표 헤더 가운데, 이름 왼쪽, 금액 오른쪽, 나머지 가운데.
- 표·허용된 탐색 영역 외 문서 가로 넘침 없음.
- 중앙/슬라이드 모달 모두 닫기·footer가 짧은 화면에서도 도달 가능.
- focus, keyboard, pending, empty, error, retry, 미저장 초안, 중첩 모달 확인.

### 레이아웃 점검

카드 겹침·중첩은 눈으로 놓치기 쉽다. 화면마다 콘솔에서 아래를 돌린다. `n`이 0이 아니면 그 화면은 아직 미완성이다.

```js
(() => {
  const I = [], F = document.querySelector(".admin-content-frame");
  const bd = (e) => {
    const s = getComputedStyle(e);
    return parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderLeftWidth) > 0;
  };
  // 테두리 박스 안의 테두리 박스 (버튼·배지는 제외)
  F.querySelectorAll("section, article, div").forEach((e) => {
    if (!bd(e) || e.closest("table") || e.closest('[role="dialog"]')) return;
    let p = e.parentElement, h = 0;
    while (p && p !== F && h < 3) {
      if (bd(p)) { I.push("중첩카드: " + e.className); break; }
      p = p.parentElement; h++;
    }
  });
  // 가로 형제인데 위쪽 선만 있는 요소
  F.querySelectorAll(".admin-section").forEach((e) => {
    const s = getComputedStyle(e);
    if (parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderLeftWidth) === 0 &&
        getComputedStyle(e.parentElement).display.includes("grid"))
      I.push("grid stray선: " + e.className);
  });
  // 같은 문구의 제목 중복
  const t = [...F.querySelectorAll(".admin-page-title, .admin-section-title")]
    .map((x) => x.textContent.trim());
  t.filter((x, i) => x && t.indexOf(x) !== i).forEach((x) => I.push("제목중복: " + x));
  return { page: location.pathname, n: I.length, i: [...new Set(I)] };
})();
```

### 계산값 점검

눈으로 보는 대신 브라우저 콘솔에서 실제 computed style을 센다. 폰트가 하나인지, 크기·굵기가 스케일 안에 있는지 한 번에 확인할 수 있다.

```js
(() => {
  const aS = ["13px", "15px", "16px", "20px", "32px"];
  const aW = ["400", "600", "700"];
  const off = [], fonts = new Set();
  document.querySelectorAll("body *").forEach((el) => {
    if (!el.textContent || el.children.length) return;
    const s = getComputedStyle(el);
    fonts.add(s.fontFamily.split(",")[0]);
    if (!aS.includes(s.fontSize) || !aW.includes(s.fontWeight)) {
      off.push({ cls: el.className, size: s.fontSize, weight: s.fontWeight });
    }
  });
  return { fonts: [...fonts], offScale: off };
})();
```

`fonts`는 Pretendard 하나, `offScale`은 빈 배열이어야 한다.

### 로컬 실행과 검사

패키지 매니저는 모노레포 기준 **pnpm**이다. DB 없이 띄우려면 `MOCK_MODE=true`를 쓴다.

```bash
pnpm run dev
```

```bash
pnpm run typecheck
```

```bash
pnpm run build
```

`typecheck`가 Prisma 모델을 못 찾는다고 하면 클라이언트가 오래된 것이다. `pnpm run prisma:generate` 후 다시 실행한다. **개발 서버가 떠 있는 상태에서 재생성하면 실행 중인 서버의 모듈 해석이 깨지므로 서버를 재시작한다.**

여러 로컬 서버를 함께 실행하면 `NEXT_DIST_DIR`로 빌드 디렉터리를 분리한다. 다른 서버의 `.next`를 정리하지 않도록 별도 디렉터리에서는 `pnpm exec next build`로 빌드한다. 이는 로컬 검증용이며 기본 배포 경로는 바꾸지 않는다.

정적 검사나 과거 스크린샷만으로 현재 모든 화면을 확인했다고 주장하지 않는다.

### 개인 성적 A4 출력 규격

개인 리포트만 별도 창에 복사하며 기존 화면의 계산과 권한은 변경하지 않는다. A4 세로 210×297mm, 여백 12mm, 내용 폭 186mm. 인쇄 전용 글꼴은 Arial/Malgun Gothic, 본문 10pt, 표 8pt, 제목 14pt/11pt로 한다. 표 선은 기존 grid 색, 머리글은 surface-muted, 본문은 text 색이다. 셀 여백 1.5mm/1mm, 섹션 간격 4mm. 표 머리글 반복, 행 중간 분할 방지, 접힌 채점표 전체 포함. 화면용 크기와 별도로 종이 출력에만 적용한다. 브라우저 인쇄에서 PDF 저장 또는 프린터를 선택한다.

### 학생 개인 성적 전용 페이지

관리자 성적 분석의 학생 선택은 `/[division]/admin/exams/students/[studentId]`로 이동한다. 우측 드로어를 사용하지 않고 관리자 본문 전체 폭을 사용한다. 상단에 목록 복귀, 학생 이름, 정기/아침 구분, 학생·시험·날짜(기간) 선택, 섹션 바로가기를 둔다. 기존 `admin-flat-page`, `admin-tabs`, `admin-filter-bar`, `admin-button` 규격을 재사용한다. 섹션 바로가기는 문서 내 탐색이며 내용을 숨기지 않아 전체 인쇄와 차트 크기를 유지한다. 목록 복귀 링크는 원래 시험 종류·날짜·기간과 분석 탭을 전달한다.
