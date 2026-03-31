# 새 프로젝트 AI 요청 템플릿

> 이 문서는 새 서비스 앱을 추가하거나, 기존 앱을 tenant/division 방식으로 확장하거나, 외부에서 만든 독립 프로젝트를 Hankuk monorepo에 편입할 때 AI에게 그대로 복붙해서 요청할 수 있는 템플릿입니다.
> 공통 기준은 항상 `D:\hankuk\AGENTS.md`를 따릅니다.

---

## 1. 언제 어떤 템플릿을 쓰나

### 템플릿 A

새 서비스 앱을 `apps/` 아래에 추가할 때 씁니다.

### 템플릿 B

기존 앱 안에 새 tenant/division/workspace를 추가할 때 씁니다.

### 템플릿 C

기존 독립 프로젝트를 현재 monorepo에 편입할 때 씁니다.

### 템플릿 D

기존 앱 안에 일반 기능을 추가할 때 씁니다.

### 템플릿 E

공통 코드 분리를 요청할 때 씁니다.

### 템플릿 F

구조 제안만 먼저 받고 싶을 때 씁니다.

---

## 2. 템플릿 A: 새 서비스 앱 추가

```text
새 서비스 앱 `{{app-name}}`을 추가해줘.

위치:
- `apps/{{app-name}}`

조건:
- Next.js App Router + TypeScript
- pnpm workspace 기준으로 설정
- 새 Vercel 프로젝트를 만들 수 있게 Root Directory를 `apps/{{app-name}}`로 맞출 것
- 기존 앱에서 직접 import하지 말 것
- 경찰/소방/지점 차이는 새 앱으로 분리하지 말고, 필요하면 이 앱 안의 runtime tenant로 처리할 것
- 통합 Supabase 프로젝트 안에서 사용할 app schema 이름 후보도 함께 제안할 것
- subdomain alias 후보도 함께 제안할 것

이 앱은 기존 서비스의 tenant 확장이 아니라, 새로운 서비스 경계다.

목적:
{{한 줄 설명}}

주요 기능:
- {{기능 1}}
- {{기능 2}}
- {{기능 3}}
```

---

## 3. 템플릿 B: 기존 앱에 새 tenant/division 추가

```text
기존 앱 `{{existing-app}}` 안에 새 tenant/division `{{tenant-slug}}`을 추가해줘.

조건:
- 새 앱을 만들지 말 것
- 새 Vercel 프로젝트를 만들지 말 것
- 새 Supabase 프로젝트를 만들지 말 것
- 기존 앱 안에서 runtime tenant/division 구조로 확장할 것
- 라우팅은 path slug, hostname, request 문맥 중 현재 앱 구조에 맞는 방식으로 처리할 것
- auth/session에 tenant 문맥이 반영되게 할 것
- API와 DB 쿼리에 tenant/division 필터를 빠짐없이 넣을 것
- tenant별 문구, 색상, 라벨, 일부 규칙 차이는 config/data로 처리할 것
- build-time env 하나로 tenant를 고정하는 방식은 새 작업의 기본 구조로 쓰지 말 것

추가 대상:
- slug: {{tenant-slug}}
- 표시 이름: {{tenant-name}}
- 차이점: {{브랜드/권한/규칙 차이}}
```

### 예시 1: `study-hall`

```text
기존 앱 `study-hall` 안에 새 division `gangnam`을 추가해줘.

조건:
- 새 앱을 만들지 말 것
- 기존 앱 안에서 runtime division 구조로 확장할 것
- auth/session에 division 문맥이 반영되게 할 것
- API와 DB 쿼리에 division 필터를 빠짐없이 넣을 것

추가 대상:
- slug: gangnam
- 표시 이름: 강남점
- 차이점: 지점명, 색상, 운영 설정, 공지 범위
```

### 예시 2: `academy-ops`

```text
기존 앱 `academy-ops` 안에 직렬 tenant `fire`를 추가해줘.

조건:
- 새 앱을 만들지 말 것
- 경찰/소방은 같은 서비스 안의 runtime tenant로 처리할 것
- 기존 `academyId` 또는 hostname 기반 스코프를 우선 재사용할 것
- 직렬별 과목, 문구, 브랜딩, 공지 범위, 운영 설정 차이는 설정 데이터로 분리할 것
- API와 DB 쿼리에 tenant 경계가 보장되게 할 것

추가 대상:
- slug: fire
- 표시 이름: 소방
- 차이점: 과목 구성, 브랜딩, 공지 범위, 운영 설정
```

---

## 4. 템플릿 C: 기존 독립 프로젝트를 monorepo에 편입

```text
기존 독립 프로젝트 `{{project-name}}`를 현재 `D:\\hankuk` monorepo로 편입해줘.

현재 위치:
- `{{current-path}}`

목표 위치:
- `apps/{{app-name}}`

조건:
- 이 프로젝트가 새 서비스 경계인지 먼저 확인할 것
- 새 서비스가 맞으면 `apps/{{app-name}}` 아래로 편입할 것
- 내부에 `web/` 같은 중첩 앱 루트가 있으면 monorepo 앱 구조에 맞게 평탄화할지 함께 판단할 것
- app-level `.git`이 있으면 백업 후 제거할 것
- nested `package-lock.json`은 제거하고 루트 `pnpm-lock.yaml`만 쓰게 할 것
- 루트 `package.json`, `pnpm-workspace.yaml`, `turbo.json` 기준으로 실행되게 맞출 것
- 기존 프로젝트 문서와 배치 스크립트 경로가 바뀌면 같이 수정할 것
- 경찰/소방/지점 차이는 새 앱을 더 만들지 말고 이 앱 안의 runtime tenant 구조로 정리할 것

이 프로젝트는 `{{service-boundary-description}}` 서비스다.
tenant 후보:
- {{tenant-1}}
- {{tenant-2}}
- {{tenant-3}}
```

### 예시: `academy-ops`

```text
기존 독립 프로젝트 `academy-ops`를 현재 `D:\\hankuk` monorepo로 편입해줘.

현재 위치:
- `D:\\hankuk\\academy-ops`

목표 위치:
- `apps/academy-ops`

조건:
- 학원 통합 운영 메인 프로그램이라는 하나의 서비스 경계로 볼 것
- 내부 `web/` 앱 구조를 monorepo 앱 구조에 맞게 정리할 것
- app-level `.git`은 백업 후 제거할 것
- nested `package-lock.json`은 제거하고 루트 `pnpm-lock.yaml`만 쓰게 할 것
- 루트 pnpm workspace와 turbo 기준으로 dev/build가 가능하게 할 것
- 경찰/소방/캠퍼스 차이는 같은 앱 안의 runtime tenant로 유지할 것
- `academyId`, hostname, 설정 기반 멀티테넌시를 우선 재사용할 것
```

---

## 5. 템플릿 D: 기존 앱 안 기능 추가

```text
기존 앱 `{{existing-app}}` 안에 새 기능을 추가해줘.

추가할 기능:
{{기능 설명}}

조건:
- 새 앱을 만들지 말 것
- 기존 라우트 구조와 코드 스타일을 따를 것
- 기존 env, DB, auth 구조를 먼저 확인하고 그 범위 안에서 작업할 것
- 필요한 API, 관리자 화면, 검증 로직까지 같이 반영할 것
- 변경 후 해당 앱 기준으로 build/lint/가능한 테스트까지 진행할 것
```

---

## 6. 템플릿 E: 공통 코드 분리 요청

```text
여러 앱에서 중복되는 코드를 정리해줘.

대상 코드:
- {{중복 코드 설명}}

조건:
- 먼저 Next.js/React/Prisma/Supabase 버전 정렬이 필요한지 확인할 것
- 버전 차이 때문에 위험하면 분리하지 말고 이유를 설명할 것
- 분리 가능하면 `packages/{{package-name}}` 형태로 제안 또는 구현할 것
- 앱끼리 직접 import하지 않게 만들 것
- dependency-free 코드부터 우선 분리할 것
- tenant 전용 코드나 앱 전용 코드는 `packages/`로 옮기지 말 것
```

---

## 7. 템플릿 F: 구조 제안만 먼저 받기

```text
새 기능 `{{name}}`을 만들려고 해.
지금 바로 구현하지 말고,
현재 `D:\hankuk` 구조와 `AGENTS.md` 규칙을 기준으로
아래를 먼저 판단해줘.

- 새 서비스 앱으로 가는 게 맞는지
- 기존 앱 안 tenant/division 확장으로 가는 게 맞는지
- 적절한 subdomain alias 또는 path slug가 무엇인지
- 적절한 Supabase app schema 또는 tenant 구분 키가 무엇인지
- 현재 단계에서 로컬만 개발해야 하는지
- 기존 외부 프로젝트를 편입해야 한다면 어느 경로로 옮기는 게 맞는지
```

---

## 8. 요청할 때 같이 주면 좋은 정보

- 서비스명
- 누구를 위한 기능인지
- 이게 새 서비스인지, 기존 서비스의 tenant 확장인지
- 기존 외부 프로젝트 편입인지
- tenant slug 후보가 있는지
- schema 이름 후보가 있는지
- 필요한 화면 3개 정도
- 지금은 로컬만 볼지, 나중에 배포까지 볼지

---

## 9. 아주 짧은 요청 예시

### 새 서비스 앱

```text
새 서비스 앱 `academy-ops`를 추가해줘.
`apps/academy-ops`에 만들고,
Next.js App Router + TypeScript + pnpm workspace 기준으로 시작해줘.
경찰/소방 차이는 같은 앱 안의 runtime tenant로 처리할 수 있게 구조를 잡아줘.
```

### 기존 앱에 tenant 추가

```text
기존 앱 `academy-ops`에 `fire` tenant를 추가해줘.
새 앱은 만들지 말고 기존 앱 안에서 runtime tenant 구조로 처리해줘.
라우팅, auth, DB 쿼리에서 tenant 경계가 보장되게 해줘.
```

### 기존 독립 프로젝트 편입

```text
기존 독립 프로젝트 `academy-ops`를 `D:\\hankuk` monorepo로 편입해줘.
목표 위치는 `apps/academy-ops`이고,
기존 `web/` 구조와 문서/배치 스크립트 경로도 같이 정리해줘.
경찰/소방 직렬은 별도 앱이 아니라 runtime tenant로 유지해줘.
```

---

## 10. 최종 정리

앞으로는 이렇게 고르면 됩니다.

1. 새 서비스 앱이면 템플릿 A
2. 기존 앱의 새 tenant/division이면 템플릿 B
3. 기존 외부 프로젝트를 repo에 편입하면 템플릿 C
4. 기존 앱 기능 확장이면 템플릿 D
5. 공통 코드 정리면 템플릿 E
6. 방향 제안만 받고 싶으면 템플릿 F
