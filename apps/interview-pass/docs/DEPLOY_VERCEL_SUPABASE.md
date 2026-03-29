# GitHub · Vercel · Supabase 배포 가이드

이 문서는 현재 standalone 배포 기준으로 정리된 버전입니다. 저장소 전체의 최종 아키텍처는 `D:\\hankuk\\AGENTS.md`를 우선합니다.

## 1. GitHub

- `origin` 은 `https://github.com/hankukpol/hankukpol-police_interview.git` 로 맞춥니다.
- 권장 브랜치는 `main` 입니다.
- `master` 를 유지해도 되지만, Vercel production branch 를 같은 이름으로 맞춰야 합니다.

## 2. Supabase 연결 준비 (standalone 기준)

1. standalone 검증용이면 전용 프로젝트를 연결할 수 있습니다. 최종 운영 기준은 `AGENTS.md`의 통합 Supabase 전략을 따릅니다.
2. SQL Editor에서 아래 파일을 순서대로 실행합니다.
3. `supabase/migrations/001_init.sql`
4. `supabase/migrations/002_distribution_logs_once_per_material.sql`

적용 후 확인 대상:

- `students`
- `materials`
- `distribution_logs`
- `app_config`
- `popup_content`
- `distribute_material()` 함수

## 3. 환경변수

로컬 `.env.local` 과 Vercel 프로젝트 환경변수에 아래 값을 넣습니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARS
QR_HMAC_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARS
NEXT_PUBLIC_APP_URL=https://YOUR_VERCEL_DOMAIN
```

주의:

- `SUPABASE_SERVICE_ROLE_KEY` 는 서버 전용 값입니다.
- `JWT_SECRET`, `QR_HMAC_SECRET` 는 기존 프로젝트 값을 재사용하지 말고 새로 생성해야 합니다.
- 로컬 개발 때만 `NEXT_PUBLIC_APP_URL=http://localhost:3000` 을 사용합니다.

## 4. Vercel 연결 (standalone 기준)

기존 `.vercel/project.json` 설명은 standalone 기준입니다. 모노레포 전환 후에는 `AGENTS.md`의 새 Vercel 프로젝트 전략을 따릅니다.

1. standalone 배포가 필요하면 Vercel 프로젝트를 생성합니다.
2. GitHub 저장소 `hankukpol-police_interview` 를 연결합니다.
3. 위 환경변수 6개를 등록합니다.
4. 로컬에서 `npx vercel link` 로 연결합니다.
5. 필요하면 `npx vercel env pull .env.local` 로 로컬 환경변수를 동기화합니다.

## 5. 첫 배포

1. `npm install`
2. `npm run build`
3. `git push -u origin main`

`main` 대신 `master` 를 쓸 경우 마지막 명령만 바꾸면 됩니다.

배치 파일을 쓸 경우:

- `deploy-vercel.bat --check`
- `deploy-vercel.bat --with-build`

단, `deploy-vercel.bat` 를 쓰기 전에 먼저 `npx vercel link` 를 완료해야 합니다.

## 6. 배포 후 초기 확인

- 학생 로그인 페이지 제목이 `경찰 면접 모바일 수강증` 으로 보이는지
- 관리자 설정에서 앱 이름/테마 색상이 저장되는지
- QR 생성 및 스캔이 정상 동작하는지
- 자료 배부 시 `distribution_logs` 에 정상 기록되는지
