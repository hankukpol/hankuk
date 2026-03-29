# 직원·권한 관리 PRD

**작성일**: 2026-03-13
**우선순위**: Phase 0 (기반 인프라)
**관련 개발 룰**: 00_개발공통룰.md

---

## 목차

1. [직원 역할 체계](#1-직원-역할-체계)
2. [역할별 권한 매트릭스](#2-역할별-권한-매트릭스)
3. [강사 관리](#3-강사-관리)
4. [직원 CRUD](#4-직원-crud)
5. [감사 로그](#5-감사-로그)
6. [DB 모델](#6-db-모델)
7. [API 엔드포인트](#7-api-엔드포인트)

---

## 1. 직원 역할 체계

### 1-1. 역할 등급

```
대표 (OWNER)
  │
  └── 원장 (DIRECTOR)
        │
        ├── 부원장 (DEPUTY_DIRECTOR)
        │     │
        │     └── 실장 (MANAGER)
        │           │
        │           ├── 교무행정 (ACADEMIC_ADMIN)
        │           ├── 상담 (COUNSELOR)
        │           └── 선생님 (TEACHER)
```

| 역할 코드 | 역할명 | 주요 업무 |
|---|---|---|
| `OWNER` | 대표 | 전체 시스템 최고 권한, 원장 계정 생성 |
| `DIRECTOR` | 원장 | 전체 운영 총괄, 강사 수익 배분율 설정 |
| `DEPUTY_DIRECTOR` | 부원장 | 원장 위임 업무 대행, 정산 조회 |
| `MANAGER` | 실장 | 수납·수강 운영 전반 관리 |
| `ACADEMIC_ADMIN` | 교무행정 | 수강 등록, 출결, 성적 입력 |
| `COUNSELOR` | 상담 | 미등록자 상담, 학생 상담 기록 |
| `TEACHER` | 선생님(직원) | 담임반 관리, 출결 확인, 성적 조회 |

> **강사(INSTRUCTOR)는 별도 관리**
> 강사(5명: 형법/형소법/헌법/경찰학/범죄학)는 직원 권한 체계와 분리됩니다.
> 강사는 강의·수익 배분율(%) 관리 대상이며, 시스템 접근 권한은 별도 설정합니다.
> 자세한 내용은 [§3 강사 관리](#3-강사-관리) 참조.

### 1-2. 현재 시스템 역할 마이그레이션

| 기존 역할 | 신규 역할 매핑 |
|---|---|
| `SUPER_ADMIN` | `OWNER` or `DIRECTOR` |
| `TEACHER` | `ACADEMIC_ADMIN` or `TEACHER` |
| `VIEWER` | `COUNSELOR` or `TEACHER` |

---

## 2. 역할별 권한 매트릭스

### 2-1. 수강 관리

| 기능 | OWNER | DIRECTOR | DEPUTY | MANAGER | ACAD_ADMIN | COUNSELOR | TEACHER |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 원생 등록 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 원생 수정 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 원생 삭제/비활성화 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 수강 등록 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 수강 변경/퇴원 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 휴원 처리 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 미등록자(상담) 등록 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 수강반 조회 | ✅ | ✅ | ✅ | ✅ | ✅ | 👁 조회 | 👁 조회 |

### 2-2. 수납·결제

| 기능 | OWNER | DIRECTOR | DEPUTY | MANAGER | ACAD_ADMIN | COUNSELOR | TEACHER |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 수납 등록 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 수납 취소/환불 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 환불 승인 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 카드 결제 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 일계표 조회 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 월계표 조회 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 강사 수익 배분율 수정 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ← 원장 이상만
| 강사 정산 조회 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ← 실장도 조회 가능
| 미납자 관리 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

### 2-3. 성적·출결

| 기능 | OWNER | DIRECTOR | DEPUTY | MANAGER | ACAD_ADMIN | COUNSELOR | TEACHER |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 성적 입력 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | 👁 담임반만 |
| 성적 수정/삭제 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 출결 처리 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ 담임반 |
| 사유서 승인 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 경고/탈락 처리 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 성적 분석 조회 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | 👁 담임반 |

### 2-4. 학생 상담·포인트

| 기능 | OWNER | DIRECTOR | DEPUTY | MANAGER | ACAD_ADMIN | COUNSELOR | TEACHER |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 상담 기록 등록 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 담임반 |
| 상담 기록 삭제 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 포인트 부여 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ 담임반 |
| 포인트 취소 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

### 2-5. 시스템 설정

| 기능 | OWNER | DIRECTOR | DEPUTY | MANAGER | ACAD_ADMIN | COUNSELOR | TEACHER |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 강좌 마스터 생성/수정 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 강좌 삭제 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 교재 관리 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 사물함 배정 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 합격자 등록 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **직원 등록** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **직원 권한 변경** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **감사 로그 조회** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **카카오 알림 설정** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **시스템 전체 설정** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **👁 = 조회만 가능 (수정 불가)**
> **담임반 = 본인이 담임인 반에 한해서만**

### 2-6. 권한 검사 방식

```typescript
// middleware.ts
// 역할 계층: 숫자가 낮을수록 높은 권한
const ROLE_LEVEL = {
  OWNER:          1,
  DIRECTOR:       2,
  DEPUTY_DIRECTOR: 3,
  MANAGER:        4,
  ACADEMIC_ADMIN: 5,
  COUNSELOR:      6,
  TEACHER:        7,
} as const;

// 최소 역할 이상이면 허용
function hasMinRole(userRole: StaffRole, minRole: StaffRole): boolean {
  return ROLE_LEVEL[userRole] <= ROLE_LEVEL[minRole];
}

// 특정 기능에 대한 권한 검사
export function canAccess(userRole: StaffRole, feature: string): boolean {
  const FEATURE_MIN_ROLE: Record<string, StaffRole> = {
    'enrollment.create':           'ACADEMIC_ADMIN',
    'enrollment.delete':           'MANAGER',
    'payment.create':              'ACADEMIC_ADMIN',
    'payment.cancel':              'MANAGER',
    'payment.refund.approve':      'DEPUTY_DIRECTOR',
    'instructor.revenue.edit':     'DIRECTOR',        // 원장 이상만
    'instructor.settlement.view':  'MANAGER',         // 실장도 조회 가능
    'staff.create':                'DIRECTOR',
    'staff.role.change':           'DIRECTOR',
    'audit.view':                  'DEPUTY_DIRECTOR',
    'system.settings':             'DIRECTOR',
  };
  const minRole = FEATURE_MIN_ROLE[feature];
  if (!minRole) return false;
  return hasMinRole(userRole, minRole);
}
```

---

## 3. 강사 관리

> 강사(Instructor)는 **직원 권한 체계와 별도로 관리**된다.
> 강사는 강의 담당 및 수익 배분율만 설정하며, 시스템 로그인 권한은 부여하지 않는 것이 기본이다.

### 3-1. 강사 목록

| 담당 과목 | 비고 |
|---|---|
| 형법 | 특강 단과 강의 |
| 형소법 | 특강 단과 강의 |
| 헌법 | 특강 단과 강의 |
| 경찰학 | 특강 단과 강의 |
| 범죄학 | 특강 단과 강의 |

### 3-2. 강사 수익 배분율

```
/admin/settings/instructors

강사 수익 배분율 설정 (원장 전용)
══════════════════════════════════════════════════════
강사명   과목       배분율   적용 강좌            수정
홍강사   형법       30%     26년 특강 (형법)     [수정]
김강사   형소법     28%     26년 특강 (형소법)   [수정]
이강사   헌법       25%     26년 특강 (헌법)     [수정]
박강사   경찰학     27%     26년 특강 (경찰학)   [수정]
최강사   범죄학     25%     26년 특강 (범죄학)   [수정]
══════════════════════════════════════════════════════
```

- 배분율 수정 권한: **원장(DIRECTOR) 이상**만 가능
- 배분율 조회 권한: **부원장(DEPUTY_DIRECTOR) 이상** 가능
- 배분율 변경 시 감사 로그 자동 기록

### 3-3. DB 모델

```prisma
model Instructor {
  id          String   @id @default(cuid())
  name        String
  subject     String   // 담당 과목
  mobile      String?
  email       String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  revenueRates InstructorRevenueRate[]
  @@map("instructors")
}

model InstructorRevenueRate {
  id            String    @id @default(cuid())
  instructorId  String
  courseId      String    // 적용 강좌
  ratePercent   Float     // 배분율 (예: 30.0 = 30%)
  effectiveFrom DateTime  // 적용 시작일
  effectiveTo   DateTime? // 적용 종료일 (null = 현재 적용 중)
  setByStaffId  String    // 설정한 직원 (원장 이상)
  createdAt     DateTime  @default(now())

  instructor  Instructor @relation(fields: [instructorId], references: [id])
  @@map("instructor_revenue_rates")
}
```

---

## 4. 직원 CRUD

### 4-1. 직원 목록 화면

```
/admin/settings/staff

직원 관리 (원장 이상 접근)
══════════════════════════════════════════════════════
[+ 직원 등록]

이름      역할        상태   담당반          마지막 로그인
김원장    원장        활성   -              2026-03-13 09:15
이실장    실장        활성   -              2026-03-13 08:50
박교무    교무행정    활성   -              2026-03-13 09:00
최상담    상담        활성   -              2026-03-12 18:30
홍선생    선생님      활성   52기 종합반     2026-03-13 07:45
══════════════════════════════════════════════════════
```

### 4-2. 직원 등록/수정

```
직원 등록
  이름:       [ 홍길동 ]
  이메일:     [ hong@academy.com ]  ← Supabase Auth 계정
  역할:       [ 선생님 ▼ ]
  담당반:     [ 52기 종합반 ▼ ]  (선생님/교무행정 역할시 선택)
  연락처:     [ 010-1234-5678 ]
  비고:       [               ]
  [등록]
```

### 4-3. 계정 관리

- 직원 계정 = Supabase Auth 이메일 계정
- 비밀번호 초기화: 원장이 재설정 링크 이메일 발송
- 계정 비활성화: `isActive = false` (물리 삭제 금지, 감사 로그 보존을 위해)
- 역할 변경 로그: 변경 전/후 역할, 변경자, 변경 사유 감사 로그에 기록

---

## 5. 감사 로그 (Audit Log)

> 모든 중요 데이터 변경 사항을 자동으로 기록한다.
> 감사 로그는 절대 삭제·수정할 수 없다.

### 5-1. 감사 로그 트리거 이벤트

| 분류 | 이벤트 |
|---|---|
| 수납 | 수납 등록, 수납 취소, 환불 처리, 수납 수정 |
| 수강 | 수강 등록, 퇴원, 휴원, 복귀, 수강료 변경 |
| 학생 | 원생 등록, 정보 수정, 비활성화, 재활성화 |
| 직원 | 직원 등록, 역할 변경, 비활성화 |
| 강사 | 수익 배분율 변경 |
| 성적 | 성적 수정, 성적 삭제 |
| 사유서 | 승인, 반려, 승인 취소 |
| 설정 | 강좌 삭제, 시스템 설정 변경 |

### 5-2. 감사 로그 조회 화면

```
/admin/settings/audit-log

감사 로그 (부원장 이상 조회)
══════════════════════════════════════════════════════
기간: [ 2026-03-01 ~ 2026-03-13 ]  직원: [ 전체 ▼ ]  분류: [ 전체 ▼ ]

일시                직원     분류    이벤트          대상          변경 내용
2026-03-13 14:22  이실장  수납    수납 취소       81697 홍길동   26-P-0052 취소
2026-03-13 11:05  박교무  수강    퇴원 처리       72341 김수험   26-0031
2026-03-13 09:15  김원장  강사    배분율 변경     홍강사(형법)   25% → 30%
══════════════════════════════════════════════════════
```

### 5-3. DB 모델

```prisma
model AuditLog {
  id          String    @id @default(cuid())
  staffId     String    // 처리한 직원
  staffName   String    // 스냅샷 (직원 삭제 후에도 보존)
  staffRole   String    // 역할 스냅샷
  category    String    // PAYMENT / ENROLLMENT / STUDENT / STAFF / INSTRUCTOR / SCORE / SYSTEM
  event       String    // 이벤트명 (예: "수납 취소")
  targetType  String?   // 대상 타입 (예: "Payment")
  targetId    String?   // 대상 ID
  targetLabel String?   // 대상 표시명 (예: "홍길동 26-P-0052")
  before      Json?     // 변경 전 값
  after       Json?     // 변경 후 값
  ipAddress   String?
  createdAt   DateTime  @default(now())

  @@index([staffId])
  @@index([category, createdAt])
  @@map("audit_logs")
}
```

---

## 6. DB 모델

### 6-1. 직원 (Staff)

```prisma
model Staff {
  id          String    @id @default(cuid())
  authUid     String    @unique // Supabase Auth UUID
  email       String    @unique
  name        String
  role        StaffRole
  mobile      String?
  isActive    Boolean   @default(true)
  note        String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  lastLoginAt DateTime?

  // 기존 AdminUser와의 연결 (마이그레이션 전환 시)
  adminUserId String?   @unique // 기존 AdminUser.id 참조

  @@map("staffs")
}

enum StaffRole {
  OWNER
  DIRECTOR
  DEPUTY_DIRECTOR
  MANAGER
  ACADEMIC_ADMIN
  COUNSELOR
  TEACHER
}
```

> **마이그레이션 노트**: 기존 `AdminUser` 테이블의 `SUPER_ADMIN` → `DIRECTOR`, `TEACHER` → `ACADEMIC_ADMIN`, `VIEWER` → `COUNSELOR` 로 일괄 변환 스크립트 작성 필요.

### 6-2. 담임반 배정

```prisma
// 선생님이 담임을 맡은 반
model HomeRoomAssignment {
  id        String   @id @default(cuid())
  staffId   String   // Staff.id (TEACHER 역할)
  courseId  String   // 담당 강좌/반
  from      DateTime
  to        DateTime?
  @@map("homeroom_assignments")
}
```

---

## 7. API 엔드포인트

```
# 직원
GET    /api/staff                          직원 목록 (원장 이상)
POST   /api/staff                          직원 등록 (원장 이상)
GET    /api/staff/[id]                     직원 상세
PATCH  /api/staff/[id]                     직원 정보 수정 (원장 이상)
PATCH  /api/staff/[id]/role                역할 변경 (원장 이상)
PATCH  /api/staff/[id]/deactivate          비활성화 (원장 이상)

# 강사
GET    /api/instructors                    강사 목록
POST   /api/instructors                    강사 등록 (원장 이상)
PATCH  /api/instructors/[id]              강사 정보 수정 (원장 이상)
GET    /api/instructors/[id]/revenue-rates 수익 배분율 이력 (부원장 이상)
POST   /api/instructors/[id]/revenue-rates 배분율 설정 (원장 이상)

# 감사 로그
GET    /api/audit-logs?from=&to=&staffId=&category=  감사 로그 조회 (부원장 이상)
```

---

## 8. 피처 플래그 (Feature Flag) 전략

> **배포 전략**: 신규 기능은 Next.js Middleware 피처 플래그로 비공개 운영.
> 아침모의고사 기존 기능은 항상 활성화. 신규 기능은 환경변수로 단계적 오픈.

### 8-1. 피처 플래그 설정

```typescript
// lib/feature-flags.ts

export const FEATURES = {
  // 항상 활성 (기존 아침모의고사 기능)
  EXAM_SCORES:        true,
  EXAM_ATTENDANCE:    true,
  ABSENCE_NOTES:      true,
  COUNSELING:         true,
  POINTS:             true,

  // 신규 기능 (환경변수로 제어)
  ENROLLMENT:         process.env.FEATURE_ENROLLMENT === 'true',
  PAYMENT:            process.env.FEATURE_PAYMENT === 'true',
  FACILITIES:         process.env.FEATURE_FACILITIES === 'true',
  STAFF_MANAGEMENT:   process.env.FEATURE_STAFF === 'true',
  DASHBOARD_V2:       process.env.FEATURE_DASHBOARD_V2 === 'true',
  KAKAO_NOTIFICATIONS: process.env.FEATURE_KAKAO === 'true',
  STUDENT_PORTAL:     process.env.FEATURE_STUDENT_PORTAL === 'true',
} as const;
```

### 8-2. Middleware 라우트 보호

```typescript
// middleware.ts
import { FEATURES } from '@/lib/feature-flags';

const FEATURE_ROUTES: Record<keyof typeof FEATURES, string[]> = {
  ENROLLMENT:       ['/admin/enrollments', '/admin/students/register'],
  PAYMENT:          ['/admin/payments', '/admin/settlements'],
  FACILITIES:       ['/admin/facilities'],
  STAFF_MANAGEMENT: ['/admin/settings/staff', '/admin/settings/instructors'],
  DASHBOARD_V2:     ['/admin/dashboard-v2'],
  KAKAO_NOTIFICATIONS: ['/admin/settings/kakao'],
  STUDENT_PORTAL:   ['/portal'],
  // 항상 활성 기능은 목록 없음
  EXAM_SCORES:      [],
  EXAM_ATTENDANCE:  [],
  ABSENCE_NOTES:    [],
  COUNSELING:       [],
  POINTS:           [],
};

export function middleware(request: NextRequest) {
  for (const [feature, routes] of Object.entries(FEATURE_ROUTES)) {
    if (!FEATURES[feature as keyof typeof FEATURES]) {
      const isProtected = routes.some(route =>
        request.nextUrl.pathname.startsWith(route)
      );
      if (isProtected) {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
    }
  }
}
```

### 8-3. Vercel 환경변수 단계별 오픈 순서

```
Phase 0 배포:
  FEATURE_STAFF=true         ← 직원 권한 체계 먼저 구축

Phase 1 배포:
  FEATURE_ENROLLMENT=true    ← 수강 등록
  FEATURE_PAYMENT=true       ← 수납 결제

Phase 2 배포:
  FEATURE_FACILITIES=true    ← 시설 관리
  FEATURE_KAKAO=true         ← 카카오 알림

Phase 3 배포:
  FEATURE_DASHBOARD_V2=true  ← 원장 대시보드 v2
  FEATURE_STUDENT_PORTAL=true ← 학생 포털
```

---

*이 PRD는 `00_개발공통룰.md §0 핵심 데이터 연동 원칙`과 함께 읽는다.*
*직원 권한 체크는 모든 API Route Handler에서 `canAccess()` 함수로 일관 처리한다.*

---

## 8. 멀티지점 전환 — 권한 체계 변경 사항 (2026-03-21 추가)

### 8-1. SUPER_ADMIN 역할 확장

> SUPER_ADMIN은 단순한 최고 관리자가 아니라 **전 지점을 관리하는 슈퍼관리자**로 확장된다.

| 기존 역할 | 변경 후 역할 |
|-----------|-------------|
| SUPER_ADMIN (시스템 전체 관리자) | **SUPER_ADMIN (전 지점 슈퍼관리자)** — 전 지점 데이터 접근 + 지점 생성·삭제 |
| DIRECTOR (원장) | **DIRECTOR (지점 원장)** — 소속 지점만 전체 접근 + 지점 설정 변경 |

### 8-2. 역할별 지점 접근 범위

| 역할 | academyId 접근 범위 | 지점 설정 변경 | 지점 생성 |
|------|-------------------|----------------|-----------|
| **SUPER_ADMIN** | **전 지점 (null = 제한 없음)** | 모든 지점 | ✅ 가능 |
| DIRECTOR | 소속 지점만 | 소속 지점만 | ❌ |
| DEPUTY_DIRECTOR | 소속 지점만 | ❌ | ❌ |
| MANAGER 이하 | 소속 지점만 | ❌ | ❌ |

### 8-3. SUPER_ADMIN 전용 기능

```
/admin/super/academies    — 전체 지점 목록 + 신규 지점 생성 + 활성화/비활성화
/admin/super/dashboard    — 전 지점 통합 KPI 대시보드 (지점별 학생 수, 수납 현황)
/admin/super/users        — 전 지점 관리자 계정 조회 + 소속 지점 변경
```

### 8-4. 지점 전환 메커니즘

```
SUPER_ADMIN 로그인 후:
  → 기본값: 전체 보기 모드 (activeAcademyId = null)
  → 헤더 드롭다운에서 특정 지점 선택 → 쿠키에 activeAcademyId 저장
  → 해당 지점 데이터만 표시 (지점 관리자와 동일한 뷰)
  → "전체 보기"로 전환 가능
```

### 8-5. AdminUser DB 필드 변경

```prisma
model AdminUser {
  // 기존 필드 유지...
  academyId  Int?      // null = SUPER_ADMIN (전체 접근)
             //  숫자 = 소속 지점 ID
  academy    Academy?  @relation(fields: [academyId], references: [id])
}
```

### 8-6. 신규 지점 관리자 생성 프로세스

```
① SUPER_ADMIN → /admin/super/academies/new
   - 지점 코드, 학원명, 유형(POLICE/FIRE/CIVIL_SERVICE) 입력
   - Academy 레코드 생성

② SUPER_ADMIN → /admin/super/users
   - 새 관리자 계정 생성 (AdminUser)
   - academyId = 신규 지점 ID 설정
   - 역할 = DIRECTOR로 설정

③ 신규 지점 DIRECTOR가 /admin/settings/* 에서 지점 설정 완료
```

### 8-7. 코드 리뷰 체크리스트 추가 항목

```
[멀티테넌시]
- [ ] API 라우트에서 getAdminContext() 사용 (getAdminSession() 금지)
- [ ] 모든 DB 조회에 academyId 필터 적용
- [ ] 신규 레코드 생성 시 academyId 포함
- [ ] SUPER_ADMIN 전체 조회 예외 처리 (academyId = null 허용)
- [ ] 지점 전환 후 UI에서 올바른 지점 데이터 표시 확인
```
