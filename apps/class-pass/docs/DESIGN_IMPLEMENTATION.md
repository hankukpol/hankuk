# 로컬 디자인 구현·검증 안내

기준일: 2026-09-06. 현재 작업 트리 기준이며 운영 배포 상태를 뜻하지 않는다.

색·크기·간격·모서리의 단일 기준은 [DESIGN.md](../DESIGN.md)이다. 이 문서는 원본 파일을 찾고 검증하는 방법을 제공한다. 값을 복사한 두 번째 디자인 시스템으로 사용하지 않는다.

## 1. 문서 역할

| 문서 | 역할 |
| --- | --- |
| [DESIGN.md](../DESIGN.md) | 현재 관리자 토큰·페이지·컴포넌트·상태·예외의 기준 |
| [AGENTS.override.md](../AGENTS.override.md) | 로컬 작업자가 지켜야 할 디자인 적용 범위 |
| [.claude/HARNESS.md](../.claude/HARNESS.md) | 설계·구현 작업 시 현재 디자인 참조 연결 |
| [초기 개발 계획](../개발계획/CLASS_PASS_개발계획.md) | 기능·구조 배경. 최신 디자인은 DESIGN.md 우선 |
| [교재 기능 명세](textbook-pickup-spec.md) | 기능과 데이터 계약. 시각 규칙 중복 정의 금지 |
| [자료 운영 안내](MATERIALS_WORKFLOW.md) | 사용 방법과 당시 검증 이력 |

_workspace, .codex, .superloopy 안의 과거 검토·측정·실행 보고서는 당시 증거다. 현재 기준에 맞추겠다는 이유로 과거의 성공/실패 결과나 스크린샷을 덮어쓰지 않는다. 다른 앱의 DESIGN.md는 이번 Class-pass 문서 갱신 대상이 아니다.

## 2. 구현 위치

| 역할 | 실제 파일 | 재사용 지점 |
| --- | --- | --- |
| 관리자 토큰·반응형·최종 모서리 규칙 | [admin.css](../src/app/%28admin%29/admin.css) | --admin-*, .admin-shell |
| 관리자 폰트·테넌트·포털 | [AdminTheme.tsx](../src/components/admin/AdminTheme.tsx) | --font-admin, #admin-portal-root |
| 전체 메뉴·본문 프레임 | [관리자 layout](../src/app/%28admin%29/layout.tsx) | admin-sidebar-rail, admin-content-frame |
| 작은 화면 관리자 메뉴 | [AdminMobileNavigation.tsx](../src/components/admin/AdminMobileNavigation.tsx) | 접기·펼치기, Escape·외부 클릭·포커스 이탈 닫기 |
| 강좌 1차 탭 | [강좌 layout](../src/app/%28admin%29/dashboard/courses/%5Bid%5D/layout.tsx) | admin-tabs, admin-flat-page |
| 강좌 최초 이동 | [강좌 page](../src/app/%28admin%29/dashboard/courses/%5Bid%5D/page.tsx) | /students redirect |
| 정산 1차 탭 | [정산 layout](../src/app/%28admin%29/dashboard/settlements/layout.tsx) | 정산 메뉴와 flat page |
| 서브 탭·초안 보존 | [AdminSectionTabs.tsx](../src/components/admin/AdminSectionTabs.tsx) | AdminSectionPanel, AdminSectionActions |
| 강좌 설정 서브페이지 | [course-detail-page-client.tsx](../src/app/%28admin%29/dashboard/courses/%5Bid%5D/course-detail-page-client.tsx), [course-settings.module.css](../src/app/%28admin%29/dashboard/courses/%5Bid%5D/settings/course-settings.module.css) | 일곱 패널의 항목명·본문 계층, 위치 인증 선택, 필드 순서 이동 |
| 작업 메뉴 | [AdminActionMenu.tsx](../src/components/admin/AdminActionMenu.tsx) | 공통/포털 메뉴, 키보드 이동 |
| 표 정렬 헤더 | [sortable-header.tsx](../src/components/admin/sortable-header.tsx) | SortableHeader, aria-sort |
| 페이지 이동 | [AdminPagination.tsx](../src/components/admin/AdminPagination.tsx) | admin-pagination |
| 강좌 순서 | [SortableCourseRow.tsx](../src/components/admin/SortableCourseRow.tsx), [useCourseOrdering.ts](../src/components/admin/useCourseOrdering.ts) | 이름 셀 grip, 취소·실패 복원 |
| 명단 toolbar·등록창 | [course-students-page-client.tsx](../src/app/%28admin%29/dashboard/courses/%5Bid%5D/students/course-students-page-client.tsx) | 검색/집계/상태 그룹, 등록 drawer |
| 명단 표 | [students-manage-table.tsx](../src/app/%28admin%29/dashboard/courses/%5Bid%5D/students/students-manage-table.tsx) | 기본/상세 열, 이름·헤더 고정, 모바일 상태 선택·카드 |
| 학생 행 작업 | [StudentRowActions.tsx](../src/app/%28admin%29/dashboard/courses/%5Bid%5D/students/StudentRowActions.tsx) | 수납·환불, 편집, 더보기 |
| 메모 셀 | [StudentMemoCell.tsx](../src/app/%28admin%29/dashboard/courses/%5Bid%5D/students/StudentMemoCell.tsx) | 미리보기·날짜·추가/수정 |
| 메모 모달 | [EnrollmentMemoDialog.tsx](../src/app/%28admin%29/dashboard/courses/%5Bid%5D/students/EnrollmentMemoDialog.tsx) | 공통 header/body/footer, 미저장 보호 |
| 닫기 버튼 | [AdminDialogClose.tsx](../src/components/admin/AdminDialogClose.tsx) | X, accessible name, 학생 확인창 호환 |
| 우측 작업 창 | [AdminDrawer.tsx](../src/components/admin/AdminDrawer.tsx) | 입력·등록·편집·상세, 공통 폭/슬라이드/포커스/고정 footer |
| 관리자 포털 | [AdminPortal.tsx](../src/components/admin/AdminPortal.tsx) | 관리자 테마 안에서 페이지 transform·클리핑을 피함 |
| 확인 모달 | [confirmation-modal.tsx](../src/components/admin/confirmation-modal.tsx) | 기존 tone·pending·중첩 우선순위 |
| 모달 포커스·잠금 | [useModalDialog.ts](../src/components/admin/useModalDialog.ts), [modal-dialog-controller.ts](../src/components/admin/modal-dialog-controller.ts) | focus trap, 복원, inert, Escape |
| 수납·환불 drawer | [EnrollmentPaymentDrawer.tsx](../src/components/payments/EnrollmentPaymentDrawer.tsx) | admin-drawer-panel |
| 환불·정정 drawer | [RefundModal.tsx](../src/components/payments/RefundModal.tsx), [PaymentCorrectionModal.tsx](../src/components/payments/PaymentCorrectionModal.tsx) | 공통 우측 표면·폭, 업무 검증 유지 |
| 자료 공통 폼 | [material-form-fields.tsx](../src/app/%28admin%29/dashboard/courses/%5Bid%5D/materials/material-form-fields.tsx) | admin-material-* |
| 자료·교재 생성 drawer | [material-create-drawer.tsx](../src/app/%28admin%29/dashboard/courses/%5Bid%5D/materials/material-create-drawer.tsx) | 직각 우측 drawer, 고정 header/footer, 실패 초안 보존 |
| 자료·교재 목록 | [course-materials-page-client.tsx](../src/app/%28admin%29/dashboard/courses/%5Bid%5D/materials/course-materials-page-client.tsx) | 전체 폭 목록, 생성 trigger, 요약 |
| 반복자료 drawer | [material-series-modal.tsx](../src/app/%28admin%29/dashboard/courses/%5Bid%5D/materials/material-series-modal.tsx) | 공통 우측 표면, 회차 미리보기 |
| 대시보드 | [dashboard/page.tsx](../src/app/%28admin%29/dashboard/page.tsx) | 개별 KPI·리스트 패널·강좌 표 |
| 모션 | [motion.ts](../src/lib/motion.ts) | 공유 spring, reduced motion |
| 학생 호환 스타일 | [globals.css](../src/app/globals.css) | student-*; 관리자와 분리 |
| QR 크기 제약 | [display-layout.ts](../src/lib/designated-seat/display-layout.ts) | 공개 디스플레이 기능 치수 |

## 3. 새 UI를 붙이는 순서

1. 관리자 화면은 기존 AdminTheme 내부에 둔다. 포털도 테마를 벗어나지 않는다.
2. 해당 작업이 경로 이동인지, 서브 페이지인지, 데이터 필터인지 먼저 구분한다.
3. 탭 본문은 admin-flat-page, 실제 표 프레임은 admin-table-frame을 사용한다.
4. 표 강좌명·금액·메모는 각각 admin-table-course / admin-table-amount / admin-table-memo를 명시한다.
5. 입력·등록·편집·상세는 AdminDrawer, 삭제·변경 폐기·최종 확인은 ConfirmationModal을 사용한다. 복잡한 기존 header/body/footer를 유지해야 하면 AdminDrawerSurface를 사용한다. 제출 버튼의 form 연결·저장 guard는 유지한다. 조건부 마운트는 AnimatePresence에서 키를 주어 닫기 애니메이션 동안에도 포커스·배경 잠금이 유지되게 한다.
6. 새 토큰이 정말 필요한지 확인한다. 임의 rounded/text/padding 유틸을 붙이기 전에 최종 CSS cascade를 확인한다.

현재 stylesheet에는 기존 JSX와 연결하는 호환 규칙이 남아 있다. 소스의 예전 클래스명만 보고 레거시 외형이 적용됐다고 단정하지 않는다. 반대로 문서에 규격을 썼다는 이유로 모든 표의 실효 폰트가 같다고 단정하지 않는다.

## 4. 검사 명령과 범위

앱 디렉터리에서 실행한다. 패키지는 pnpm만 사용한다.

~~~powershell
pnpm verify:admin-presentation
pnpm test:admin-ui
pnpm exec tsc --noEmit --incremental false
git diff --check
~~~

- verify:admin-presentation은 표시용 내부 코드 노출·모달 autofocus 등 일부 계약을 검사한다. 전체 시각 검사를 대체하지 않는다.
- test:admin-ui는 React/DOM·표·모달·업무 안전성 회귀 검사다. 실제 운영 DB 확인을 뜻하지 않는다.
- 타입 검사와 build 성공만으로 디자인 완료라고 판단하지 않는다.
- 의미 있는 UI 변경 시 실제 로컬 브라우저의 390/768/1280px, 긴 텍스트, 키보드, 선택/빈/오류/저장 중 상태를 확인한다.

다음 도구는 **실제 브라우저에서 수집한 JSON**을 검사한다. 새 UI 검증에는 새 데이터를 수집해야 한다.

| 도구 | 목적 |
| --- | --- |
| [verify-admin-choice-geometry.mjs](../scripts/verify-admin-choice-geometry.mjs) | 선택 버튼 크기 |
| [verify-admin-shape-geometry.mjs](../scripts/verify-admin-shape-geometry.mjs) | 모서리·외곽 구분 |
| [verify-admin-table-geometry.mjs](../scripts/verify-admin-table-geometry.mjs) | 표 정렬·레이아웃 |
| [verify-roster-toolbar-geometry.mjs](../scripts/verify-roster-toolbar-geometry.mjs) | 검색/집계/상태 배치 |
| [verify-admin-modal-geometry.mjs](../scripts/verify-admin-modal-geometry.mjs) | 모달 크기·내부 여백·닫기·footer 도달성 |
| [verify-admin-drawer-observations.mjs](../scripts/verify-admin-drawer-observations.mjs) | 우측 drawer/중앙 확인창의 실제 브라우저 측정, 폭·직각·고정 액션 검증 |
| [verify-material-create-drawer-geometry.mjs](../scripts/verify-material-create-drawer-geometry.mjs) | 자료·교재 생성 drawer와 전체 폭 목록의 실제 치수 |
| [verify-settings-subpage-observations.mjs](../scripts/verify-settings-subpage-observations.mjs) | 일곱 설정 패널의 실측 글자 계층·선택 영역·서브 탭·가로 넘침 |

## 5. 최초 문서 정리 단계의 확인 내용과 한계

- admin.css의 토큰과 최종 우선순위, 관련 공통 컴포넌트, 실제 로컬 수강생 화면의 computed style을 대조했다.
- 수강생 명단의 본문 15px/보조 요소 13px, 검색 320px, 선택 버튼 128px/8px, 폴더·서브 탭과 표의 직각 모서리를 확인했다.
- 이전 모달 수정 작업의 모바일·태블릿·PC 측정은 당시 증거로 유지한다. 이번 문서 편집을 위해 모든 모달/상태를 새로 전수 실행했다고 기록하지 않는다.
- 새로 정리한 문서의 로컬 링크, CSS 토큰명·값, 제거한 과거 상충 문구를 검사한다.
- 최초 정리 단계는 소스 변경 없이 문서만 갱신했다. 이후 input-group 포커스를 포함한 리뷰 항목은 아래 후속 수정 기록을 참조한다.
- DB·운영 데이터·배포 상태와 Lighthouse 점수는 이번 검증 대상이 아니다.

## 6. 후속 UIUX 수정

[2026-09-05 수정·검증 결과](UIUX_FIXES_2026-09-05.md)에 리뷰 R01~R09의 처리 내용과 현재 검증 범위를 기록했다. 디자인 기준은 DESIGN.md에 반영했다. 회귀 테스트에는 compact 메뉴 닫기/포커스, 기본·반복 설정 필드의 접근성 이름, 명단의 두 상태 필터, 대시보드 읽기 전용 강좌 필터가 포함된다. 정산·명단·메모는 실제 브라우저에서도 측정했다.
