# Hankuk Docker 개발

Windows에서 소스를 수정하고 Docker 안에서 Node·Next.js·Prisma를 실행합니다.
별도 VM 접속이나 WSL 내부의 수동 Node 실행은 필요하지 않습니다.
Docker Desktop의 WSL2 기반은 유지합니다. 운영 Vercel·Supabase는 변경하지 않습니다.

## 프로젝트와 포트

| 앱 | 개발 주소 | 데이터 |
|---|---|---|
| study-hall | http://localhost:3000 | 기존 mock 데이터의 Docker 복사본 |
| academy-ops | http://localhost:3100 | 기존 mock 모드 + 로컬 Hankuk DB |
| score-predict | http://localhost:3200/police/login | 로컬 Hankuk DB의 경찰·소방 별도 스키마 |
| class-pass | http://localhost:3300 | 기존 class-pass 로컬 Supabase |
| portal | http://localhost:3400 | 로컬 Hankuk Supabase |
| interview-pass | http://localhost:3500 | 로컬 Hankuk Supabase |
| interview-mate | http://localhost:3600 | 로컬 Hankuk Supabase |
| police-exam-bank | 미구성 | 현재 빈 폴더, package.json과 실행 소스 없음 |

## 처음 준비

Docker Desktop을 켜고 저장소 루트에서 실행합니다. 기존 로컬 DB 볼륨을 사용하며 초기화하지 않습니다.

```powershell
supabase start --workdir . --exclude studio,postgres-meta,edge-runtime,logflare,vector,supavisor,realtime,imgproxy,mailpit
supabase start --workdir apps/class-pass
pnpm docker:setup
```

`docker:setup`은 실행 중인 로컬 Supabase의 주소·키만 읽습니다.
이미 생성한 `docker/environments/*.env.local`은 덮어쓰지 않습니다.
원격 주소를 거부하며 운영 `.env.local`을 가져오지 않습니다.
로컬 DB가 빈 새 컴퓨터에서는 앱별 스키마·시드를 별도로 준비해야 합니다.

## 평소 개발

```powershell
pnpm dev:class-pass
pnpm dev:score-predict
pnpm dev:study-hall
```

앱 폴더에서는 `pnpm dev`로 같은 작업을 수행합니다.
개발 명령은 터미널에서 계속 실행되며 Ctrl+C로 종료합니다.
자습반 외 앱은 Compose Watch가 소스를 동기화하고 설정 변경 시 재시작합니다.
package.json 또는 루트 잠금 파일 변경 시 해당 이미지를 다시 빌드합니다.
자습반은 기존에 검증한 bind mount와 polling 방식을 유지합니다.

전체 동시 개발이 필요하면 `pnpm docker:dev all`을 사용합니다.
컴퓨터 자원을 아끼려면 작업하는 앱만 실행하는 것을 권장합니다.

```powershell
pnpm docker:status
pnpm docker:stop class-pass
pnpm docker:stop all
```

`pnpm docker:start <app>`은 확인용 백그라운드 서버입니다. **Watch는 실행하지 않으므로**
지속적인 소스 수정에는 위의 `pnpm dev:<app>`을 사용합니다.

## 컨테이너에서 검증

```powershell
pnpm docker:check class-pass
pnpm docker:exec score-predict run test:tenant-isolation
pnpm docker:exec interview-mate run test
pnpm docker:check study-hall
```

자습반 외 앱은 일회용 컨테이너에서 실행해 개발 서버의 캐시를 건드리지 않습니다.
`check`·`exec`는 실행 전에 이미지를 다시 빌드합니다. 일회용 컨테이너는 Watch 동기화를
받지 않아, 빌드하지 않으면 마지막으로 빌드한 시점의 코드를 검사하고 통과로 보고합니다.
`docker:exec`는 전달한 명령을 그대로 실행하므로 DB 쓰기·초기화 명령을 임의로 실행하지 않습니다.
자습반의 `docker:check`는 기존 별도 테스트 컨테이너를 사용하며, 같은 이유로 먼저 이미지를 다시 빌드합니다.

## 운영 규칙

- 한 앱에 한 개발 서버, 표의 고정 포트를 사용합니다. 포트가 이미 사용 중이면 소유자를 확인합니다.
- 비밀키는 이미지·Git에 넣지 않습니다. Compose 설정을 공유할 때 환경변수 값을 출력하지 않습니다.
- 루트 Compose와 자습반 Compose는 프로젝트 이름이 다릅니다. 통합 명령이 양쪽을 관리합니다.
- 기존 이미지·DB 볼륨을 `prune`, `down -v`, `supabase db reset`으로 지우지 않습니다.
- Git worktree와 파일 소유권은 별도로 관리합니다. 컨테이너는 코드 편집 충돌을 막아주지 않습니다.
- `dev:runtime`은 기존 실행 명령의 보존용이며 호스트에서 평소 사용하지 않습니다.
- `docker/apps.json`이 앱·포트 목록, `scripts/docker-config.mjs`가 Compose 생성 원본입니다.

참고: [Docker Compose Watch 공식 문서](https://docs.docker.com/compose/how-tos/file-watch/).

## 이 컴퓨터의 검증 결과 — 2026-09-10

| 앱 | Docker 이미지·기동·브라우저 진입 화면 | 컨테이너 타입 검사 |
|---|---|---|
| study-hall | 통과, 기존 개발 서버 유지 | 이전 전환 단계 통과, 테스트 639개·lint 포함 |
| academy-ops | 통과 | 누락된 @hankuk/config 의존성 보완 후 통과 |
| score-predict | 통과, 로컬 Supabase health 200도 확인 | 통과 |
| class-pass | 통과 | 통과 |
| portal | 통과 | 통과 |
| interview-pass | 통과, 진입 경로는 / → /police | 통과 |
| interview-mate | 통과 | 앱의 tsconfig.typecheck.json 기준 통과 |

공통 실행 명령으로 class-pass의 Watch를 켜고 파일 추가·수정·삭제 동기화를 확인했습니다.
호스트의 .env.local이 컨테이너에 없고, 생성한 로컬 키 파일들이 Git에서 제외됨을 확인했습니다.
검증용으로 실행한 6개 앱은 종료했으며, 자습반과 로컬 DB는 유지했습니다.
검증은 개발 환경의 기동·진입 화면·타입 검사 범위입니다. 모든 업무 기능의 통합 테스트나 운영 배포를 의미하지 않습니다.
