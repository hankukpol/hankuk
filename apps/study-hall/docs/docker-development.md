# Docker 개발 환경

Windows의 Docker Desktop(WSL2 엔진)을 켜고 `apps/study-hall`에서 실행합니다.
별도 Ubuntu VM에 접속하거나 그 안에서 Node 서버를 직접 실행하지 않습니다.
Docker Desktop 내부의 WSL2 가상화는 필요합니다.

```powershell
docker compose up -d --build
docker compose ps
docker compose logs -f dev
```

화면: http://localhost:3000 (공용 서버 한 대). 다른 세션은 별도 서버를 띄우지 않습니다.
기존 서버가 포트를 사용하면 해당 프로젝트 서버인지 확인하고 종료한 뒤 실행합니다.
Windows 소스 경로를 유지하며 파일 변경 감지는 polling으로 처리합니다.
Node 22, pnpm 10, Prisma는 컨테이너에서 실행됩니다.

## 데이터 및 검증

기본 실행은 명시적인 mock 모드입니다. 운영 Supabase에 연결하지 않습니다.
소스 폴더를 통째로 연결하므로 호스트의 `.env.local`·`.env.development.local`·`.env.production.pull`도
함께 들어오게 되는데, compose가 이 셋을 빈 파일로 덮습니다. 설정은 compose의 `environment`에서만 옵니다.
이 폴더에 새 `.env` 파일을 두면 compose.yaml의 목록에도 추가합니다.
최초 실행 시 기존 `.local/mock-db.json`을 Docker의 `dev-state` 볼륨으로 복사합니다.
원본은 읽기 전용이며 이후 두 데이터는 별도로 유지됩니다.
Windows의 node_modules와 빌드 캐시를 Linux 컨테이너에 재사용하지 않습니다.

```powershell
docker compose build dev
docker compose --profile test run --rm test
docker compose --profile test run --rm -e NODE_ENV=production test pnpm build
docker compose stop dev
docker compose start dev
```

테스트는 이미지의 소스와 임시 데이터에서 실행되어 개발 서버의 데이터·캐시를 건드리지 않습니다.
소스 변경 후 테스트하기 전에는 이미지를 다시 빌드합니다. 저장소 루트의 `pnpm docker:check study-hall`은 이 빌드를 먼저 합니다.
의존성 변경 후에는 다음 순서로 의존성 볼륨만 교체합니다. 개발 데이터 볼륨은 보존됩니다.

```powershell
docker compose down
docker volume rm study-hall_dependencies
docker compose up -d --build
```

`docker compose down -v`는 개발 데이터까지 삭제하므로 사용하지 않습니다.

Git worktree 분리는 별도로 필요합니다. Docker는 여러 세션의 동일 파일 수정이나 공유 Git 인덱스 충돌을 방지하지 않습니다.
운영 배포·DB 마이그레이션은 이 개발 환경 전환에 포함하지 않습니다.

## 이 컴퓨터의 전환 검증 (2026-09-10)

- Docker Linux 엔진, Node 22에서 개발 서버 `healthy` 확인
- 브라우저 로그인 화면 정상 표시
- Windows 소스 변경 후 서버 재시작 없이 변경 응답 확인, 검증용 경로 제거 완료
- 별도 테스트 컨테이너: 테스트 639/639, lint 및 typecheck 통과
- 기존 mock 원본과 Docker 복사본의 SHA-256 일치 확인
- `pnpm dev`는 Docker Compose를 실행하며, 컨테이너 내부에서만 `pnpm dev:runtime` 사용

Docker Desktop의 오래된 통신 소켓을 이름 변경해 보존한 뒤 엔진을 복구했습니다.
기존 이미지·볼륨·프로젝트 데이터는 초기화하지 않았습니다.
