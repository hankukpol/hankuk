# 성적 분석 운영 연결 검증

사용자 요청: 신규 정기·아침 성적 분석을 기존 성적 조회 화면에 연결하고 Study Hall 변경을 커밋·푸시·운영 배포.

## 연결 범위

- 관리자 기존 `/[division]/admin/exams`의 입력·주간·가져오기 기능은 유지하고 반 분석·학생별 분석을 새 화면에 연결한다.
- 관리자 개인 `/[division]/admin/exams/students/[studentId]`, 학생 `/[division]/student/exams`를 새 분석으로 교체한다.
- 독립 전체 분석 `/[division]/admin/exams/analysis`, 진도 설정 `/[division]/admin/exams/learning`을 제공한다.
- 학생의 기존 `analysisSession`, `morningType/morningFrom/morningTo` 링크를 변환한다.
- 비활성 시험의 과거 기록, 직접입력·날짜 미등록 점수, 총점·당시 석차·메모를 보존한다.
- 운영 API는 `/api/[division]/exam-analysis/{regular,morning,learning}`. 로컬 `/preview` 경로는 기존 이중 환경변수 제한을 유지한다.

## 저장 및 권한

- 성적 원장은 기존 Prisma 조회를 사용한다. 테스트 데이터를 운영으로 복사하지 않는다.
- 추가 테이블 `study_hall.exam_learning_documents`는 학원별 표준 진도·문항 연결·적용일별 분석 정책·복습·시간 이력을 저장한다.
- DB 행 잠금과 문서 revision으로 서버 인스턴스 간 충돌을 차단한다. 동일 요청 재시도와 변경 전후 이력은 기존 명령 처리 계약을 유지한다.
- RLS 활성화, PUBLIC/anon/authenticated 테이블 접근 취소. 서버 API의 학원 관리자 또는 본인 학생 인증 후 Prisma로 접근한다. 클라이언트 직접 접근 정책은 의도적으로 없다.
- 설정이나 기준을 등록하지 않은 학원에는 가짜 기준/진도/시간을 자동 입력하지 않는다. 관리자가 진도·학습 분석 설정에서 구성한다.
- 신규 테이블만 추가하는 마이그레이션을 검증해 적용했다. 기존 기록 수는 정기 0, 아침 153, 가져온 회차 6으로 유지됐다.

## 검증

- 분석·학습·기존 링크 단위 테스트 53개 통과.
- 로컬 실제 PostgreSQL: 로더, 재조회 영속성, 학원 격리, 동시 첫 저장(3요청 중 1성공·2충돌), 소유 학원 제약, 트랜잭션 롤백 통과. 기존 로컬 DB의 오래된 스키마 때문에 전체 스키마를 별도 검증 DB에 생성했다.
- Chrome 6개 시나리오 통과: 운영 관리자/학생 경로, 390/768/1280px 화면, 기존 분석 탭 링크, 진도 설정, 비활성·날짜 미등록 직접 성적, 예전 링크 및 타 학생/타 학원 차단. pageerror 없음.
- MOCK_MODE=false, EXAM_ANALYSIS_PREVIEW=false 조건의 배포용 Next 빌드 통과. 빌드 중 더미 인증 환경의 인증 조회 로그는 배포 인증 검증으로 간주하지 않는다.
- 독립 코드 리뷰에서 직접입력 성적과 비활성 시험 누락 2건을 수정한 뒤 남은 확정 P1/P2 없음으로 재검토됐다.
- PC/모바일 스크린샷을 직접 확인했다. 변경 전 디자인·인쇄·성능 검증은 `exam-learning-review-2026-09-17.md`에 있으며 이번 연결 검증과 구분한다.

검증 산출물: `.superloopy/evidence/frontend/2026-09-17-exam-release/` (로컬 전용, 개인정보/브라우저 상태를 Git에 넣지 않음).

## 배포 확인 / 복구 기준

배포는 Study Hall 전용 커밋 트리거로 수행한다. 해당 커밋의 Vercel READY와 정식 도메인 연결, 로그인 상태에서 실제 성적 조회를 확인해야 완료다. 이전 READY 배포는 `dpl_Fw7LgBLY6xHJvbLr4e6MzqrtJyKQ`이며, 필요 시 애플리케이션 배포만 이전 버전으로 복구한다. 추가된 학습 기록 테이블과 성적 원장은 삭제하지 않는다.
