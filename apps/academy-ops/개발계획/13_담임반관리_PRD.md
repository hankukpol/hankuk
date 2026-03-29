# PRD: 담임 반 관리 + 카카오톡 출석 파싱

**작성일**: 2026-03-13
**우선순위**: 높음 (담임 강사가 매일 사용하는 핵심 기능)
**연관 모듈**: 통합학원관리시스템 마스터플랜 — 반 관리 모듈

---

## 1. 기능 개요

각 담임 강사가 자신의 반 학생들을 한 화면에서 관리할 수 있도록 한다.
특히 카카오톡 단체 채팅방에서 학생들이 "동원했습니다"라고 입력한 출석 메시지를
**복사 → 붙여넣기**로 출석 처리할 수 있어야 한다.

---

## 2. 카카오톡 출석 메시지 형식 분석

### 2-1. 실제 메시지 형식

카카오톡 채팅방에서 날짜 기준으로 메시지를 복사하면 아래와 같은 텍스트가 클립보드에 들어온다:

```
2026년 3월 13일 금요일
52기 윤정원
동원했습니다
오전 5:51
52기 김진주
동원했습니다
오전 5:53
52기 정아은
동원했습니다
오전 6:01
52기 이준호
자리비웠습니다
오전 6:05
```

### 2-2. 파싱 규칙

| 라인 패턴 | 의미 | 처리 |
|---|---|---|
| `YYYY년 M월 D일 요일` | 날짜 헤더 | 출석 날짜로 사용 |
| `N기 이름` | 학생 정보 | 기수 + 이름으로 학생 조회 |
| 출석 키워드 | 출석 확인 | 아래 2-3 참고 |
| `오전/오후 H:MM` | 시간 | 출석 시간 기록 |
| 기타 텍스트 | 일반 채팅 | 무시 |

### 2-3. 출석 키워드 목록

학원마다 "동원했습니다" 외에 다양한 표현을 쓸 수 있으므로 **관리자가 커스텀 설정 가능**해야 한다.
기본 제공 키워드 (대소문자 무시, 공백 무시):

```
출석 인정 키워드:
  "동원했습니다", "동원", "출석합니다", "출석했습니다", "왔습니다", "자리했습니다",
  "착석했습니다", "공부시작", "시작합니다"

결석/불참 키워드 (선택적 감지):
  "결석합니다", "못가겠습니다", "결석", "빠지겠습니다"
```

### 2-4. 학생 매칭 방식

카카오톡 메시지의 학생 이름은 `{N}기 이름` 형식이다.
DB에서 매칭 시:
1. **기수(generation) + 이름(name)** 으로 정확 매칭 (1순위)
2. **이름만** 으로 매칭 (기수 없거나 오기입 시, 2순위)
3. 매칭 실패 시 → "미인식" 목록에 표시하여 수동 처리

---

## 3. 신규 DB 모델

```prisma
// 반 (담임 단위)
model Classroom {
  id              Int        @id @default(autoincrement())
  name            String     // "A반", "1반", "화요반"
  examType        ExamType   // 공채/경채
  generation      Int?       // 기수 (null이면 기수 무관)
  teacherStaffId  String     // 담임 직원 ID (AdminUser.id)
  description     String?
  isActive        Boolean    @default(true)
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  teacher         AdminUser  @relation("ClassroomTeacher", ...)
  students        ClassroomStudent[]
  attendanceLogs  ClassroomAttendanceLog[]

  @@map("classrooms")
}

// 반-학생 배정
model ClassroomStudent {
  id              Int        @id @default(autoincrement())
  classroomId     Int
  examNumber      String
  joinedAt        DateTime   @default(now())
  leftAt          DateTime?  // null이면 현재 소속
  isActive        Boolean    @default(true)

  classroom       Classroom  @relation(...)
  student         Student    @relation(...)

  @@unique([classroomId, examNumber])
  @@map("classroom_students")
}

// 카카오톡 출결 파싱 이력 (1번 붙여넣기 = 1 session)
model ClassroomAttendanceParse {
  id              String     @id @default(cuid())
  classroomId     Int
  parseDate       DateTime   // 출결 날짜
  rawText         String     // 원본 붙여넣기 텍스트
  parsedCount     Int        // 파싱된 항목 수
  matchedCount    Int        // 학생 매칭 성공 수
  failedCount     Int        // 매칭 실패 수
  staffId         String     // 처리 직원
  createdAt       DateTime   @default(now())

  classroom       Classroom  @relation(...)
  results         ClassroomAttendanceResult[]

  @@map("classroom_attendance_parses")
}

// 파싱된 출결 결과 (개별 항목)
model ClassroomAttendanceResult {
  id              String     @id @default(cuid())
  parseId         String
  rawName         String     // 원문 이름 ("52기 윤정원")
  rawMessage      String     // 원문 메시지 ("동원했습니다")
  checkinTime     String?    // 체크인 시간 ("오전 5:51")
  examNumber      String?    // 매칭된 수험번호 (null이면 미매칭)
  status          ParseMatchStatus  // MATCHED / AMBIGUOUS / UNMATCHED / IGNORED
  attendType      AttendType?       // 출석 유형 (NORMAL / ABSENT)
  isConfirmed     Boolean    @default(false)  // 관리자 확인 여부

  parse           ClassroomAttendanceParse @relation(...)
  student         Student?   @relation(...)

  @@map("classroom_attendance_results")
}

// 반별 출결 최종 기록 (파싱 확정 후 저장)
model ClassroomAttendanceLog {
  id              String     @id @default(cuid())
  classroomId     Int
  examNumber      String
  date            DateTime   // 날짜만 사용 (시간은 checkinTime)
  checkinTime     String?    // "오전 5:51"
  attendType      AttendType @default(NORMAL)
  source          AttendSource  // KAKAO / MANUAL
  note            String?
  parseId         String?    // 원본 파싱 ID
  staffId         String
  createdAt       DateTime   @default(now())

  classroom       Classroom  @relation(...)
  student         Student    @relation(...)

  @@unique([classroomId, examNumber, date])
  @@map("classroom_attendance_logs")
}

enum ParseMatchStatus { MATCHED AMBIGUOUS UNMATCHED IGNORED }
enum AttendSource     { KAKAO MANUAL }
```

---

## 4. 화면 설계

### 4-1. 반 목록 (`/admin/classrooms`)

```
┌────────────────────────────────────────────────────────────────┐
│  반 관리                               [+ 새 반 만들기]        │
├────────────────────────────────────────────────────────────────┤
│  반 이름    │ 담임      │ 기수 │ 학생 수 │ 오늘 출석 │ 이동   │
│  공채 A반   │ 김강사    │ 52기 │  28명  │  24/28    │ [입장] │
│  공채 B반   │ 박강사    │ 52기 │  25명  │  미처리   │ [입장] │
│  경채 종합  │ 이강사    │ 52기 │  18명  │  17/18    │ [입장] │
└────────────────────────────────────────────────────────────────┘
```

### 4-2. 담임 대시보드 (`/admin/classrooms/[id]`)

담임 강사가 로그인하면 자신의 반으로 바로 들어오는 화면.

```
┌──────────────────────────────────────────────────────────────────┐
│  공채 A반 (52기)  담임: 김강사          [출결 입력] [학생 관리] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  오늘 출결 현황 (2026-03-13)                                     │
│  출석 24 / 결석 2 / 미확인 2            [카카오 출결 처리 →]    │
│                                                                  │
│  학생 목록                       성적   최근출결  상태   면담    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 윤정원 (2024001)   72.4점   오늘출석  정상   2/20면담  │   │
│  │ 김진주 (2024002)   68.1점   오늘출석  정상   3/05면담  │   │
│  │ 정아은 (2024003)   81.5점   오늘출석  정상   미면담    │   │
│  │ 이준호 (2024004)   55.3점   오늘결석  1차경고 [면담예약]│   │
│  │ 박민수 (2024005)   63.2점   미확인    정상    -        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  이번 주 반 성적 요약                                            │
│  평균: 70.2점 / 최고: 88점 / 최저: 52점 / 주간 출석율: 91.4%  │
└──────────────────────────────────────────────────────────────────┘
```

### 4-3. 카카오톡 출결 처리 화면 (`/admin/classrooms/[id]/attendance`)

**Step 1: 텍스트 붙여넣기**

```
┌──────────────────────────────────────────────────────────────────┐
│  카카오톡 출결 처리 — 공채 A반                                   │
│                                                                  │
│  카카오톡 채팅방에서 오늘 날짜 메시지를 전체 복사한 후           │
│  아래에 붙여넣으세요.                                            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 2026년 3월 13일 금요일                                     │ │
│  │ 52기 윤정원                                                 │ │
│  │ 동원했습니다                                               │ │
│  │ 오전 5:51                                                  │ │
│  │ 52기 김진주                                                 │ │
│  │ 동원했습니다                                               │ │
│  │ 오전 5:53                                                  │ │
│  │ ...                                                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  출석 키워드: [동원했습니다] [출석합니다] [+추가]               │
│                                                                  │
│  [파싱 시작 →]                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Step 2: 파싱 결과 확인·수정**

```
┌──────────────────────────────────────────────────────────────────┐
│  파싱 결과 확인 — 2026-03-13                                     │
│  인식됨: 24명  /  미인식: 2명  /  결석 감지: 1명                │
├──────────────────────────────────────────────────────────────────┤
│  원문              │ 매칭 학생    │ 시간    │ 출결   │ 처리    │
├────────────────────┼──────────────┼─────────┼────────┼─────────┤
│ 52기 윤정원        │ ✓ 윤정원    │ 05:51   │ 출석   │ [확인] │
│ 52기 김진주        │ ✓ 김진주    │ 05:53   │ 출석   │ [확인] │
│ 52기 정아은        │ ✓ 정아은    │ 06:01   │ 출석   │ [확인] │
│ 52기 이준호        │ ✓ 이준호    │ 06:05   │ 결석   │ [확인] │  ← "자리비웠습니다"
├────────────────────┼──────────────┼─────────┼────────┼─────────┤
│ 52기 홍길동        │ ⚠ 미매칭   │ 06:10   │ 출석   │[수동지정]│  ← 수험번호 없음
│ 강민재             │ ⚠ 기수없음  │ 06:15   │ 출석   │[수동지정]│  ← 기수 빠짐
├────────────────────┼──────────────┼─────────┼────────┼─────────┤
│                    │ (미응답)      │  -      │ 미확인 │ [결석]  │  ← 반 전체에서 응답 없는 학생
│ 박민수 (2024005)   │              │         │        │         │
└────────────────────┴──────────────┴─────────┴────────┴─────────┘

  [전체 확인] [확정 저장 →]
```

**Step 3: 확정 저장 완료**

```
  ✓ 출결 처리 완료 (2026-03-13)
  출석 24명 / 결석 2명 / 미처리 2명

  → [반 대시보드로 돌아가기]
```

---

## 5. 파싱 로직 설계 (`/web/src/lib/classrooms/kakao-parser.ts`)

```typescript
export type ParsedAttendanceEntry = {
  rawLine: string          // "52기 윤정원"
  rawMessage: string       // "동원했습니다"
  checkinTime: string | null  // "오전 5:51"
  generation: number | null   // 52
  name: string             // "윤정원"
  attendType: 'NORMAL' | 'ABSENT'
}

export type KakaoParseResult = {
  date: Date | null
  entries: ParsedAttendanceEntry[]
  ignoredLines: string[]   // 키워드 없는 일반 채팅 등
}

export function parseKakaoAttendanceText(
  text: string,
  attendKeywords: string[],
  absentKeywords: string[]
): KakaoParseResult

// 파싱 알고리즘:
// 1. 줄 단위로 분리 (trim 후 빈 줄 제거)
// 2. 날짜 헤더 정규식: /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/
// 3. 학생 이름 정규식: /^(\d+)기\s+(.+)$/ → generation, name 추출
//    또는 /^(.+)$/ → name만 추출 (기수 없는 경우)
// 4. 출석/결석 키워드 감지
// 5. 시간 정규식: /^(오전|오후)\s*(\d{1,2}):(\d{2})$/
// 6. 순서 기반 그룹화:
//    [이름 라인] → [메시지 라인] → [시간 라인] 순으로 1개 엔트리 구성
```

### 5-1. 파싱 엣지 케이스 처리

| 케이스 | 처리 방식 |
|---|---|
| 기수 없는 이름 ("김철수") | 이름만으로 매칭 시도, 동명이인이면 AMBIGUOUS |
| 이모티콘 포함 메시지 | 이모티콘 제거 후 키워드 비교 |
| 메시지 없이 이름만 | 출석 키워드 없으면 IGNORED |
| 관리자/선생님 메시지 | 반 학생 명단에 없으면 IGNORED |
| 이미 오늘 처리된 학생 | "이미 처리됨" 표시, 덮어쓰기 여부 선택 |

---

## 6. 담임 학생 관리 연동

### 6-1. 담임 전용 기능

담임 강사(`TEACHER` 역할)는 **자신의 반 학생만** 접근할 수 있다.

| 기능 | 경로 | 접근 범위 |
|---|---|---|
| 반 출결 현황 | `/admin/classrooms/[id]` | 담당반 전체 |
| 카카오 출결 처리 | `/admin/classrooms/[id]/attendance` | 담당반 |
| 학생 성적 조회 | `/admin/students/[examNumber]` | 담당반 학생만 |
| 면담 기록 | `/admin/students/[examNumber]?tab=counseling` | 담당반 학생만 |

### 6-2. 학생 상세 페이지에 반 정보 추가

기존 `/admin/students/[examNumber]` 페이지 헤더에 소속 반 정보 표시:

```
홍길동 (2024001)
공채 · 52기 · A반 (담임: 김강사) · 재원
```

### 6-3. 담임 대시보드의 성적 요약 (기존 데이터 활용)

담임 대시보드에서 반 학생들의 성적 요약을 보여줄 때:
- 기존 `getStudentCumulativeAnalysis()` 함수를 반 전체에 대해 반복 호출
- 또는 새 함수 `getClassroomScoreSummary(classroomId)` 추가

```typescript
export type ClassroomScoreSummary = {
  examNumber: string
  name: string
  currentStatus: StudentStatus
  overallAverage: number | null  // 전체 평균
  lastWeekAverage: number | null // 지난 주 평균
  trend: 'up' | 'down' | 'flat'
  absentCount: number            // 이번 달 결석 수
  weakSubjects: Subject[]        // 약점 과목
  lastCounseledAt: string | null // 최근 면담일
  todayAttendance: AttendType | null  // 오늘 출결 (ClassroomAttendanceLog)
}
```

### 6-4. 담임-면담 통합

기존 `CounselingRecord`를 담임 대시보드에서 직접 생성:
- 학생 목록에서 "면담" 버튼 클릭 → 면담 기록 작성 페이지로 이동
- 담임이 작성한 면담 기록은 `counselorName = 담임 강사명` 으로 저장
- 기존 `/admin/counseling` 페이지와 동일한 데이터 공유

---

## 7. 구현 파일 목록

### 새로 생성할 파일

| 파일 | 역할 |
|---|---|
| `web/src/lib/classrooms/service.ts` | 반 CRUD, 학생 배정, 출결 집계 쿼리 |
| `web/src/lib/classrooms/kakao-parser.ts` | 카카오톡 텍스트 파싱 로직 |
| `web/src/app/admin/classrooms/page.tsx` | 전체 반 목록 |
| `web/src/app/admin/classrooms/[id]/page.tsx` | 담임 대시보드 |
| `web/src/app/admin/classrooms/[id]/attendance/page.tsx` | 카카오 출결 처리 |
| `web/src/components/classrooms/classroom-list.tsx` | 반 목록 컴포넌트 |
| `web/src/components/classrooms/classroom-dashboard.tsx` | 담임 대시보드 컴포넌트 |
| `web/src/components/classrooms/kakao-attendance-parser.tsx` | 카카오 출결 파서 UI |
| `web/src/components/classrooms/attendance-parse-review.tsx` | 파싱 결과 확인 테이블 |
| `web/src/app/api/classrooms/route.ts` | 반 CRUD API |
| `web/src/app/api/classrooms/[id]/attendance/route.ts` | 출결 처리 API |
| `web/src/app/api/classrooms/[id]/attendance/parse/route.ts` | 파싱 결과 확정 API |

### 수정할 파일

| 파일 | 수정 내용 |
|---|---|
| `web/prisma/schema.prisma` | 위 3-1의 신규 모델 추가 |
| `web/src/lib/constants.ts` | `ADMIN_NAV_ITEMS`에 반 관리 메뉴 추가 |
| `web/src/app/admin/students/[examNumber]/page.tsx` | 헤더에 소속 반 정보 표시 추가 |

---

## 8. 구현 우선순위

```
Phase 1 (핵심):
  1. Classroom, ClassroomStudent 모델 + 반 CRUD
  2. 담임 대시보드 (학생 목록 + 성적 요약)
  3. 카카오 파서 (`kakao-parser.ts`) + 파싱 결과 확인 UI

Phase 2 (출결 연동):
  4. ClassroomAttendanceLog 저장 + 조회
  5. 오늘 출결 현황 집계 (담임 대시보드 상단)
  6. 반별 월간 출결률 통계

Phase 3 (성적·면담 연동):
  7. 담임 대시보드에서 개별 학생 성적 요약
  8. 담임이 직접 면담 기록 추가
  9. 경고 위험 학생 자동 표시 (결석 기준)
```

---

## 9. 카카오 출결 키워드 설정 화면

`/admin/settings/attendance-keywords`

관리자가 커스텀 키워드를 등록·삭제할 수 있어야 한다.

```
출석 키워드 관리
┌────────────────────────────────────┐
│ 출석 인정 키워드                   │
│ [동원했습니다] ×  [출석합니다] ×  │
│ [왔습니다] ×      [+ 추가]         │
├────────────────────────────────────┤
│ 결석/불참 키워드                   │
│ [결석합니다] ×  [못가겠습니다] ×  │
│ [+ 추가]                           │
└────────────────────────────────────┘
```

DB: `AttendKeyword` 테이블 또는 JSON 설정으로 관리.

---

*이 PRD를 구현하기 전에 반드시 마스터플랜 문서의 Phase 0 (기반 작업) 완료 후 진행할 것.*

---

## ⚠️ 멀티지점 고려사항 (2026-03-21 추가)

### 데이터 격리
- 담임반 (Classroom), 반 편성 데이터는 `academyId`로 격리됨
- 지점 관리자는 자신의 지점 담임반만 관리 가능

### 개발 시 주의사항
- 담임반 생성: `academyId` 포함
- 카카오톡 출결 파싱: 지점별 출결 키워드 설정 (`/admin/settings/system`)
- 반 목록 조회: `where: { academyId: ctx.academyId }` 필터 적용
