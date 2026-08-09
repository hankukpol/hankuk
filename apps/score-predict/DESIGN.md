# Score Predict Design System

## 1. Atmosphere / signature

한국경찰학원과 소방 합격예측의 기존 운영 화면을 보존한다. 정보 밀도가 높은 수험 대시보드이며, 밝은 회색 배경과 흰색 카드, 진한 헤더를 공유한다. 서비스 강조색은 경찰 블루와 소방 레드로 분리하여 사용자·관리자 화면 전체에서 현재 서비스를 즉시 식별할 수 있게 한다. 구조와 상태 표현은 동일하게 유지한다.

Design Read: 수험생과 운영자를 위한 실시간 성적 대시보드, 기존 학원 서비스 언어, 안정적이고 직접적인 운영 UI.

- `DESIGN_VARIANCE`: 1
- `MOTION_INTENSITY`: 1
- `VISUAL_DENSITY`: 7

## 2. Color

기본 색은 `src/app/globals.css`와 `tailwind.config.ts`가 구현 원본이다.

- `--background`: `oklch(1 0 0)`, 기본 화면 배경
- `--foreground`: `oklch(0.145 0 0)`, 기본 본문
- `--card`: `oklch(1 0 0)`, 카드
- `--muted`: `oklch(0.97 0 0)`, 보조 배경
- `--muted-foreground`: `oklch(0.556 0 0)`, 보조 본문
- `--border`: `oklch(0.922 0 0)`, 기본 경계선
- `--ring`: `oklch(0.708 0 0)`, 포커스 링
- `--destructive`: `oklch(0.577 0.245 27.325)`, 오류·삭제
- 경찰 `--service-50~950`: `#eff6ff`, `#dbeafe`, `#bfdbfe`, `#93c5fd`, `#60a5fa`, `#3b82f6`, `#2563eb`, `#1d4ed8`, `#1e40af`, `#1e3a8a`, `#172554`
- 소방 `--service-50~950`: `#fef2f2`, `#fee2e2`, `#fecaca`, `#fca5a5`, `#f87171`, `#ef4444`, `#dc2626`, `#b91c1c`, `#991b1b`, `#7f1d1d`, `#450a0a`
- `--service-50`: 서비스 강조 배경
- `--service-100`: 서비스 강조 hover
- `--service-200`: 서비스 강조 경계
- `--service-300~500`: 어두운 서비스 배경의 보조 글자·아이콘
- `--service-600`: 기본 버튼·선택 상태
- `--service-700`: 강조 버튼·관리자 내비게이션
- `--service-950`: 관리자 외곽 배경
- `--header`: `#111111`, 공개 헤더
- `--chart-grid`: `#e2e8f0`, 차트 격자
- `--chart-tick`: `#64748b`, 차트 눈금
- `--chart-tick-muted`: `#94a3b8`, 보조 차트 눈금
- `--chart-mine`: `#2563eb`, 사용자 위치
- `--chart-series`: `#0ea5e9`, 기본 분포 막대
- `--chart-sure`: `#16a34a`, 확실권 추이
- `--chart-possible`: `#f97316`, 가능권 추이
- `--predict-safe`: `#0f766e`, 합격 안전권
- `--predict-likely`: `#1d4ed8`, 합격 유력권
- `--predict-possible`: `#d97706`, 합격 가능권
- `--predict-challenge`: `#dc2626`, 도전권

중립색과 상태색은 공유하되 서비스 강조색은 공유하지 않는다. `service-*` 유틸리티는 현재 테넌트 CSS 변수만 참조하며, 공통 컴포넌트에서 `fire-*` 또는 `police-*`를 직접 사용하지 않는다. 오류·삭제의 rose, 성공의 emerald, 정답·오답 및 예측 단계의 의미 색상은 서비스 강조색과 별개의 상태 토큰으로 유지한다.

## 3. Typography

- 글꼴: `Noto Sans KR`, `Apple SD Gothic Neo`, `Malgun Gothic`, `sans-serif`
- 큰 제목: `30px`, 700, line-height 1.25
- 섹션 제목: `20px`, 700, line-height 1.4
- 카드 제목: `16px`, 600, line-height 1.5
- 본문: `14px`, 400, line-height 1.6
- 보조 설명: `12px`, 400, line-height 1.5
- 수치 강조: 해당 문맥 크기, 600 또는 700, tabular number 우선

## 4. Spacing

기본 단위는 4px이다.

- `--space-1`: 4px
- `--space-2`: 8px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-5`: 20px
- `--space-6`: 24px
- `--space-8`: 32px
- `--space-10`: 40px
- `--space-12`: 48px
- `--space-16`: 64px
- `--space-20`: 80px

## 5. Components

- 카드: 흰색 배경, slate-200 경계, 12px radius, 16px 또는 24px padding
- 주 버튼: service-600 또는 service-700 배경, 흰색 글자, 명확한 hover·focus·disabled 상태
- 보조 버튼: 흰색 배경, slate-200 경계, slate-700 글자
- 탭: 선택 시 서비스 강조색, 미선택 시 흰색과 slate 경계
- 차트: 흰색 카드, chart-grid 격자, chart-tick 레이블, mine 색은 chart-mine
- 상태: 로딩은 slate, 빈 상태는 amber, 오류는 rose 계열의 기존 표현 유지
- 관리자 내비게이션: service-700 배경, 흰색 활성 글자, service-200~400 보조 글자

모든 인터랙션은 hover, active, focus-visible, disabled 상태를 보존한다.

## 6. Motion

- 기본 전환: 150~300ms ease-out
- 관리자 모바일 사이드바: 기존 300ms transform 전환 유지
- 진행 표시: 기존 500ms 전환 유지
- 새 레이아웃 애니메이션은 추가하지 않는다.
- `prefers-reduced-motion` 환경에서는 비필수 transition과 transform을 제거한다.

## 7. Depth

경계선 중심의 깊이 체계를 사용한다.

- Level 0: 페이지 배경 slate-100
- Level 1: 흰색 카드 + 1px slate-200 경계
- Level 2: 메뉴·팝오버의 기존 `shadow-sm`
- Level 3: 모바일 관리자 패널의 기존 `shadow-lg`

한 화면에서 임의의 추가 그림자나 글래스모피즘을 도입하지 않는다.
