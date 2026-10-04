# score-predict — Agent Rules

> 공통 규칙은 저장소 루트 `AGENTS.md`를 따른다. 이 문서는 이 앱에만 해당하는 추가 규칙이다.
> Claude·Codex 등 모든 에이전트에 동일하게 적용된다.

---

## 1. UI 작업 전 반드시 읽을 것

**`apps/score-predict/DESIGN.md`**

이 문서는 참고 자료가 아니라 **구속력 있는 명세**다. 크기·여백·색·정렬의 실제 값과, 요소별로 어떤 클래스를 써야 하는지가 들어 있다.

작업 순서는 `DESIGN.md` §13에 있다. 요약하면:

1. `DESIGN.md` §0-1 **결정표**에서 만들려는 요소를 찾는다 → 있으면 그 클래스를 쓰고 끝낸다
2. 없으면 가장 가까운 기존 요소의 규격을 따른다
3. 그래도 필요하면 `src/app/globals.css`에 **토큰으로 추가**하고 `DESIGN.md`에 기록한다
4. `DESIGN.md` §12 **자가 점검**을 돌린다 (전부 `0`이어야 한다)
5. 390px·768px·1280px에서 실제 브라우저로 확인한다

### 절대 하지 말 것

- 컴포넌트에서 토큰 클래스가 소유한 속성을 인라인으로 덮기
  ```tsx
  // 안 됨
  <table className="data-table text-sm">
  <h2 className="user-section-title text-xl font-bold">
  <td className="px-4 py-3 text-right border-b">
  ```
  지금은 CSS 우선순위가 이기지만 Tailwind 출력 순서가 바뀌면 뒤집힌다.
- `@media` 안에서 표·제목 크기를 다시 정하기 (데스크톱에서만 어긋난다)
- `!important` 쓰기 (외부 HTML을 이겨야 하는 프로모션 프레임만 예외)
- 컴포넌트에 `police-*` / `fire-*` 색 하드코딩 → `service-*` 토큰만 쓴다

---

## 2. 직렬 분리 — 화면은 공통, 계산은 분리

경찰과 소방은 **회원·인증·시험·성적·계산식을 절대 공유하지 않는다.** 공통으로 쓰는 것은 화면 UI뿐이다.

| 구분 | 처리 |
|---|---|
| 화면 컴포넌트 | 공통. 직렬 차이는 `TenantConfig`(`src/lib/tenant.ts`)의 문구·플래그로 주입 |
| 색상 | `service-*` 토큰 + `<body data-tenant>` |
| 과목·배점·과락·필기 배수·시험유형 | `src/lib/police/` 와 `src/lib/fire/` 가 각각 소유 |
| DB | `score_predict_police` / `score_predict_fire` 별도 스키마 |

- API 라우트는 **호스트로 직렬을 판별해 해당 핸들러 하나만** 호출하는 얇은 진입점이어야 한다.
- 경찰 핸들러가 `lib/fire/*`를, 소방 핸들러가 `lib/police/*`를 import하면 안 된다.
- 예외로 `src/lib/tenant-calculations.server.ts`와 `src/lib/tenant-regions.ts`는 디스패처라 양쪽을 import한다.
- OMR·결과·성적분석·합격예측·최종예측 **화면은 직렬별 파일을 유지한다.**

`src/proxy.ts`가 호스트↔경로 불일치(421), 타 직렬 세션(401), 관리자 경로를 이미 차단한다. 이 방어를 약화시키지 않는다.

---

## 3. 검증

UI를 바꿨으면 아래를 모두 통과해야 한다.

```bash
pnpm --dir ./apps/score-predict typecheck
pnpm --dir ./apps/score-predict lint
pnpm --dir ./apps/score-predict test:tenant-isolation
```

`test:tenant-isolation`은 공유 컴포넌트의 직렬색 누수와 계산 모듈 교차 import를 검사한다. 실패하면 통과할 때까지 고친다.

계산 로직을 건드렸다면 추가로:

```bash
pnpm --dir ./apps/score-predict verify:calculations
```

---

## 4. 운영 중 주의

- 시험 회차 운영 중에는 구조 리팩터링을 배포하지 않는다. 시험 종료 직후가 제출·채점 트래픽 최대 구간이다.
- 운영 단계 전환(`PRE_REGISTRATION` → `SCORING_OPEN` 등)은 관리자 화면에서 하며 **코드 배포가 필요 없다.**
- 배포는 커밋 메시지에 `[deploy score-predict]` 태그가 있어야 트리거된다. 동결 기간에는 태그를 넣지 않는다.
- 빌드는 마이그레이션을 실행하지 않는다. DB 변경은 별도로 적용한다.
