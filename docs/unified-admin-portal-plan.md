# 통합 관리자 포털 (Unified Admin Portal)

## Context
현재 7개 앱이 각각 별도 Vercel 주소(*.vercel.app)에 배포되어 있고, 관리자는 매번 각 앱 URL을 즐겨찾기하고 개별 로그인해야 한다. 하나의 포털에서 Supabase 통합 계정(이메일/비밀번호)으로 로그인한 뒤, 각 앱을 클릭하여 진입하는 구조로 변경한다.

### 현재 상태
- 커스텀 도메인(*.hankukpol.co.kr): **아직 미연결** (*.vercel.app 사용 중)
- 앱별 인증: score-predict(NextAuth), study-hall(Supabase Auth), interview-pass/class-pass(PIN JWT), academy-ops(Supabase Auth)
- 쿠키 도메인 공유 인프라: 모든 앱에 `withConfiguredCookieDomain()` 구현됨, `COOKIE_DOMAIN` 환경변수만 설정하면 활성화
- Supabase 공유: 단일 프로젝트, `public` 스키마에 `user_app_memberships`, `user_division_memberships` 테이블 존재

### 핵심 제약
- **커스텀 도메인 미연결 상태** → 쿠키 공유 SSO는 도메인 연결 후 가능
- 프레임워크 버전 불일치 (Next.js 14/15/16) → 공유 패키지 제한
- 1인 개발 → 최소 공수로 점진적 구현

---

## 아키텍처: Cookie-Bridge 패턴

```
[포털 앱] ──로그인──> Supabase Auth (이메일/비밀번호)
    │
    ├─ hk_portal_session JWT 쿠키 발급 (domain=.hankukpol.co.kr)
    │
    ├─ 앱 카드 클릭 ──> /api/auth/portal-bridge?division=police
    │                      ├─ 포털 JWT 검증
    │                      ├─ 앱 네이티브 세션 발급 (PIN JWT, NextAuth 등)
    │                      └─ /dashboard로 리다이렉트
    │
    └─ 각 앱의 기존 로그인은 그대로 유지 (폴백)
```

---

## Phase 0: 커스텀 도메인 연결 (선행 필수)

수동 작업 (코드 변경 아님):

1. **DNS 설정**: hankukpol.co.kr에 서브도메인 CNAME 추가
   - `portal.hankukpol.co.kr` → 포털 앱 Vercel
   - `academy.hankukpol.co.kr` → academy-ops Vercel
   - `classpass.hankukpol.co.kr` → class-pass Vercel
   - `interview.hankukpol.co.kr` → interview-pass Vercel
   - `studyhall.hankukpol.co.kr` → study-hall Vercel
   - `score.hankukpol.co.kr` → score-predict Vercel
   - `interview-mate.hankukpol.co.kr` → interview-mate Vercel

2. **Vercel 대시보드**: 각 프로젝트에 커스텀 도메인 추가

3. **환경변수 설정**: 모든 앱 Vercel 환경변수에 `COOKIE_DOMAIN=.hankukpol.co.kr` 추가

---

## Phase 1: 포털 앱 생성 (`apps/portal`)

### 1-1. 프로젝트 설정

**파일**: `apps/portal/` (신규 Next.js 15 앱)

- Next.js 15 + React 19 + Tailwind CSS
- 의존성: `@supabase/ssr`, `jose` (JWT), `@hankuk/config`
- Vercel 배포: `portal.hankukpol.co.kr`

### 1-2. 페이지 구성

| 경로 | 용도 |
|------|------|
| `/login` | 이메일/비밀번호 로그인 (Supabase Auth) |
| `/` | 앱 대시보드 (앱 카드 목록) |

### 1-3. 로그인 흐름

1. 관리자가 `portal.hankukpol.co.kr/login`에서 이메일/비밀번호 입력
2. Supabase Auth 인증 성공 → 서버에서 `hk_portal_session` JWT 발급
   - payload: `{ sub: supabaseUserId, email, iat, exp }`
   - 서명: `PORTAL_JWT_SECRET` (새 환경변수)
   - 쿠키: `domain=.hankukpol.co.kr`, `httpOnly`, `secure`, `sameSite=lax`, `maxAge=24h`
3. `/` 대시보드로 리다이렉트

### 1-4. 대시보드 UI

- `public.user_app_memberships` 조회 → 사용자가 접근 가능한 앱 목록
- `public.user_division_memberships` 조회 → 앱별 사용 가능한 지점(소방/경찰)
- 앱 카드: 앱 이름 + 설명 + 지점 버튼(소방/경찰)
- 클릭 시 → `https://{subdomain}.hankukpol.co.kr/api/auth/portal-bridge?division={slug}`

### 1-5. 참고할 기존 코드

- `packages/config/src/index.js` — `HANKUK_SERVICE_CONFIG` 앱 레지스트리
- `apps/interview-pass/src/lib/auth/shared-auth.ts` — `user_app_memberships` 조회 패턴
- `apps/class-pass/src/lib/auth/cookie-domain.ts` — 쿠키 도메인 설정 패턴

---

## Phase 2: 앱별 Bridge 엔드포인트

각 앱에 `GET /api/auth/portal-bridge` 추가. 포털 JWT를 검증하고 앱 네이티브 세션을 발급한다.

### 2-1. class-pass, interview-pass (PIN JWT 방식)

**파일**: `apps/{app}/src/app/api/auth/portal-bridge/route.ts` (신규)

```
1. hk_portal_session 쿠키에서 JWT 추출 + PORTAL_JWT_SECRET로 검증
2. supabaseUserId로 user_app_memberships에서 앱 권한 확인
3. identity_claim_reservations에서 앱 내 admin identity 조회
4. 기존 signJwt('admin', ...) 호출하여 admin_token 쿠키 발급
5. division/tenant 쿠키 설정
6. /dashboard로 302 리다이렉트
```

참고: `apps/class-pass/src/lib/auth/jwt.ts` — `signJwt()`, `cookieOptions()`

### 2-2. academy-ops (Supabase Auth)

academy-ops는 이미 Supabase Auth를 사용하므로, `COOKIE_DOMAIN` 설정 시 Supabase 세션 쿠키(`sb-*-auth-token`)가 자동 공유됨.

- `apps/academy-ops/src/lib/supabase/middleware.ts`의 Supabase 클라이언트에 `withConfiguredCookieDomain` 적용 필요
- Bridge 엔드포인트 불필요 — 포털에서 직접 링크

### 2-3. study-hall (Supabase Auth + 커스텀 JWT)

**파일**: `apps/study-hall/app/api/auth/portal-bridge/route.ts` (신규)

```
1. 포털 JWT 검증
2. supabaseUserId로 study_hall.admins 테이블에서 admin 레코드 조회
3. 기존 createAdminSessionToken() 호출하여 tc_admin_session 쿠키 발급
4. /{division}/admin으로 리다이렉트
```

참고: `apps/study-hall/lib/session-tokens.ts`, `apps/study-hall/lib/auth-cookies.ts`

### 2-4. score-predict (NextAuth + Prisma)

**파일**: `apps/score-predict/src/app/api/auth/portal-bridge/route.ts` (신규)

```
1. 포털 JWT 검증
2. user_login_aliases에서 레거시 user ID 조회
3. NEXTAUTH_SECRET으로 NextAuth JWT 쿠키 직접 발급
4. /admin으로 리다이렉트
```

참고: `apps/score-predict/src/lib/auth.ts` — `buildSharedNextAuthCookies()`

### 2-5. interview-mate (Supabase Auth)

academy-ops와 동일 — Supabase 세션 쿠키 자동 공유. Bridge 불필요.

### 2-6. police-exam-bank (인증 없음)

포털에서 직접 링크. Bridge 불필요.

---

## Phase 3: 인프라 변경

### 3-1. @hankuk/config 업데이트

**파일**: `packages/config/src/index.js`

- `HANKUK_APP_KEYS`에 `PORTAL` 추가
- `HANKUK_SERVICE_CONFIG`에 포털 설정 추가 (`domainAlias: "portal"`)

### 3-2. Supabase 마이그레이션

**파일**: `supabase/migrations/YYYYMMDD_portal_setup.sql` (신규)

- `app_registry` constraint에 `portal`, `class-pass` 추가 (아직 미등록 시)
- 포털 관리자의 `user_app_memberships` 초기 데이터 삽입

### 3-3. 환경변수

모든 앱 + 포털에 추가:
- `PORTAL_JWT_SECRET` — 포털 ↔ 앱 간 JWT 서명 공유 키
- `COOKIE_DOMAIN=.hankukpol.co.kr` — 쿠키 공유 도메인

---

## Phase 4: 편의 기능 (MVP 이후)

- 각 앱 관리자 영역에 "포털로 돌아가기" 링크 추가
- 포털 로그아웃 시 `hk_portal_session` + 각 앱 쿠키 정리
- 앱 미들웨어에서 `hk_portal_session` 쿠키 자동 감지 → bridge 없이 자동 로그인

---

## 구현 순서

1. **Phase 0**: 커스텀 도메인 DNS + Vercel 연결 (수동)
2. **Phase 3-1**: `@hankuk/config`에 PORTAL 추가
3. **Phase 1**: 포털 앱 생성 (login + dashboard)
4. **Phase 3-2**: Supabase 마이그레이션
5. **Phase 2**: 앱별 bridge 엔드포인트 (academy-ops → class-pass → study-hall → score-predict 순)
6. **Phase 4**: 편의 기능

---

## 검증

1. `portal.hankukpol.co.kr/login`에서 이메일 로그인 → 대시보드 표시 확인
2. 앱 카드 클릭 → 해당 앱 관리자 페이지로 자동 로그인 확인
3. 포털 세션 만료 후 → 각 앱 자체 로그인으로 폴백 확인
4. 소방/경찰 지점 선택 → 올바른 division으로 앱 진입 확인
5. `hk_portal_session` 쿠키가 `.hankukpol.co.kr` 도메인으로 설정되는지 확인
