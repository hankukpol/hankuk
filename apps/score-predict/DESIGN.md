# 합격예측 디자인 가이드

> 이 문서가 정하는 값은 전부 `src/app/globals.css` 한 곳에 구현되어 있다.
> 화면을 만들 때 여기 있는 클래스를 쓰고, **크기·여백·색·정렬을 인라인으로 다시 지정하지 않는다.**
> 인라인으로 덮는 순간 그 화면만 다른 화면과 어긋나기 시작한다.

---

## 0. 세 가지 원칙

**① 규격은 CSS가 소유한다.**
표·제목·탭·배지의 크기와 색은 `globals.css`가 단독으로 결정한다. 컴포넌트는 클래스 이름만 붙인다.

**② 화면 폭이 바뀌어도 규격은 그대로다.**
데스크톱에서 글자를 키우지 않는다. 표는 어느 폭에서든 13px이다. 화면이 넓어지면 글자가 아니라 **담기는 정보량**이 늘어야 한다.

**③ 페이지는 문서다, 카드 모음이 아니다.**
수험생 화면은 위에서 아래로 읽고, 관리자 화면은 위에서 아래로 점검하고 처리한다. 두 화면 모두 카드보다 제목·구분선·표·폼의 순서가 먼저 읽혀야 한다. 카드는 아껴 쓴다.

---

## 0-1. 결정표 — 무엇을 만들 때 무엇을 쓰나

새 화면·요소를 만들 때 이 표에서 먼저 찾는다. **표에 있으면 새로 스타일을 만들지 않는다.**

| 만들려는 것 | 쓸 것 | 붙이면 안 되는 것 |
|---|---|---|
| 화면 제목 | `<h1 className="user-page-title">` | `text-*` `font-*` `tracking-*` |
| 섹션 제목 (좌측 바 자동) | `<h2 className="user-section-title">` | `text-*` `font-*` `pl-*` `mb-*` |
| 섹션 안 소제목 | `<h3 className="user-card-title">` | `text-*` `font-*` |
| 색상 패널 안의 상태 제목 | `<h2 className="user-notice-title text-amber-900">` | `text-*` `font-*` (색상 클래스는 유지) |
| 라벨·캡션 | `className="user-data-label"` | `text-*` `font-*` `text-slate-*` |
| 핵심 결과 숫자 | `className="user-metric-hero"` | `text-*` `font-*` |
| 표 | `<table className="data-table">` | `text-*` `tracking-*` |
| 표 셀 | `<td>` (클래스 없이) | `px-*` `py-*` `border-*` `text-left/center/right` `text-xs/sm/base` |
| 숫자 비교 열 | `<td className="tabular-nums num-right">` | 위와 동일 |
| 라벨/값 목록 | `<dl className="user-data-rows">` + `<div><dt><dd>` | 자식에 `p-*` `text-*` |
| 표의 모바일 카드 | `className="data-list-flat"` | `text-*` `tracking-*` |
| 모바일 카드의 행머리 (과목명·총점) | `<p className="user-metric-heading">` | `text-*` `font-*` `text-left` |
| 모바일 카드 안의 지표 묶음 | `<dl className="user-metric-pairs" data-cols="2\|3\|4">` + `<div><dt><dd>` | `text-*` `font-*` `grid-cols-*` `justify-between`, `dd`에 색 클래스(→ `data-tone`) |
| 화면 구획 탭 | `<div className="user-content-tabs">` + `<button className="user-content-tab" aria-selected={…}>` | `text-*` `font-*` `p*-` `bg-*` `border*` |
| 섹션 내 필터 탭 | `<button className="user-filter-tab" data-active={…}>` | `text-*` `font-*` `p*-` `border-b-*` |
| 난이도 배지 | `<span className="user-level-badge" data-level="easy\|normal\|hard\|veryhard">` | `text-*` `font-*` `bg-*` `rounded*` |
| 섹션 구분 | `<section className="border-t border-slate-200 pt-6">` | 카드 껍데기(`rounded-xl border … bg-white p-*`) |
| 강조 블록 | `border border-service-200 bg-service-50 px-5 py-5` | — |
| 경고·알림 | `border-l-2 border-{tone}-400 bg-{tone}-50 px-4 py-3` | 여러 형태 혼용 |

관리자 화면은 위 클래스의 값과 같은 토큰을 `.admin-shell`에서 일괄 적용한다. 기존 관리자 페이지의 레거시 Tailwind 클래스는 시각 규격을 결정하지 않으며, 새 관리자 요소에는 아래 클래스를 우선한다.

| 관리자 요소 | 쓸 것 | 규격 |
|---|---|---|
| 전체 화면 | `.admin-shell` | 사용자 화면과 같은 중립색·글꼴·서비스색 |
| 콘텐츠 프레임 | `.admin-content-frame` | 최대 1440px, 좌우 여백은 프레임이 소유 |
| 페이지 제목 | `<h1>` 또는 `.admin-page-title` | 20px / 700 |
| 섹션 제목 | `<h2>` 또는 `.admin-section-title` | 16px / 700 |
| 섹션 안 소제목 | `<h3>` 또는 `.admin-card-title` | 15px / 700 |
| 데이터 표 | `.admin-shell table` | `data-table`과 같은 13px·14px 10px·전체 격자 |
| 폼 컨트롤 | `.admin-shell input/select/textarea` | 15px, 기본 높이 44px, 각진 1px 경계 |
| 업무 구역·내부 전환 탭 | `.admin-content-tabs` + `.admin-content-tab` | 사용자 풀서비스의 공채·경채 탭과 같은 폴더형 활성 상태. URL 이동은 `aria-current`, 화면 내부 전환은 `aria-selected` 사용 |
| 상태·경고 | `.admin-status-strip` | 좌측 2px 상태선 + 옅은 배경 |

**활성 상태 표기**: `user-content-tab`은 `aria-selected`, `user-filter-tab`은 `data-active` 또는 `aria-selected`를 읽는다. 클래스를 조건부로 바꾸지 않는다.

**직렬 색**: 반드시 `service-*`. `police-*` / `fire-*` 를 컴포넌트에 쓰면 `test:tenant-isolation` 이 실패한다.

---

## 1. 색상

### 직렬 팔레트

두 직렬은 `<body data-tenant="police|fire">` 하나로 갈린다. **컴포넌트에 `police-*` / `fire-*` 색을 직접 쓰지 않는다.** `service-*` 토큰만 쓰면 파일을 그대로 복사해도 색이 따라온다.

| 토큰 | 경찰 | 소방 | 용도 |
|---|---|---|---|
| `--service-50` | `#f2f5ff` | `#fef2f2` | 표 행머리, 히어로 블록 바탕 |
| `--service-100` | `#e3e9ff` | `#fee2e2` | 표 컬럼머리 바탕 |
| `--service-200` | `#c7d3ff` | `#fecaca` | 강조 블록 테두리 |
| `--service-600` | `#002ef6` | `#dc2626` | **주색** — 활성 탭, 섹션 바, 버튼 |
| `--service-700` | `#0024c8` | `#b91c1c` | 강조 숫자, 활성 텍스트 |
| `--service-800` | `#001b96` | `#991b1b` | 진한 강조 |

경찰 램프는 `#002ef6` 한 색조의 틴트로 구성한다. 중간 단계에 다른 색조(예: Tailwind 기본 `sky`)를 섞으면 화면이 어수선해진다.

`:root` 기본값은 **중립 회색**이다. 직렬 판별이 실패해도 특정 브랜드색으로 오인되지 않게 하기 위함이다.

### 중립 스케일

Tailwind 기본 `slate`는 푸른기가 돈다. 파란 주색과 겹치면 화면 전체가 파랗게 물든다. **순수 중립**으로 교체해 쓴다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-slate-50` | `#fafafa` | 표 안쪽 보조 영역 |
| `--color-slate-100` | `#f3f3f5` | 비활성 탭, 패널 헤더 |
| `--color-slate-200` | `#e8e8ec` | 카드·구분 테두리 |
| `--color-slate-300` | `#d6d6dc` | 탭 테두리 |
| `--color-slate-500` | `#9c9c9c` | 비활성 텍스트 |
| `--color-slate-600` | `#6b6b6b` | 라벨 |
| `--color-slate-800` | `#222222` | 제목 |
| `--color-slate-900` | `#0a0a0a` | 본문 |

### 색 사용 규칙

- 페이지 배경은 **흰색**이다. 데이터가 담기는 면도 흰색이고, 구분은 **테두리**가 한다.
- 주색은 **"내 데이터"와 "지금 선택된 것"** 에만 쓴다. 링크·버튼·차트에까지 같은 파랑을 쓰면 강조가 희석된다.
- **빈 상태는 경고색을 쓰지 않는다.** "데이터 수집 중"은 사용자가 잘못한 게 아니므로 중립 회색이다.
- 순서가 있는 값(난이도 등)은 순서형 스케일을 쓴다: `#0f766e` → `#3f9e7c` → `#a1a1aa` → `#d97706` → `#dc2626`

---

## 2. 타이포그래피

크기 차이로 위계를 만들지 않는다. **좌측 바와 여백**이 위계를 담당한다.

| 클래스 | 크기 / 굵기 | 색 | 비고 |
|---|---|---|---|
| `user-page-title` | 20px / 700 | `#222222` | 화면 제목 |
| `user-section-title` | 16px / 700 | `#333333` | **좌측 3px 브랜드 바** + 하단 25px |
| `user-card-title` | 15px / 700 | `#333333` | 섹션 안 소제목 |
| 본문 | 15px / 400 | `#0a0a0a` | |
| `user-notice-title` | 15px / 700 | **지정 안 함** | 색상 패널 안의 상태 제목 — 색은 패널에서 물려받는다 |
| `user-data-label` | 13px / 600 | `#6b6b6b` | 라벨·캡션 |
| `user-metric-hero` | clamp(32~44px) / 800 | 주색 | 핵심 결과 숫자 |

공통: `letter-spacing: -0.05em`, `line-height: 1.3`
숫자에는 `tabular-nums`를 붙여 자릿수가 흔들리지 않게 한다.

> `user-section-title`을 쓰면 좌측 바가 자동으로 붙는다. `pl-*`이나 `mb-*`로 다시 조정하지 않는다.

---

## 3. 레이아웃

### 콘텐츠 프레임

```
.user-content-frame  →  width: calc(100% - 2rem)   (768px 이상 3rem)
                        max-width: clamp(66.25rem, 56.25vw - 1.25rem, 90rem)
                        margin-inline: auto
```

**좌우 여백은 프레임이 담당한다.** 안쪽 섹션에 좌우 패딩을 주면 같은 페이지에서 섹션마다 좌측 시작점이 달라진다.

관리자 화면은 고밀도 표를 위해 `.admin-content-frame`의 최대폭을 1440px로 둔다. 모바일 16px, 태블릿 24px, 데스크톱 32px의 바깥 여백만 허용하며 페이지 내부에서 다시 좌우 여백을 더하지 않는다. 관리자 본문의 기본 구획은 카드가 아니라 `border-top`으로 시작하는 페이지 섹션이다.

- 메뉴바 → 페이지 제목: **100px**
- 섹션 사이: `border-t border-slate-200` + `pt-6`

### 카드를 쓰는 경우

기본은 **테두리 없는 문서형**이다. 카드는 아래에만 쓴다.

- 핵심 결과 (히어로 블록)
- 경고·주의 (과락, 채점 대기)
- 빈 상태·로딩 메시지
- 모달
- 성격이 다른 삽입물 (프로모션)

모든 곳에 카드를 쓰면 "이건 독립된 덩어리다"라는 신호가 사라지고 위계가 평평해진다.

### 모서리

**라운드를 쓰지 않는다.** `rounded` / `-sm` / `-md` / `-lg` / `-xl` / `-2xl` / `-3xl`과 방향형(`rounded-l-md` 등)까지 **모든 radius 유틸리티가 `border-radius: 0`으로 무력화**되어 있다. 일부 스케일만 덮으면 `rounded`(4px)처럼 빠진 클래스가 새어 그 화면만 모서리가 둥글어지므로 스케일을 빠짐없이 적는다.

`rounded-full`만 예외다. 이건 반지름 스케일이 아니라 **형태 선택**이기 때문이다. 진행바 트랙, 차트의 위치 점, 원형 카운트 배지처럼 원이어야 하는 요소에만 쓴다. 배경과 좌우 패딩을 가진 알약형 배지에는 쓰지 않는다 — 페이지 전체가 각진데 배지만 알약이면 튄다.

관리자 화면도 같다. 드롭다운·모달처럼 문서 흐름 위에 뜨는 요소도 외곽은 각지게 두며, 체크박스·라디오·진행바·상태 점만 원형을 허용한다.

---

## 4. 표 — `data-table`

가장 중요한 규격이다. 앱의 모든 표가 이 한 규칙을 따른다.

```
글자        13px / line-height 1.3 / letter-spacing -0.05em
셀 여백     14px 10px
행 높이     약 46px  ← padding 이 결정한다. height 를 못 박지 않는다
격자선      1px solid #dddddd  (전체 격자)
컬럼머리    background: var(--service-100) / color: #000 / weight 600 / 가운데
행머리      background: var(--service-50)  / color: #000 / weight 600 / 가운데
데이터 셀   background: #fff / color: #000 / weight 400 / 가운데
합계 행     tr 에 `data-table-total` → background: var(--service-50) / weight 700
```

합계 행 배경을 `<tr>`에 Tailwind 클래스로 주면 보이지 않는다. `tbody td`가 흰 배경과 400 굵기를 못 박고 있고, `.data-table` 규칙은 레이어 밖이라 `@layer utilities`의 Tailwind 유틸리티보다 항상 우선한다. 셀에 직접 클래스를 붙여도 같은 이유로 먹지 않는다. 표를 닫는 행이므로 `data-table-total` 클래스로 규격에서 처리한다.

컬럼머리는 **검정 바탕에 흰 글자가 아니라 옅은 틴트에 검정 글자**다. 밀도 높은 표에서 반전 대비는 눈이 피로하다.

### 정렬

**기본은 가운데다.** 자릿수를 세로로 맞춰야 읽히는 열에만 `num-right`를 붙인다.

```tsx
<th className="num-right">전체평균</th>
<td className="tabular-nums num-right">166.98</td>
```

`tabular-nums`는 글꼴 폭 고정 용도이지 정렬 마커가 아니다. 정렬 기준으로 쓰면 이미 그 클래스가 붙어 있는 표까지 전부 밀린다.

### 표가 아닌 표

실제 `table`이 아니지만 같은 규격을 따라야 하는 것들이 있다.

| 클래스 | 용도 |
|---|---|
| `user-data-rows` | 라벨/값 한 쌍이 한 행을 이루는 목록 |
| `user-overview-metric-row` + `-label` / `-value` | 풀서비스 메인의 지표 목록 |
| `data-list-flat` | 표의 모바일 대응 카드 목록 |

`user-data-rows`는 행이 아니라 **셀에 여백을 준다.** 행에 padding을 두면 셀 배경이 칸을 채우지 못해 표처럼 보이지 않는다.

---

## 4-1. 모바일 열 배치

표를 모바일에서 세로로 풀면 **라벨 하나가 화면 한 줄을 통째로 쓴다.** 40문항 답안지는 한 문항이 4줄이 되어 160줄이 된다. 값이 짧을수록 낭비가 크다.

### 규칙 — 내용으로 정한다

| 내용 | 모바일 | 이유 |
|---|---|---|
| 짧은 수치·라벨 (6자 이내) | **2·3·4열** | 한 화면에서 비교된다 |
| 지표 카드 (라벨 + 숫자) | **2·3열** | 세로로 쌓을 이유가 없다 |
| 문장·설명 | **1열** | 줄바꿈이 잦으면 못 읽는다 |
| 입력 폼 | **1열** | 필드 길이가 제각각이면 오히려 느려진다 |
| 라디오·체크박스 그룹 | **1열** | 44px 터치 영역을 확보해야 한다 |
| 표 전체·차트 | **1열** | 가로 폭이 필요하다 |
| 배너·이미지 | **1열** | 반으로 줄이면 글자가 안 보인다 |

### 지표 묶음 — `user-metric-pairs`

표의 한 행을 모바일에서 펼칠 때 쓴다. 라벨을 값 위에 올려 **데스크톱 표의 머리글–본문 구조를 그대로 유지**한다.

```tsx
<div className="px-4 py-3">
  <p className="user-metric-heading">형사법</p>
  <dl className="user-metric-pairs mt-3" data-cols="4">
    <div><dt>내 답</dt><dd>3</dd></div>
    <div><dt>정답</dt><dd>2</dd></div>
    <div><dt>결과</dt><dd data-tone="negative">오답</dd></div>
    <div><dt>정답률</dt><dd>72.5%</dd></div>
  </dl>
</div>
```

**행머리도 가운데다.** 과목명·총점은 데스크톱 표에서 행의 첫 칸이며 `data-table`이 가운데로 놓는다. 모바일에서만 좌측으로 두면 같은 데이터가 화면 폭에 따라 다르게 정렬된다. `user-metric-heading`(14px/700)을 쓰고, 값(14px/600)보다 무겁게 두어 위계를 준다.

```
라벨(dt)   12px / 500 / #777777
값(dd)     14px / 600 / #222222 / tabular-nums
열         data-cols="2" (기본) · "3" · "4"
간격       가로 8px / 세로 12px
가로 정렬   가운데 — 표 셀과 같다
세로 정렬   가운데 — 한 줄에서 가장 높은 칸에 맞춰 늘어난 뒤 가운데로 모인다
```

**`grid`가 아니라 `flex-wrap`이다.** 항목 수가 열 수로 나누어떨어지지 않을 때(5개를 3열에) `grid`는 마지막 줄을 왼쪽에 붙이고 오른쪽 칸을 비운다. 그러면 덩어리가 왼쪽 아래로 처져 보인다. `flex`는 남은 줄을 가운데로 모은다. 줄이 꽉 찰 때의 칸 너비는 `grid`와 같으므로 다른 경우는 달라지지 않는다.

한 줄 안의 칸은 가장 높은 칸에 맞춰 늘어난다(`align-items: stretch`). 그때 `justify-content: center`가 없으면 짧은 칸의 글자가 위로 붙어 옆 칸과 축이 어긋난다.

**항목 수에 맞춘 열 수**

| 항목 수 | `data-cols` | 360px 칸폭 | 줄 배치 |
|---|---|---|---|
| 2 | `2` | 175px | 2 |
| 3 | `3` | 114px | 3 |
| 4 | `2` 또는 `4` | 175px / 84px | 2+2 · 4 |
| 5 | `3` | 114px | 3+2 — **둘째 줄은 가운데** |

**값의 색은 `data-tone`으로 준다.** `dd`에 색 클래스를 붙이지 않는다.

| `data-tone` | 색 | 용도 |
|---|---|---|
| (없음) | `#222222` | 기본 |
| `positive` | `#047857` | 정답·득점 |
| `negative` | `#be123c` | 오답·실점 |
| `accent` | `var(--service-700)` | 직렬 강조값 |
| `muted` | `#9c9c9c` | 집계 중·미확정 |

### 넘침 한계 (390px Pretendard 실측)

라벨은 **6자 이내**로 쓴다. 길어지면 줄이 바뀌어 옆 칸과 값의 높이가 어긋난다. 라벨에 괄호 보조 설명을 넣지 말고 값에 넣는다 — `선발인원` + `1200명 (2배)`이지 `선발인원 (합격배수)`가 아니다.

큰 숫자를 3열에 넣을 때는 글자 크기를 확인한다. 360px에서 3열 카드의 안쪽 폭은 **84px**뿐이라 `font-black` 20px은 `12,345명`(85px)에서 줄이 바뀐다. 18px이면 77px로 들어간다.

---

## 5. 탭 — 3단계 위계

탭은 세 가지 목적으로 쓰이고, 각각 무게가 다르다. **섞지 않는다.**

### 1단계 — 메인 네비게이션

다크바(`#0a0a0a`) 위 16px / 700. 서비스 전체를 나누는 최상위 이동이다.

### 2단계 — 콘텐츠 탭 `user-content-tabs` / `user-content-tab`

화면 안의 큰 구획을 나눈다. 폴더 형태다.

```
비활성   bg #f3f3f5 / 테두리 #d6d6dc / 하단만 주색 1px / 16px 400 / #777777
활성     bg #ffffff / 테두리 주색 1px / 하단 테두리 없음 / 16px 700 / #0a0a0a / z-index 10
여백     padding 19px 16px 22px  (활성은 하단 23px — 테두리 1px 만큼 보정)
```

동작 원리가 중요하다. **컨테이너에 선을 긋지 않는다.** 비활성 탭들이 각자 하단선을 갖고, 활성 탭만 그 선이 없다. 이렇게 해야 `overflow` 클리핑이 있어도 활성 탭 자리가 확실히 비워진다.

활성 탭에 `z-index: 10`이 필요하다. 탭이 `-1px`씩 겹쳐 있어 이게 없으면 이웃 탭의 회색 테두리가 활성 탭의 주색 테두리를 덮는다.

적용 위치: 내 성적 분석(내 성적/시험 분석/문항 분석), 응시정보 입력(응시정보/OMR), 합격 예측(합격 예측/경쟁자 순위), 풀서비스 메인(채용유형)

### 3단계 — 필터 탭 `user-filter-tab`

섹션 안에서 대상을 고른다. 밑줄 형태로 2단계보다 가볍다.

```
14px / 600 / #6b6b6b / min-height 40px / 하단 2px
활성: 하단 주색 / 글자 주색 / 700
```

적용 위치: 과목 선택, 성적분포 선택, OMR 과목 탭

---

## 6. 배지와 상태

### 난이도 배지 `user-level-badge`

```tsx
<span className="user-level-badge" data-level="easy">쉬움</span>
```

12px / 700 / 각진 모서리. 색은 **체감난이도 차트와 같은 순서형 스케일**을 쓴다. 같은 개념이 화면마다 다른 색으로 나오면 안 된다.

| 단계 | 배경 | 글자 |
|---|---|---|
| `easy` | `#e7f2f0` | `#0f766e` |
| `normal` | `#f3f3f5` | `#6b6b6b` |
| `hard` | `#fdf1e2` | `#b45309` |
| `veryhard` | `#fdeceb` | `#c02626` |

### 안내 문구

한 화면에 스타일이 다른 안내 박스를 여러 개 두지 않는다. 좌측 2px 경계(`border-l-2`) + 옅은 배경 **한 가지 형태**로 통일하고, 개별 수치에 대한 단서는 그 수치 옆 툴팁으로 붙인다.

---

## 7. 차트

- 순서가 있는 값(난이도)은 **단색이 아니라 순서형 스케일**을 쓴다. 전부 같은 파랑이면 순서가 안 읽힌다.
- Y축을 0~100%로 못 박지 않는다. 최댓값이 40%대인데 축이 100%면 위 절반이 빈 공간이 된다.
- 축·격자·툴팁 색은 중립 스케일을 쓴다 (`#e8e8ec`, `#9c9c9c`, `#6b6b6b`).
- 차트 라벨은 SVG라 CSS 클래스가 안 먹는다. `style={{ fontSize: "var(--user-chart-label-size)" }}`처럼 **토큰을 참조**한다.

---

## 8. 이 가이드를 지키는 법

### 인라인으로 덮지 않는다

토큰 클래스가 소유한 속성을 컴포넌트에서 다시 지정하면 안 된다.

```tsx
// 안 됨 — 이 표만 다른 표와 어긋난다
<table className="data-table text-sm">
<h2 className="user-section-title text-xl font-bold">
<td className="px-4 py-3 text-right border-b">

// 맞음
<table className="data-table">
<h2 className="user-section-title">
<td className="tabular-nums num-right">
```

지금은 CSS 우선순위가 이기지만, **Tailwind 출력 순서가 바뀌면 언제든 뒤집힌다.** 실제로 이 방식으로 59개 클래스가 규격을 덮고 있었다.

### 미디어쿼리로 규격을 다시 정하지 않는다

`@media`에서 표나 제목 크기를 키우면 데스크톱에서만 어긋난다. 미디어쿼리에는 **버튼 크기·입력창·프레임 폭·차트 라벨**만 둔다.

### `!important`를 쓰지 않는다

specificity를 무시하고 이기므로 위 규칙이 손쓸 수 없게 된다. 예외는 외부 HTML(프로모션 랜딩)의 스타일을 이겨야 하는 경우뿐이다.

### 점검 명령

```bash
pnpm --dir ./apps/score-predict typecheck
pnpm --dir ./apps/score-predict lint
pnpm --dir ./apps/score-predict test:tenant-isolation
```

`test:tenant-isolation`은 공유 컴포넌트에 `police-*` / `fire-*` 색이 들어가면 실패한다.

---

## 9. 관리자 화면 적용

관리자 화면은 사용자 합격예측 화면과 **같은 제품 UI**다. 정보 밀도는 더 높지만 별도의 색·글꼴·모서리 언어를 만들지 않는다.

- `.admin-shell`이 사용자 화면과 같은 Pretendard 글꼴, 중립 스케일, `service-*` 팔레트를 소유한다.
- 페이지 배경과 데이터 표면은 흰색이다. 관리자 본문에서는 카드 껍데기를 제거하고 영역을 상단 1px 구분선과 섹션 간격으로 나눈다. 예외는 모달·팝오버·업로드 슬롯·편집기·상태 알림이다.
- 사이드바는 사용자 메인 네비게이션과 같은 `#0a0a0a`를 쓴다. 활성 항목만 `service-*`로 표시한다.
- 사이드바에는 대시보드와 큰 업무 구역만 둔다. 시험 운영·참여자 관리·콘텐츠 관리의 세부 메뉴는 각 업무 페이지 상단의 `.admin-content-tabs`로 이동한다. URL과 권한 경계는 바꾸지 않는다.
- 관리자 탭은 사용자 풀서비스 메인의 공채·경채 탭과 같은 폴더형 규격을 그대로 쓴다. 비활성은 중립 배경과 서비스색 하단선, 활성은 흰 배경·서비스색 외곽선·굵은 검정 글자이며 하단선을 비워 현재 콘텐츠와 연결한다. URL 탭은 `aria-current="page"`, 내부 전환 버튼은 `aria-selected="true"`로 활성 상태를 노출한다.
- 제목 위계는 사용자 화면과 동일하게 20px / 16px / 15px이다. 관리자라고 제목을 24px 이상 키우지 않는다.
- 본문은 15px, 라벨과 표는 13px이다. `text-xs`와 `text-sm`을 페이지마다 임의 조합해 밀도를 만들지 않는다.
- 모든 관리자 표는 `data-table`과 같은 13px, `14px 10px` 셀 여백, `#dddddd` 격자, `service-100` 컬럼 머리를 쓴다.
- 입력·셀렉트·기본 버튼은 44px, 표 안의 조밀한 행동은 36px이다. 포커스 링은 `service-600`을 쓴다.
- 카드 모서리는 0이다. 페이지 흐름 안에는 그림자를 쓰지 않고, 팝오버·모달에만 깊이를 허용한다.
- 성공·경고·오류는 각각 emerald·amber·rose 의미색을 유지하되 형태는 좌측 2px 상태선 하나로 통일한다.
- 모바일에서는 넓은 표만 자기 컨테이너 안에서 가로 스크롤한다. 페이지 자체의 가로 스크롤은 0이어야 한다.

관리자 화면의 계산, 권한, 저장, 공개 상태, 업로드, HTML 정제 로직은 디자인 작업의 대상이 아니다. 시각 변경 때문에 이 동작을 약화하거나 우회하지 않는다.

---

## 9-1. 이 가이드가 적용되지 않는 곳

두 영역은 **의도적으로 다른 시각 언어**를 쓴다. 여기 규칙을 옮겨오지 않는다.

**① 프로모션 랜딩** — 관리자가 등록하는 `HTML/CSS 자유 랜딩`. 캠페인마다 색·타이포가 다르며 제품 UI와 분리된 마케팅 표면이다. `iframe`으로 격리되고 높이는 `ResizeObserver`로 맞춘다. `body`는 `display: flow-root`로 두어 자식 마진이 밖으로 새지 않게 한다.

**② 히어로·마케팅 블록** — 랜딩 최상단의 큰 제목은 `user-overview-title` 등 고유 클래스로 이 문서의 타이포 스케일에서 제외한다.

---

## 10. 소방 적용

경찰 화면을 확정한 뒤 소방에 옮길 때는 **파일을 그대로 복사하면 된다.**

컴포넌트에 하드코딩된 직렬 색이 0건이고 전부 `service-*` 토큰이므로, `<body data-tenant="fire">` 하나로 빨간 팔레트로 전환된다.

주의할 것은 색이 아니라 **시험 규칙**이다. 과목·배점·과락·필기 배수·시험유형은 `lib/police/`와 `lib/fire/`가 각각 소유하며 **절대 공유하지 않는다.** 화면만 공통이고 계산은 분리다.

---

## 11. 구현 위치

모든 토큰은 `src/app/globals.css` 한 파일에 있다. 값을 바꾸려면 여기만 고친다.

| 대상 | 셀렉터 |
|---|---|
| 중립 스케일 | `.public-product-shell` 안의 `--color-slate-*` |
| 페이지 배경 | `.public-product-shell { background }` + `<body className="bg-white">` (`src/app/layout.tsx`) |
| 경찰 팔레트 | `body[data-tenant="police"]` |
| 소방 팔레트 | `body[data-tenant="fire"]` |
| 타이포 | `.user-page-title` / `.user-section-title` (+`::before`) / `.user-card-title` / `.user-data-label` / `.user-metric-hero` |
| 표 | `.data-table` / `.data-table th, td` / `thead th` / `tbody th` / `tbody td` / `.num-right` |
| 의사 테이블 | `.user-data-rows` / `.user-overview-metric-row` `-label` `-value` / `.user-overview-table-heading` / `.data-list-flat` |
| 모바일 지표 묶음 | `.user-metric-pairs` / `[data-cols]` / `dt` / `dd` / `dd[data-tone]` |
| 모바일 카드 행머리 | `.user-metric-heading` |
| 콘텐츠 탭 | `.user-content-tabs` / `.user-content-tab` / `[aria-selected="true"]` |
| 필터 탭 | `.user-filter-tab` / `[aria-selected="true"]`, `[data-active="true"]` |
| 배지 | `.user-level-badge` / `[data-level="…"]` |
| 프레임 | `.user-content-frame` |
| 라운드 무력화 | `.rounded` / `-sm` / `-md` / `-lg` / `-xl` / `-2xl` / `-3xl` + 방향형 → `border-radius: 0` (`rounded-full` 제외) |
| 관리자 전체 | `.admin-shell` |
| 관리자 콘텐츠 프레임 | `.admin-content-frame` |
| 관리자 타이포 | `.admin-shell h1` / `h2` / `h3` / `.text-sm` / `.text-xs` |
| 관리자 표 | `.admin-shell table` / `th` / `td` |
| 관리자 폼 | `.admin-shell input` / `select` / `textarea` / `button` |
| 관리자 탭 | `.admin-content-tabs` / `.admin-content-tab` |
| 관리자 상태 | `.admin-status-strip` |

메뉴바 아래 100px 여백은 CSS가 아니라 두 곳의 컴포넌트에 있다. **한쪽만 고치면 진입 경로에 따라 간격이 달라진다.**

- `src/app/exam/layout.tsx` — `/exam/*` 직접 접속
- `src/components/landing/ExamFunctionArea.tsx` — 랜딩의 다크 네비 경로

---

## 12. 자가 점검

작업 후 아래를 돌려 **전부 0건**인지 확인한다. 하나라도 0이 아니면 그 화면만 다른 화면과 어긋난 상태다.

```bash
cd apps/score-predict
D="src/app/exam src/components/prediction src/components/exam src/components/landing src/components/result"
A="src/app/admin src/components/admin"

# 표 셀에 레이아웃·크기를 인라인으로 지정했는가
# className="…" 과 className={`…`} 을 모두 본다. 큰따옴표만 보면 백틱 안의 위반을 놓친다.
grep -rhoE '<t[dh] className=(\{`|")[^"`]*(p[xy]-[0-9]|text-(left|center|right)|text-(xs|sm|base|lg)|border-[bt])' $D --include=*.tsx | wc -l

# thead 에 인라인 스타일이 남았는가
grep -rn -A1 '<thead' $D --include=*.tsx | grep -cE '<tr className|<thead className="[^"]*bg-'

# 제목에 인라인 크기를 지정했는가
grep -rhoE '<h[1-6] className="text-(xs|sm|base|lg|xl|2xl)' $D --include=*.tsx | wc -l

# 모바일 목록이 라벨↔값을 한 줄에 하나씩 세로로 쌓는가 (→ user-metric-pairs)
grep -rh -A1 'justify-between gap-4' $D --include=*.tsx | grep -c 'className="text-slate-500"'

# user-metric-pairs 자식에 클래스를 붙였는가 (색은 dd 의 data-tone 으로 준다)
grep -rh -A14 'user-metric-pairs' $D --include=*.tsx | grep -cE '<(dt|dd) className='

# 컴포넌트에 직렬 색을 하드코딩했는가
grep -roE '(bg|text|border|ring)-(police|fire)-[0-9]+' $D | wc -l

# 문서형이어야 할 곳에 카드 껍데기가 남았는가
grep -ro 'rounded-xl border border-slate-200 bg-white p-5 sm:p-6' $D | wc -l

# 미디어쿼리가 표/제목 크기를 다시 정하는가
grep -A3 '@media' src/app/globals.css | grep -cE 'data-table[^}]*font-size|user-(page|section|card)-title[^}]*font-size'

# CSS 에 !important 선언이 있는가 (세미콜론이 붙은 것만 실제 선언이다)
grep -c '!important;' src/app/globals.css

# 관리자 컴포넌트에 직렬 색을 하드코딩했는가
grep -roE '(bg|text|border|ring)-(police|fire)-[0-9]+' $A | wc -l

# 관리자 화면에 24px 이상 페이지 제목이 남았는가
grep -rhoE '<h1 className="[^"]*text-(2xl|3xl|4xl|5xl)' $A --include=*.tsx | wc -l
```

빌드 검증:

```bash
pnpm --dir ./apps/score-predict typecheck
pnpm --dir ./apps/score-predict lint
pnpm --dir ./apps/score-predict test:tenant-isolation
```

---

## 13. 새 화면을 만드는 순서

1. **§0-1 결정표**에서 만들려는 요소를 찾는다. 있으면 그 클래스를 쓰고 끝낸다.
2. 없으면 **가장 가까운 기존 요소**를 찾아 그 규격을 따른다. 새 크기·새 색을 만들지 않는다.
3. 그래도 필요하면 `globals.css`에 **토큰으로 추가**하고 이 문서에 적는다. 컴포넌트에 인라인으로 넣지 않는다.
4. §12 자가 점검을 돌린다.
5. 390px·768px·1280px에서 실제 브라우저로 확인한다.

> 3번이 이 문서가 존재하는 이유다. 컴포넌트에 값을 직접 쓰기 시작하면 다음 사람은 그 값이 규격인지 예외인지 알 수 없고, 그때부터 화면이 갈라진다.
