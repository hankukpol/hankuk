# 출석 시스템 안정성 심층 리뷰 - 2026-04

## 범위와 전제

- 리뷰 기준일: 2026-04-30
- 운영 DB에는 DDL/DML을 실행하지 않았다. 이 문서는 코드 정독 기반 리뷰이며, 운영 적용 전 검토가 필요한 권장안까지 포함한다.
- 2026-04-30 다중 active binding 이슈는 `202604300001_attendance_device_binding_limit.sql` 적용 완료 상태로 가정했다.
- KSCAT 격리 경로(`src/lib/payments/kscat/`, `src/components/payments/kscat/`, `src/app/api/payments/kscat/`)는 리뷰 및 변경 범위에서 제외했다.

검토 대상:

- `src/lib/attendance/service.ts`
- `src/app/api/attendance/submit/route.ts`
- `src/lib/qr/token.ts`
- `src/lib/attendance/token.ts`, `src/lib/attendance/display-runtime.ts`
- `src/lib/presence/location.ts`
- `src/lib/designated-seat/device.ts`
- `supabase/migrations/202604300001_attendance_device_binding_limit.sql`

## 결론 요약

4월 30일의 직접 원인이었던 "수강생당 active binding 1대 전제"는 현재 코드와 마이그레이션으로 대부분 해소됐다. 다만 출석 실패가 1주일간 자주 발생했다면, 아래 4개 축도 함께 의심해야 한다.

1. 출석 표시 세션 중복 또는 빠른 재시작으로 인한 코드 불일치
2. 재등록 요청 상태가 기존 정상 기기 사용 후에도 남는 stale pending 문제
3. 위치 인증의 `low_accuracy` 차단
4. invalid code/device mismatch 계열 실패가 DB 이벤트로 남지 않아 원인 추적이 어려운 관측성 부족

가장 먼저 적용할 패치는 다음 순서가 적절하다.

1. `enforceAttendanceDeviceBinding`을 충돌 후 stale snapshot으로 판단하지 않도록 재조회/루프 구조로 변경
2. 기존 등록 기기로 정상 출석하면 `reset_requested_*`를 정리
3. active display session이 2개 이상 생기지 않도록 DB 유니크 제약 또는 RPC 트랜잭션 추가
4. `INVALID_CODE`, `DEVICE_MISMATCH`, presence 실패를 DB 이벤트로 남겨 운영 모니터링 가능하게 변경
5. presence `low_accuracy` 정책은 1~2주 로그를 보고 threshold 또는 soft-pass 정책 조정

## 7일 이벤트 집계 해석 보정

사용자가 제공한 7일 이벤트 baseline:

| event_type | count | 1차 해석 |
| --- | ---: | --- |
| `student_checked_in` | 1370 | 정상 자동 출석 |
| `attendance_device_registered` | 472 | 기기 자동 등록 |
| `attendance_device_rebind_requested` | 153 | 새 기기 요청, 출석 차단 |
| `admin_marked_present` | 59 | 관리자 수동 출석 |
| `admin_created_excuse` | 24 | 출석 면제 |
| `display_session_started` | 21 | 표시 세션 시작 |
| `attendance_device_rebind_approved` | 19 | 승인된 재등록 |
| `attendance_device_binding_reset` | 12 | 기기 초기화 |
| `display_session_stopped` | 8 | 관리자 정상 종료 |
| `admin_marked_absent` | 3 | 결석 처리 |

이 baseline은 "출석 트러블이 실제로 많았다"는 방향성은 뒷받침한다. 다만 이벤트 건수를 그대로 더해 `약 12%`로 확정하는 것은 위험하다.

- `attendance_device_rebind_requested`는 학생 1명이 여러 번 발생시킬 수 있다. 따라서 `153 - 19 = 134명 미해결`로 바로 보기는 어렵다.
- `admin_marked_present` 59건도 모두 "학생 폰 실패"라고 단정할 수 없다. 현장 운영상 사후 보정, 지각자 처리, 관리자 일괄 처리 등이 섞일 수 있다.
- `attendance_device_registered` 472건은 환경 변경만 뜻하지 않는다. 첫 출석 때 정상적으로 생성된 최초 기기 등록도 포함된다.
- `rebind_requested` 뒤에 `admin_marked_present`가 이어진 경우 같은 학생/날짜 문제가 두 이벤트로 중복 집계된다.
- denominator도 전체 출석 시도 수가 아니라 이벤트 수 조합이므로, 정확한 장애율은 학생-날짜-과목 단위로 dedupe해서 계산해야 한다.

권장하는 보정 지표:

1. 학생-날짜-과목 단위 trouble unique count
2. `rebind_requested`의 unique enrollment count와 반복 요청 count 분리
3. `admin_marked_present` 중 직전 10분 내 `rebind_requested`, `attendance_code_invalid`, presence 실패가 있었던 건수
4. 표시 세션별 invalid code 수와 빠른 재시작 여부

보정 SQL 예시:

```sql
with events as (
  select
    course_id,
    event_type,
    created_at,
    (details->>'enrollment_id')::bigint as enrollment_id,
    coalesce(details->>'subject_id', 'none') as subject_key,
    coalesce(details->>'date', (created_at at time zone 'Asia/Seoul')::date::text) as date_key
  from class_pass.attendance_events
  where created_at >= now() - interval '7 days'
    and event_type in (
      'attendance_device_rebind_requested',
      'admin_marked_present',
      'attendance_code_invalid',
      'attendance_device_locked'
    )
    and details ? 'enrollment_id'
)
select
  course_id,
  date_key,
  subject_key,
  count(*) as trouble_events,
  count(distinct enrollment_id) as trouble_students
from events
group by course_id, date_key, subject_key
order by date_key desc, course_id, subject_key;
```

### display start/stop 불균형 해석

`display_session_started = 21`, `display_session_stopped = 8`은 "13회 비정상 종료"로 단정할 수 없다.

코드 기준:

- `display_session_started`는 관리자가 새 출석 표시 세션을 시작할 때 기록된다.
- `display_session_stopped`는 관리자가 명시적으로 종료 API를 호출할 때만 기록된다.
- 세션이 `expires_at`으로 자연 만료되거나, 새 세션 시작 시 기존 세션이 자동 revoke되는 경우에는 `display_session_stopped` 이벤트가 남지 않는다.
- 표시폰 Wi-Fi가 끊겨도 display session row가 자동으로 stopped 이벤트를 남기지는 않는다.

따라서 started/stopped 불균형은 "관리자가 수동 종료하지 않은 세션이 많다"는 뜻에 가깝고, Wi-Fi 끊김의 직접 증거는 아니다. Wi-Fi/표시 기기 문제를 확인하려면 `attendance_display_sessions.last_seen_at`, `expires_at`, 빠른 재시작, invalid code 이벤트가 필요하다.

표시 세션 stale 의심 SQL:

```sql
select
  id,
  course_id,
  subject_id,
  created_at,
  last_seen_at,
  expires_at,
  revoked_at,
  extract(epoch from least(coalesce(revoked_at, expires_at), expires_at) - last_seen_at) as seconds_without_heartbeat_before_end
from class_pass.attendance_display_sessions
where created_at >= now() - interval '7 days'
order by created_at desc;
```

해석 기준:

- `seconds_without_heartbeat_before_end`가 90초 이상이면 표시 화면이 세션 종료 전 한동안 API를 호출하지 않은 것으로 볼 수 있다.
- 단, heartbeat는 현재 60초 간격으로만 DB 갱신되므로 60초 이하는 정상 범위다.
- fetch 실패 시 화면은 error 상태로 전환되므로, "오래된 코드가 계속 보였는지"는 별도 stale overlay 또는 클라이언트 이벤트 로깅 없이는 확정하기 어렵다.

## 심각도별 발견 사항

### P0 - 운영 출석 실패 가능성이 큰 결함

#### 1. active display session 중복 시 출석 제출 전체 실패 가능

관련 코드:

- `src/app/api/attendance/admin/display/route.ts`: 출석 시작 시 기존 session revoke 후 새 session insert
- `src/lib/attendance/service.ts`: `getActiveAttendanceDisplaySessionForCourse()`에서 `.order(...).maybeSingle()`
- `src/app/api/attendance/submit/route.ts`: 제출 시 active display session을 1개로 가정

발생 가능성:

- 관리자 화면에서 출석 시작 버튼을 빠르게 2번 누르거나, 네트워크 재시도로 POST가 중복 발생하면 가능하다.
- 현재 revoke와 insert가 하나의 DB 트랜잭션이 아니고, `attendance_display_sessions`에는 "course당 active 1개"를 보장하는 partial unique index가 없다.
- 이 경우 active row가 2개 이상 생기면 `.maybeSingle()`이 `PGRST116`을 반환할 수 있고, 제출 API는 generic 500으로 떨어진다.

영향:

- 특정 학생 문제가 아니라 해당 강좌 출석 제출 전체가 실패할 수 있다.
- display device가 오래된 session code를 계속 보여주면 학생은 `INVALID_CODE`를 받는다.

권장:

- 즉시 코드 방어: `getActiveAttendanceDisplaySessionForCourse()`는 `.limit(1).maybeSingle()` 또는 `.limit(1)`로 최신 1개만 선택한다.
- DB 방어: `revoked_at is null` active session을 course당 1개로 제한하는 partial unique index를 추가한다. 단, 운영 적용 전 active 중복 preflight가 필요하다.

#### 2. 같은 등록 기기로 다시 들어와도 reset request가 정리되지 않음

관련 코드:

- `src/lib/attendance/service.ts`
  - `matchingBinding` branch는 `last_seen_at`, `updated_at`만 갱신
  - `reset_requested_at`, `reset_requested_device_key_hash`, `reset_requested_user_agent`를 null로 만들지 않음

발생 가능성:

- 높음. 학생이 새 기기로 시도해서 `DEVICE_REBIND_REQUIRED`가 생긴 뒤, 기존 정상 브라우저/기기로 다시 출석하면 실제 출석은 가능하지만 관리자 화면에는 재등록 요청이 계속 남을 수 있다.

영향:

- 관리자가 stale 요청을 승인하면 기존 binding hash가 요청 hash로 바뀌어, 실제 정상 기기가 다음번에 새 기기로 감지될 수 있다.
- "학생은 한 브라우저만 쓴다"는 제보와 다르게 보이는 운영 혼선을 만든다.

권장:

- 같은 enrollment의 active binding 중 하나라도 정상 매칭되어 출석하면 pending reset 전체를 취소한다.
- 이벤트 `attendance_device_rebind_cancelled`를 추가하면 운영 추적이 쉬워진다. 이벤트 타입 추가에는 migration이 필요하다.

#### 3. `enforceAttendanceDeviceBinding` 충돌 처리 후 stale snapshot 판단 가능

관련 코드:

- `src/lib/attendance/service.ts`
  - insert 충돌 시 1회 재귀 재시도
  - 두 번째 충돌이면 throw하지 않고 아래 `pickDeviceBindingForNewRequest(ownBindings, deviceKeyHash)`로 진행
  - 이때 `ownBindings`는 insert 전에 읽은 stale 값일 수 있음

발생 가능성:

- `202604300001` 적용 후 일반적인 빈도는 낮다.
- 다만 동시 제출이 몰릴 때, 또는 DB read-after-write 지연/구버전 유니크 인덱스 잔존/트리거 23514가 반복될 때 발생 가능하다.

영향:

- 신규 학생의 `ownBindings`가 빈 배열인 상태로 두 번째 충돌이 나면 `등록된 출석 기기가 없습니다.` 404가 throw될 수 있다.
- 1~2개 등록 상태에서 충돌이 반복되면 원래 자동 등록되어야 할 상황이 재등록 요청으로 바뀔 수 있다.

권장:

- 충돌 후에는 반드시 fresh read 후 분기한다.
- 더 나은 방식은 `ensure_attendance_device_binding(...)` DB 함수로 advisory lock, select, insert/update를 한 트랜잭션에서 처리하는 것이다.

### P1 - 빈도/운영 환경에 따라 큰 불편을 만들 수 있는 결함

#### 4. QR/출석 코드 만료와 표시 기기 Wi-Fi 불안정

관련 코드:

- `src/lib/attendance/constants.ts`: `ATTENDANCE_ROTATION_MS = 30_000`
- `src/app/api/attendance/submit/route.ts`: 현재 rotation과 직전 rotation만 허용
- `src/app/attendance-display/[courseId]/page.tsx`: fetch 실패 시 error 화면으로 바뀌고, stale code overlay는 없음

검증:

- 숫자 출석 코드는 30초마다 바뀌며 서버는 현재/직전 코드만 받는다. 실효 허용 범위는 입력 시점에 따라 약 30~60초다.
- 표시 기기 Wi-Fi가 끊겨 화면이 갱신되지 않으면 학생은 만료된 코드를 입력하게 된다.
- 현재 `INVALID_CODE`는 DB 이벤트로 남지 않아 어떤 학생/시점/세션에서 많이 발생했는지 SQL로 추적할 수 없다.

영향:

- Wi-Fi가 불안정한 강의실에서는 특정 시간대에 다수 학생이 동시에 실패할 수 있다.
- 관리자는 관리자 수동 출석으로만 복구하게 된다.

권장:

- display 화면에 `rotationExpiresAt + 5초` 이상 갱신이 없으면 "연결 끊김/코드 갱신 중지" 오버레이를 표시한다.
- submit route에서 invalid code를 `attendance_events`에 기록한다. 입력한 실제 code는 저장하지 말고, `display_session_id`, `subject_id`, `current_rotation`, `browser/user_agent`, `device_source` 정도만 저장한다.
- 운영상으로는 표시용 스마트폰을 강의실 Wi-Fi에 고정하고, 출석 시작 후 바로 세션을 재시작하지 않는 절차가 필요하다.

#### 5. Presence `low_accuracy`가 실내 GPS에서 과도하게 차단될 수 있음

관련 코드:

- `src/lib/presence/location.ts`
  - `allowedRadiusM = course.presence_radius_m ?? 180`
  - `allowedAccuracyM = course.presence_accuracy_max_m ?? 250`
  - `accuracy > allowedAccuracyM`이면 거리 계산 전 `low_accuracy`
  - 거리 slack은 `allowedRadiusM + min(accuracy, 100)`으로 최대 280m 수준

검증:

- 코드상 "180m + 정확도 250m = 430m" 또는 "350m slack"이 아니다.
- 정확도 251m 이상이면 실제 좌표가 학원 바로 위여도 `low_accuracy`로 차단된다.
- `getPresenceLocation()`은 `enableHighAccuracy: true`, `timeout: 10_000`, `maximumAge: 0`을 쓰지만 실내/지하/건물 밀집 지역에서 accuracy 250m 초과는 충분히 발생 가능하다.

영향:

- presence가 `enforce` 모드이면 출석 제출 자체가 차단된다.
- 특정 브라우저, 특히 카카오 인앱 또는 위치 권한 상태가 불안정한 환경에서 집중될 수 있다.

권장:

- 1~2주간 `presence_verification_events`에서 `low_accuracy`, `timeout`, `permission_denied` 비율을 관측한다.
- 실제 현장 학생이 다수 차단되면 출석에 대해서는 일시적으로 `monitor` 모드 또는 `presence_accuracy_max_m` 상향을 검토한다.
- 코드 개선안: `distance <= radius`이고 `accuracy`만 초과한 경우에는 enforce block 대신 monitor_failed로 기록하고 통과시키는 soft-pass 정책을 선택할 수 있다.

#### 6. 재등록 승인 시 UPDATE 방식이라 device binding 이력이 손실됨

관련 코드:

- `approveAttendanceDeviceReRegistration()`에서 기존 binding row의 `device_key_hash`를 새 요청 hash로 UPDATE

검증:

- 현재 설계가 "현재 활성 슬롯 3개"만 관리하는 목적이라면 동작상 문제는 아니다.
- 다만 운영 디버깅 관점에서는 기존 hash가 active row에서 사라지고, 어떤 기기를 언제 retired했는지 binding table만으로 추적하기 어렵다.

영향:

- 재등록 승인 이후 "왜 이 학생의 기존 기기가 갑자기 새 기기로 바뀌었는지"를 attendance_events에만 의존해야 한다.
- 과거 attendance_records에는 기존 hash가 남지만, binding history로는 자연스럽게 이어지지 않는다.

권장:

- 감사 추적이 중요하면 UPDATE 대신 기존 row retire + 새 row insert를 한 트랜잭션/RPC로 처리한다.
- 단순 슬롯 관리가 목적이면 현재 UPDATE 방식은 허용 가능하다.

### P2 - 관측성/정합성 개선 항목

#### 7. `src/lib/qr/token.ts`는 숫자 출석 코드 경로가 아님

- `src/lib/qr/token.ts`는 enrollment/course 기반 QR token을 10분 TTL로 생성/검증한다.
- 출석 숫자 코드는 `src/lib/attendance/token.ts`의 HMAC 기반 6자리 rotation code다.
- 4월 30일 숫자 코드 불일치와 `src/lib/qr/token.ts`는 직접 관련이 낮다.

#### 8. submit route의 pre-check query error 미처리

관련 코드:

- `src/app/api/attendance/submit/route.ts`
  - `existingAttendance`, `existingDeviceAttendance`의 `.error`를 명시적으로 검사하지 않는다.

영향:

- 일반적으로 최종 insert unique constraint가 중복 출석을 막지만, pre-check 오류가 있으면 사용자 메시지가 부정확하거나 device lock 체크가 우회될 수 있다.

권장:

- 두 pre-check query의 error를 검사하고, device lock pre-check 실패 시 안전하게 500 또는 재시도 가능 응답으로 처리한다.

#### 9. `202604300001`에는 DOWN 스크립트가 없음

관련 파일:

- `supabase/migrations/202604300001_attendance_device_binding_limit.sql`

검증:

- migration은 기존 active enrollment unique index를 drop하고, non-unique index + max 3 trigger를 추가한다.
- 기존 데이터 DML은 없으므로 보존성은 좋다.
- rollback이 필요하면 trigger/function/index를 되돌리는 수동 SQL이 필요하다.

권장 DOWN 예시:

```sql
drop trigger if exists attendance_device_binding_limit_trigger
  on class_pass.attendance_device_bindings;

drop function if exists class_pass.enforce_attendance_device_binding_limit();

drop index if exists class_pass.idx_attendance_device_bindings_active_enrollment;

-- 운영 데이터에 동일 enrollment active row가 2개 이상 있으면 아래 unique index 생성은 실패한다.
create unique index attendance_device_bindings_active_enrollment_key
  on class_pass.attendance_device_bindings (course_id, enrollment_id)
  where is_active;
```

## 의심 이슈 A-E 검증표

| 이슈 | 실제 발생 가능성 | 빈도 예상 | 영향 | 판정 |
| --- | --- | --- | --- | --- |
| A. 동시 출석 race condition | 있음. migration 적용 후 낮아졌지만 stale snapshot fallback은 남아 있음 | 낮음~중간 | 일부 학생 404/재등록 요청 또는 출석 실패 | P0/P1 경계. 재조회 루프 또는 RPC 권장 |
| B. matching binding update 시 reset request 정리 누락 | 있음 | 중간 | stale 승인 요청, 관리자 혼선, 승인 후 기존 기기 불일치 | P0. 코드 패치 권장 |
| C. 재등록 승인 UPDATE로 이력 손실 | 있음. 동작 버그라기보다 감사성 결함 | 낮음~중간 | 운영 추적 어려움 | P1/P2. retire+insert RPC 선택 |
| D. QR 코드 만료 + 약한 Wi-Fi | 있음 | 강의실 네트워크에 따라 중간~높음 | 다수 학생 invalid code | P1. stale display 감지 + invalid code logging 권장 |
| E. Presence 350m slack 오해/low_accuracy 차단 | 있음. 실제 코드는 max distance 280m 수준이고 accuracy 250 초과 즉시 차단 | 환경 의존 | 실내 GPS 불량 학생 차단 | P1. 모니터링 후 threshold/soft-pass 조정 |

## 권장 패치

### Patch 1 - pending reset 정리

의도:

- 기존 정상 기기로 출석 성공 시 stale 재등록 요청을 제거한다.

핵심 변경:

```ts
if (matchingBinding) {
  const updateResult = await db
    .from('attendance_device_bindings')
    .update({
      last_seen_at: nowIso,
      reset_requested_at: null,
      reset_requested_device_key_hash: null,
      reset_requested_user_agent: null,
      updated_at: nowIso,
    })
    .eq('course_id', params.courseId)
    .eq('enrollment_id', params.enrollmentId)
    .eq('is_active', true)
    .select('*')
}
```

주의:

- 위 코드는 같은 enrollment의 모든 active row pending을 취소한다. 운영 의도가 "등록된 기기로 출석 성공하면 pending 요청은 무효"라면 이 방식이 가장 단순하다.
- 이벤트를 추가하려면 `attendance_events_type_check` migration에 `attendance_device_rebind_cancelled`를 추가해야 한다.

### Patch 2 - `enforceAttendanceDeviceBinding` 충돌 후 fresh read

의도:

- insert conflict/trigger conflict 후 stale `ownBindings`로 판단하지 않는다.

핵심 방향:

```ts
for (let attempt = 0; attempt < 3; attempt += 1) {
  const ownBindings = await listActiveAttendanceDeviceBindings(db, { courseId, enrollmentId })
  const matching = ownBindings.find((row) => row.device_key_hash === deviceKeyHash)
  if (matching) {
    return touchAndReturnState(matching, ownBindings)
  }

  if (ownBindings.length < ATTENDANCE_DEVICE_BINDING_LIMIT) {
    const inserted = await tryInsertBinding(...)
    if (inserted.ok) {
      return inserted.result
    }
    if (inserted.conflict) {
      continue
    }
    throw inserted.error
  }

  return requestRebind(...)
}

throw new AttendanceServiceError('출석 기기 등록 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.', 409)
```

더 좋은 장기안:

- `class_pass.ensure_attendance_device_binding(...)` RPC를 만들고 advisory lock 안에서 select/insert/update/log를 처리한다.
- 이렇게 하면 Vercel 동시 요청, Supabase round-trip, stale read 문제를 DB 트랜잭션으로 닫을 수 있다.

### Patch 3 - active display session 단일성 보장

즉시 코드 방어:

```ts
const response = await query.limit(1).maybeSingle()
```

DB migration preflight:

```sql
select
  course_id,
  count(*) as active_count,
  array_agg(id order by created_at desc) as session_ids
from class_pass.attendance_display_sessions
where revoked_at is null
group by course_id
having count(*) > 1;
```

운영 검토 후 forward migration:

```sql
create unique index attendance_display_sessions_one_active_per_course
  on class_pass.attendance_display_sessions (course_id)
  where revoked_at is null;
```

DOWN:

```sql
drop index if exists class_pass.attendance_display_sessions_one_active_per_course;
```

주의:

- `expires_at > now()`는 partial index predicate로 적절하지 않다. `now()`가 immutable이 아니기 때문이다.
- 따라서 expired session도 새 session 시작 전에 revoke되어야 한다. 현재 admin POST는 `revoked_at is null` 전체를 revoke하므로 이 제약과 맞는다.

### Patch 4 - invalid code 관측성 추가

권장 event type:

- `attendance_code_invalid`
- `attendance_device_cookie_mismatch`
- `attendance_device_rebind_cancelled`

invalid code logging 예시:

```ts
await logAttendanceEvent({
  course_id: access.course.id,
  event_type: 'attendance_code_invalid',
  details: {
    enrollment_id: access.enrollment.id,
    display_session_id: displaySession.id,
    subject_id: displaySession.subject_id,
    current_rotation: currentRotation,
    user_agent: req.headers.get('user-agent'),
    device_source: device.source,
    local_key_matched_cookie: device.localKeyMatchedCookie,
  },
})
```

주의:

- 학생이 입력한 실제 6자리 code는 저장하지 않는다.
- event type 추가 migration이 필요하다.

### Patch 5 - display stale overlay

의도:

- 표시 기기 Wi-Fi가 끊겼을 때 만료된 코드를 계속 보여주지 않는다.

핵심 방향:

- `now > Date.parse(payload.rotationExpiresAt) + 5_000`이면 코드 영역 위에 "연결 끊김, 코드를 갱신 중입니다" 오버레이를 표시한다.
- fetch 실패 시 전체 error 화면으로 전환하기보다 마지막 payload는 유지하되, stale 상태를 크게 표시한다.

### Patch 6 - presence soft-pass 또는 threshold 조정

운영 데이터 확인 전 기본 권장:

- 출석 기능은 `monitor` 모드로 1~2주 계측하거나, enforce라면 `presence_accuracy_max_m`를 500~800m로 임시 상향 검토.

코드 정책 변경안:

- `accuracy > allowedAccuracyM`라도 `distanceM <= allowedRadiusM`이면 통과시키고 `monitor_failed` 이벤트로 기록한다.
- 단, 이 정책은 부정 출석 방지 강도를 낮춘다. 운영 철학에 따라 선택해야 한다.

## 단위 테스트 추가 권장

현재 프로젝트에는 별도 테스트 러너 구성이 보이지 않는다. 최소 범위로는 Vitest 또는 Node test runner를 추가하고, Supabase client를 mockable하게 service helper를 분리하는 방식이 좋다.

권장 테스트:

1. `mapAttendanceDeviceState`
   - active 0개: `unregistered`, `registered_count=0`
   - active 1~3개: 최신 `last_seen_at` 선택
   - pending row가 있으면 `pending_reset`
   - 4개 이상 기존 데이터가 있어도 함수가 throw하지 않음

2. `pickDeviceBindingForNewRequest`
   - 같은 requested hash pending row 우선
   - 없으면 최신 pending 우선
   - pending도 없으면 가장 오래된 active row 선택

3. `enforceAttendanceDeviceBinding`
   - 등록 기기 재사용 시 `last_seen_at` 갱신 및 pending reset 정리
   - 0개 상태에서 새 기기 자동 등록
   - 1~2개 상태에서 새 기기 자동 등록
   - 3개 상태에서 새 기기는 `DEVICE_REBIND_REQUIRED`
   - insert 23505/23514 후 fresh read로 matching binding 성공
   - 다른 enrollment 소유 device hash는 `DEVICE_LOCKED`

4. `approveAttendanceDeviceReRegistration`
   - pending이 없으면 409
   - requested hash가 다른 enrollment active hash면 409
   - pending 중 최신 요청을 승인
   - retire+insert 방식으로 변경한다면 old row retired, new row active 검증

5. submit route
   - invalid code는 400 + `INVALID_CODE`
   - invalid code event logging 호출
   - active display session이 여러 개라도 최신 1개를 선택하거나 DB 제약으로 생성 불가
   - pre-check query error를 500으로 처리

6. presence
   - accuracy 251m, distance 0m 케이스
   - stale location > 30초
   - monitor mode에서는 `shouldBlock=false`
   - enforce mode에서는 정책대로 차단/soft-pass

7. display runtime
   - refresh delay가 만료 2초 전에 예약됨
   - rotation expired + 5초 후 stale state가 true

## 운영 모니터링 SQL

아래 SQL은 운영 DB에 직접 실행하기 전에 read-only 세션에서만 사용한다. DML/DDL은 포함하지 않았다.

### 1. active device binding 수 분포

```sql
select
  course_id,
  active_count,
  count(*) as enrollment_count
from (
  select
    course_id,
    enrollment_id,
    count(*) as active_count
  from class_pass.attendance_device_bindings
  where is_active
  group by course_id, enrollment_id
) grouped
group by course_id, active_count
order by course_id, active_count;
```

### 2. 3대 초과 active binding 존재 여부

```sql
select
  course_id,
  enrollment_id,
  count(*) as active_count,
  array_agg(id order by coalesce(last_seen_at, bound_at, updated_at, created_at) desc) as binding_ids
from class_pass.attendance_device_bindings
where is_active
group by course_id, enrollment_id
having count(*) > 3
order by active_count desc, course_id, enrollment_id;
```

### 3. pending reset 현황

```sql
select
  course_id,
  date_trunc('day', reset_requested_at at time zone 'Asia/Seoul') as requested_day,
  count(*) as pending_count,
  count(distinct enrollment_id) as enrollment_count
from class_pass.attendance_device_bindings
where is_active
  and reset_requested_at is not null
group by course_id, requested_day
order by requested_day desc, course_id;
```

### 4. 재등록 관련 이벤트 추이

```sql
select
  course_id,
  date_trunc('hour', created_at at time zone 'Asia/Seoul') as hour_kst,
  event_type,
  count(*) as event_count
from class_pass.attendance_events
where event_type in (
  'attendance_device_registered',
  'attendance_device_locked',
  'attendance_device_rebind_requested',
  'attendance_device_rebind_approved',
  'attendance_device_binding_reset'
)
  and created_at >= now() - interval '14 days'
group by course_id, hour_kst, event_type
order by hour_kst desc, course_id, event_type;
```

### 5. active display session 중복

```sql
select
  course_id,
  count(*) as active_session_count,
  array_agg(id order by created_at desc) as session_ids,
  max(created_at) as latest_created_at
from class_pass.attendance_display_sessions
where revoked_at is null
group by course_id
having count(*) > 1
order by active_session_count desc, latest_created_at desc;
```

### 6. 출석 세션 빠른 재시작 탐지

```sql
with ordered as (
  select
    course_id,
    subject_id,
    id,
    created_at,
    lag(created_at) over (
      partition by course_id
      order by created_at
    ) as previous_created_at
  from class_pass.attendance_display_sessions
  where created_at >= now() - interval '14 days'
)
select
  course_id,
  subject_id,
  id,
  previous_created_at,
  created_at,
  extract(epoch from created_at - previous_created_at) as seconds_since_previous
from ordered
where previous_created_at is not null
  and created_at - previous_created_at <= interval '60 seconds'
order by created_at desc;
```

### 7. 관리자 수동 출석 비율

```sql
select
  course_id,
  subject_id,
  attended_date,
  count(*) as total_records,
  count(*) filter (where device_key_hash = 'admin_override') as admin_override_records,
  round(
    100.0 * count(*) filter (where device_key_hash = 'admin_override') / nullif(count(*), 0),
    2
  ) as admin_override_rate_pct
from class_pass.attendance_records
where attended_date >= (now() at time zone 'Asia/Seoul')::date - interval '14 days'
group by course_id, subject_id, attended_date
order by attended_date desc, course_id, subject_id;
```

### 8. presence 실패 코드 분포

```sql
select
  course_id,
  feature,
  enforcement_mode,
  result,
  error_code,
  browser_context,
  count(*) as event_count,
  percentile_cont(0.5) within group (order by accuracy_m) as accuracy_p50,
  percentile_cont(0.9) within group (order by accuracy_m) as accuracy_p90,
  percentile_cont(0.95) within group (order by accuracy_m) as accuracy_p95
from class_pass.presence_verification_events
where created_at >= now() - interval '14 days'
group by course_id, feature, enforcement_mode, result, error_code, browser_context
order by event_count desc;
```

### 9. presence low_accuracy 상세

```sql
select
  course_id,
  enrollment_id,
  created_at,
  accuracy_m,
  distance_m,
  allowed_radius_m,
  allowed_accuracy_m,
  browser_context,
  message
from class_pass.presence_verification_events
where created_at >= now() - interval '14 days'
  and error_code = 'low_accuracy'
order by created_at desc;
```

### 10. invalid code 이벤트 추가 후 사용할 SQL

현재 코드는 invalid code를 DB에 기록하지 않는다. `attendance_code_invalid` 이벤트를 추가한 뒤 아래 SQL을 사용한다.

```sql
select
  course_id,
  details->>'subject_id' as subject_id,
  details->>'display_session_id' as display_session_id,
  date_trunc('minute', created_at at time zone 'Asia/Seoul') as minute_kst,
  count(*) as invalid_count
from class_pass.attendance_events
where event_type = 'attendance_code_invalid'
  and created_at >= now() - interval '14 days'
group by course_id, subject_id, display_session_id, minute_kst
order by invalid_count desc, minute_kst desc;
```

## 1~2주 운영 모니터링으로 검증할 가설

1. 재등록 요청은 대부분 `registered_count = 3`인 학생에게서만 발생해야 한다. 1~2대 상태에서 계속 발생하면 코드/마이그레이션 정합성 문제가 남아 있다.
2. invalid code 실패가 특정 시간대에 몰리면 display Wi-Fi 끊김, 세션 빠른 재시작, 또는 표시 기기 stale 문제가 원인일 가능성이 높다.
3. `low_accuracy`가 presence 실패의 다수를 차지하면 GPS 정책이 현장 환경보다 엄격하다.
4. `browser_context = kakao`에서 presence 실패나 device mismatch가 집중되면 카카오 인앱 브라우저 안내/차단 또는 외부 브라우저 열기 UX가 필요하다.
5. active display session 중복은 항상 0이어야 한다. 1건이라도 발견되면 DB 제약 또는 admin POST transaction화가 필요하다.
6. 관리자 수동 출석 비율은 배포 후 1% 미만으로 내려가야 한다. 특정 과목/강의실만 높으면 네트워크/표시 기기/위치 인증 환경 문제를 우선 확인한다.
7. `attendance_device_locked`가 증가하면 동일 기기 대리 출석 시도이거나, 쿠키 도메인/브라우저 저장소 꼬임으로 서로 다른 학생이 같은 device key를 공유하는 케이스를 확인해야 한다.

## 운영 적용 전 체크리스트

- [ ] `202604300001` 적용 후 `attendance_device_bindings_active_enrollment_key`가 실제로 제거됐는지 확인
- [ ] `idx_attendance_device_bindings_active_enrollment`와 `attendance_device_binding_limit_trigger` 존재 확인
- [ ] active binding 3대 초과 학생이 없는지 확인
- [ ] active display session 중복이 없는지 확인
- [ ] invalid code/event type 추가 migration은 운영 적용 전 별도 검토
- [ ] presence enforce 모드 강좌 목록과 threshold 확인
- [ ] 출석 시작 운영 절차: 한 번 시작 후 재시작 금지, 표시 기기 Wi-Fi 고정, 화면 stale 여부 확인

## 적용 완료 - 2026-04-30

이번 작업에서 P0 패치를 코드와 migration 파일로 적용했다. 운영 DB에는 직접 DDL/DML을 실행하지 않았다.

적용 항목:

1. Patch 1: 등록된 기기로 정상 매칭되면 해당 binding의 `reset_requested_*`를 정리하고, 같은 학생의 다른 active binding에 남은 pending reset도 정리하도록 변경했다.
2. Patch 2: `enforceAttendanceDeviceBinding`의 insert/update 충돌 처리 후 stale snapshot으로 판단하지 않도록 최대 3회 fresh read 루프로 변경했다.
3. Patch 3: active display session 조회는 최신 1건만 읽도록 `.limit(1).maybeSingle()` 방어를 추가했다.
4. Patch 3 DB guard: `attendance_display_sessions_one_active_per_course` partial unique index migration을 추가했다. migration 내부 preflight가 active 중복 session을 발견하면 적용을 중단한다.
5. Patch 4: `INVALID_CODE` 발생 시 `attendance_code_invalid` 이벤트를 best-effort로 기록하도록 추가했다. 학생이 입력한 실제 6자리 코드는 저장하지 않는다.
6. 단위 테스트: device binding 정책과 invalid-code 이벤트 details를 Node 내장 test runner로 검증하는 테스트를 추가했다.

운영 확인 결과:

- 사용자가 제공한 active display session 중복 결과가 `<위 SQL 결과 N건 또는 0건>` placeholder였기 때문에, 코드에서 운영 DB 확인은 수행하지 않았다.
- 신규 migration `202604300002_attendance_stability_events_and_display_session_guard.sql`는 운영 적용 시 중복 active display session이 있으면 `ACTIVE_ATTENDANCE_DISPLAY_SESSION_DUPLICATES_EXIST`로 실패한다. 이 경우 먼저 중복 session을 운영자가 확인/정리한 뒤 재적용해야 한다.

변경 파일:

- `package.json`
- `tsconfig.test.json`
- `src/lib/attendance/device-binding-policy.ts`
- `src/lib/attendance/service.ts`
- `src/lib/attendance/submit-event-details.ts`
- `src/app/api/attendance/submit/route.ts`
- `supabase/migrations/202604300002_attendance_stability_events_and_display_session_guard.sql`
- `supabase/rollbacks/202604300002_attendance_stability_events_and_display_session_guard.down.sql`
- `tests/attendance/device-binding-policy.test.ts`
- `tests/attendance/submit-event-details.test.ts`
- `docs/attendance-review-202604.md`

검증:

- `pnpm exec tsc --noEmit`
- `pnpm run test:attendance`
