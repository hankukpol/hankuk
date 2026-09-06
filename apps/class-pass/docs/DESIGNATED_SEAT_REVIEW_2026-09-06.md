# 지정좌석 리뷰 확인 및 수정 결과

## 범위와 운영 상태

- 운영 `hankuk-main` (`pbonwjwbtqyrfrxqdwlu`)는 함수 정의와 설정만 읽었다. 운영 데이터·스키마 변경, Git 푸시, Vercel 배포는 하지 않았다.
- 관리자 좌석 레이아웃 저장 오류를 수정하고, `claim_designated_seat` 검색 경로 고정 마이그레이션을 준비했다.
- 기존 다른 작업의 변경은 보존했다. UI 레이아웃·기능 플래그·예약 정책은 변경하지 않았다.

## 리뷰에서 정정할 내용

운영의 4인자 `claim_designated_seat`는 좌석의 강의실을 조회한 뒤 5인자 함수를 호출한다. 3인자 `admin_assign_designated_seat`도 4인자 함수에 위임한다. 함수 본문에 `DEVICE_LOCKED` 등의 문자열이 없다는 이유만으로 안전장치가 없다고 판정할 수 없다. 두 함수는 호환용 래퍼이며, 이번에는 삭제하지 않았다.

레이아웃의 RPC 예외는 8종이 아니라 9종이다. 입력 오류는 400, 없는 강의실·좌석은 404, 중복 및 기존 배정·이력과의 충돌은 409로 반환한다. 중복 409는 기존 API 사전검사와 동일하다. 알 수 없는 SQL 오류는 원문을 응답에 포함하지 않고 500으로 유지한다.

## 변경 파일

- `src/lib/designated-seat/reason-messages.ts`: 공개 가능한 RPC 예외 9종의 한글 안내.
- `src/app/api/designated-seats/admin/route.ts`: 저장 실패 사유와 상태 코드 연결.
- `tests/designated-seat/layout-save-errors.test.ts`: 실제 라우트의 오류·권한·성공 흐름 17건 검증. DB 경계는 메모리 대역을 사용한다.
- `package.json`: `test:designated-seat-layout` 명령 추가. 기존 스크립트 보존.
- `supabase/migrations/20260905155709_designated_seat_claim_search_path.sql`: 두 claim 함수에 빈 `search_path` 설정. 함수 본문·권한·invoker 속성은 유지한다. 파일명의 시각은 CLI가 생성한 UTC 기준이다.
- `tests/designated-seat/claim-search-path-local.sql`: 고정 검색 경로, 신·구 시그니처의 강의실 닫힘 거부, 예약 기록 미생성을 실제 로컬 DB에서 검사하고 롤백한다.
- `scripts/verify-designated-seat-local.ps1`: 로컬 전용 환경과 독립 검증 서버를 사용한다. `.env` 파일은 수정하지 않는다.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| `pnpm test:designated-seat-layout` | 17/17 통과. 수정 전 사유 매핑 9건 실패를 확인함 |
| `pnpm test:designated-seat-scan` | 7/7 통과 |
| `pnpm verify:designated-seat-display` | 통과 |
| claim 검색 경로 SQL 검사 | 수정 전 실패, 수정 후 통과. 테스트 데이터 롤백 |
| 100명·2개 강의실 HTTP/DB 워크플로 | 예약·이동·강의실 전환·경합·기기 잠금·닫기/재열기 통과 |
| 200명 HTTP/DB 워크플로 | 순차 예약/이동 160명, 동시 예약 20명, 동일 좌석 경합 10쌍 및 복구, 관리자 해제/재배정, 최종 200건 검증 통과 |
| `pnpm exec tsc --noEmit --incremental false` | 통과 |
| `pnpm build` | 종료 코드 0 |
| 변경된 추적 파일 `git diff --check` | 통과 |

검증에서 생성한 고유 테스트 division 4개의 강좌가 모두 0건으로 정리됐음을 로컬 SQL로 재확인했다. SQL 롤백과 테스트 강좌 삭제는 이번에 만든 데이터만 대상으로 했다.

## 로컬 환경에서 발견한 차이

1. `.env.development.local`은 54331 포트를 가리켰지만 현재 프로젝트의 로컬 Supabase API는 54321에서 실행 중이었다. 새 실행 스크립트는 `supabase/config.toml`의 API 포트를 사용한다.
2. 로컬 DB에 `ensure_course_seat_display_schedule_session`이 없어 200명 검증의 예약 시간대 QR 조회가 처음에는 500이었다. 운영에는 이 함수가 존재한다. 기존 `202605270003_atomic_schedule_display_session.sql`의 함수만 로컬에 복원하고 PostgREST 스키마 캐시를 갱신한 후 같은 검증을 통과했다. 해당 기존 마이그레이션 파일은 수정하지 않았다.
3. 로컬 스키마 보완은 지정한 Docker 컨테이너의 psql로 적용했다. migration history를 조작하거나 미적용 마이그레이션을 일괄 push하지 않았다.

## 다시 검증하는 방법

Class-pass 디렉터리의 첫 PowerShell 창에서 검증용 서버를 실행한다. 3011 포트와 `.next-dev`를 쓰며 기존 3002 로컬 미리보기 서버와 구분한다. 다른 `.next-dev` 서버가 실행 중이라면 먼저 조정한다.

```powershell
./scripts/verify-designated-seat-local.ps1 -Mode server
```

두 번째 창에서 순서대로 실행한다. 현재 로컬 Supabase와 필요한 스키마가 준비되어 있어야 한다.

```powershell
./scripts/verify-designated-seat-local.ps1 -Mode multi-room
./scripts/verify-designated-seat-local.ps1 -Mode 200
```

원래 검증 스크립트의 localhost/127.0.0.1 제한은 유지했다. 운영 주소로 우회하거나 검증용 인증값을 운영에 사용하지 않는다.

## 남은 사항

- 신규 `20260905155709_designated_seat_claim_search_path.sql`은 로컬에만 적용했다. 운영 적용은 별도 승인 및 현재 계정·프로젝트·미적용 목록 확인 후 진행해야 한다.
- 빌드에는 기존 `AnimatePresence`, `_width` 미사용 경고와 일부 관리자 데이터의 Supabase 환경설정 미설정 로그가 남는다.
- 로컬 표시기기 등록 로그에 `auth_rate_limits` SQL 참조 오류와 메모리 제한 방식으로의 대체 로그가 있었다. 지정좌석 테스트는 통과했지만, 공통 요청 제한 DB 함수는 별도 확인 대상이다. 이번에는 해당 인증 공통 코드를 변경하지 않았다.
- 위 시나리오 통과는 모든 가능한 동시 실행 조합이나 운영 부하를 검증했다는 뜻은 아니다.

검색 경로 설정은 [Supabase Database Functions 안내](https://supabase.com/docs/guides/database/functions)의 스키마 명시 원칙과 현재 두 함수의 완전 수식된 참조를 확인해 적용했다.
