# 시간통제 자습반 관리 시스템

Next.js 14 + Prisma + Supabase 기반 운영 시스템입니다.  
경찰반 / 소방반 등 직렬별로 출석, 상벌점, 성적, 수납, 공지, 시즌 운영을 분리 관리합니다.

## 핵심 구성

- 관리자 / 조교 / 학생 / 슈퍼관리자 권한 분리
- 직렬별 완전 분리 URL 구조: `/{division}/...`
- mock 모드 로컬 테스트 지원
- Prisma + Supabase PostgreSQL 실배포 구조
- 시즌 종료 / 재등록 / 슈퍼관리자 계정 관리 포함

## 로컬 실행

### 1. 의존성 설치

```bash
cd study-hall
npm install
```

### 2. 환경변수 준비

`.env.example`를 기준으로 `.env.local` 또는 `.env`를 설정합니다.

mock 모드만 빠르게 확인할 때는 최소값만 있어도 됩니다.

```env
MOCK_MODE=true
APP_SESSION_SECRET=local-dev-secret
NEXT_PUBLIC_SUPABASE_URL=https://local.test
NEXT_PUBLIC_SUPABASE_ANON_KEY=local-anon-key
SUPABASE_SERVICE_ROLE_KEY=local-service-role
DATABASE_URL=postgresql://user:pass@localhost:5432/mockdb
DIRECT_URL=postgresql://user:pass@localhost:5432/mockdb
```

### 3. mock 모드 실행

저장소 루트에서:

```bat
run-local-test.bat
```

또는 `web` 폴더에서:

```bash
npm run dev
```

### 4. mock 데이터 초기화

저장소 루트에서:

```bat
reset-all-data.bat --force
```

또는 `web` 폴더에서:

```bash
npm run reset:all -- --force
```

## 실제 DB 초기화와 시드

Supabase PostgreSQL을 연결한 뒤 아래 순서로 실행합니다.

```bash
cd study-hall
npm run prisma:generate
npm run db:deploy
npm run db:seed
```

### seed에서 생성되는 기본 데이터

- `divisions`: 경찰반, 소방반
- `division_settings`: 기본 경고/휴가/운영 요일 설정
- `periods`: 0교시 ~ 8교시
- `point_rules`: 기본 상벌점 규칙
- `payment_categories`: 등록비 / 월납부 / 환불
- `exam_types`, `exam_subjects`
  - 경찰공채, 경찰경채
  - 소방공채, 소방경채
- `seasons`
  - 2026 경찰반 기본 시즌
  - 2026 소방반 기본 시즌
- 슈퍼관리자 계정
  - `SEED_SUPER_ADMIN_EMAIL`
  - `SEED_SUPER_ADMIN_PASSWORD`
  - `SEED_SUPER_ADMIN_NAME`

`SEED_SUPER_ADMIN_EMAIL`과 `SEED_SUPER_ADMIN_PASSWORD`가 없으면 Auth 슈퍼관리자 생성은 건너뜁니다.

## 검증 명령

```bash
cd study-hall
npm run typecheck
npm run build
```

현재 `build` 스크립트는 내부에서 `prisma generate`를 먼저 실행합니다.

## Vercel 배포

### 1. Supabase 준비

- 현재 standalone 개발용 연결 정보를 준비하거나, 최종적으로는 통합 Supabase 프로젝트 편입을 기준으로 준비
- `DATABASE_URL`, `DIRECT_URL` 확보
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 확보

### 2. Vercel 프로젝트 연결

현재 standalone 설명에서는 이 앱 폴더를 프로젝트 루트로 사용합니다. 모노레포 전환 후 최종 Root Directory는 `apps/study-hall` 입니다.

`vercel.json`은 아래 기준으로 동작합니다.

- framework: `nextjs`
- buildCommand: `npm run build`

### 3. Vercel 환경변수 설정

필수:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL`
- `APP_SESSION_SECRET`
- `NEXT_PUBLIC_APP_URL`

권장:

- `SEED_SUPER_ADMIN_EMAIL`
- `SEED_SUPER_ADMIN_PASSWORD`
- `SEED_SUPER_ADMIN_NAME`

### 4. DB 반영 및 시드

배포 전 또는 최초 배포 직후 아래를 실행합니다.

```bash
cd study-hall
npm run db:deploy
npm run db:seed
```

### 5. 최종 확인

- `/login`
- `/super-admin`
- `/police/admin`
- `/fire/admin`
- 학생 로그인 `/[division]/student/login`
- export API 응답

## 주의사항

- 한글이 깨지지 않도록 모든 문서와 소스는 UTF-8 기준으로 유지합니다.
- mock 모드와 실DB 모드는 같은 라우트 구조를 사용합니다.
- Supabase Auth를 쓰는 관리자/조교/슈퍼관리자는 seed 또는 슈퍼관리자 화면으로 계정을 준비해야 합니다.
- 학생 로그인은 Supabase Auth를 사용하지 않고 수험번호 + 이름 세션 방식입니다.
> Migration note:
> This README mainly describes the current standalone app workflow.
> If any instruction here conflicts with `D:\hankuk\AGENTS.md`, the rules in `AGENTS.md` take precedence.
> In particular, the target architecture is a unified Supabase project with schema separation and new monorepo-linked Vercel projects.
