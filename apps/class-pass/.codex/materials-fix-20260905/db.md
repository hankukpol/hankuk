# 자료 DB/조회/API 로컬 수정 증거 — 2026-09-05

## 범위

- D1 과목별 좌석 제한 로컬 반영, D2 배정 해제/수령 동시성, D3 자료 삭제/배정/수령 동시성.
- 자료 목록, 학생/강좌 교재 배정 목록, 학생 수령 목록, 과목 좌석 ID와 학생 좌석 목록의 cap300 누락.
- 단건/일괄 교재 배정 및 배정 해제, 자료 삭제/수정의 커밋 후 캐시 실패를 성공+갱신 경고로 분리.
- 운영 DB, Git commit/push, 배포, DB reset/db push 없음. 기존 금융 작업의 course30/enrollment128와 기타 기존 데이터는 쓰지 않음.

## 실제 RED 증거

변경 전 로컬 `supabase_db_class-pass`(54322)에서 독립 psql 연결 두 개로 확인했다. 임시 course/enrollment/material은 UUID slug로 생성하고 정확한 ID로 정리했다.

1. 연결 A: 트랜잭션 BEGIN → 수령 0건 확인. 연결 B: 기존 `distribute_material` 성공/COMMIT. A: 배정 DELETE/COMMIT. 실제 최종값 `assignments=0, receipts=1`, Node assertion 실패.
2. 연결 A: 자료의 배정/수령 이력 0건 확인. B: 배정 INSERT 및 기존 `distribute_material` 성공/COMMIT. A: 자료 DELETE/COMMIT. 실제 수령 잔여 `0`, 보존 기대 `1` assertion 실패. 기존 `ON DELETE CASCADE`로 새 기록이 제거됨.
3. 새 local-schema 테스트: `subjectColumn=false, seatGuard=false, unassign=false, delete=false` 확인 후 기대 true assertion 실패.
4. 실제 `class-pass-data`를 호출하는 cap300 테스트: 자료 1,200행 중 `300 !== 1200` 실패.
5. 실제 assignment POST에 저장 후 캐시 오류 주입: `500 !== 200` 실패. 수정 후 성공 결과와 `refreshRequired=true`, warning 유지.

## 구현 계약

새 migration: `supabase/migrations/20260905093143_material_assignment_atomic_safety.sql`.
파일명은 CLI 2.84.2의 `supabase migration new material_assignment_atomic_safety`로 생성했다.

- `assign_textbooks_atomic(text,bigint,integer[],text)`: enrollment FOR UPDATE → material IDs 중복 제거/오름차순 FOR UPDATE → 모든 대상 검증 → INSERT ON CONFLICT DO NOTHING. 재시도는 기존 배정자/배정 시각 보존.
- `unassign_textbook_atomic(text,bigint,integer)`: 같은 enrollment/material 잠금 후 수령 검사와 배정 해제를 한 트랜잭션으로 처리. 수령이 있으면 ALREADY_DISTRIBUTED.
- `distribute_material_atomic(text,bigint,integer)`: 같은 잠금 순서, 학원·강좌 일치, 취소/종료/정지, 강좌 active, 자료 active, 교재 배정, handout의 해당 강좌 과목 좌석 확인. 성공 시 DB가 저장한 `log_id`, `distributed_at` 반환.
- 기존 `distribute_material(bigint,integer)`는 호환 wrapper. 새 앱 호출은 검증된 tenant를 명시 전달한다.
- `delete_material_atomic(text,integer)`: material FOR UPDATE 후 소속과 이력 재확인/삭제. 새 배정·수령과 동일 material lock으로 직렬화. enrollment를 나중에 잡지 않는다.
- 새 함수는 SECURITY INVOKER, 빈 search_path, PUBLIC/anon/authenticated EXECUTE 회수, service_role만 실행 허용.
- `materials`, `textbook_assignments`, `distribution_logs` RLS 활성화 및 PUBLIC/anon/authenticated 테이블 권한 회수. server service_role 접근 유지.
- FK cascade 자체는 변경하지 않았다. 원래 물리 강좌 삭제는 수강 이력이 있으면 거부하는 계약이다. 빈 강좌+과목 연계 handout의 같은 문장 cascade 삭제와 과목 단독 삭제 차단을 실제 SQL로 확인했다.
- 기존 전액 결제 정책과 금융 함수는 변경하지 않았다. 과거 수령을 유지한 종료 수강의 미수령 교재 배정 정리는 허용한다.

수령/배정 변경 앱 경로는 RPC를 사용한다. 관리자급 postgres/service_role의 임의 SQL까지 막는 전역 삭제 트리거 또는 FK 정책으로 바꾼 것은 아니다.

## 로컬 SQL 적용/이력

1. `supabase db query --local --file ...`를 두 대상 파일에 시도했으나 CLI가 `cannot insert multiple commands into a prepared statement`로 거부했다. 이 호출은 SQL을 적용하지 못했다.
2. 대안: `Get-Content -Raw <file> | docker exec -i supabase_db_class-pass psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction -f -`.
3. 누락된 기존 `202605280001_material_subject_seat_gating.sql`을 한 번 적용했다.
4. 새 migration을 로컬 적용 후 실제 호출에서 PL/pgSQL 변수 `material_id`의 ON CONFLICT 컬럼명 모호성을 발견했다. `v_material_id`로 고치고 새 migration을 재실행했다. 이 검증 중 migration history는 변경하지 않았다.
5. SQL/동시성/권한 검증 통과 후 `supabase migration repair 202605280001 20260905093143 --status applied --local`로 **두 버전만** 로컬 이력에 기록했다.
6. `supabase migration list --local` 확인: 두 버전 파일/대상 DB 이력 일치. 이 명령 표의 `Remote` 열은 `--local`로 연결한 로컬 DB 이력을 뜻하며 운영 확인이 아니다. 다른 기존 이력 차이는 건드리지 않았다.

## GREEN 검증

- `node --test tests/distribution/material-atomic-local.test.cjs`: **7/7 통과**, skip 0. unassign→receipt, receipt→unassign, delete→assignment, assignment→delete, delete→receipt, receipt→delete. 두 번째 세션이 `pg_stat_activity.wait_event_type='Lock'`에 도달한 것을 확인하고 첫 세션 COMMIT. 최종 이력/배정 수까지 확인.
- `tests/distribution/material-guards-local.sql`을 Docker psql로 실행: 학원/강좌/과목좌석/취소/종료/정지/비활성자료/중복/잘못된 배치의 전체무변경/원본시각/호환 wrapper/ACL/RLS/service_role 실제 호출/빈강좌 cascade PASS. 전체 ROLLBACK.
- `material-api-commit.test.ts`, `material-data-pagination.test.ts`: **3/3 통과**. 조회는 실제 반환량만큼 이동하고 빈 페이지(offset1200)까지 읽는다.
- 기존+신규 distribution TS 및 material admin 회귀: **23/23 통과**, skip 0 (동시 작업의 root/staff 테스트 포함).
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: exit0.
- 대상 `git diff --check`: exit0; CRLF 변환 안내만 있음.
- `supabase db advisors --local --type security --level warn --fail-on none`: 기존 다른 함수의 mutable search_path 경고 23개. 이번 자료 테이블/5개 RPC의 경고는 0개. 범위 밖 함수는 수정하지 않았다.

## 유지한 브라우저 검증 fixture

루트 요청으로 이 fixture만 유지했다. 생성 SQL: `create-local-ui-fixture.sql`; 정리 SQL: `cleanup-local-ui-fixture.sql` (아직 실행하지 않음).

| 대상 | ID/값 |
|---|---|
| course | 75 / `codex-materials-fix-20260905` / 교재 흐름 로컬 검증 |
| enrollment | 183 / 교재검증학생 / 01090050905 |
| handout | 21 / 일반 배부자료 검증 |
| textbook | 22 / 미배정 교재 검증 |
| subject | 1 / 경찰학 검증 과목 |
| gated handout | 23 / 과목 좌석 제한 자료 검증 / subject1 |

무료 강좌 tuition0, billing expected/payable0·paid. 새 결제 없음. 최초 상태는 교재 미배정, 좌석 없음, 수령 없음. 이후 실제 브라우저 검증 결과는 루트 증거를 따른다.

참고한 현재 공식 문서: [Supabase Data API 보안](https://supabase.com/docs/guides/api/securing-your-api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Changelog](https://supabase.com/changelog). Supabase 스킬의 로컬 검증/최소권한 원칙 적용.

## 보안 재검토 H1 후속 수정 — 등록 되돌리기의 수령 이력 보존

실제 호출 경로는 `src/app/api/enrollments/route.ts`의 신규 enrollment 저장 → 교재 배정 RPC → 수납 실패 → `rollback_enrollment_creation(bigint)`이다. 실제 로컬 구형 함수는 SECURITY DEFINER였고, enrollment 잠금/수령 확인 없이 결제·이벤트·교재 배정·수강 행을 삭제했다. 이 후속 작업에서는 enrollment route나 금융 서비스 파일을 수정하지 않았다.

### RED

- 기존 로컬 함수로 실제 두 연결 테스트: 연결 A에서 수령 RPC 실행, COMMIT 전 연결 B의 rollback 시작. B가 DB lock 대기한 것을 확인하고 A COMMIT. B가 성공하면서 새 수령을 삭제하여 `rollback erased a concurrently committed receipt` assertion 실패.
- 별도 롤백형 SQL 테스트: 이미 커밋된 결제가 있는 수강에 rollback을 호출하자 구형 함수가 성공하여 `rollback accepted consequential history` 실패.

### 수정 계약

- 새 CLI 생성 파일 `supabase/migrations/20260905095307_enrollment_rollback_material_history_guard.sql`만 추가했다. 이전 적용 완료 자료 migration은 수정하지 않았다 (SHA256 `469045F15A78BC42AA317187BEDFA31383920CF9C80243AE24CC34CFE2E2A4A5`).
- `rollback_enrollment_creation(bigint) returns void`와 없는 ID의 no-op 유지.
- enrollment FOR UPDATE가 첫 잠금. 자료 배부/배정과 금융 함수의 enrollment-first 잠금 규칙 공유. FK 자식 INSERT의 key-share 잠금도 이 enrollment 잠금과 충돌하므로 조회/삭제 사이의 신규 자식 이력 생성 차단.
- `enrollments.id`를 참조하는 단일 컬럼 FK의 실제 자식 행을 pg_catalog에서 조회한다. 등록 초기 설정인 `enrollment_billing`, `textbook_assignments`만 제외하고 수령·수납·출결·상담·좌석·생애주기 등 후속 행이 있으면 **SQLSTATE CP005**로 전부 거부한다. optional/new FK 이력 테이블도 같은 보호를 받는다.
- active가 아니거나 ended/refunded/suspended 값이 생긴 수강 역시 CP005로 자동 되돌리기 거부.
- 통과한 미사용 등록만 billing/assignment/enrollment를 정리한다. 결제·결제 이벤트를 직접 지우지 않는다.
- SECURITY INVOKER, 빈 search_path, PUBLIC/anon/authenticated EXECUTE 회수, service_role EXECUTE 유지. tenant 인수 없는 기존 내부 함수 인터페이스는 바꾸지 않았다.
- 학생 프로필은 함수에서 삭제하지 않는다. 기존 호출자의 `shouldDeleteStudent`와 `deleteStudentIfOrphaned` 분기 그대로이며, 함수 거부 시 호출자가 orphan cleanup으로 진행하지 않는다.

### GREEN 및 로컬 적용

- 신규 파일을 Docker `supabase_db_class-pass` psql `--single-transaction`으로 로컬 한 번 적용.
- `node --test tests/distribution/material-atomic-local.test.cjs`: **11/11 통과, skip0**. 기존7개 + receipt-first rollback 거부, rollback-first receipt STUDENT_NOT_FOUND, provisional cleanup/idempotent missing ID/service_role 호출, payment-first rollback CP005 및 결제 보존.
- `tests/distribution/enrollment-rollback-guards-local.sql`: 이미 커밋된 결제/출결/상담 이력 보존, INVOKER/ACL, 학생 프로필 원본 호출자 소유 유지 모두 PASS. fixture 전체 ROLLBACK.
- 로컬 security advisors에서 `rollback_enrollment_creation` 경고 0.
- 검증 후 `supabase migration repair 20260905095307 --status applied --local`로 이 버전만 추가 기록. pg_catalog 함수/권한 및 해당 이력 행 확인. 운영 DB/배포/이전 migration 내용 변경 없음.
