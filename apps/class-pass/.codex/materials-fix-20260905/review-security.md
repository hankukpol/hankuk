# 보안 리뷰: 자료 배정·수령 로컬 수정

검토일: 2026-09-05. 범위: S1, D1–D3, 직원/관리자 쓰기 권한 경계. 지정 설계 문서 대조는 기존 사용자 승인에 따라 생략했다. `class-pass-review`의 보안 검토와 Supabase의 RLS/최소권한 체크리스트를 적용했다. 일반 코드 품질·디자인은 판정하지 않았다.

## Blocker (배포 금지)

- 이 검토 범위에서 남은 Blocker 없음.

## High

- 현재 지정 범위에서 남은 High 없음.

## Medium

- 이번 지정 수정 범위에서 추가 확인된 Medium 없음.

## 검토 중 발견·해결한 H1

- [x] **신규 수강등록의 실패 복구가 다른 요청에서 이미 저장한 수령 이력을 지우는 경로.** `src/app/api/enrollments/route.ts:539`, `:582`, `:622`의 수강 INSERT·배정·결제는 서로 다른 DB 요청이며, 실패 시 기존 `rollback_enrollment_creation`은 수령 확인 없이 배정/수강을 삭제했다. `distribution_logs.enrollment_id`의 실제 로컬 FK는 `ON DELETE CASCADE`였다. 이는 임의 관리자 SQL이 아니라 실제 앱의 등록 실패 복구 경로였다.
- 후속 migration `20260905095307_enrollment_rollback_material_history_guard.sql:14`는 enrollment `FOR UPDATE`를 먼저 잡고 수강 상태 및 수령·결제·출석 등 FK 후속 이력을 검사한다. 이력이 있으면 `CP005`로 전체 삭제를 거부하며, 없어도 초기 billing/배정/수강만 정리한다. 기존 bigint → void 및 없는 ID no-op 계약은 유지한다. 새로 단일-column FK를 추가한 후속 이력 테이블도 검사 대상이다. 현재 로컬 enrollment 참조 FK 중 이 검사에서 제외되는 복합 FK는 없었다.
- 최종 파일과 실제 로컬 `pg_get_functiondef`를 독립 대조했다. 함수는 `SECURITY INVOKER`, 빈 `search_path`, PUBLIC/anon/authenticated 실행 불가, service_role 실행 허용이다. catalog에서 얻은 식별자는 `%I`, enrollment ID는 `USING` 파라미터로 처리하므로 HTTP 입력이 raw SQL에 삽입되지 않는다. **H1 해결 판정은 로컬 소스·schema에 한정하며 운영 반영을 뜻하지 않는다.**
- `db.md`의 추가 RED/GREEN과 실제 테스트 코드를 읽었다. 구현자 증거는 수령 선행 시 복구 `CP005`·이력 보존, 복구 선행 시 수령 `STUDENT_NOT_FOUND`, 결제 선행 시 복구 거부, 미사용 초기 등록 정리·없는 ID 재시도와 결제/출석/상담 보존을 포함한다.

## 확인한 방어와 증거 수준

- S1: `authenticate.ts`는 관리자·직원·최고관리자 모두 쿠키 JWT를 직접 검증한다. unsigned verified-header reader는 제거되었다. 현대식 claim의 구형 인증 강등은 차단되며 역할·학원·세션 검증이 남아 있다. `middleware.ts`는 API 파일형 경로도 인증 대상으로 처리하고, 조기 반환 전에 내부 헤더를 제거한다. `parsePositiveInt`는 정규 십진 양의 안전 정수 문자열만 허용한다.
- 직원 쓰기 범위: quick/scan은 `requireStaffApi`; 교재 배정·배정 해제·자료 수정/삭제·수동 수령·수령 취소는 `requireAdminApi`다. 직원 quick의 자료 미선택 요청은 조회만 한다. 직원에게 신규 교재 배정 권한을 추가한 경로는 발견하지 않았다.
- 테넌트/대상: 요청 경계의 Zod 파싱, 강좌/수강/자료 소유권 검사와 새 RPC의 `p_division`·동일 강좌 검사를 확인했다. 새 RPC는 취소·종료·정지 수강/비활성 강좌, 배정 없는 교재, 과목 좌석 없는 handout을 차단한다. QR 서명·10분 TTL 검증은 요청 시 실행된다.
- D1: 로컬 `class_pass.materials.subject_id` 존재 및 실제 `distribute_material_atomic`의 `NO_SEAT_FOR_SUBJECT` 검사 존재를 읽기 전용 조회로 확인했다. 과목 소속 강좌를 함께 검사하며 qualifying seat에 `FOR SHARE`를 건다.
- D2/D3 주 경로: 배정/배정 해제/수령 RPC는 enrollment → 정렬된 material 순서로 잠근다. 자료 삭제 RPC는 material만 잠그며 enrollment를 뒤에 잠그지 않는다. 새 배정 재시도는 `ON CONFLICT DO NOTHING`으로 기존 배정자/시각을 유지한다. 직접 SQL을 사용하는 batch 등록도 선행 enrollment 잠금과 material FK 잠금이 있으므로 직접 INSERT라는 이유만으로 D3 우회라고 판정하지 않았다.
- 로컬 RLS/ACL: `materials`, `textbook_assignments`, `distribution_logs` 모두 RLS 활성. 허용 정책 없이 default-deny를 사용하고 PUBLIC/anon/authenticated 테이블 권한은 회수한다. 실제 로컬 스키마 USAGE는 service_role만, 자료 5개 함수 EXECUTE는 postgres/service_role만 보유한다. 함수 5개 모두 `SECURITY INVOKER`, 빈 `search_path`를 실제 `pg_catalog`에서 확인했다. service_role은 RLS를 우회하므로 이것이 앱 관리자/직원의 역할을 DB에서 구분하는 정책이라고 해석하지 않는다.
- 자료 RPC는 `class_pass` 테이블을 명시하며 클라이언트용 service-key 노출 경로를 추가하지 않았다. 후속 복구 함수의 catalog 기반 동적 SQL은 위 H1 해결 항목에서 별도 검토했다. 학생 이름은 권한 확인 후 직원/관리자 응답에 사용한다. PII 흐름 전체에 대한 별도 감사나 운영 로그 검사는 하지 않았다.

## 독립 실행 검증

```text
node node_modules/tsx/dist/cli.mjs --require ./tests/_setup/stub-server-only.cjs --test tests/auth/*.test.ts tests/distribution/staff-quick-route.test.ts tests/distribution/material-api-commit.test.ts
```

**157 통과 / 0 실패 / 0 건너뜀**, 종료 코드 0. 실제 JWT·인증·미들웨어와 quick/material 라우트를 사용하되 세션 DB·테넌트·저장·캐시는 테스트 대역이다. 캐시 실패 로그는 의도한 결함 주입이다. HTTP 서버로 인증 우회를 시도한 검증은 아니다.

- 대상 소스 `git diff --check`: 종료 0, LF/CRLF 안내만 있음.
- 로컬 DB 읽기: `docker exec supabase_db_class-pass psql ...`에서 `BEGIN READ ONLY`로 명시적 `class_pass` 대상의 함수·컬럼·ACL·RLS·FK만 조회했다. 검토자는 DB 자료/스키마를 변경하지 않았다.
- 검토 migration: `supabase/migrations/20260905093143_material_assignment_atomic_safety.sql`, SHA256 `469045F15A78BC42AA317187BEDFA31383920CF9C80243AE24CC34CFE2E2A4A5`.
- 후속 검토 migration: `supabase/migrations/20260905095307_enrollment_rollback_material_history_guard.sql`, SHA256 `3A9863498A3D49D971C13D33D1142546EE18F14817C80D2C16FBEC8BB4DEEE22`.
- DB worker의 최종 11개 DB 테스트 및 두 SQL fixture PASS는 `db.md`의 구현자 증거로 읽었다. 검토자가 이를 재실행했다고 주장하지 않는다.

## 한계

- 운영 DB·운영 배포·실제 카메라·실기기 미검증. 로컬 결과를 운영 보호 보장으로 해석하지 않는다.
- `202605270002_fix_rate_limit_rpc_alias.sql`는 이번 변경 대상이 아니다. quick/scan 라우트와 직원 인증 guard에서 별도 rate-limit 호출은 발견하지 못했다. 기존 상태의 abuse 방어는 이번 S1/D1–D3 해결 여부와 분리한 후속 점검 사항이다.
- 관리자 수령 취소는 기존대로 수령 행을 삭제한다. 처리자/사유를 남기는 취소 이력 모델은 이번 수정에 포함되지 않았다.
- 지정 리뷰 파일 이외 소스·테스트·DB·운영 상태는 변경하지 않았다.
