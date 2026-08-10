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

글꼴은 `Noto Sans KR`, `Apple SD Gothic Neo`, `Malgun Gothic`, `sans-serif`이다.

| 단계 | 크기 | 클래스 | 굵기 | 용도 |
| --- | --- | --- | --- | --- |
| Display | `48px` | `text-5xl` | 900 | 대시보드 대표 점수, 랜딩 히어로 최대 단계 |
| Hero | `36px` | `text-4xl` | 900 | 랜딩 히어로 중간 단계 |
| 큰 제목 | `30px` | `text-3xl` | 700 | 페이지 제목 |
| 수치 강조 | `24px` | `text-2xl` | 700~900 | 카드 안의 핵심 수치 |
| 섹션 제목 | `20px` | `text-xl` | 700 | 섹션 헤딩 |
| 카드 제목 | `18px` | `text-lg` | 700 | 카드·패널 헤딩 |
| 본문 강조 | `16px` | `text-base` | 600 | 강조 본문, 폼 라벨 |
| 본문 | `14px` | `text-sm` | 400 | 기본 본문 |
| 보조 설명 | `12px` | `text-xs` | 400 | 캡션, 배지, 보조 라벨 |
| 마이크로 라벨 | `10~11px` | `text-[10px]`, `text-[11px]` | 400~700 | 밀도가 높은 대시보드 지표 라벨 전용 |

- line-height는 제목 1.25~1.4, 본문 1.6, 보조 1.5를 기준으로 한다.
- 수치는 크기와 무관하게 `tabular-nums`를 우선한다.
- 마이크로 라벨은 `VISUAL_DENSITY 7`인 실시간 대시보드에 한정한다. 일반 폼과 관리자 표에는 사용하지 않는다. 신규 코드는 `10px`을 기본으로 쓰고 `11px`은 기존 화면 유지 목적으로만 남긴다.
- `36px`·`48px`은 랜딩 히어로와 대시보드 대표 수치에만 쓰고 다른 화면으로 확산하지 않는다.

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

- 카드: 흰색 배경, slate-200 경계, 12px radius(`rounded-xl`)
- 카드 padding: `p-4`(16px) 조밀, `p-5`(20px) 기본, `p-6`(24px) 여유, `p-8`(32px) 강조 섹션. 반응형은 `p-5 sm:p-6`을 기본 패턴으로 한다
- 카드 내부의 작은 상태 박스는 `p-2`(8px), `p-3`(12px)를 사용한다
- radius 위계: 카드·패널은 `rounded-xl`(12px), 배지·중간 컨테이너는 `rounded-lg`(8px), 폼 컨트롤과 작은 버튼은 shadcn 기본값인 `rounded-md`(6px), 아바타·진행바·점은 `rounded-full`. `rounded-2xl`(16px)는 `object-cover` 이미지에만 허용한다
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
- Level 2: 메뉴·팝오버·기본 카드의 `shadow-sm`
- Level 3: 모바일 관리자 패널, 드롭다운 패널의 `shadow-lg`
- Level 4: 모달 다이얼로그와 콘텐츠 위에 뜨는 오버레이 카드의 `shadow-xl`

정지 상태의 깊이는 위 네 단계만 사용한다. 아래 두 가지는 예외로 허용한다.

- hover 상승: `shadow-sm`에서 `hover:shadow-md`로 한 단계만 올린다. 정지 상태에 `shadow-md`를 직접 지정하지 않는다.
- `components/ui`의 shadcn 기본 프리미티브(`button`, `input`)가 쓰는 `shadow-xs`는 기반 레이어이므로 앱 코드에서 덮어쓰지 않는다.

색상이 지정된 그림자(`shadow-slate-900/10` 등), `shadow-2xl`, 글래스모피즘은 도입하지 않는다.
