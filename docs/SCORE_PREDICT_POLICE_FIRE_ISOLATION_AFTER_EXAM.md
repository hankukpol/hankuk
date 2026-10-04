# 경찰·소방 합격예측 분리 작업 보관 계획서

> 작성일: 2026-08-15  
> 상태: 시험 운영 종료 후 실행 대기  
> 중요: 이 문서는 보관용 계획서다. 사용자가 별도로 작업 시작을 지시하기 전에는 코드, DB, Git, Vercel, Supabase를 변경하지 않는다.

## 1. 지금은 변경하지 않는 이유

- 2026년 하반기 경찰공무원 필기시험은 8월 22일 10:00~11:40에 진행된다.
- 현재 경찰 사이트는 운영 중이며 활성 시험과 사전등록 흐름이 정상 작동한다.
- 2026-08-15 운영 DB 읽기 전용 확인 결과 경찰 회원 351명, 제출 168건, 소방 회원 219명, 제출 93건이다.
- 경찰·소방 교차 시험유형과 잘못된 `tenantType` 데이터는 0건이고, 아이디·연락처·이메일 중복 그룹도 양쪽 모두 0건이다.
- 현재 경찰 회차 운영 단계는 `PRE_REGISTRATION`이며 OMR 제출 기능은 꺼져 있다. 제출 API도 조기 제출을 403으로 차단한다.
- 분리 작업은 인증, Prisma 라우팅, 제출, 결과, 예측, 관리자 API 등 운영 핵심 경로를 건드리므로 시험 직전이나 시험 당일에 배포하지 않는다.

### 시험 당일 운영 원칙

1. 시험 중에는 현재 코드와 `PRE_REGISTRATION` 상태를 유지한다.
2. 랜딩, 프로모션, 로그인, 회원가입, 공지, FAQ, 사전등록은 운영할 수 있다.
3. OMR 입력은 11:40 이전에 열지 않는다.
4. 시험 종료 후 관리자가 수동으로 `SCORING_OPEN`으로 전환한다.
5. 시험 종료 직후의 제출·결과·예측 트래픽이 안정될 때까지 코드나 DB를 배포하지 않는다.

## 2. 작업 시작 조건

다음 조건을 모두 충족하고 사용자가 명시적으로 시작을 지시한 뒤에만 실행한다.

- 시험 당일 OMR 제출과 결과 조회가 정상 운영됨
- 시험 종료 후 최소 1일 이상 운영 데이터와 오류 로그 확인 완료
- 경찰·소방 운영 DB 최신 백업 완료
- 회원·제출·답안·점수 기준 건수와 체크섬 기록 완료
- 긴급 운영 수정이 없는 안정된 시간대 확보
- Preview 또는 별도 검증 환경 준비

## 3. 확정 운영 구조

| 구분 | 경찰 | 소방 | 공통 사용 |
|---|---|---|---|
| 운영 주소 | `fullservice.hankukpol.co.kr` | `fullservice.119sobang.co.kr` | 같은 Vercel 앱 |
| DB 스키마 | `score_predict_police` | `score_predict_fire` | 공유 회원 테이블 금지 |
| 회원·아이디·비밀번호·세션 | 경찰 스키마 전용 | 소방 스키마 전용 | 화면 UI만 |
| 시험유형 | 일반공채, 경행경채 | 공채, 구조·학위·구급 경채 | 없음 |
| 채점·배수·컷라인·예측 | 경찰 전용 | 소방 전용 | 없음 |
| OMR·결과·최종예측 | 경찰 전용 화면·서버 | 소방 전용 화면·서버 | 없음 |
| 공지·FAQ·프로모션 | 경찰 데이터 | 소방 데이터 | 렌더링·편집 UI만 |

- 한 사람이 경찰과 소방에 동일한 아이디, 이메일, 전화번호로 각각 가입할 수 있다.
- 한쪽 가입, 로그인, 비밀번호 변경, 계정 복구가 다른 쪽 계정에 영향을 주면 안 된다.
- 하나의 `score-predict` 앱, 하나의 Vercel 프로젝트, 하나의 Supabase 프로젝트를 유지한다.
- 두 스키마는 같은 Supabase 안의 논리적 분리다. 인프라 장애 범위까지 물리적으로 분리되는 구조는 아니다.

## 4. 절대 변경하면 안 되는 항목

- 기존 회원 삭제·병합·아이디 변경
- 비밀번호 일괄 재암호화
- 경찰·소방 간 회원 또는 시험 데이터 이동
- 기존 제출·답안·점수 일괄 재계산
- 경찰과 소방 계산식 통합
- 외부 URL과 API 요청·응답 계약 변경
- 적용된 과거 마이그레이션 수정
- 운영 DB에서 사전 감사 없이 제약조건 적용
- 시험 운영 중 구조 리팩터링 배포

## 5. 단계별 구현 계획

### 1단계: 기준선과 문서·가드레일

- 운영 백업, 테이블 건수, 식별자와 점수 체크섬을 다시 기록한다.
- `AGENTS.md`, 공통 인증 문서, 프로젝트 지도를 실제 운영 구조와 맞춘다.
- `score-predict`는 공용 인증의 승인된 예외임을 명시한다.
- CI에서 경찰 핸들러의 소방 import, 소방 핸들러의 경찰 import, 공통 UI의 DB·세션 import를 차단한다.
- 기존 `tenant-module-isolation-test.ts`의 final-prediction 동시 import 요구를 직렬별 핸들러 격리 검사로 교체한다.

### 2단계: 인증 경계 정리

- 참조가 없는 `src/lib/shared-auth.ts`를 제거한다.
- `portal-bridge`의 HTTP 410 응답을 유지한다.
- 경찰과 소방 로그인 처리기를 각각 전용 모듈로 이동한다.
- 아이디 찾기, 비밀번호 찾기·변경, 계정 보안 API도 직렬 전용 처리기로 분리한다.
- 아이디 대소문자 무시, 기존 비밀번호 해시 호환, 이름·휴대전화 아이디 찾기, 경찰 MFA와 로그인 제한을 보존한다.
- `public` 스키마의 기존 공유 인증 관련 행은 초기 작업에서 삭제하지 않는다.

### 3단계: 시험 API 직렬별 분리

- 공통 `route.ts`는 신뢰된 운영 호스트로 직렬을 판별하고 해당 처리기 하나만 호출한다.
- 경찰 처리기는 `lib/police/*`와 경찰 DB만 사용한다.
- 소방 처리기는 `lib/fire/*`와 소방 DB만 사용한다.
- 분리 순서는 제출, 결과, 최종예측, 메인 통계, 응시번호 확인, 관리자 API 순서로 한다.
- 대상 관리자 API는 정답, 목업 데이터, 컷 공개, 지역, 제출 관리다.
- `tenant-calculations.server.ts`와 `tenant-regions.ts`는 명시적 디스패처로 유지할 수 있다.
- 계산식과 저장된 점수는 변경하지 않는다.

### 4단계: 공통 UI 정리

- 로그인, 회원가입, 아이디 찾기, 비밀번호 찾기, 계정 보안, 홈, 공지, FAQ, 게시판, 프로모션의 표현 UI만 공통화한다.
- 공통 UI는 `TenantConfig`의 문구·라벨과 직렬 전용 콜백만 받는다.
- 공통 UI에서 DB 조회, 세션 발급, 직렬 판별, 시험유형 판별, 채점·예측 계산을 금지한다.
- OMR 입력, 결과, 성적분석, 합격예측, 최종예측 화면은 직렬별 파일을 유지한다.
- 소방 결과 화면에만 있는 채점 대기 상태와 관리자 검색 기능은 동작을 검증한 뒤 경찰 결과 화면에도 동일하게 제공한다.
- 기존 `DESIGN.md` 토큰과 반응형 동작을 유지하고 390px, 768px, 1280px에서 실제 브라우저로 확인한다.

### 5단계: Prisma와 DB 이중 안전장치

- 마이그레이션으로 이미 존재하는 `User.smsMarketingConsentAt`, `smsMarketingConsentVersion`, `smsMarketingWithdrawnAt` 필드를 Prisma 스키마에 반영한다. 운영 컬럼은 삭제하지 않는다.
- 콘텐츠 모델의 `tenantType @default("fire")`를 제거하되 컬럼과 조회 필터는 유지한다.
- 경찰 스키마에는 `tenantType='police'`, 소방 스키마에는 `tenantType='fire'`만 허용하는 CHECK 제약을 추가한다.
- 경찰 시험유형은 `PUBLIC`, `CAREER`만 허용한다.
- 소방 시험유형은 `PUBLIC`, `CAREER_RESCUE`, `CAREER_ACADEMIC`, `CAREER_EMT`만 허용한다.
- 시험유형 제약 대상은 `Subject`, `Submission`, `AnswerKeyLog`, `RescoreEvent`, `PassCutSnapshot`, `PredictionCalibrationSnapshot`, `PreRegistration`이다.
- 배포 시점의 사전 감사에서 잘못된 행이 하나라도 발견되면 마이그레이션을 중단한다.
- 행 이동·삭제·수정 없이 제약만 추가한다.

### 6단계: DB 클라이언트 명시화

- `policeDb`, `fireDb` 명시적 클라이언트를 추가한다.
- 인증, 제출·채점, 결과·예측, 관리자, 콘텐츠 순서로 공통 Prisma 프록시 사용처를 교체한다.
- 모든 사용처가 전환된 후에만 공통 프록시를 제거한다.
- 가능하면 경찰·소방 전용 DB 역할과 `SCORE_PREDICT_POLICE_DATABASE_URL`, `SCORE_PREDICT_FIRE_DATABASE_URL`을 추가한다.
- 하나의 서버 프로세스가 두 연결 정보를 보유한다는 한계를 문서에 유지한다.

## 6. 배포와 롤백 순서

각 단계는 별도 커밋과 별도 Preview 검증 후 운영에 한 단계씩 배포한다.

| 배포 단계 | 내용 | 롤백 |
|---|---|---|
| 1 | 문서와 CI 가드레일 | 직전 Vercel 배포 복원 |
| 2 | 공용 인증 잔재 제거와 인증 처리기 분리 | 직전 배포 복원, `public` 데이터 유지 |
| 3 | 사용자 시험 API 분리 | 직전 배포 복원, DB 행 변경 없음 |
| 4 | 관리자 시험 API 분리 | 직전 배포 복원 |
| 5 | 공통 UI 정리 | 직전 배포 복원 |
| 6 | Prisma 드리프트와 CHECK 제약 | CHECK 제약만 DROP, 행 변경 없음 |
| 7 | 명시적 DB 클라이언트 전환 | 직전 단계 배포와 기존 연결 정보로 복원 |

- 빌드 과정에서 운영 마이그레이션을 자동 실행하지 않는다.
- 이전 DB 역할과 연결 문자열은 안정화 기간 동안 유지한다.
- 한 단계의 운영 검증이 끝나기 전 다음 단계를 배포하지 않는다.

## 7. 필수 검증

```bash
pnpm --dir ./apps/score-predict typecheck
pnpm --dir ./apps/score-predict lint
pnpm --dir ./apps/score-predict build
pnpm --dir ./apps/score-predict verify:calculations
pnpm --dir ./apps/score-predict test:tenant-isolation
pnpm --dir ./apps/score-predict test:exam-lifecycle
pnpm --dir ./apps/score-predict test:account-recovery
pnpm --dir ./apps/score-predict test:account-identity-conflicts
pnpm --dir ./apps/score-predict test:admin-workflow
pnpm --dir ./apps/score-predict test:police-user-journey
pnpm --dir ./apps/score-predict test:promotions
pnpm --dir ./apps/score-predict test:notice-board-crud
```

추가 수용 조건:

- 경찰 주소에서 경찰 데이터만, 소방 주소에서 소방 데이터만 조회된다.
- 동일한 아이디·이메일·전화번호로 양쪽에 각각 가입할 수 있다.
- 한쪽 비밀번호 변경과 세션 만료가 다른 쪽에 영향을 주지 않는다.
- 이름·휴대전화 아이디 찾기는 현재 직렬 계정만 반환한다.
- 경찰 경행경채와 소방 구조·학위·구급 경채의 과목·만점·배점이 각각 맞다.
- 다른 직렬 세션, 경로, 헤더, 쿠키를 이용한 접근이 차단된다.
- 경찰 DB의 소방 시험유형과 소방 DB의 경찰 시험유형을 DB가 거부한다.
- 배포 전후 회원·제출·답안·점수 건수와 체크섬이 일치한다.
- 공지·FAQ·프로모션이 반대 직렬에 노출되지 않는다.
- 실제 브라우저에서 390px, 768px, 1280px 화면과 주요 오류·빈 상태를 확인한다.

## 8. 재개할 때 사용할 요청문

다음 문장으로 작업을 다시 시작한다.

> `docs/SCORE_PREDICT_POLICE_FIRE_ISOLATION_AFTER_EXAM.md` 계획서를 현재 코드와 운영 DB에 다시 대조한 뒤, 작업 시작 조건을 모두 확인하고 1단계부터 진행해 줘. 운영 데이터 변경과 배포는 각 단계 검증 결과를 먼저 보고한 뒤 진행해 줘.

