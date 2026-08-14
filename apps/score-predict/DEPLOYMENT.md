# 경찰·소방 합격예측 배포 운영서

## 서비스 주소

- 경찰 운영: `https://fullservice.hankukpol.co.kr`
- 소방 운영: `https://fullservice.119sobang.co.kr`
- Vercel 원본: `https://score-predict.vercel.app`
- 로컬 공식 호스트: `http://police.localhost:3200`, `http://fire.localhost:3200`
- 로컬·Preview 보조 경로: `/police`, `/fire`

운영 공식 도메인은 접두사 없는 `/login`, `/exam`, `/admin` 경로를 사용한다. 운영 Vercel 원본의 `/police/*`, `/fire/*`는 공식 도메인으로 308 이동하며, 테넌트를 알 수 없는 `/`는 404를 반환한다.

## 로컬 Docker

```powershell
Copy-Item .env.docker.example .env.docker.local
pnpm local:up
pnpm local:reset
pnpm local:test
pnpm local:down
```

`local:reset`은 로컬 Supabase 포트와 로컬 호스트만 허용하며 `score_predict_police`, `score_predict_fire` 두 스키마만 초기화한다. 운영 Supabase 프로젝트 ref가 감지되면 중단한다.
`local:reset`과 `staging:reset`은 `prisma db push` 후 두 스키마에 마이그레이션 이력을 기록하고 DB 전용 제약을 적용한다.

이 저장소의 Prisma 이력은 기존 운영 DB 위에 적용하는 추가 패치 이력이다. `_prisma_migrations`가 없는 기존 스키마는 `db:tenants:deploy`가 idempotent SQL을 먼저 실행하고 기준선을 기록한다. 이력이 이미 있으면 일반 `prisma migrate deploy`를 실행한다. 경찰 또는 소방 한쪽에만 `prisma migrate deploy`를 직접 실행하지 않는다.

## Supabase 스테이징과 Vercel Preview

스테이징 프로젝트 ref는 `.env.staging.local`에만 저장하고 Git에 커밋하지 않는다. 현재 승인된 스테이징 ref는 `ftzcmuvunhbwetzdwyfy`, 운영 ref는 `pbonwjwbtqyrfrxqdwlu`이다.

```powershell
$env:CREATE_STAGING_CONFIRM='CREATE_SCORE_PREDICT_STAGING'
pnpm staging:create

$env:STAGING_RESET_CONFIRM='RESET_SCORE_PREDICT_STAGING_ftzcmuvunhbwetzdwyfy'
pnpm staging:reset

$env:STAGING_TEST_CONFIRM='TEST_SCORE_PREDICT_STAGING_ftzcmuvunhbwetzdwyfy'
pnpm staging:test

$env:VERCEL_PREVIEW_CONFIG_CONFIRM='CONFIGURE_SCORE_PREDICT_PREVIEW'
pnpm staging:vercel-env

$env:VERCEL_PREVIEW_URL='score-predict-<deployment>.vercel.app'
pnpm preview:test

$env:VERCEL_PREVIEW_URL='https://score-predict-<deployment>.vercel.app'
pnpm preview:visual
```

Preview와 Production의 Prisma 런타임 URL은 Supavisor 세션 풀러 포트 `5432`와 `connection_limit=1`을 사용한다. 기존 원시 SQL은 테넌트 연결의 `search_path`를 사용하므로, 세션 상태를 유지하지 않는 트랜잭션 풀러 포트 `6543`로 되돌리지 않는다.

## Production 게이트

운영 감사 파일은 다음 명령으로 Vercel Production 환경을 로컬의 무시된 `.env.production.audit.local`에 받은 후 실행한다. 감사 완료 후 이 파일을 삭제한다.

```powershell
vercel env pull .env.production.audit.local --environment production --yes

$env:PRODUCTION_AUDIT_CONFIRM='AUDIT_SCORE_PREDICT_PRODUCTION_pbonwjwbtqyrfrxqdwlu'
pnpm production:audit -- before

# 백업과 사전 건수 기록이 완료된 뒤 두 테넌트 스키마에 동일한 추가 전용 마이그레이션을 적용한다.
$env:TENANT_SCHEMA_MIGRATION_CONFIRM='MIGRATE_SCORE_PREDICT_PRODUCTION_pbonwjwbtqyrfrxqdwlu'
pnpm db:tenants:deploy
pnpm db:tenants:status

# 기존 전역 공개 기능을 회차 운영 상태로 그대로 보존해 경찰·소방 각각 백필한다.
$env:PROMOTION_BACKFILL_CONFIRM='BACKFILL_PROMOTIONS_pbonwjwbtqyrfrxqdwlu'
pnpm db:promotions:backfill

# 현재 운영 중인 경찰 랜딩을 새 HTML/CSS 캠페인으로 캡처·게시하고 대표 캠페인으로 연결한다.
# 반드시 기존 랜딩을 제공하는 Vercel Production 배포 전에 실행한다.
$env:PROMOTION_LANDING_IMPORT_CONFIRM='IMPORT_CURRENT_POLICE_PROMOTION_pbonwjwbtqyrfrxqdwlu'
pnpm db:promotions:import-current-police

# 경찰·소방 활성 시험, 운영 상태, 기능값과 경찰 대표 캠페인을 읽기 전용으로 검증한다.
pnpm db:promotions:verify

$env:PRODUCTION_RUNTIME_CONFIRM='CONFIGURE_SCORE_PREDICT_PRODUCTION_RUNTIME_pbonwjwbtqyrfrxqdwlu'
pnpm production:vercel-runtime

# Preview에서 검증한 동일 소스를 Production 환경변수로 새로 빌드한다.
# 이 저장소는 모노레포이므로 저장소 루트에서 프로젝트 ID를 명시한다.
Push-Location ../..
$env:VERCEL_ORG_ID='team_S1kpwEzE2Hbujvnuawv7OPz0'
$env:VERCEL_PROJECT_ID='prj_M7dR3Of2eUxUDCL3QGKcrBdDjQrC'
vercel deploy --prod --yes --force --archive=tgz
Pop-Location

vercel domains add fullservice.119sobang.co.kr

$env:PRODUCTION_SMOKE_CONFIRM='SMOKE_SCORE_PREDICT_OFFICIAL_DOMAINS'
pnpm production:smoke

# 실제 비밀번호·개인정보를 사용하지 않는 서명 세션으로 통계와 관리자 GET API를 점검한다.
$env:PRODUCTION_SESSION_SMOKE_CONFIRM='READ_ONLY_SCORE_PREDICT_PRODUCTION_SESSION'
pnpm production:session-smoke

$env:PRODUCTION_AUDIT_CONFIRM='AUDIT_SCORE_PREDICT_PRODUCTION_pbonwjwbtqyrfrxqdwlu'
pnpm production:audit -- after
```

배포 전후 `production-before.json`, `production-after.json`의 경찰·소방 `tenants` 값이 완전히 같아야 한다. `production:smoke`는 공식 도메인 SSL·로그인 화면·CSRF·잘못된 로그인 거부·교차 도메인 308·교차 쓰기 421·통합 로그인 410·Vercel 원본 이동을 검증한다. `production:session-smoke`는 5분짜리 읽기 전용 서명 세션으로 경찰·소방 통계와 관리자 GET API를 점검하며 계정이나 DB를 변경하지 않는다.

## 롤백

1. Vercel의 직전 Ready Production 배포를 Production으로 승격한다.
2. 두 공식 도메인이 직전 배포를 가리키는지 확인한다.
3. `DATABASE_URL`을 변경했다면 검증된 직전 값으로 되돌린다.
4. `production:smoke`와 `production:audit -- after`를 다시 실행한다.
5. 이번 추가 전용 마이그레이션은 되돌리지 않는다. 코드 롤백 후에도 nullable 컬럼, 캘리브레이션 테이블, 단일 활성 시험 인덱스는 유지한다.
