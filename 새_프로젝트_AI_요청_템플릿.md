# 새 프로젝트 AI 요청 템플릿

> 이 문서는 앞으로 새 서비스 앱을 추가하거나, 기존 앱을 tenant/division 방식으로 확장할 때 AI에게 그대로 복붙해서 요청할 수 있는 템플릿입니다.
> 공통 기준은 항상 `D:\hankuk\AGENTS.md`를 따릅니다.

---

## 1. 언제 어떤 템플릿을 쓰나

### 템플릿 A

새 서비스 앱을 추가할 때 씁니다.

### 템플릿 B

기존 앱 안에 새 tenant/division/workspace를 추가할 때 씁니다.

### 템플릿 C

기존 앱 안에 일반 기능을 추가할 때 씁니다.

### 템플릿 D

모노레포 전환 후 새 앱을 추가할 때 씁니다.

### 템플릿 E

공통 코드 분리를 요청할 때 씁니다.

### 템플릿 F

구조 제안만 먼저 받고 싶을 때 씁니다.

---

## 2. 템플릿 A: 새 서비스 앱 추가

```text
새 서비스 앱 `{{app-name}}`을 추가해줘.

현재 저장소는 아직 모노레포 전 상태이니,
루트(`D:\hankuk`)에 폴더로 만들어줘.

조건:
- Next.js App Router + TypeScript로 시작
- npm 기준으로 작업
- `.env.local`과 `.env.local.example` 구조를 만들 것
- 지금은 Vercel 연결 없이 로컬 실행과 build까지 가능하게 만들 것
- 기존 앱과 직접 import하지 말 것
- 최종적으로는 통합 Supabase 프로젝트 안의 새 app schema로 들어갈 수 있게 구조를 잡을 것

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
- 기존 앱 안에서 runtime tenant/division 구조로 확장할 것
- 라우팅은 path slug 또는 request 기반으로 처리할 것
- auth/session에 tenant 문맥이 반영되게 할 것
- API와 DB 쿼리에 tenant/division 필터를 빠짐없이 넣을 것
- tenant별 문구, 색상, 라벨, 제한된 규칙 차이는 config/data로 처리할 것
- build-time env 하나로 tenant를 고정하는 방식은 새 작업의 기본 구조로 쓰지 말 것

추가 대상:
- slug: {{tenant-slug}}
- 표시 이름: {{tenant-name}}
- 차이점: {{브랜드/권한/규칙 차이}}
```

### 예시

```text
기존 앱 `study-hall` 안에 새 division `gangnam`을 추가해줘.

조건:
- 새 앱을 만들지 말 것
- 기존 앱 안에서 runtime division 구조로 확장할 것
- 라우팅은 path slug 또는 request 기반으로 처리할 것
- auth/session에 division 문맥이 반영되게 할 것
- API와 DB 쿼리에 division 필터를 빠짐없이 넣을 것
- division별 문구, 색상, 라벨, 제한된 규칙 차이는 config/data로 처리할 것

추가 대상:
- slug: gangnam
- 표시 이름: 강남점
- 차이점: 지점명, 색상, 운영 설정, 공지 범위
```

---

## 4. 템플릿 C: 기존 앱 안 기능 추가

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

## 5. 템플릿 D: 모노레포 전환 후 새 앱 추가

```text
새 서비스 앱 `{{app-name}}`을 모노레포 구조에 맞게 추가해줘.

위치:
- `apps/{{app-name}}`

조건:
- Next.js App Router + TypeScript
- pnpm workspace 기준으로 설정
- 새 Vercel 프로젝트를 만들 수 있게 Root Directory를 `apps/{{app-name}}`로 맞출 것
- 앱용 subdomain alias 후보를 함께 제안할 것
- 통합 Supabase 프로젝트 안에서 사용할 app schema 이름도 제안할 것
- 기존 앱에서 직접 import하지 말 것
- 공유 코드는 버전 정책에 맞는 범위에서만 `packages/`로 분리할 것

이 앱은 기존 앱의 tenant 확장이 아니라, 새로운 서비스 경계다.
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
```

---

## 8. 요청할 때 같이 주면 좋은 정보

- 서비스명
- 누구를 위한 기능인지
- 이게 새 서비스인지, 기존 서비스의 tenant 확장인지
- tenant slug 후보가 있는지
- schema 이름 후보가 있는지
- 필요한 화면 3개 정도
- 지금은 로컬만 볼지, 나중에 배포까지 볼지

---

## 9. 아주 짧은 요청 예시

### 새 서비스 앱

```text
새 서비스 앱 `fire-admin`을 추가해줘.
현재는 모노레포 전 상태이니 루트에 만들고,
Next.js App Router + TypeScript + npm 기준으로 시작해줘.
지금은 로컬 실행과 build까지만 되게 해줘.
```

### 기존 앱에 tenant 추가

```text
기존 앱 `interview-pass`에 `fire` tenant를 추가해줘.
새 앱은 만들지 말고 기존 앱 안에서 runtime tenant 구조로 처리해줘.
라우팅, auth, DB 쿼리에서 tenant 경계가 보장되게 해줘.
```

---

## 10. 최종 정리

앞으로는 이렇게 고르면 됩니다.

1. 새 서비스면 템플릿 A
2. 기존 앱의 새 tenant/division이면 템플릿 B
3. 기존 앱 기능 확장이면 템플릿 C
4. 모노레포 전환 후 새 앱이면 템플릿 D
5. 공통 코드 정리면 템플릿 E
6. 방향 제안만 받고 싶으면 템플릿 F
