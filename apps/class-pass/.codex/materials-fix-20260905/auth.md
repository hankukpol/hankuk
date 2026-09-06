# S1 인증 경계 방어 수정

범위: 로컬 소스와 격리된 단위 테스트만 변경. HTTP 우회 재현, 운영/원격 DB 접근, 배포, 커밋 없음.

## 변경

- `src/lib/auth/authenticate.ts`: 관리자·직원·최고관리자 라우트 인증은 요청 메타데이터를 읽지 않고 쿠키 JWT 서명을 직접 검증. 기존 현대식 세션 취소, 현대식 claim의 구형 인증 강등 차단, 역할·학원 일치 검사를 보존.
- `src/lib/auth/verified-auth.ts`: 서명 없는 JSON 인증 reader 제거. 미들웨어용 상수·인코더만 남기고 비인증 메타데이터임을 명시.
- `src/middleware.ts`: 신뢰용 요청 헤더 제거를 정적 파일 조기 반환 앞으로 이동. 정적 파일 형태여도 API라면 인증 검사하며, tenant-prefixed API에도 적용. matcher의 일반 점 경로 제외 제거 및 favicon 제외를 정확한 파일명으로 한정.
- `src/lib/utils.ts`: `parsePositiveInt`는 정규 십진수 표현의 양의 안전 정수 문자열만 허용. 양의 안전 정수 `number` 입력은 호환 유지.
- 테스트: 기존 `tests/auth/operator-session-revocation.test.ts` 확장, `middleware-auth-boundary.test.ts`, `strict-positive-id.test.ts` 추가. package.json·공용 테스트 설정은 수정하지 않음.

## TDD와 검증

```text
node node_modules/tsx/dist/cli.mjs --require ./tests/_setup/stub-server-only.cjs --test tests/auth/*.test.ts
```

- 1차 RED: 149개 중 111 통과 / 38 실패. 메타데이터 신뢰, 점 경로 제외, 조기 반환 헤더 유지, 비정규 ID 허용을 실제 코드 실행으로 관찰.
- 추가 RED: `favicon-ico` 학원 경로가 부정확한 favicon matcher에 걸리는 사례 1 실패 / 17 통과를 확인하고 수정.
- 최종 GREEN: **151 통과 / 0 실패 / 0 건너뜀**. 인증 106개, 미들웨어 18개, ID 27개.
- 실제 `jose` 서명/검증, `NextRequest`, 인증 함수, 미들웨어 및 설치된 Next matcher 검사기를 실행. 네트워크·DB·카메라는 사용하지 않음. 기존 테스트의 operator-session 조회, session-version 조회, 서버 tenant 결정은 메모리 대역이므로 운영 DB의 취소 전파 시간까지 입증하지 않음.
- `git diff --check -- src/middleware.ts src/lib/auth/authenticate.ts src/lib/auth/verified-auth.ts src/lib/utils.ts tests/auth`: 종료 0, 공백 오류 없음. 저장소의 기존 LF→CRLF 안내만 출력.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: 인증 변경 파일의 오류는 없음. 전체 종료 1: 병행 수정 중인 `course-students-page-client.tsx`의 중복 할인 필드 2건, `scan/page.tsx`의 pendingToken 관련 8건. 담당자에게 전달했으며 전체 통과로 보고하지 않음.

## 호환성 및 제한

- 서명된 `cp_admin__학원`, `cp_staff__학원`, `admin_token`, `staff_token`, `cp_super_admin` 지원 보존. 검증된 현대식 세션, 취소된 세션 거부, 구형 버전 회전, 직원 API의 독립 관리자 대체 인증, 동일 출처 쓰기 방어가 통과.
- 의도적 변경: 공백·선행 0·소수 표기·지수 표기·16진수·안전 정수 범위 초과 문자열은 ID로 받지 않음. 정상 정수 문자열과 숫자 호출은 유지.
- 라우트는 미들웨어와 별개로 JWT를 다시 검증하므로 헤더만으로 인증하는 내부 호출은 더 이상 허용하지 않음. 해당 reader의 다른 소스 사용처는 검색 결과 없음.
- 일반 정적 자산은 matcher 진입 후 즉시 반환할 수 있어 기존보다 미들웨어 호출 범위가 넓어짐. `_next/static`, `_next/image`, 정확한 `/favicon.ico`의 framework-level 제외는 유지.
- 로컬 전체 빌드·브라우저 업무 흐름·운영 배포 검증은 이 인증 작업 범위에서 수행하지 않음.
