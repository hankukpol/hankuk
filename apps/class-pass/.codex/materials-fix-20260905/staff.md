# 직원 배부 선택 세션 수정 증거

대상: C1 / C2 / D5, 저장 후 캐시 갱신 경고 표시(D6 연계). 작성일 2026-09-05.

## 수정 범위

- `src/app/(staff)/scan/page.tsx`: QR 선택 세션에 강좌·학생·토큰·자료·세대를 고정. 실제 요청 잠금과 학생 선택 잠금을 분리하고 동기 ref로 중복 클릭 차단. 선택 중에는 다음 QR을 받지 않으며, 배부 요청 중 완료·재시작·강좌·모드·로그아웃을 잠금. 이전 요청 결과와 중지한 카메라 콜백은 무시.
- 전화번호 조회와 배부 확정을 별도 동작으로 분리. A 조회 중 B 입력/조회가 시작되면 A 응답과 A finally를 폐기. 배부 시 확인한 전화번호·강좌·자료 스냅샷 사용, 입력과 자료 선택을 잠금.
- 성공한 자료 ID를 단건/전체/오류 응답에서도 재시도 목록에서 제거. 만료/잘못된 QR은 선택을 지우고 새 QR 스캔 안내. 새 강좌 bootstrap이 완료되기 전에는 배부 조회를 시작하지 않음.
- `quick-distribution-panel.tsx`, `qr-distribution-panel.tsx`: 기존 레이아웃/색상 유지, 관련 disabled 상태와 조회/배부 콜백만 보완.
- `scan-page-types.ts`: `warning` / `refreshRequired` 응답 필드 추가.
- `src/app/api/distribution/quick/route.ts`: 자료 선택 없는 요청에 `requireExplicitSelection`을 적용하여 미수령 1건이어도 조회만 수행. 부분 성공 후 NOT_ASSIGNED 응답에서 이미 저장한 자료 ID를 보존. 캐시 갱신 경고를 성공/부분성공 응답에 전달.
- root의 atomic RPC / 캐시 notice 변경과 함께 테스트. 기존 page의 `getUserErrorMessage` 변경 보존. package.json과 공용 테스트 설정은 수정하지 않음.

## RED 확인

실제 `StaffScanPage`, 두 실제 패널을 React/JSDOM으로 렌더링. fetch만 지연 가능한 메모리 응답으로 대체하고 카메라 하드웨어 시작/중지 및 Next 라우팅을 대체. quick route 테스트는 실제 POST와 실제 distribution service를 사용하고 인증/DB/캐시 외부 경계만 메모리 대체.

1. 최초 실행: 직원 React 8/8 실패, quick route 3/3 실패.
   - A 응답 폐기 기대 false, 실제 A 이름 표시 true.
   - 조회 POST에 원치 않는 `materialId: 20` 포함.
   - 한 프레임의 두 번 클릭 후 총 요청 2 기대, 실제 3.
   - QR 한 건 성공 후 B 스캔 차단 기대 총 2, 실제 3.
   - 만료 토큰/부분성공 후 수령 완료 자료가 선택 목록에 남음.
   - quick 미수령 1건 조회에서 `needsSelection` 없음, 실제 저장 경로 실행.
   - NOT_ASSIGNED 부분성공 응답에서 `distributed_materials` 유실.
2. 추가 RED: 중지한 카메라 콜백, 모드 전환 후 요청 총 1 기대, 실제 2.
3. 추가 RED: 저장 후 캐시 warning 응답/화면 표시 3건 실패.
4. 추가 RED: 지연 중인 새 강좌 bootstrap 전에 QR 요청 0 기대, 실제 1.

첫 RED 중 DOM 객체 자체를 assert 출력해 진단 출력이 지연된 실행은 종료하고, 존재 여부 boolean을 검사하도록 테스트만 정리해 8/8의 실제 기능 실패를 재실행 확인했다. 기존 테스트는 수정하지 않았다.

## GREEN 검증

실행 명령:

```powershell
node node_modules/tsx/dist/cli.mjs --require ./tests/_setup/stub-server-only.cjs --require ./tests/_setup/react-jsx.cjs --test tests/distribution/staff-session.test.tsx tests/distribution/staff-quick-route.test.ts tests/distribution/qr-scan-receipt-status.test.ts tests/designated-seat/scan-reliability.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check -- 'src/app/(staff)/scan' 'src/app/api/distribution/quick/route.ts' 'tests/distribution/staff*'
```

결과: **28/28 PASS**, 실패 0, 종료 코드 0. 새 직원 React 13건 + 실제 quick route/service 4건 = 17건. 기존 QR 표시 4건, 지정좌석 회귀 7건 포함. 캐시 오류 주입 테스트의 `Saved result needs refresh` 로그는 의도한 결함 주입 로그이며 HTTP 성공과 경고 반환을 검증한다. 타입 검사 종료 코드 0. scoped diff check 종료 코드 0(LF/CRLF 안내만 출력).

중간 타입 검사에서 동시 작업의 학생명단 `discountAmount` / `discountReason` 중복 오류 2건을 관측했으나 root 변경 반영 후 재실행은 정상 통과.

## 디자인 및 검증 한계

`DESIGN.md`, 프런트엔드 anti-slop, TDD, 완료 전 검증 지침을 적용했다. 직원용 기존 Apple 스타일을 그대로 보존했으며 새 색상·간격·레이아웃을 도입하지 않았다.

DS compliance 전체 파일 검사는 기존 선언되지 않은 색상 9건 때문에 FAIL: `#b42318`, `#19703a`, `#020617`, `#eefaf1`. HEAD 내용과 현 작업 파일의 위반 값 목록이 동일함을 확인했다. 요청된 기능 안정화 범위를 넘는 스타일 변경은 하지 않았다. Windows에서는 제공 검사 스크립트의 직접 실행 진입점이 작동하지 않아 export `checkFiles`를 직접 호출했다. 이를 디자인 시스템 전체 통과로 보고하지 않는다.

실제 브라우저 390/768/1280px 검증은 root의 localhost:3002 QA에서 별도 수행한다. 본 파일은 실제 카메라 인식·실기기·운영 DB 저장·운영 배포 검증을 의미하지 않는다. 직원 권한 추가, QR에서 교재 신규 배정, 운영 데이터 변경, 배포, 커밋, 서버 재시작은 수행하지 않았다.

## 독립 리뷰 후 추가 수정 및 재검증

독립 검토자가 `staff-session.test.tsx`에 추가한 두 실제 React 테스트를 직접 재실행하여 RED 확인:

- `Html5Qrcode.start()` 지연 → 수동 모드 → 이전 시작 완료 → QR 재진입: 기대 POST 1, 실제 0.
- URL의 QR token을 정리하는 경로: 기대 `/police/scan`, 실제 `/police/staff/scan`.

`page.tsx`에서 모든 카메라 비동기 경계(readiness, 동적 모듈, 카메라 목록, start, 최적화)의 세대를 대조한다. 퇴역한 시작 결과는 현재 scannerRef에 넣지 않고 해당 스트림을 중지한다. 퇴역한 catch/finally/stop 완료가 새 카메라 ref, 시작 잠금, 새 DOM을 지우지 못하도록 가드했다. html5-qrcode의 `clear()`는 현재 ID의 DOM을 찾아 지우므로 구세대에서는 호출하지 않는다. 카메라 오류가 활성 배부 처리 상태를 idle로 되돌리지 않게 했다. URL 정리 경로는 실제 `/scan`으로 수정했다.

추가 두 건 포함 직원 실제 React 15건 + quick route/service 4건, **19/19 PASS**, 실패 0, 종료 코드 0. `tsc --noEmit --incremental false` 종료 코드 0, scoped diff check 종료 코드 0.

이후 기존 QR 표시/지정좌석 회귀를 포함한 전체 묶음 **30/30 PASS**를 확인했다. 새 카메라 시작 자체도 세대를 증가시켜, 직전 stop 완료가 새 시작 중인 컨테이너를 지우지 못하게 했다. 이 보강 후 직원 19/19 및 타입 검사/diff check를 다시 통과했다.

### 실제 Chrome UI / 로컬 저장 검증

이 작업자의 CUA에는 IAB가 노출되지 않아 `getTab('4', {browser:'iab'})`는 접근 불가였다. inventory에 보이는 Chrome으로 별도 검증 탭 581025175를 만들고 `http://localhost:3002/police/scan`의 기존 dev-admin 세션을 사용했다. 기존 사용자 탭은 변경하지 않았다.

- 2026-09-05 18:59~19:00 KST: 카메라 권한 수락 없이 QR → 수동 → QR → 수동 버튼을 실제 CUA 클릭. 수동 화면의 휴대폰 입력/학생 조회/배부 선택이 매번 AX 트리에 나타남을 확인. 1920px 스크린샷으로 실제 화면을 확인했다. 이 작업자는 390/768/1280px를 측정했다고 주장하지 않는다.
- 승인된 전용 로컬 fixture: course 75, enrollment 183(교재검증학생), handout 21, textbook 22. 로컬 Docker 컨테이너 `supabase_db_class-pass`, DB `postgres`, schema `class_pass`만 SQL SELECT로 확인했다.
- UI 조회 전: 수령 로그 0행, 교재 22 배정 1행.
- 19:01 KST: 전화번호 01090050905 입력 후 **학생 조회** 클릭. UI에 일반 배부자료 검증(21)과 미배정 교재 검증(22, fixture 이름) 두 선택이 표시되고 배부 처리 버튼은 미선택으로 비활성. 조회 후 SQL 수령 로그는 여전히 0행.
- 19:02:00 KST: 자료 21만 선택하여 **배부 처리** 클릭. UI에 `교재검증학생 · 일반 배부자료 검증 [배부자료] 배부 완료` 표시. SQL에 log 18, enrollment 183, material 21, `2026-09-05 10:02:00.278532+00` 저장 확인.
- root가 별도 관리자 UI에서 교재 22를 10:02:09 UTC에 명시적으로 수령 처리하여 log 19가 생김을 root에게 확인했다. 이 작업자의 요청이 추가 교재를 저장한 것이 아니다. 한 건 남은 조회 검증을 위해 root가 관리자 UI로 교재 22 수령을 취소하는 동안 직원 쪽 쓰기를 중단했다.

로컬 UI의 명시적 자료 21 수령 쓰기는 승인된 fixture에만 수행했다. SQL은 읽기만 수행했다. 운영 DB/배포, 권한 변경, 실기기 카메라 허용/광학 QR 인식은 수행하지 않았다.

### 추가 반응형 화면 확인 (19:07 KST)

위 초기 1920px 확인 이후 CUA가 반환한 브라우저 문서에서 `viewport` capability를 발견하고 `capabilities.list()` → `get('viewport').documentation()`으로 사용법을 확인했다. 해당 API만 사용해 다음 크기로 실제 Chrome 화면을 검증했다.

| 화면 | 실제 DOM innerWidth | clientWidth | scrollWidth | 관찰 |
|---|---:|---:|---:|---|
| 390 × 844 | 390 | 390 | 390 | 수동 모드 버튼/휴대폰 입력/학생 조회/선택 안내가 한 열 안에서 표시, 수평 넘침 없음 |
| 768 × 1024 | 768 | 768 | 768 | 입력과 버튼이 컨테이너 폭 안에 표시, 수평 넘침 없음 |
| 1280 × 900 | 1280 | 1280 | 1280 | 운영 설정/입력/선택 영역 표시, 수평 넘침 없음 |

각 크기에서 실제 AX 트리와 네이티브 스크린샷을 CUA 도구 결과로 확인했다. 레이아웃 치수는 읽기 전용 DOM evaluate로 읽었으며 React 내부 상태는 읽지 않았다. 완료 후 `viewport.reset()`으로 원래 창 크기를 복원했다. QR 광학 인식 및 각 폭의 실제 배부 저장까지 반복한 검증은 아니다.

### 단일 잔여 교재 조회 실증 (19:10 KST)

root의 관리자 UI에서 교재 22 수령 취소 완료 통지를 받은 후 SQL로 직접 재확인했다: 교재 22 배정 1행, 교재 22 수령 0행, 자료 21의 log 18만 유지.

같은 Chrome 직원 화면에서 전화번호 01090050905를 입력해 **학생 조회만** 클릭했다. 실제 AX/스크린샷에 `미배정 교재 검증 [교재] 선택됨` 한 건과 별도의 **배부 처리** 버튼이 나타났다. 해당 버튼은 클릭하지 않았다.

조회 완료 후 SQL 최종 확인: `textbook22_assignment_count=1`, `textbook22_receipt_count=0`. 수령 로그는 기존 material 21의 log 18 한 행뿐이다. 따라서 미수령 교재가 1건인 실제 로컬 흐름에서도 조회는 저장하지 않고 명시적 배부 확정을 기다린다는 것을 UI+저장 데이터로 교차 검증했다.
