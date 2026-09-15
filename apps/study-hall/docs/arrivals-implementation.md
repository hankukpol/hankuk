# 등원 체크 구현 계약

사용자 승인 계획(2026-09-15). 로컬 구현 및 검증만. 커밋/푸시/DB 마이그레이션 실행/배포는 별도 승인 전 금지.

## 데이터와 인터페이스

공유 타입/검증/시간 포맷은 `lib/arrivals.ts`. 모든 응답은 JSON이며 오류는 `{ error: string }`. 성공 응답은 아래 타입 그대로이고 fetch cache=no-store.

- GET `/api/[division]/arrival-kiosk`: `{ status: 'ready', numberLength, popupMs }` 또는 `{ status: 'unpaired' | 'pending' | 'expired' | 'disabled', code?: string, expiresAt?: string }`. 초기 화면은 이 API를 호출하며 ready일 때만 번호 입력. pending 때 3초 주기로 확인한다.
- POST `/api/[division]/arrival-kiosk/pair`: 등록 요청을 시작/갱신하며 `{ code, expiresAt }`; 브라우저의 HttpOnly 쿠키에 등록 증명 저장. 등록코드는 이 응답에서만 제공되므로 클라이언트 state/sessionStorage로 표시 가능(수험번호는 저장 금지). 관리자 계정 로그인은 이 기기에서 하지 않는다.
- POST `/api/[division]/arrival-kiosk`: `{ studentNumber: string }` → `{ ok: true, popupMs }`. 학생 신원, 기록 ID, 중복 여부는 반환 금지. 성공만 완료 팝업. 저장중 잠금, 연속 입력, 0 보존.
- GET `/api/[division]/arrivals?date=YYYY-MM-DD`: `ArrivalDayResult`. 오늘이면 재원/휴원 학생 및 해당 날짜 기록 학생 모두 rows에 포함. 과거면 저장된 기록만(취소 포함). UI 기본 '기록 있음'(취소 제외), 오늘 '미기록'. 취소 이력은 학생 상세 달력에서 확인.
- GET `/api/[division]/arrivals?studentId=...&month=YYYY-MM`: `ArrivalMonthResult` (관리자 history 포함).
- POST `/api/[division]/arrivals`: `ArrivalCorrection` → `{ ok: true }`. expectedVersion=0 신규, 취소기록 복구시 기존version. 정정 학생/날짜는 불변. 관리자 등록 검색은 GET `/api/[division]/arrivals/students?q=...` → `{ students: ArrivalStudent[] }`.
- GET `/api/[division]/student/arrivals?month=YYYY-MM`: `ArrivalMonthResult` (history 없음, 학생 본인만).
- GET `/api/[division]/arrival-settings`: `ArrivalSettingsResult`.
- POST `/api/[division]/arrival-settings/preview`: `{ expectedRevision, config }` → `ArrivalSettingsPreview`. 변경 필드는 before/after 비교. 설정 활성화/저장은 이 결과를 먼저 표시한 뒤 사용자 저장 클릭.
- PUT `/api/[division]/arrival-settings`: `{ expectedRevision, config }` → `ArrivalSettingsResult`. 적용일은 오늘 이후. 이전 버전은 남고 미래 적용일 전에는 현재 유효 설정 사용. revision 충돌 409.
- POST `/api/[division]/arrival-settings/devices`: `{ code: string, name: string }` → `ArrivalSettingsResult`.
- DELETE `/api/[division]/arrival-settings/devices`: `{ deviceId: string }` → `ArrivalSettingsResult`.

## 화면

`/[division]/check-in`, `/[division]/admin/arrivals`, 기존 학생 출석 화면 확장. 관리자 출석 관리 바로 아래 등원 현황.
설정은 기존 운영규칙의 출결 탭에 등원 설정으로 가는 링크/공용기기 관리 진입 추가. 필요시 운영규칙 아래 별도 상세 경로 `settings/rules/arrivals` 사용, 기존 SettingsPageShell activeId=rules.

공용 숫자5자리 자동제출, 팝업1200ms 후 초기화/포커스복원. 설정/기기는 학원별 기본 비활성. 기록대상 ACTIVE/ON_LEAVE, 좌석무관. 기록시각 서버 접수 UTC, 날짜 KST. 출석/지각/벌점/학습시간에 반영하지 않음.
관리자 날짜이동/검색/시각정렬/5초 visible polling(중첩요청 금지, stale응답 거부), 선택학생/정정초안 보존. 목록 HH:mm:ss, 공통 월간달력 HH:mm. 원본 접수시각/유효시각/출처/담당자/사유/이력 표시. 관리자 추가/정정/취소 사유필수, 미래 금지, 취소는 ConfirmDialog.
학생 오늘 시각 및 공유 달력, 조회만. 취소한 날 재입력시 새 유효시각, 최초기기시각 및 모든 이력 보존.

## 디자인 계약

현재 DESIGN.md, MOBILE_DESIGN.md와 기존 admin shell/StudentPortalFrame 기준. Pretendard, `--admin-*` 토큰, admin-flat-page/page-title/filter-bar/table-frame/notice/empty-state/button, 학생 요약 admin-portal-summary 사용. 숫자 tabular-nums. 표 셀 가운데(금액만 오른쪽), 모바일 열 접어 가로 넘침 방지, 제목 및 긴 이름은 줄바꿈. 관리자 전체폭표+SlideOver 편집, 중앙모달 짧은 완료/확인만.
일반 controls44px/8px (모바일 기존4px), 페이지제목20/700, 표13px. 흰 화면, 얇은 격자, 직렬색 DB. 새 UI에는 장식/이미지/다른 디자인체계 추가하지 않음(사용자 기존체계 재사용 요구 우선).
ActionCompleteModal optional autoCloseMs 추가 기존호출 유지. 키패드·월달력 규격만 공유 CSS 토큰과 DESIGN 문서에 추가.

## 검증

단위/서비스/권한/중복/정정/설정예약 테스트, API 실제 로컬 요청, lint/typecheck/build, 실제 브라우저390/768/1280(연결 불가시 미검증 명시). 기존 출결/출석률/벌점/학습시간 회귀검사. SQL 파일은 승인 검토용으로만 작성.
