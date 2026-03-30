# 한국학원 프로젝트 전체 지도

> 최종 업데이트: 2026-03-30
> 이 문서는 현재 운영 중인 모든 서비스의 주소, DB, 관리자 접속 정보를 한눈에 정리합니다.

---

## 핵심 개념 (쉽게 설명)

```
┌──────────────────────────────────────────────────────────────────────┐
│                       GitHub 저장소 1개                               │
│                     hankukpol/hankuk                                 │
│                                                                      │
│  apps/                                                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐│
│  │ academy-ops  │ │score-predict │ │  study-hall  │ │interview-pass││
│  │ (학원 운영)   │ │  (합격예측)   │ │ (자습반관리)  │ │ (면접수강증)  ││
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘│
│                                                                      │
│  루트 (예외)                                                          │
│  ┌──────────────┐                                                    │
│  │interview-mate│                                                    │
│  │ (면접 메이트) │                                                    │
│  └──────┬───────┘                                                    │
└─────────┼────────────────────────────────────────────────────────────┘
          │
          ▼
   Vercel 프로젝트 (각각 독립 배포)
          │
          └────────────────┐
                           ▼
              Supabase 프로젝트 1개 (hankuk-main)
              ┌─────────────────────────────────┐
              │ public 스키마    → 공통 회원/인증  │
              │ academy_ops     → 학원 운영 데이터  │
              │ score_predict   → 합격예측 데이터  │
              │ study_hall      → 자습반 데이터    │
              │ interview       → 면접수강증 데이터 │
              │ interview_mate  → 면접메이트 데이터 │
              └─────────────────────────────────┘
```

**비용 절감 원리:**
- GitHub 저장소 1개 = 무료
- Supabase 프로젝트 1개 = 무료 티어 1개만 사용 (기존 5개 → 1개)
- Vercel은 앱당 1개지만, 같은 GitHub 저장소에서 배포하므로 관리 효율적
- 새 앱 추가 시: Vercel 프로젝트 1개 + Supabase 스키마 1개 추가 (추가 비용 없음)

---

## 1. 현재 앱별 접속 주소 및 관리자 정보

### score-predict (합격예측)

| 구분 | 내용 |
|------|------|
| **앱 위치** | `apps/score-predict/` |
| **사이트 (현재)** | https://score-predict.vercel.app |
| **사이트 (커스텀 도메인 예정)** | https://score.hankukpol.co.kr |
| **소방 학생 접속** | `/fire/exam` 또는 메인에서 소방 선택 |
| **경찰 학생 접속** | `/police/exam` 또는 메인에서 경찰 선택 |
| **관리자 로그인 경로** | `/admin-login` (또는 `/police/admin-login`, `/fire/admin-login`) |
| **관리자 대시보드** | `/admin` |
| **로그인 방식** | 소방: 전화번호 + 비밀번호 / 경찰: 아이디 + 비밀번호 |
| **시드 관리자 계정** | 전화번호: `010-0000-0000` / 비밀번호: `.env.local` 참조 |
| **선택적 2FA** | `ADMIN_TOTP_SECRET` 환경변수 설정 시 활성화 (현재 미설정) |
| **관리자 기능** | 시험관리, 정답입력, 채용인원, 사전등록, 통계, 사이트설정, 회원관리, 합격선 등 |

### study-hall (시간통제 자습반)

| 구분 | 내용 |
|------|------|
| **앱 위치** | `apps/study-hall/` |
| **사이트 (현재)** | https://study-hall-six.vercel.app |
| **사이트 (커스텀 도메인 예정)** | https://studyhall.hankukpol.co.kr |
| **학생 접속** | `/{division}/student` (예: `/police/student`, `/fire/student`) |
| **관리자 로그인 경로** | `/login` (공통 로그인 페이지) |
| **관리자 대시보드** | `/{division}/admin` (예: `/police/admin`) |
| **슈퍼관리자 대시보드** | `/super-admin` |
| **조교 대시보드** | `/{division}/assistant` |
| **로그인 방식** | 이메일 + 비밀번호 (Supabase Auth) |
| **슈퍼관리자 계정** | `.env`의 `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`로 시드 |
| **현재 상태** | `.env.local`에 `MOCK_MODE=true` (목업 모드) |
| **목업 테스트 계정** | `super@mock.local` (슈퍼관리자, 비번 아무거나) |
| | `admin-police@mock.local` (경찰반 관리자) |
| | `admin-fire@mock.local` (소방반 관리자) |
| | `admin-allpass@mock.local` (올패스 관리자) |
| | `admin-hankyung-sparta@mock.local` (한경스파르타 관리자) |
| **지점 목록** | police(경찰반), fire(소방반), allpass(올패스독학원), hankyung-sparta(한경스파르타) |
| **역할** | SUPER_ADMIN(전체), ADMIN(지점별), ASSISTANT(조교), STUDENT(학생) |

### interview-pass (면접 수강증)

| 구분 | 내용 |
|------|------|
| **앱 위치** | `apps/interview-pass/` |
| **사이트 (현재)** | https://interview-pass.vercel.app |
| **사이트 (커스텀 도메인 예정)** | https://interview.hankukpol.co.kr |
| **학생 접속** | `/{division}/` (예: `/police/`, `/fire/`) |
| **관리자 로그인 경로** | `/{division}/admin/login` (예: `/police/admin/login`) |
| **관리자 대시보드** | `/dashboard` |
| **관리자 초기설정** | `/{division}/admin/setup` (최초 1회 PIN 설정) |
| **로그인 방식** | 관리자 ID(선택) + PIN 코드(필수, 4~20자) |
| **기본 비밀번호** | 없음 (최초 접속 시 `/admin/setup`에서 직접 설정) |
| **보안** | PIN은 bcrypt 해시 저장, 로그인 시도 횟수 제한, JWT 8시간 만료 |
| **관리자 기능** | 학생관리, 자료배부, 배부기록, 설정, QR 수강증 발급/스캔 |

### interview-mate (면접 메이트)

| 구분 | 내용 |
|------|------|
| **앱 위치** | `interview-mate/` (루트, apps/ 이동 전) |
| **메인 페이지** | `/` (전체), `/student` (학생 전용) |
| **사이트 (현재)** | https://interview-mate-lime.vercel.app |
| **사이트 (커스텀 도메인 예정)** | 미정 (공개 전 결정 필요) |
| **학생 주요 경로** | `/reservation` (예약), `/my-reservation` (내 예약 확인), `/apply` (지원), `/status` (현황), `/room` (조 방), `/join/[inviteCode]` (초대코드로 방 참여), `/study-groups` (스터디 그룹) |
| **관리자 로그인 경로** | `/admin/login` |
| **관리자 대시보드** | `/admin` (로그인 세션 필요) |
| **관리자 비밀번호** | `0112` (`.env.local`의 `ADMIN_PASSWORD`) |
| **로그인 방식** | `ADMIN_PASSWORD` 입력 → `httpOnly` 서명 세션 쿠키 발급 (8시간 만료) → `/api/admin/*` 보호 |
| **관리자 인증 환경변수** | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` (`ADMIN_KEY`는 구배포 호환 fallback) |
| **관리자 대시보드 메뉴** | 개요, 세션, 명단, 예약, 조 방, 대기자 (사이드바 탭 전환) |
| **관리자 기능** | 면접세션 관리, 학원설정, 예약슬롯 관리, 조 방 관리, 명단 업로드/관리, 통계, 그룹 동기화, 데이터 내보내기 |

### academy-ops (학원 운영 — 신규)

| 구분 | 내용 |
|------|------|
| **앱 위치** | `apps/academy-ops/` |
| **사이트 (현재)** | https://academy-ops.vercel.app |
| **사이트 (커스텀 도메인 예정)** | https://academy.hankukpol.co.kr |
| **관리자 로그인 경로** | `/login` |
| **관리자 대시보드** | `/admin` |
| **학생 로그인 경로** | `/student/login` |
| **로그인 방식** | 이메일 + 비밀번호 (Supabase Auth) |
| **슈퍼관리자 계정** | `ikma@hanmail.net` |
| **슈퍼관리자 비밀번호** | `pol_0112^^` |
| **공통 인증 사용자 ID** | `dc620f3a-1610-4246-8ddc-83417eee70a8` |
| **학원 코드** | `hankuk-main` |
| **호스트명 설정** | `academy-ops.vercel.app` |
| **Supabase 스키마** | `academy_ops` |
| **현재 상태** | `hankuk-main`에서 신규 초기화 완료, Vercel 배포 및 관리자 로그인 검증 완료 |
| **관리자 기능** | 수강관리, 수납·결제, 성적관리, 출결관리, 시설관리, 시스템 운영 |

---

## 2. Supabase DB 구성

### 통합 프로젝트: hankuk-main

| 항목 | 값 |
|------|-----|
| 프로젝트명 | hankuk-main |
| 프로젝트 ID | pbonwjwbtqyrfrxqdwlu |
| 리전 | ap-northeast-2 (서울) |
| URL | https://pbonwjwbtqyrfrxqdwlu.supabase.co |
| 대시보드 | https://supabase.com/dashboard/project/pbonwjwbtqyrfrxqdwlu |

### 스키마별 테이블 현황

| 스키마 | 용도 | 주요 테이블 | 데이터 건수 |
|--------|------|------------|-----------|
| `public` | 공통 인증/회원 | user_profiles, user_app_memberships, user_login_aliases, identity_claim_reservations, app_registry | 소량 (구축 초기) |
| `academy_ops` | 학원 운영 | academies(1), academy_settings(1), system_config(1), admin_users(1) | 신규 초기화 4건+ |
| `score_predict` | 합격예측 | legacy_import_runs, legacy_table_columns, legacy_table_rows | 37,591건 |
| `score_predict_fire` | 합격예측-소방 브릿지 | (score_predict의 tenant별 뷰) | - |
| `score_predict_police` | 합격예측-경찰 브릿지 | (score_predict의 tenant별 뷰) | - |
| `study_hall` | 자습반 | divisions, students, periods, attendance, payments 등 24개 테이블 | 스키마만 구축 (데이터 0) |
| `interview` | 면접수강증 | students(128), materials(14), distribution_logs(497), app_config(28), popup_content(4) | 671건 |
| `interview_mate` | 면접메이트 | (초기 시드 데이터) | 소량 |

---

## 3. 레거시 프로젝트 (마이그레이션 완료 후 30일 유지 → 삭제 예정)

> ⚠️ 아직 삭제하면 안 됩니다! 30일 안정 운영 확인 후 삭제합니다.

### 레거시 Vercel 프로젝트

| 프로젝트명 | 용도 | 상태 |
|-----------|------|------|
| fire | 소방 합격예측 | 운영 중 (레거시) |
| police | 경찰 합격예측 | 운영 중 (레거시) |
| fire-interview | 소방 면접수강증 | 운영 중 (레거시) |
| police-interview | 경찰 면접수강증 | 운영 중 (레거시) |
| studyhall-manager | 자습반 관리 | 운영 중 (레거시) |

### 레거시 Supabase 프로젝트

| 프로젝트명 | ID | 주요 데이터 |
|-----------|-----|-----------|
| fire-exam-predictio | iqhkmcxeuwueiqopkwfd | 소방 합격예측 (User 219명, Submission 93건 등) |
| police-exam-predictio | qsdufgjxepzvgkrcumcq | 경찰 합격예측 (User 279명, Submission 168건 등) |
| fire-interview | xylhptelczfrvjhvdfdg | 소방 면접 (students 127명) |
| police_interview | vxjpapdjnkrmotcrfxsv | 경찰 면접 (students 1명) |
| studyhall-manager | jbiuwadpnbunwuollohn | 자습반 (별도 확인 필요) |

### 기타 Supabase

| 프로젝트명 | ID | 비고 |
|-----------|-----|------|
| supabase-bistre-paddle | zsvnocvmyhjueaejtlyh | ikma-4087's projects 조직 소속 (Vercel 자동생성 추정) |

---

## 4. 새 앱 추가 시 절차 (비용 절감 방식)

새 서비스를 만들 때 아래만 하면 됩니다:

1. **코드**: `apps/` 안에 새 폴더 생성 (예: `apps/new-app/`)
2. **pnpm-workspace.yaml**에 이미 `apps/*`가 포함되어 있으므로 자동 인식
3. **Supabase**: hankuk-main에 새 스키마 추가 (예: `new_app`)
4. **Supabase**: `public.app_registry`에 앱 등록
5. **Vercel**: 새 프로젝트 생성 → Root Directory를 `apps/new-app`으로 지정
6. **도메인**: Vercel 대시보드에서 `newapp.hankukpol.co.kr` 연결

**추가 비용: 0원** (Supabase 프로젝트 추가 없음, GitHub 저장소 추가 없음)

---

## 5. 마이그레이션 진행 상태 요약

| 항목 | 상태 | 설명 |
|------|------|------|
| GitHub 모노레포 | ✅ 완료 | hankukpol/hankuk 저장소, Turborepo + pnpm 워크스페이스 구성 |
| 앱 코드 → apps/ 이동 | ✅ 완료 | academy-ops, score-predict, study-hall, interview-pass가 `apps/`로 이동 |
| npm → pnpm 전환 | ✅ 완료 | 루트 `pnpm-lock.yaml` 단일 관리, 앱별 lockfile 제거 |
| Node.js 버전 고정 | ✅ 완료 | `.nvmrc` = 22.17.1, `engines.node` = `>=22.17.1 <23` |
| Supabase 통합 프로젝트 | ✅ 완료 | hankuk-main, 스키마 분리 구축 |
| academy_ops 초기화 | ✅ 완료 | 레거시 DB 없이 `academy_ops` 스키마 신규 초기화, 슈퍼관리자 부트스트랩 및 로그인 검증 완료 |
| interview 데이터 이관 | ✅ 완료 | 소방+경찰 통합, 건수 일치 확인 |
| score_predict 데이터 이관 | ⚠️ 부분 완료 | 레거시 메타데이터 보존만 됨, 실제 테이블 재구성 필요 |
| study_hall 데이터 이관 | ⚠️ 미완료 | 스키마만 구축, 실 데이터 이관 필요 |
| 공통 인증 | ⚠️ 기반만 구축 | identity_claim_reservations 779건 등록, 실사용 연동 전 |
| 커스텀 도메인 | ❌ 미완료 | Vercel 대시보드에서 수동 설정 필요 |
| 쿠키 기반 SSO | ❌ 미시작 | 커스텀 도메인 연결 후 COOKIE_DOMAIN 설정 필요 |
| 프레임워크 버전 통일 | ❌ 미완료 | Next.js 14/15/16, React 18/19 혼재 |

---

## 6. 저장소 구조

```
d:\hankuk/
├── apps/
│   ├── academy-ops/         # 학원 운영 (Next.js 14, Prisma 6)
│   ├── score-predict/       # 합격예측 (Next.js 16, Prisma 5)
│   ├── study-hall/          # 자습반 관리 (Next.js 14, Prisma 6)
│   └── interview-pass/      # 면접 수강증 (Next.js 15, Supabase JS)
├── interview-mate/          # 면접 메이트 (Next.js 14, Supabase JS) — apps/ 이동 전
├── docs/                    # 프로젝트 문서
├── supabase/                # 통합 마이그레이션 (7개 SQL)
├── package.json             # 루트 (pnpm 워크스페이스)
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── turbo.json
├── .nvmrc                   # Node.js 22.17.1
├── AGENTS.md
└── CLAUDE.md
```

---

## 7. 경찰/소방 직렬 분리 구조 (업데이트 시 동시 반영 여부)

### score-predict (합격예측)

**직렬 판별 방식:** URL 경로(`/fire/`, `/police/`) → 헤더 → 쿠키 → 환경변수 순서

**구조: 공유 컴포넌트 + 직렬별 페이지 분리 (혼합형)**

| 영역 | 공유 여부 | 업데이트 시 양쪽 반영? |
|------|----------|---------------------|
| `/src/components/` (Header, Footer 등) | ✅ 공유 | ✅ 자동 반영 |
| `/src/lib/tenant.ts` (설정/Feature Flag) | ✅ 공유 | ✅ 자동 반영 |
| `/src/app/*/_FirePage.tsx`, `_PolicePage.tsx` | ❌ 직렬별 분리 | ❌ **양쪽 수동 수정 필요** |
| `/src/lib/police/` (경찰 전용 로직) | ❌ 경찰 전용 | 소방에 영향 없음 |
| `/src/lib/fire/` (소방 전용 로직) | ❌ 소방 전용 | 경찰에 영향 없음 |
| DB 스키마 | ❌ 분리 (`score_predict_fire` / `score_predict_police`) | 각각 독립 |

**⚠️ 주의: 17개 페이지 쌍이 `_FirePage.tsx` / `_PolicePage.tsx`로 분리되어 있음**
- 홈, 로그인, 회원가입, 비밀번호 찾기/재설정, 시험 입력/최종/예측/결과 등
- 이 페이지들은 한쪽만 수정하면 다른 쪽에 반영 안 됨

**주요 직렬 차이점:**
- 소방: 전화번호 로그인, 복구코드, 자격증 가산점, 성별 분리 채용
- 경찰: 아이디 로그인, 사전등록, 방문자 추적, MFA, 관리자 로그인 링크

---

### interview-pass (면접 수강증)

**직렬 판별 방식:** URL 경로(`/fire/`, `/police/`) → 헤더 → 쿠키 → 환경변수 순서

**구조: 100% 공유 (가장 깔끔)**

| 영역 | 공유 여부 | 업데이트 시 양쪽 반영? |
|------|----------|---------------------|
| 모든 컴포넌트 | ✅ 100% 공유 | ✅ 자동 반영 |
| 모든 라우트 | ✅ 공유 (미들웨어가 리라이트) | ✅ 자동 반영 |
| API 라우트 | ✅ 공유 (division 파라미터로 분리) | ✅ 자동 반영 |
| 설정/라벨 차이 | `tenant.ts` config 기반 | ✅ 자동 반영 |
| DB 데이터 | `division` 컬럼으로 격리 | 같은 테이블, 쿼리로 분리 |

**✅ 코드 수정 = 소방+경찰 동시 반영. 가장 이상적인 구조.**

---

### study-hall (자습반)

**직렬 판별 방식:** URL 경로 `[division]` 동적 세그먼트 (예: `/police/admin`, `/fire/student`)

**구조: 100% 공유 (가장 깔끔)**

| 영역 | 공유 여부 | 업데이트 시 양쪽 반영? |
|------|----------|---------------------|
| 모든 컴포넌트 | ✅ 100% 공유 (props로 division 전달) | ✅ 자동 반영 |
| 모든 라우트 | ✅ `/[division]/` 동적 라우트 | ✅ 자동 반영 |
| API 라우트 | ✅ `/api/[division]/` 패턴 | ✅ 자동 반영 |
| DB 데이터 | `divisionId` FK + unique 제약 | 같은 테이블, 쿼리로 분리 |
| 관리자 접근 | 역할별 (SUPER_ADMIN, ADMIN, ASSISTANT) | division별 권한 격리 |

**✅ 코드 수정 = 모든 지점 동시 반영. interview-pass와 동일한 이상적 구조.**

---

### 종합 평가

| 앱 | 직렬 분리 방식 | 코드 수정 시 동시 반영 | 평가 |
|----|--------------|---------------------|------|
| **interview-pass** | 런타임 config 기반 | ✅ 100% 자동 | ⭐ 가장 깔끔 |
| **study-hall** | URL [division] + props | ✅ 100% 자동 | ⭐ 가장 깔끔 |
| **score-predict** | 공유 + 직렬별 페이지 혼합 | ⚠️ 공유 부분만 자동, 17개 페이지 쌍은 수동 | 개선 여지 있음 |
