# 교재·자료 수정 독립 테스트 리뷰

검토일: 2026-09-05. 대상: 기존 리뷰 C1/C2, C3/C4, D4/D5/D6.

## 최종 재검토 판정

T1/T2는 구현 변경 대조와 동일 회귀 테스트 재실행으로 **해결됨**을 확인했다. 현재 지정 테스트/행동 검토 범위에서 추가 필수 결함은 발견하지 못했다. 전체 집중 묶음 최신 실행은 **31 passed, 0 failed**, exit 0이다. 실제 휴대폰 카메라·운영 DB·전체 빌드를 확인했다는 의미는 아니다.

## 지적 항목과 해결 증거

### T1 / P2 / 해결됨 — 시작 중이던 카메라가 모드 전환 후 완료되면 QR 재진입이 동작하지 않음

- 실제 `StaffScanPage`와 두 패널을 렌더링한 테스트로 재현했다. 카메라 하드웨어 시작 Promise만 지연했다.
- 순서: 최초 `Html5Qrcode.start()` 대기 → `수동 배부` 클릭 → 이전 카메라 시작 완료 → `QR 스캔` 클릭 → QR 콜백 호출.
- 수정 전 기대: 새 QR 조회 POST 1건. 실제: 0건. 학생 오기록은 이 재현에서 발생하지 않았고, QR 조회가 막혔다.
- 수정 전 원인: 비동기 `start()` 뒤에 세대 검사가 없어, 이미 중지된 세대의 scanner가 `scannerRef`에 저장됐다. 이후 ref 존재 검사가 재시작을 생략하고 이전 콜백은 세대 검사에 의해 폐기됐다.
- 해결 대조: `src/app/(staff)/scan/page.tsx:445`의 세대 함수, `:523` 및 `:552`의 시작 완료 후 검사·중지, `:575`/`:581`의 오류·finally 보호를 확인했다. readiness/import/getCameras 후 검사와 `:286`의 늦은 stop 정리 보호도 포함됐다.
- 최신 재현 결과: 모드 복귀 후 새 QR 조회 POST가 정확히 1건 생성되고 `{ token: 'student-A-late-camera-token', courseId: 8 }` 본문이 일치한다.
- 회귀 테스트 추가: `tests/distribution/staff-session.test.tsx:319` — `returning to QR after a late camera startup in phone mode attaches a usable camera callback`.

### T2 / P2 / 해결됨 — URL QR 토큰 처리 후 실제 직원 페이지가 아닌 경로로 이동

- 수정 전 코드는 토큰을 제거하며 `/police/staff/scan`으로 이동했다. 실제 페이지 경로는 `/police/scan`이고 로그인 기본 이동도 `src/app/staff/login/page.tsx:74`에서 `/scan`을 사용한다.
- 실제 페이지를 `token=student-A-url-token`으로 렌더링해 조회 POST 본문 및 router.replace 인자를 검증했다.
- 수정 전 기대: `['/police/scan']`. 실제: `['/police/staff/scan']`.
- 해결 대조: 현재 `src/app/(staff)/scan/page.tsx:910`의 replace 대상은 `withTenantPrefix('/scan', tenant.type)`이며, 동일 테스트에서 `['/police/scan']`을 확인했다.
- 기존부터 존재한 코드지만 QR 진입 흐름 검증에 필요하다. 이 검토자는 라우터 호출까지 재현했으며 HTTP 404 브라우저 증거는 루트 검토자가 별도로 담당한다.
- 회귀 테스트 추가: `tests/distribution/staff-session.test.tsx:331` — `QR token URL cleanup stays on the tenant scan route`.

## 기존 테스트의 의미와 범위

| 대상 | 확인한 검증 경계 | 판정 범위 |
|---|---|---|
| C1/C2 직원 세션 | 실제 React 페이지·패널, 지연 HTTP 응답, 요청 본문, 같은 tick 중복 클릭, 선택 유지, 일부 성공 제거, 잘못된 토큰, 강좌 bootstrap 대기 | 상태 로직을 테스트 안에 복제한 것이 아니다. 카메라 시작이 즉시 완료되는 기존 mock 때문에 T1은 누락됐다. |
| C3/C4 관리자 표 | 실제 `course-students-page-client`·표 컴포넌트, 늦은 이전 탭 응답, 저장 후 network/malformed 응답 유실, 서버 상태 재조회, 재조회 실패 시 쓰기 차단·같은 탭 재시도로 복구 | 실제 UI와 HTTP 경계 테스트다. 현재 조사 범위에서 추가 필수 결함을 찾지 못했다. |
| D4 페이지 조회 | 실제 receipt-matrix GET·데이터 함수, 1,200행/페이지 상한 300 및 1,000, 실제 offset 이동, 후속 페이지 오류 | 낮은 반환 상한에서 빈 마지막 페이지까지 조회하는 회귀를 검증한다. 실제 PostgREST·테넌트 필터 실행 자체의 증거는 아니다. |
| D5 quick 조회 | 실제 quick POST·selection service, RPC 호출 수 | 자료 한 개 및 빈 materialIds 조회에서 쓰기 0건, 명시 materialId에서 1건을 검증한다. |
| D6 저장 후 오류 | 실제 service·manual/quick/assignment/material DELETE 라우트, RPC/캐시/후속 조회 실패 주입. 관리자 실제 페이지에서 수동 배부·수령 취소의 응답 유실/캐시 경고도 검증 | 부분 저장 목록 유지, 저장 성공과 refreshRequired 구분, RPC의 저장 시각 유지가 검증된다. 관리자 화면은 저장·취소 후 조회 상태로 복구한다. DB 원자성 자체는 별도 로컬 통합 검증 담당이다. |

## 실행 증거

최초 지정 집중 테스트 7개 파일은 **27 passed, 0 failed**, exit 0이었다.

```text
pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --require ./tests/_setup/react-jsx.cjs --test tests/distribution/staff-session.test.tsx tests/distribution/staff-quick-route.test.ts tests/distribution/committed-results.test.ts tests/distribution/receipt-matrix-pagination.test.ts tests/distribution/material-data-pagination.test.ts tests/distribution/material-api-commit.test.ts tests/admin/material-matrix-races.test.tsx
```

T1을 먼저 메모리에서 추가해 재현한 뒤, 루트 승인으로 T1/T2 두 테스트와 필요한 카메라/라우터 경계 설정만 실제 테스트 파일에 추가했다. 구현 수정 전 직원 테스트 재실행 결과는 **13 passed, 2 failed**, exit 1이었다. 실패는 위 T1/T2와 일치했다.

```text
pnpm exec tsx --require ./tests/_setup/stub-server-only.cjs --require ./tests/_setup/react-jsx.cjs --test tests/distribution/staff-session.test.tsx
```

구현 수정 후 새로 실행한 결과:

1. `staff-session.test.tsx` + `staff-quick-route.test.ts` + `material-matrix-races.test.tsx`: **26 passed, 0 failed**, exit 0. 직원 19건과 관리자 7건(부모 테스트 1건 + 하위 시나리오 6건)이다.
2. 위에 기록한 집중 테스트 7개 파일 전체: **31 passed, 0 failed**, exit 0. T1/T2 및 관리자 추가 시나리오 2건을 포함한다.

오류 로그의 `fixture cache failure`, `injected postcommit cache failure`, `fixture later page failure`는 의도한 실패 주입이며 해당 테스트는 모두 통과했다. 수정 전 실패 → 수정 후 같은 assertion 통과를 확인했고, 테스트 기대값을 낮추지 않았다.

## 작업 경계

- `class-pass-review`의 테스트 검토 역할에 한정했다. 설계 02/03 누락은 이미 승인된 대로 설계 일탈 대조를 생략했다.
- 제품 소스·DB·운영 환경은 수정하지 않았다. 공유 작업 트리의 다른 변경을 유지했다.
- 변경 파일은 본 보고서와 승인된 `tests/distribution/staff-session.test.tsx`뿐이다.
- 이번 재검토에서는 본 보고서만 갱신했다. 다른 작업자의 제품 코드·관리자 추가 테스트는 읽고 실행만 했다.
- 실제 휴대폰 카메라·권한 대화상자·광학 QR 인식은 검증하지 않았다. 인증/RLS/DB 동시성·전체 빌드 결과를 이 집중 테스트로 대체하지 않는다.
