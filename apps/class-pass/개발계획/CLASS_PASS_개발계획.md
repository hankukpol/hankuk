# class-pass 통합 모바일 수강증 개발 계획

## Context

### 왜 만드는가
현재 학원에서는 구글 앱스크립트로 6종의 개별 수강증을 운영 중이다 (아침모의고사, 정기모의고사, 7.6.5 수강증, 알짜 문풀 QR, 알짜 진도별, 통합 모바일 수강증 미완성). 각각 별도 코드로 관리되어 유지보수가 어렵고, 학생이 여러 강좌를 수강할 때 통합 관리가 불가능하다.

interview-pass(면접 수강증)의 검증된 아키텍처를 기반으로, **모든 종류의 수강증을 하나의 앱에서 관리**하는 통합 시스템을 구축한다. **장기적으로 interview-pass를 class-pass로 통합하여 대체**한다.

### 사용자 결정사항
- **서브도메인**: `classpass.hankukpol.co.kr`
- **interview-pass 통합**: 통합 예정 → 데이터 모델에 interview-pass 기능 포함
- **Phase 1 우선 유형**: 좌석배정 수강증 (과목별 좌석번호)

### 핵심 목표
1. 관리자가 강좌를 생성하고, 강좌별로 기능(QR배부, 좌석배정, 시간제한 등)을 선택
2. 관리자가 강좌별로 별도 수강생 명단을 등록
3. 학생이 이름+연락처로 로그인 → 수강 중인 강좌 목록 → 강좌별 맞춤 수강증 표시

---

## 1. 프로젝트 구조

### 위치 및 네이밍
```
apps/class-pass/
  src/
    app/
      (student)/          # 학생 페이지
      (staff)/            # 직원/조교 QR 스캔
      (admin)/            # 관리자 대시보드
      api/                # API 라우트
    lib/                  # 공통 유틸, 인증, 테넌트
    components/           # UI 컴포넌트
    types/                # 타입 정의
  package.json
  next.config.ts
  tailwind.config.ts
```

### 기술 스택 (interview-pass 동일)
- Next.js 15 + React 19 + TypeScript
- Supabase (직접 클라이언트, Prisma 없음)
- Tailwind CSS 4
- QR: qrcode.react + html5-qrcode
- Auth: JWT (jose) + bcryptjs
- 패키지 매니저: pnpm (모노레포 워크스페이스)

### 인프라
| 항목 | 값 |
|------|-----|
| Supabase 스키마 | `class_pass` (hankuk-main 프로젝트 내) |
| Vercel 프로젝트 | `class-pass` |
| 서브도메인 | `classpass.hankukpol.co.kr` |

---

## 2. 데이터 모델 (Supabase `class_pass` 스키마)

### 핵심 테이블

```sql
-- =============================================
-- 강좌 (관리자가 생성)
-- =============================================
CREATE TABLE class_pass.courses (
  id            SERIAL PRIMARY KEY,
  division      TEXT NOT NULL,            -- 'police', 'fire' 등
  name          TEXT NOT NULL,            -- '경찰 면접반', '아침모의고사' 등
  slug          TEXT NOT NULL,            -- URL용: 'police-interview', 'morning-mock'
  course_type   TEXT NOT NULL DEFAULT 'general',  -- 'interview', 'mock_exam', 'lecture', 'general'
  status        TEXT NOT NULL DEFAULT 'active',   -- 'active', 'archived'
  theme_color   TEXT DEFAULT '#1a237e',

  -- ========== 기능 토글 (강좌별 선택) ==========
  feature_qr_pass         BOOLEAN DEFAULT true,   -- QR 수강증 표시
  feature_qr_distribution BOOLEAN DEFAULT false,  -- QR 스캔 후 자료배부
  feature_seat_assignment BOOLEAN DEFAULT false,   -- 좌석배정
  feature_time_window     BOOLEAN DEFAULT false,   -- 시간제한 표시
  feature_photo           BOOLEAN DEFAULT false,   -- 사진 표시
  feature_dday            BOOLEAN DEFAULT false,   -- D-day 카운트다운
  feature_notices         BOOLEAN DEFAULT true,    -- 공지사항
  feature_refund_policy   BOOLEAN DEFAULT false,   -- 환불규정

  -- ========== 시간제한 설정 ==========
  time_window_start  TIME,              -- '07:30'
  time_window_end    TIME,              -- '08:35'

  -- ========== D-day 설정 ==========
  target_date        DATE,
  target_date_label  TEXT,              -- '시험일', '면접일'

  -- ========== 공지/환불 ==========
  notice_title    TEXT,
  notice_content  TEXT,
  notice_visible  BOOLEAN DEFAULT false,
  refund_policy   TEXT,

  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(division, slug)
);

-- =============================================
-- 강좌별 과목 (좌석배정용)
-- =============================================
CREATE TABLE class_pass.course_subjects (
  id          SERIAL PRIMARY KEY,
  course_id   INT NOT NULL REFERENCES class_pass.courses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,            -- '형법', '형소법', '경찰학', '헌법'
  sort_order  INT DEFAULT 0,
  UNIQUE(course_id, name)
);

-- =============================================
-- 강좌별 수강생 명단 (각 강좌마다 별도)
-- =============================================
CREATE TABLE class_pass.enrollments (
  id          BIGSERIAL PRIMARY KEY,
  course_id   INT NOT NULL REFERENCES class_pass.courses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  exam_number TEXT,                     -- 수험번호 (선택)
  gender      TEXT,                     -- 성별 (선택)
  region      TEXT,                     -- 응시지역 (선택)
  series      TEXT,                     -- 직렬/구분 (선택)
  status      TEXT NOT NULL DEFAULT 'active',  -- 'active', 'refunded'
  photo_url   TEXT,                     -- 사진 URL (선택)
  memo        TEXT,                     -- 관리자 메모
  refunded_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE(course_id, name, phone)
);

-- =============================================
-- 수강생별 좌석배정
-- =============================================
CREATE TABLE class_pass.seat_assignments (
  id            BIGSERIAL PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES class_pass.enrollments(id) ON DELETE CASCADE,
  subject_id    INT NOT NULL REFERENCES class_pass.course_subjects(id) ON DELETE CASCADE,
  seat_number   TEXT NOT NULL,          -- '23', 'A-15' 등

  UNIQUE(enrollment_id, subject_id)
);

-- =============================================
-- 강좌별 배부 자료 (feature_qr_distribution 활성 시)
-- =============================================
CREATE TABLE class_pass.materials (
  id          SERIAL PRIMARY KEY,
  course_id   INT NOT NULL REFERENCES class_pass.courses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INT DEFAULT 0
);

-- =============================================
-- 자료 배부 기록
-- =============================================
CREATE TABLE class_pass.distribution_logs (
  id              BIGSERIAL PRIMARY KEY,
  enrollment_id   BIGINT NOT NULL REFERENCES class_pass.enrollments(id),
  material_id     INT NOT NULL REFERENCES class_pass.materials(id),
  distributed_at  TIMESTAMPTZ DEFAULT now(),
  distributed_by  TEXT,
  note            TEXT,

  UNIQUE(enrollment_id, material_id)
);

-- =============================================
-- 앱 설정 (division별)
-- =============================================
CREATE TABLE class_pass.app_config (
  id         SERIAL PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,     -- 'police::app_name', 'fire::staff_pin_hash'
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 팝업 콘텐츠 (division별 공지/안내)
-- =============================================
CREATE TABLE class_pass.popup_content (
  id         SERIAL PRIMARY KEY,
  division   TEXT NOT NULL,
  type       TEXT NOT NULL,            -- 'notice', 'refund_policy'
  title      TEXT,
  content    TEXT,
  is_active  BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 인덱스
-- =============================================
CREATE INDEX idx_courses_division_status ON class_pass.courses(division, status);
CREATE INDEX idx_enrollments_course ON class_pass.enrollments(course_id, status);
CREATE INDEX idx_enrollments_phone ON class_pass.enrollments(name, phone);
CREATE INDEX idx_seat_assignments_enrollment ON class_pass.seat_assignments(enrollment_id);
CREATE INDEX idx_materials_course ON class_pass.materials(course_id, is_active);
CREATE INDEX idx_distribution_logs_enrollment ON class_pass.distribution_logs(enrollment_id);

-- =============================================
-- DB 함수: 자료 배부 (원자적, interview-pass 패턴)
-- =============================================
CREATE OR REPLACE FUNCTION class_pass.distribute_material(
  p_enrollment_id BIGINT,
  p_material_id INT
) RETURNS JSONB AS $$
DECLARE
  v_enrollment RECORD;
  v_material RECORD;
  v_existing RECORD;
  v_log_id BIGINT;
BEGIN
  -- 수강생 확인
  SELECT e.id, e.name, e.status, e.course_id
  INTO v_enrollment
  FROM class_pass.enrollments e
  WHERE e.id = p_enrollment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'STUDENT_NOT_FOUND');
  END IF;

  IF v_enrollment.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'STUDENT_INACTIVE');
  END IF;

  -- 자료 확인
  SELECT m.id, m.name, m.is_active, m.course_id
  INTO v_material
  FROM class_pass.materials m
  WHERE m.id = p_material_id;

  IF NOT FOUND OR NOT v_material.is_active THEN
    RETURN jsonb_build_object('success', false, 'reason', 'MATERIAL_NOT_FOUND');
  END IF;

  -- 같은 강좌 확인
  IF v_enrollment.course_id != v_material.course_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'COURSE_MISMATCH');
  END IF;

  -- 중복 확인
  SELECT dl.id INTO v_existing
  FROM class_pass.distribution_logs dl
  WHERE dl.enrollment_id = p_enrollment_id AND dl.material_id = p_material_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'ALREADY_DISTRIBUTED');
  END IF;

  -- 배부 기록 삽입
  INSERT INTO class_pass.distribution_logs (enrollment_id, material_id)
  VALUES (p_enrollment_id, p_material_id)
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'material_name', v_material.name,
    'student_name', v_enrollment.name
  );
END;
$$ LANGUAGE plpgsql;
```

---

## 3. 사용자 흐름

### 학생 흐름
```
1. classpass.hankukpol.co.kr/{division}/ 접속
2. 이름 + 연락처 입력하여 로그인
3. → API: 해당 division에서 학생이 등록된 모든 활성 강좌 조회
4. 강좌 목록을 카드 형태로 표시 (강좌명, 유형 아이콘, 테마색)
5. 강좌 클릭 → 해당 강좌의 수강증 페이지
   └─ 기능 토글에 따라 동적 블록 조합:
      - QR 수강증: QR 코드 + 학생 정보
      - 좌석배정: 과목별 좌석번호 카드
      - 자료배부: 배부 상태 실시간 폴링
      - 시간제한: 현재시간 + 입실 확인 시계
      - D-day: 카운트다운 표시
      - 사진: 본인 사진 표시
      - 공지/환불규정: 팝업 모달
```

### 관리자 흐름
```
1. classpass.hankukpol.co.kr/{division}/admin/login
2. PIN 코드로 로그인 (interview-pass 동일 방식)
3. 대시보드:
   a. 강좌 관리
      - 강좌 생성 (이름, 유형, 기능 토글 체크박스)
      - 강좌별 설정 수정 (테마색, 공지, 환불규정, 시간, D-day)
      - 과목 설정 (좌석배정 강좌용)
   b. 수강생 관리 (강좌 선택 후)
      - 명단 붙여넣기 (엑셀 복붙: 이름\t연락처\t수험번호...)
      - 개별 추가/수정/삭제/환불처리
      - 좌석번호 일괄 입력 (이름\t과목\t좌석번호 또는 매트릭스)
   c. 자료 관리 (QR배부 강좌용)
   d. 배부 기록
   e. 앱 설정
```

### 직원(Staff) 흐름
```
1. classpass.hankukpol.co.kr/{division}/staff/login
2. PIN 또는 계정 로그인
3. 강좌 선택 드롭다운
4. QR 스캔 → 학생 확인 → 자료 배부 / 출석 확인
5. 수동 배부 (연락처 입력 대체 수단)
```

---

## 4. 라우트 구조

```
src/app/
├── layout.tsx                          # 루트 레이아웃 + TenantProvider
├── middleware.ts                       # /{division}/... → / 리라이트 + 인증
│
├── (student)/
│   ├── layout.tsx
│   ├── page.tsx                        # 로그인 (이름+연락처)
│   ├── courses/
│   │   └── page.tsx                    # 수강 강좌 목록 카드
│   └── courses/[courseSlug]/
│       └── page.tsx                    # 강좌별 수강증 (동적 블록 렌더링)
│
├── (staff)/
│   ├── layout.tsx
│   └── scan/page.tsx                   # 강좌 선택 + QR 스캔 + 수동배부
│
├── (admin)/
│   ├── layout.tsx
│   └── dashboard/
│       ├── page.tsx                    # 대시보드 개요 (강좌별 통계)
│       ├── courses/
│       │   ├── page.tsx               # 강좌 목록 + 생성
│       │   └── [id]/
│       │       ├── page.tsx           # 강좌 상세/수정/기능토글
│       │       ├── students/page.tsx  # 수강생 명단 관리 + 붙여넣기
│       │       ├── seats/page.tsx     # 좌석배정 관리
│       │       └── materials/page.tsx # 자료 관리
│       ├── logs/page.tsx              # 배부 기록 조회/내보내기
│       └── config/
│           └── page.tsx               # 앱 설정 (PIN, 테마 등)
│
├── admin/
│   ├── login/page.tsx                  # 관리자 로그인
│   └── setup/page.tsx                  # 초기 PIN 설정
├── staff/
│   └── login/page.tsx                  # 직원 로그인
│
└── api/
    ├── auth/
    │   ├── admin/  (login, logout, session, setup, bootstrap)
    │   └── staff/  (login, logout, session, accounts)
    ├── courses/
    │   ├── route.ts                   # GET 목록 / POST 생성
    │   └── [id]/
    │       ├── route.ts               # GET/PUT/DELETE
    │       └── subjects/route.ts      # 과목 CRUD
    ├── enrollments/
    │   ├── lookup/route.ts            # 학생 로그인 (이름+연락처 → 강좌 목록)
    │   ├── bulk/route.ts              # 명단 일괄 등록
    │   ├── [id]/
    │   │   ├── route.ts               # 개별 수정/삭제
    │   │   ├── refund/route.ts        # 환불 처리
    │   │   └── receipts/route.ts      # 배부 상태 조회
    │   └── route.ts                   # 강좌별 수강생 목록
    ├── seats/
    │   ├── route.ts                   # 좌석 일괄 등록/조회
    │   └── bulk/route.ts              # 좌석 일괄 입력
    ├── materials/
    │   ├── route.ts                   # 자료 CRUD
    │   └── [id]/route.ts
    ├── distribution/
    │   ├── scan/route.ts              # QR 스캔 배부
    │   ├── quick/route.ts             # 수동 배부
    │   ├── undo/route.ts              # 배부 취소
    │   └── logs/route.ts              # 배부 기록
    └── config/
        ├── app/route.ts               # 앱 설정
        └── cache/invalidate/route.ts  # 캐시 무효화
```

---

## 5. interview-pass에서 재사용할 코드

> 참조 경로: `apps/interview-pass/src/`

| 영역 | interview-pass 소스 | class-pass 대응 |
|------|---------------------|----------------|
| 멀티테넌트 | `lib/tenant.ts`, `tenant.server.ts`, `division-scope.ts` | 그대로 복사, division 목록 확장 |
| 미들웨어 | `middleware.ts` | 동일 패턴 (division 리라이트 + 인증 체크) |
| JWT 인증 | `lib/auth/jwt.ts`, `pin.ts`, `cookie-domain.ts` | 그대로 복사 |
| 세션 액터 | `lib/auth/session-actor.ts` | 그대로 복사 |
| Rate Limiter | `lib/auth/rateLimiter.ts` | 그대로 복사 |
| 관리자 인증 API | `lib/auth/require-admin-api.ts` | 그대로 복사 |
| QR 토큰 | `lib/qr/token.ts` | 그대로 복사 (HMAC 기반) |
| Supabase 클라이언트 | `lib/supabase/server.ts` | 스키마만 `class_pass`로 변경 |
| 유틸리티 | `lib/utils.ts` | 이름/전화 정규화 등 그대로 복사 |
| 앱 설정 패턴 | `lib/app-config.ts`, `app-config.shared.ts` | feature flag 구조 재사용 + 강좌별 확장 |
| Feature Guard | `lib/app-feature-guard.ts` | 패턴 재사용 |
| TenantProvider | `components/TenantProvider.tsx` | 그대로 복사 |
| FeatureDisabledPanel | `components/FeatureDisabledPanel.tsx` | 그대로 복사 |
| QR 스캔 UI | `app/(staff)/scan/page.tsx` | 강좌 선택 드롭다운 추가하여 확장 |
| 학생 로그인 | `app/(student)/page.tsx` | 동일 패턴 (이름+연락처) |
| 수강증 표시 | `app/(student)/receipt/page.tsx` | 기능 토글 기반 동적 블록으로 재설계 |
| 관리자 로그인 | `app/admin/login/`, `app/admin/setup/` | 그대로 복사 |
| 관리자 대시보드 | `app/(admin)/dashboard/` | 강좌 관리 화면 추가 |
| 자료 배부 로직 | `lib/distribution/materials.ts` | enrollment_id 기반으로 변환 |
| 설정 관리 UI | `app/(admin)/dashboard/config/` | 패턴 재사용 |
| 캐시 revalidation | `lib/cache/revalidate.ts` | 그대로 복사 |
| Student status | `lib/student-status.ts` | 그대로 복사 |
| Division compat | `lib/division-compat.ts` | 그대로 복사 |

---

## 6. 강좌 유형별 기능 매핑

| 앱스크립트 원본 | course_type | 활성화 기능 |
|---------------|-------------|------------|
| 면접 수강증 (interview-pass) | `interview` | qr_pass, qr_distribution, notices, refund_policy |
| 면접 수강증 + 좌석 | `interview` | qr_pass, qr_distribution, seat_assignment, notices, refund_policy |
| 알짜 문풀 QR 수강증 | `lecture` | qr_pass, qr_distribution |
| 알짜 진도별 수강증 | `lecture` | qr_pass, photo, notices, refund_policy |
| 아침모의고사 수강증 | `mock_exam` | qr_pass, time_window, dday, notices |
| 7.6.5 수강증 | `mock_exam` | qr_pass, time_window, dday, notices, refund_policy |
| 정기모의고사 수강증 | `mock_exam` | qr_pass, dday, notices, refund_policy |
| **좌석만 있는 강좌 (Phase 1)** | `general` | **qr_pass, seat_assignment** |

관리자가 강좌 생성 시 이 기능들을 자유롭게 조합 가능.

---

## 7. 수강증 UI 컴포넌트 구조 (동적 렌더링)

```tsx
// courses/[courseSlug]/page.tsx
// 강좌의 feature 토글에 따라 블록을 조합

<PassLayout course={course} enrollment={enrollment}>
  {/* 항상 표시 */}
  <PassHeader courseName={course.name} themeColor={course.theme_color} />
  <StudentInfoCard name={enrollment.name} phone={enrollment.phone}
    examNumber={enrollment.exam_number} region={enrollment.region} />

  {/* 조건부 블록 - 강좌 설정에 따라 */}
  {course.feature_photo && <StudentPhoto url={enrollment.photo_url} />}
  {course.feature_seat_assignment &&
    <SeatAssignmentCard subjects={subjects} seats={seatAssignments} />}
  {course.feature_qr_pass &&
    <QRCodeCard token={qrToken} />}
  {course.feature_time_window &&
    <TimeWindowClock start={course.time_window_start} end={course.time_window_end} />}
  {course.feature_dday &&
    <DdayCounter targetDate={course.target_date} label={course.target_date_label} />}
  {course.feature_qr_distribution &&
    <MaterialStatusList materials={materials} receipts={receipts} polling={true} />}
  {course.feature_notices && course.notice_visible &&
    <NoticePopup title={course.notice_title} content={course.notice_content} />}
  {course.feature_refund_policy &&
    <RefundPolicyPopup content={course.refund_policy} />}
</PassLayout>
```

---

## 8. 개발 단계 (Codex에게 위임)

### Phase 1: 프로젝트 초기화 + DB (기반)
- `apps/class-pass/` Next.js 15 프로젝트 생성 (interview-pass 기반 복사)
- Supabase `class_pass` 스키마 + 위 테이블 전체 생성 (섹션 2의 SQL 실행)
- interview-pass에서 공통 코드 복사 (tenant, auth, middleware, utils, supabase client)
- 기본 레이아웃 + TenantProvider + 미들웨어
- 환경변수 설정 (.env.local.example)
- package.json 의존성: interview-pass의 것 복사

### Phase 2: 관리자 인증 + 강좌 CRUD
- 관리자 PIN 로그인/로그아웃/세션 (interview-pass 코드 복사)
- 관리자 초기 설정(setup) 페이지
- 강좌 CRUD API (`/api/courses/`) + UI (목록, 생성, 수정, 아카이브)
- 강좌 생성 시 기능 토글 체크박스 UI
- 과목 CRUD (`/api/courses/[id]/subjects/`) (좌석배정 강좌용)

### Phase 3: 수강생 명단 + 좌석배정 (Phase 1 우선 기능)
- 강좌별 수강생 명단 관리 UI
- **명단 붙여넣기 파싱** (탭 구분 텍스트: `이름\t연락처\t수험번호`)
- 수강생 개별 추가/수정/삭제
- 환불 처리 (`/api/enrollments/[id]/refund/`)
- **좌석배정 UI**: 과목×학생 매트릭스 또는 붙여넣기
- 좌석 일괄 등록 API (`/api/seats/bulk/`)

### Phase 4: 학생 로그인 + 강좌 목록 + 수강증
- 학생 로그인 (이름 + 연락처) → `/api/enrollments/lookup/`
- 수강 강좌 목록 카드 UI (`/courses/`)
- **좌석배정 수강증 화면** (과목별 좌석번호 카드 - Phase 1 핵심)
- QR 수강증 카드
- 동적 블록 조합 렌더링 (섹션 7 참조)

### Phase 5: QR 스캔 + 자료 배부
- 직원 로그인
- 강좌 선택 + QR 스캔 UI
- 자료 배부 로직 (`distribute_material` DB 함수 호출)
- 수동 배부 (`/api/distribution/quick/`)
- 학생 수강증에 배부 상태 폴링

### Phase 6: 추가 기능 블록
- 시간제한 시계 (TimeWindowClock 컴포넌트)
- D-day 카운트다운 (DdayCounter 컴포넌트)
- 사진 표시 (StudentPhoto 컴포넌트)
- 공지/환불규정 팝업
- 관리자 대시보드 통계 (강좌별 수강생 수, 배부율 등)

### Phase 7: interview-pass 통합 마이그레이션
- `interview` 스키마 데이터 → `class_pass` 스키마 이관 스크립트
- 기존 면접 수강증 → class-pass 강좌로 등록
- interview-pass 도메인 리다이렉트 설정
- 안정화 후 interview-pass 앱 폐기

---

## 9. 환경변수

```env
# Supabase (공유 - 다른 앱과 동일)
NEXT_PUBLIC_SUPABASE_URL=https://pbonwjwbtqyrfrxqdwlu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# 앱 전용
JWT_SECRET=...                    # JWT 서명 키
QR_HMAC_SECRET=...                # QR 토큰 HMAC 키
NEXT_PUBLIC_TENANT_TYPE=police    # 기본 테넌트 (과도기)
```

---

## 10. 모노레포 규칙 참고

- AGENTS.md 도메인 매핑 테이블에 class-pass 추가 필요
- Supabase 프로젝트 새로 만들지 않음 (hankuk-main에 `class_pass` 스키마 추가)
- pnpm 사용, npm/yarn 금지
- apps/ 하위에 앱 배치
- division은 런타임 경로 기반 (`/{division}/...`)
- build-time tenant env 최소화

---

## 11. 검증 방법

1. `pnpm --filter class-pass dev` → 로컬 개발 서버 실행
2. Supabase 대시보드에서 `class_pass` 스키마 + 테이블 확인
3. 관리자 로그인 → 강좌 생성 → 기능 토글 설정 → 과목 추가
4. 강좌에 수강생 명단 붙여넣기 → 좌석번호 배정
5. 학생 로그인 → 강좌 목록 → **좌석배정 수강증** 확인 (Phase 1 핵심)
6. 직원 QR 스캔 → 자료 배부 → 학생 수강증에 반영
7. `pnpm --filter class-pass build` → 빌드 성공
8. `/{division}/` 경로별 멀티테넌트 동작 확인 (police, fire)
