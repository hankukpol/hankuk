# 시간통제 자습반 관리 시스템 - 개발 지침

> 이 파일은 AI 코딩 에이전트(Claude Code, Codex 등)가 이 프로젝트를 올바르게 개발하기 위한 핵심 지침서입니다.
> 개발 시작 전 반드시 `../개발문서.md`를 완독하세요.

---

## 프로젝트 핵심 원칙

1. **관리자 완전 제어**: 모든 수치 기준(벌점 임계값, 지각 기준 분, 허가 한도 등)을 코드에 하드코딩하지 않음. 반드시 DB(`division_settings` 테이블)에서 읽어 사용.
2. **직렬 완전 분리**: 모든 쿼리에 `division_id` 필터 필수. 경찰반 데이터가 소방반에 노출되면 안 됨.
3. **모바일 우선**: 조교 출석체크 페이지(`/[division]/assistant/check`)는 모바일 환경 기준으로 설계.
4. **PC 대시보드**: 관리자 페이지는 사이드바(240px) + 메인 콘텐츠 2컬럼 레이아웃 기준.
5. **한글/인코딩 보존**: 모든 문서와 코드 파일은 UTF-8 기준으로 읽고 저장. 한글 UI 문구, 문서, 시드 데이터가 깨지지 않도록 수정 전후 인코딩 상태를 확인.
6. **승인 지연 금지**: 사용자가 전체 자동 승인을 허용한 상태로 간주하고, 권한 상승이나 네트워크 접근 승인이 필요하면 추가 확인 질문 없이 바로 승인 요청 절차를 진행.

---

## 기술 스택

```
Next.js 14 (App Router)     TypeScript 필수
Supabase                    Auth + PostgreSQL DB
Prisma                      ORM (schema.prisma → supabase 마이그레이션)
TailwindCSS                 스타일링
Lucide React                아이콘
Sonner                      Toast 알림
ExcelJS                     엑셀 내보내기 (서버 사이드 only)
Zod                         API 입력 유효성 검사
```

---

## 디렉토리 구조

```
web/
├── app/
│   ├── layout.tsx                  루트 레이아웃
│   ├── page.tsx                    메인 (직렬 선택)
│   ├── login/page.tsx              관리자/조교 로그인
│   ├── [division]/
│   │   ├── layout.tsx              직렬 레이아웃 (직렬 색상 적용)
│   │   ├── student/
│   │   │   ├── login/page.tsx      학생 로그인 (수험번호+이름)
│   │   │   ├── page.tsx            학생 개인 대시보드
│   │   │   ├── attendance/page.tsx 본인 출석 상세
│   │   │   ├── points/page.tsx     본인 상벌점 상세
│   │   │   └── exams/page.tsx      본인 성적 상세
│   │   ├── assistant/
│   │   │   ├── layout.tsx          조교 레이아웃
│   │   │   ├── page.tsx            조교 대시보드
│   │   │   └── check/page.tsx      현장 출석체크 (모바일 최적화)
│   │   └── admin/
│   │       ├── layout.tsx          어드민 레이아웃 (사이드바)
│   │       ├── page.tsx            관리자 대시보드
│   │       ├── students/
│   │       ├── attendance/
│   │       ├── points/
│   │       ├── exams/
│   │       ├── payments/
│   │       ├── leave/
│   │       ├── interviews/
│   │       ├── warnings/           경고 대상자 + 연락처 복사
│   │       ├── announcements/
│   │       ├── settings/
│   │       │   ├── page.tsx        설정 허브
│   │       │   ├── periods/        교시 설정
│   │       │   ├── rules/          경고기준·지각기준·휴가한도
│   │       │   ├── seats/          좌석 배치도
│   │       │   ├── exams/          시험 종류·과목
│   │       │   └── general/        직렬 기본 정보
│   │       └── reports/
│   └── api/
│       ├── auth/
│       └── [division]/
│           ├── students/
│           ├── periods/
│           ├── attendance/
│           ├── points/
│           ├── point-rules/
│           ├── exams/
│           ├── payments/
│           ├── leave/
│           ├── interviews/
│           ├── warnings/
│           ├── announcements/
│           ├── settings/
│           ├── seasons/
│           └── export/
├── components/
│   ├── layout/
│   │   ├── AdminSidebar.tsx
│   │   ├── MobileHeader.tsx
│   │   └── AssistantBottomNav.tsx
│   ├── dashboard/
│   ├── attendance/
│   ├── students/
│   ├── points/
│   ├── exams/
│   ├── seats/
│   │   ├── SeatMap.tsx             시각적 좌석 배치도
│   │   └── SeatEditor.tsx
│   ├── payments/
│   ├── student-view/
│   └── ui/
│       ├── Badge.tsx
│       ├── Modal.tsx
│       ├── CopyButton.tsx          연락처 복사 버튼
│       └── DataTable.tsx
├── lib/
│   ├── supabase/
│   │   ├── server.ts               createServerClient
│   │   ├── browser.ts              createBrowserClient
│   │   └── middleware.ts           updateSession
│   ├── prisma.ts                   PrismaClient singleton
│   ├── auth.ts                     인증 유틸
│   ├── api-auth.ts                 requireApiAuth 헬퍼
│   └── services/
│       ├── student.service.ts
│       ├── attendance.service.ts
│       ├── point.service.ts
│       ├── period.service.ts
│       ├── exam.service.ts
│       ├── payment.service.ts
│       └── settings.service.ts     division_settings 읽기/쓰기
├── middleware.ts
└── prisma/
    └── schema.prisma
```

---

## 코딩 규칙

### API 라우트 패턴
```typescript
// app/api/[division]/students/route.ts
import { requireApiAuth } from '@/lib/api-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { division: string } }
) {
  const auth = await requireApiAuth(params.division, 'ADMIN')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // division_id 필터 필수
  const students = await prisma.student.findMany({
    where: { division: { slug: params.division } }
  })
  return NextResponse.json(students)
}
```

### 설정값 사용 패턴 (하드코딩 금지)
```typescript
// ❌ 절대 금지
const WARN_LEVEL1 = 10

// ✅ 올바른 방법
import { getDivisionSettings } from '@/lib/services/settings.service'
const settings = await getDivisionSettings(divisionSlug)
const warnLevel1 = settings.warn_level1  // DB에서 읽기
```

### 직렬 분리 패턴
```typescript
// 모든 DB 쿼리에 division 필터 필수
const data = await prisma.student.findMany({
  where: {
    division: { slug: divisionSlug }  // 반드시 포함
  }
})
```

### 컴포넌트 패턴
```typescript
// 서버 컴포넌트 (데이터 패칭)
export default async function StudentsPage({ params }) {
  const students = await getStudents(params.division)
  return <StudentTable students={students} />
}

// 클라이언트 컴포넌트 (인터랙션)
'use client'
export function StudentTable({ students }) { ... }
```

### 문서/인코딩 규칙
```text
- PowerShell로 파일을 읽을 때 한글이 깨지면 UTF-8로 다시 확인
- 새 파일 작성 및 기존 파일 수정 시 UTF-8 인코딩 유지
- 사용자에게 보이는 한국어 문자열은 수정 후 깨짐 여부를 반드시 재확인
```

### 개발 진행 규칙
```text
- 각 Phase는 문서에 적힌 순서대로 진행하고, 이전 Phase의 핵심 작업이 끝나기 전 다음 Phase로 넘어가지 않기
- Phase 종료 전 가능한 범위에서 lint, typecheck, build 또는 핵심 경로 실행 검증 수행
- 모든 API는 입력 검증, 권한 검증, division 필터, 일관된 에러 응답을 기본 포함
- Prisma schema 변경 시 migration/seed/관련 문서 영향까지 함께 점검
- 날짜와 시간은 저장/비교 기준을 명확히 유지하고, 운영 판단은 Asia/Seoul 기준으로 확인
- 임시 mock 데이터나 하드코딩 fallback을 남긴 채 다음 단계로 진행하지 않기
```

---

## 색상 테마 (tailwind.config.ts에 추가)

```javascript
colors: {
  police: {
    DEFAULT: '#1B4FBB',
    light: '#EBF0FB',
    dark: '#0D2D6B',
  },
  fire: {
    DEFAULT: '#C55A11',
    light: '#FEF3EC',
    dark: '#7A3608',
  },
  // 출석 상태
  attend: {
    present: '#16A34A',
    tardy: '#CA8A04',
    absent: '#DC2626',
    excused: '#2563EB',
    holiday: '#6B7280',
    unprocessed: '#F97316',
  },
  // 경고 단계
  warn: {
    1: '#EAB308',   // 10점+
    2: '#F97316',   // 20점+
    interview: '#DC2626',  // 25점+
    withdraw: '#7F1D1D',   // 30점+
  }
}
```

---

## 인증 구조

### 관리자/조교
- Supabase Auth (이메일+비밀번호)
- `admins` 테이블에서 role + division_id 확인
- 미들웨어에서 `/[division]/admin/*`, `/[division]/assistant/*` 보호

### 학생
- 수험번호+이름으로 조회 → 커스텀 JWT 또는 서버 세션 쿠키 (7일)
- Supabase Auth 사용하지 않음 (별도 세션 관리)
- `/[division]/student/*` 경로 보호

### 접근 제어
```
SUPER_ADMIN  → 모든 직렬 접근
ADMIN        → 담당 division_id만 접근
ASSISTANT    → 담당 division_id의 출석체크만
학생         → 본인 데이터만 (출석+상벌점+성적)
```

---

## Prisma 스키마 핵심 관계

```prisma
model Division {
  id       String  @id @default(cuid())
  slug     String  @unique  // "police", "fire"
  name     String
  color    String
  students Student[]
  periods  Period[]
  pointRules PointRule[]
  examTypes  ExamType[]
  seats    Seat[]
  settings DivisionSettings?
}

model DivisionSettings {
  id             String   @id @default(cuid())
  divisionId     String   @unique
  division       Division @relation(fields: [divisionId], references: [id])
  warnLevel1     Int      @default(10)
  warnLevel2     Int      @default(20)
  warnInterview  Int      @default(25)
  warnWithdraw   Int      @default(30)
  tardyMinutes   Int      @default(20)
  holidayLimit   Int      @default(1)
  halfDayLimit   Int      @default(2)
  healthLimit    Int      @default(1)
  holidayUnusedPts  Int   @default(5)
  halfDayUnusedPts  Int   @default(2)
  operatingDays  Json     @default("{}")
  updatedAt      DateTime @updatedAt
}
```

---

## 개발 우선순위

```
Phase 1: 기반 (프로젝트 셋업 + Auth + 레이아웃)
Phase 2: 출석 관리 ← 최우선 핵심 기능
Phase 3: 학생 명단 + 상벌점
Phase 4: 학생 조회 페이지
Phase 5: 성적 + 수납 + 부가 기능
Phase 6: 대시보드 + 통계
Phase 7: 마무리 + 배포
```

---

## 환경변수 (.env.local)

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=postgresql://...?pgbouncer=true
DIRECT_URL=postgresql://...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 금지 사항

- ❌ 벌점 기준값 하드코딩 (반드시 `division_settings`에서 읽기)
- ❌ 경찰/소방 직렬명 하드코딩 (DB에서 읽기)
- ❌ 직렬 분리 없는 DB 쿼리
- ❌ 학생 로그인에 Supabase Auth 사용 (커스텀 세션 사용)
- ❌ 서버 컴포넌트에서 브라우저 API 사용
- ❌ ExcelJS를 클라이언트 사이드에서 import
- ❌ 인코딩 확인 없이 한글 문서/문자열을 수정하여 깨진 상태로 저장
