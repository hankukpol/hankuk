# PRD: 개별 학생 성적 분석 고도화

**작성일**: 2026-03-13
**대상 시스템**: 아침모의고사 성적·출결관리 (Next.js 14 App Router + Prisma + Supabase)
**구현 목적**: 관리자(강사)가 면담 시 학생의 성적 현황을 디테일하게 파악하고, 데이터 기반 면담을 진행할 수 있도록 개별 학생 분석 기능을 강화한다.

---

## 1. 프로젝트 구조 및 기술 스택

```
web/
├── prisma/schema.prisma              # DB 스키마
├── src/
│   ├── app/admin/
│   │   └── students/[examNumber]/   # 개별 학생 허브 페이지 (핵심 수정 대상)
│   ├── components/
│   │   ├── analytics/               # 공통 차트·테이블 컴포넌트
│   │   └── students/                # 학생 관련 컴포넌트
│   └── lib/
│       └── analytics/
│           ├── analysis.ts          # DB 쿼리·계산 로직 (핵심 수정 대상)
│           ├── service.ts           # 석차/집계 서비스
│           └── presentation.ts     # 상수·포맷 함수
```

**기술 스택**: Next.js 14 App Router, TypeScript, Prisma 6, TailwindCSS, Recharts
**색상 시스템**: ember(#C55A11), forest(#1F4D3A), ink(#111827), mist(#F7F4EF), slate(#4B5563)
**라운딩 시스템**: 카드는 `rounded-[28px]`, 내부 테이블 컨테이너는 `rounded-[24px]`

---

## 2. 현재 구현 현황 (수정 금지 / 참고용)

### 2-1. 학생 허브 페이지: `/admin/students/[examNumber]/page.tsx`

4개 탭으로 구성된 Server Component 페이지:

| 탭 키 | 탭명 | 구현 내용 |
|---|---|---|
| `history` | 성적 이력 | 전체 회차별 성적 목록, 수정·삭제 |
| `cumulative` | 누적 분석 | 기수별 평균, 과목별 통계, 상태 이력 |
| `analysis` | 기간별 분석 | 레이더/막대/라인 차트, 과목 비교, 오답 테이블 |
| `counseling` | 면담 | 면담 기록, 목표 점수 설정 |

### 2-2. 주요 데이터 함수 (analysis.ts 내 기존 함수)

```typescript
// 누적 분석 데이터 (cumulative 탭)
getStudentCumulativeAnalysis(examNumber: string): Promise<CumulativeAnalysisData | null>

// 기간별 분석 데이터 (analysis 탭)
getStudentDetailAnalysis({ examNumber, periodId? }): Promise<{...} | null>

// 공통 계산 유틸
average(values: number[]): number | null
topAverage(values: number[], ratio: number): number | null
percentileRank(values: number[], target: number): number | null
buildHistogram(values: number[]): { range: string; count: number }[]
```

### 2-3. CumulativeAnalysisData 타입 (현재)

```typescript
type CumulativeAnalysisData = {
  student: { examNumber, name, className, generation, examType, currentStatus, isActive, targetScores }
  periods: Array<{ id, name, avg, sessionCount, attendedCount }>
  trend: Array<{ date, label, subject, finalScore, attendType, periodName, periodId, week }>
  subjectStats: Array<{ subject, avg, target, sessionCount, scoredCount, highest, lowest, trend, isWeak }>
  weakSubjects: Subject[]
  statusHistory: Array<{ weekKey, weekStartDate, status }>
  totalSessions: number
  attendedCount: number
  overallAvg: number | null
  attendanceRate: number
  bestPeriod: { id, name, avg } | null
}
```

### 2-4. 석차 드로어 (`student-result-drawer.tsx`)

석차 목록에서 학생 클릭 시 오른쪽에서 슬라이드로 열리는 패널:
- 핵심 요약 카드 (집계 평균, 참여율, 최고 점수, 진행 회차, 사유/무단 결시, 최근 시험일)
- 과목별 요약 테이블 (평균/최고/최저/점수기록/LIVE/사유결시/무단결시/최근점수)
- 최근 8건 시험 기록

### 2-5. DB 주요 모델 (schema.prisma)

```prisma
model Score {
  examNumber  String
  sessionId   Int
  rawScore    Float?
  oxScore     Float?
  finalScore  Float?
  attendType  AttendType   // NORMAL | LIVE | EXCUSED | ABSENT
  sourceType  ScoreSource
  note        String?
  session     ExamSession
}

model ExamSession {
  id                 Int
  periodId           Int
  examType           ExamType
  week               Int
  subject            Subject
  displaySubjectName String?
  examDate           DateTime
  isCancelled        Boolean
}

model Student {
  examNumber    String   @id
  name          String
  examType      ExamType
  currentStatus StudentStatus   // NORMAL | WARNING_1 | WARNING_2 | DROPOUT
  targetScores  Json?    // { CONSTITUTIONAL_LAW: 80, CRIMINAL_LAW: 75, ... }
  className     String?
  generation    Int?
  isActive      Boolean
}

enum Subject {
  CONSTITUTIONAL_LAW   // 헌법
  CRIMINAL_LAW         // 형법
  CRIMINAL_PROCEDURE   // 형사소송법
  POLICE_SCIENCE       // 경찰학
  CRIMINOLOGY          // 범죄학 (경채 전용)
  CUMULATIVE           // 누적 모의고사
}

enum AttendType {
  NORMAL   // 정상 응시
  LIVE     // 라이브 (온라인)
  EXCUSED  // 사유 결시
  ABSENT   // 무단 결시
}
```

---

## 3. 구현할 기능 목록

### 우선순위 1 (면담 실용성 - 즉시 효과)
- **[F-1] 면담 브리핑 카드**: 면담 탭 상단에 한눈에 파악할 수 있는 요약 섹션
- **[F-2] 목표 달성 진행률**: 과목별 목표 대비 현재 달성률 시각화

### 우선순위 2 (분석 심화)
- **[F-3] 월별 성적 요약**: 개인 탭에 월별 집계 추가
- **[F-4] 백분위 추이 차트**: 회차별 백분위 변화 시각화
- **[F-5] 최근 N회 필터**: 최근 5/10/20회 기간 필터

### 우선순위 3 (출결 분석)
- **[F-6] 개인 출결 캘린더**: 학생 탭에 개인용 출결 캘린더 추가
- **[F-7] 탈락 위험도 계산**: 현재 결석 횟수 기반 위험도 표시

---

## 4. 기능별 상세 명세

---

### [F-1] 면담 브리핑 카드

**위치**: `/admin/students/[examNumber]` 의 `counseling` 탭 상단
**목적**: 강사가 면담 시작 전 학생 현황을 30초 안에 파악할 수 있는 요약 카드

#### 4-1-1. 표시할 데이터

```
┌─────────────────────────────────────────────────────────┐
│ 면담 브리핑                            2026-03-13 면담  │
├──────────┬──────────┬──────────┬──────────┬────────────┤
│ 전체평균  │  전체석차  │  응시율   │ 무단결시  │ 현재 상태  │
│  72.4점   │   8위    │  94.2%   │  2회     │  정상      │
├──────────┴──────────┴──────────┴──────────┴────────────┤
│ 최근 4주 추이                                           │
│ 형법: 68 → 71 → 75 → 74  (↑ 상승)                     │
│ 헌법: 80 → 78 → 79 → 81  (→ 유지)                     │
│ 경찰학: 72 → 68 → 65 → 63  (↓ 하락)  ← 주의 과목     │
├─────────────────────────────────────────────────────────┤
│ 약점 과목: 경찰학 (평균 66.2, 목표 75, -8.8점 미달)    │
│ 지난 면담 이후: 평균 +3.2점 상승 (2026-02-20 면담)     │
└─────────────────────────────────────────────────────────┘
```

#### 4-1-2. 구현 방법

**새 함수 추가**: `web/src/lib/analytics/analysis.ts`에 `getStudentCounselingBriefing()` 추가

```typescript
export type CounselingBriefing = {
  // 핵심 KPI
  overallAverage: number | null          // 전체 기간 평균
  overallRank: number | null             // 현재 기수 전체 석차
  participationRate: number             // 응시율 (%)
  absentCount: number                   // 무단결시 횟수
  currentStatus: StudentStatus         // 현재 경고 상태

  // 최근 4주 추이 (주차별, 과목별)
  recentWeeksTrend: Array<{
    weekLabel: string                   // "3/10주"
    weekStartDate: string
    bySubject: Array<{
      subject: Subject
      avgScore: number | null
    }>
  }>

  // 과목별 목표 달성 현황
  subjectProgress: Array<{
    subject: Subject
    currentAverage: number | null
    targetScore: number | null
    gap: number | null                  // currentAverage - targetScore (양수=초과)
    trend: 'up' | 'down' | 'flat'
    isWeak: boolean
  }>

  // 지난 면담 이후 변화
  sinceLastCounseling: {
    lastCounseledAt: string | null
    avgBefore: number | null            // 면담 이전 평균
    avgAfter: number | null             // 면담 이후 평균
    change: number | null               // 변화량
  } | null
}

export async function getStudentCounselingBriefing(examNumber: string): Promise<CounselingBriefing | null>
```

**구현 로직**:
1. `getStudentCumulativeAnalysis()`의 데이터를 재활용하되 면담에 특화된 형식으로 가공
2. 현재 기수(`isActive: true` 기간) 내에서 석차 계산: 해당 기수 전체 학생 평균 조회 후 `percentileRank()` 활용
3. 최근 4주: `getTuesdayWeekStart()`로 최근 4개 주차 식별, 주차별 과목별 평균 집계
4. 약점 과목: `subjectStats[].isWeak === true` 인 과목 + 목표 미달 과목
5. 지난 면담 이후 변화: `CounselingRecord` 테이블에서 최근 면담일 조회 후 해당 날짜 기준 전/후 평균 계산

**페이지 수정**: `page.tsx`의 `counseling` 탭 로딩 시 `getCounselingProfile()` 외에 `getStudentCounselingBriefing()` 병렬 호출

**컴포넌트 추가**: `web/src/components/students/counseling-briefing-card.tsx` 신규 생성

---

### [F-2] 목표 달성 진행률

**위치**: `cumulative` 탭 내 `subjectStats` 섹션 수정 또는 별도 섹션 추가
**목적**: 과목별 목표 점수 대비 현재 평균을 시각적으로 표시

#### 4-2-1. UI 설계

```
과목별 목표 달성 현황
┌────────────────────────────────────────────────────────────┐
│ 형법          현재: 74.2점   목표: 80점    달성률: 92.8%  │
│ ████████████████████░░░░   -5.8점 부족                    │
│                                                            │
│ 헌법          현재: 81.5점   목표: 80점    달성률: 101.9% │
│ ████████████████████████   +1.5점 초과 달성              │
│                                                            │
│ 경찰학        현재: 66.2점   목표: 75점    달성률: 88.3%  │
│ ██████████████████░░░░░   -8.8점 부족   ⚠ 주의          │
└────────────────────────────────────────────────────────────┘
```

#### 4-2-2. 구현 방법

**기존 데이터 활용**: `CumulativeAnalysisData.subjectStats`에 이미 `avg`와 `target` 필드가 있으므로 **새 DB 쿼리 불필요**

**컴포넌트 수정**: `web/src/components/students/student-cumulative-analysis.tsx`에 목표 달성 섹션 추가

```typescript
// subjectStats에서 목표가 설정된 항목만 필터링
const subjectsWithTargets = subjectStats.filter(s => s.target !== null && s.sessionCount > 0)

// 달성률 계산
const achievementRate = (currentAvg / targetScore) * 100

// 프로그레스 바 너비 (100% 캡)
const barWidth = Math.min(achievementRate, 100)
```

**TailwindCSS 프로그레스 바**:
- 달성(≥100%): `bg-forest` 색상 + "초과 달성" 뱃지
- 80~99%: `bg-amber-500`
- 80% 미만: `bg-ember` + "⚠ 주의" 텍스트

목표 점수가 없는 과목은 표시하지 않고, 목표 점수 설정 링크(`?tab=counseling`)를 안내한다.

---

### [F-3] 월별 성적 요약

**위치**: `analysis` 탭 내 새 섹션으로 추가 (기존 기간별 분석 섹션들 아래)
**목적**: 기간 내 월별로 집계된 성적 추이를 테이블로 표시

#### 4-3-1. UI 설계

```
월별 성적 요약 (2026년 1기 기간 선택 시)
┌────────┬──────┬──────┬──────────┬──────┬──────────┬───────┐
│  월    │ 응시 │ 결시 │ 개인평균  │ 석차 │ 전체평균  │ 전월비 │
├────────┼──────┼──────┼──────────┼──────┼──────────┼───────┤
│ 1월    │  18  │  2   │  71.2    │ 12위 │  69.4    │  -    │
│ 2월    │  20  │  0   │  74.6    │  8위 │  70.1    │ +3.4  │
│ 3월    │   8  │  1   │  72.1    │ 10위 │  71.3    │ -2.5  │
└────────┴──────┴──────┴──────────┴──────┴──────────┴───────┘
```

#### 4-3-2. 구현 방법

**새 함수 추가**: `getStudentDetailAnalysis()`를 확장하거나 별도 함수 `getStudentMonthlyBreakdown()` 추가

```typescript
export type MonthlyBreakdownRow = {
  year: number
  month: number
  monthLabel: string          // "2026년 1월"
  sessionCount: number        // 해당 월 총 회차 수
  attendedCount: number       // 응시 횟수 (NORMAL + LIVE)
  absentCount: number         // 무단 결시
  excusedCount: number        // 사유 결시
  studentAverage: number | null
  cohortAverage: number | null
  studentRank: number | null  // 해당 월 개인 석차
  totalParticipants: number   // 해당 월 응시자 수
  changeFromPrevMonth: number | null  // 전월 대비 변화
}

export async function getStudentMonthlyBreakdown(input: {
  examNumber: string
  periodId: number
}): Promise<MonthlyBreakdownRow[]>
```

**구현 로직**:
1. 해당 기수의 전체 세션을 `examDate` 기준으로 월별 그룹핑
2. 각 월별로 해당 학생 점수와 전체 학생 점수를 집계
3. `percentileRank()`로 해당 월 석차 계산
4. 전월 대비 변화량 계산

**페이지 수정**: `analysis` 탭에서 `getStudentDetailAnalysis()` 호출 시 월별 데이터도 함께 반환하도록 반환 타입 확장 (또는 `Promise.all`로 병렬 추가 쿼리)

---

### [F-4] 백분위 추이 차트

**위치**: `analysis` 탭의 "회차별 추이" 섹션 아래에 새 차트 추가
**목적**: 내 점수가 얼마인지뿐만 아니라 "상대적으로 몇 등급인지"의 추이를 시각화

#### 4-4-1. UI 설계

라인 차트 (Recharts `LineChart`):
- X축: 날짜/회차 레이블
- Y축: 백분위 (0~100, **낮을수록 상위** — "상위 X%"로 표시)
- 단일 라인: 개인 백분위 추이
- 참조선: 상위 10%(=10), 상위 30%(=30), 상위 50%(=50) 점선
- 툴팁: "3/15 형법: 상위 12.3% (전체 87명 중 11위)"

```
백분위 추이 (낮을수록 상위권)
100% ─────────────────────────────────────────
 50% ─ ─ ─ ─ ─ ─ ─ ─ ─ (중위권 기준)─ ─ ─ ─
 30% ─ ─ ─ ─ ─ ─ ─ ─ ─ (상위 30%)─ ─ ─ ─ ─
 10% ─ ─ ─ ─ ─ ─ ─ ─ ─ (상위 10%)─ ─ ─ ─ ─
  0% ─────────────────────────────────────────
     1/6  1/13 1/20 2/3  2/10 2/17 3/3  3/10
```

#### 4-4-2. 구현 방법

**기존 `trendData` 확장**: `getStudentDetailAnalysis()`의 `trendData` 배열에 `percentileRank` 필드 추가

```typescript
// 기존 trendData 구조 확장
const trendData = sessions.map((session) => {
  const sessionScores = scoresBySession.get(session.id) ?? []
  const values = scoreValues(sessionScores)
  const studentScore = sessionScores.find(s => s.examNumber === input.examNumber) ?? null
  const studentValue = studentScore ? scoredMockScoreValue(studentScore) : null

  return {
    // 기존 필드들 유지...
    label: ...,
    studentScore: studentValue,
    cohortAverage: average(values),
    top10Average: topAverage(values, 0.1),
    top30Average: topAverage(values, 0.3),

    // 신규 추가
    participantCount: values.length,
    studentRank: studentValue !== null ? percentileRank(values, studentValue) : null,
    percentile: studentValue !== null && values.length > 0
      ? Math.round((percentileRank(values, studentValue)! / values.length) * 1000) / 10
      : null,  // 상위 X% (낮을수록 좋음)
  }
})
```

**차트 컴포넌트**: 기존 `TrendLineChart`를 재사용하거나, 백분위 전용 `PercentileLineChart` 추가 (`web/src/components/analytics/charts.tsx`)

Y축을 반전(`domain={[0, 100]}`, `reversed`)하거나 "상위 X%" 레이블로 표시.

---

### [F-5] 최근 N회 필터

**위치**: `analysis` 탭의 기간 선택 폼 옆에 추가 필터
**목적**: 기수 전체 기간뿐 아니라 최근 5/10/20회만 보는 단기 분석

#### 4-5-1. UI 설계

기존 기간 선택 `<select>` 옆에 버튼 그룹 추가:

```
[ 1기 (2026-01~03) ▼ ]  최근:  [ 5회 ]  [ 10회 ]  [ 20회 ]  [ 전체 ]
```

#### 4-5-2. 구현 방법

**쿼리 파라미터 추가**: `?tab=analysis&periodId=1&recent=10`

**페이지 수정**: `page.tsx`에서 `recent` 파라미터를 읽어 `getStudentDetailAnalysis()`에 전달

```typescript
const recentCount = Number(readParam(searchParams, 'recent')) || undefined
analysisData = await getStudentDetailAnalysis({
  examNumber: params.examNumber,
  periodId,
  recent: recentCount  // 신규 파라미터
})
```

**`getStudentDetailAnalysis()` 수정**:

```typescript
export async function getStudentDetailAnalysis(input: {
  examNumber: string
  periodId?: number
  recent?: number  // 최근 N회 필터 (undefined = 전체)
})
```

- `recent`가 있으면 `sessions.slice(-recent)`로 최근 N회만 추출
- 코호트 비교도 동일한 N회 세션으로 제한

---

### [F-6] 개인 출결 캘린더

**위치**: `history` 탭 상단에 캘린더 뷰 추가 (현재는 테이블만 있음)
**목적**: 날짜별 출결 상태를 달력 형태로 직관적으로 파악

#### 4-6-1. UI 설계

```
2026년 3월                              [ < 이전 달 ] [ 다음 달 > ]
┌───┬───┬───┬───┬───┬───┬───┐
│일  │월  │화  │수  │목  │금  │토  │
├───┼───┼───┼───┼───┼───┼───┤
│   │   │   │   │   │   │   │
│   │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │
│   │   │ ● │   │   │   │   │  ● = 시험 있는 날
├───┼───┼───┼───┼───┼───┼───┤
│ 8 │ 9 │10 │11 │12 │13 │14 │
│   │   │ ✓ │   │ ✓ │ ✗ │   │  ✓=정상, ✗=무단결시
└───┴───┴───┴───┴───┴───┴───┘

색상:
- 정상(NORMAL): forest 계열 (green bg)
- 라이브(LIVE): blue 계열
- 사유결시(EXCUSED): amber 계열
- 무단결시(ABSENT): red 계열
- 시험 없는 날: 회색 날짜
```

#### 4-6-2. 구현 방법

**기존 데이터 활용**: `StudentScoreHistoryManager`에 이미 전체 성적 이력(`student.scores`)이 전달되므로 **추가 API 불필요**

**컴포넌트 추가**: `web/src/components/students/student-attendance-calendar.tsx`

```typescript
type Props = {
  scores: Array<{
    attendType: AttendType
    session: {
      examDate: string  // ISO string
      subject: Subject
      week: number
    }
  }>
}
```

- 현재 월을 기본으로 표시, 이전/다음 달 버튼으로 탐색
- 날짜별로 해당 날 시험 목록(과목별) 표시
- 셀 클릭 시 해당 날 시험 상세(과목, 점수, 출결 상태) 툴팁 또는 드로어 표시

**`StudentScoreHistoryManager` 수정**: 상단에 `StudentAttendanceCalendar` 컴포넌트를 렌더링하는 토글 버튼 추가 ("캘린더 뷰 / 목록 뷰" 전환)

---

### [F-7] 탈락 위험도 계산

**위치**: `history` 탭 또는 `cumulative` 탭 상단 경고 배너
**목적**: 현재 결석 횟수 기준으로 몇 회 더 결석 시 경고/탈락되는지 표시

#### 4-7-1. UI 설계

```
┌─────────────────────────────────────────────────────────┐
│ ⚠ 출결 경고 알림                                        │
│ 이번 주 무단 결시 2회 — 1회 더 결시 시 탈락 위험        │
│ 이번 달 무단 결시 6회 — 2회 더 결시 시 탈락 위험        │
└─────────────────────────────────────────────────────────┘
```

경고 기준 (기존 `ATTENDANCE_STATUS_RULES` 상수 활용):
```typescript
const ATTENDANCE_STATUS_RULES = {
  weeklyWarning1Absences: 1,   // 주 1회 → 1차 경고
  weeklyWarning2Absences: 2,   // 주 2회 → 2차 경고
  weeklyDropoutAbsences: 3,    // 주 3회 → 탈락
  monthlyDropoutAbsences: 8,   // 월 8회 → 탈락
}
```

#### 4-7-2. 구현 방법

**기존 데이터 활용**: `StudentScoreHistoryManager`의 `scores` 데이터에서 현재 주/월 결석 수 계산

**컴포넌트 추가**: `web/src/components/students/absence-risk-banner.tsx`

```typescript
type Props = {
  scores: Array<{
    attendType: AttendType
    session: { examDate: string }
  }>
}
```

계산 로직:
1. `getTuesdayWeekStart(new Date())`로 이번 주 범위 계산
2. 이번 주 ABSENT 횟수 → `weeklyDropoutAbsences - count` = 남은 횟수
3. 이번 달 ABSENT 횟수 → `monthlyDropoutAbsences - count` = 남은 횟수
4. 위험도에 따라 색상 다르게 표시 (1회 남음: red, 2회 남음: amber, 여유 있음: 숨김)

---

## 5. 파일 수정 및 생성 목록

### 수정할 파일

| 파일 경로 | 수정 내용 |
|---|---|
| `web/src/lib/analytics/analysis.ts` | `getStudentCounselingBriefing()` 함수 추가, `getStudentDetailAnalysis()` 반환 타입에 월별 데이터·백분위·recent 파라미터 추가 |
| `web/src/app/admin/students/[examNumber]/page.tsx` | counseling 탭 로딩 시 briefing 데이터 병렬 로딩, analysis 탭에 monthly/recent 파라미터 처리 추가, history 탭에 출결 캘린더·위험도 배너 props 전달 |
| `web/src/components/students/student-cumulative-analysis.tsx` | 목표 달성 진행률 섹션 추가 (기존 subjectStats 데이터 활용) |
| `web/src/components/students/student-score-history-manager.tsx` | 출결 캘린더 토글 버튼 및 컴포넌트 렌더링 추가, 위험도 배너 추가 |
| `web/src/components/analytics/charts.tsx` | 백분위 전용 `PercentileLineChart` 컴포넌트 추가 (또는 기존 TrendLineChart에 Y축 반전 옵션 추가) |

### 새로 생성할 파일

| 파일 경로 | 내용 |
|---|---|
| `web/src/components/students/counseling-briefing-card.tsx` | 면담 브리핑 카드 컴포넌트 |
| `web/src/components/students/student-attendance-calendar.tsx` | 개인 출결 캘린더 컴포넌트 |
| `web/src/components/students/absence-risk-banner.tsx` | 탈락 위험도 배너 컴포넌트 |

---

## 6. 구현 순서 권장

```
Phase 1 (데이터 불필요, 기존 데이터 재활용)
  1. [F-2] 목표 달성 진행률 → student-cumulative-analysis.tsx 수정만으로 완성
  2. [F-7] 탈락 위험도 → absence-risk-banner.tsx 신규 + history 탭 수정
  3. [F-6] 개인 출결 캘린더 → student-attendance-calendar.tsx 신규

Phase 2 (분석 함수 확장)
  4. [F-4] 백분위 추이 → trendData에 percentile 필드 추가 (analysis.ts 소수 수정)
  5. [F-5] 최근 N회 필터 → recent 파라미터 추가 (analysis.ts + page.tsx 수정)

Phase 3 (신규 DB 쿼리)
  6. [F-3] 월별 성적 요약 → getStudentMonthlyBreakdown() 신규 작성
  7. [F-1] 면담 브리핑 카드 → getStudentCounselingBriefing() 신규 작성 (가장 복잡)
```

---

## 7. 유의사항

### 공통 규칙
- **Server Component 우선**: `page.tsx`에서 데이터를 fetch하고 Client Component에 props로 전달
- **`"use client"` 컴포넌트**: 상태(useState), 이벤트 처리, 차트(Recharts) 렌더링이 필요한 경우에만
- **에러 처리**: DB 쿼리 실패 시 `null`을 반환하고 UI에서 빈 상태 표시 (throw 금지)
- **성능**: 새 쿼리는 기존 쿼리와 `Promise.all()`로 병렬 실행

### 스타일 규칙
- 카드 컨테이너: `rounded-[28px] border border-ink/10 bg-white p-6`
- 테이블 컨테이너: `overflow-x-auto rounded-[24px] border border-ink/10`
- 뱃지: `inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold`
- 경고 배너: amber 또는 red 계열 (`border-amber-200 bg-amber-50 text-amber-700`)
- 성공/초과 달성: `text-forest`, 미달: `text-ember`, 위험: `text-red-600`

### 기존 코드 금지 사항
- `getStudentCumulativeAnalysis()` 함수 시그니처 변경 금지 (다른 곳에서 사용)
- `StudentResultDrawer` 컴포넌트 수정 금지 (석차 페이지와 공유)
- `ATTENDANCE_STATUS_RULES` 상수 값 변경 금지

### 점수 계산 규칙
- 평균 계산 시 `ABSENT` 제외, `NORMAL`과 `LIVE`만 포함
- `EXCUSED`(사유결시)는 `attendCountsAsAttendance` 플래그에 따라 포함 여부 결정
- 점수 표시는 `formatScore()` 함수 사용 (`import from "@/lib/analytics/presentation"`)
- 석차는 `formatRank()` 함수 사용

---

## 8. 데이터 흐름 다이어그램

```
page.tsx (Server Component)
  │
  ├─ tab === "history"
  │   └─ getStudentHistory()           → StudentScoreHistoryManager
  │                                        ├─ AbsenceRiskBanner (F-7)
  │                                        └─ StudentAttendanceCalendar (F-6)
  │
  ├─ tab === "cumulative"
  │   └─ getStudentCumulativeAnalysis() → StudentCumulativeAnalysis
  │                                        └─ GoalProgressSection (F-2) ← subjectStats 활용
  │
  ├─ tab === "analysis"
  │   └─ getStudentDetailAnalysis({
  │         examNumber, periodId, recent
  │      })                            → 기존 차트들
  │                                        ├─ PercentileLineChart (F-4) ← percentile 필드 추가
  │                                        ├─ MonthlyBreakdownTable (F-3)
  │                                        └─ 최근 N회 필터 버튼 (F-5)
  │
  └─ tab === "counseling"
      ├─ getCounselingProfile()
      └─ getStudentCounselingBriefing() → CounselingBriefingCard (F-1)
                                          CounselingPanel (기존)
```

---

*이 문서는 다른 AI 에이전트가 독립적으로 구현할 수 있도록 기존 코드 구조와 신규 요구사항을 함께 기술합니다.*
*구현 전 반드시 현재 파일을 Read 도구로 먼저 확인하고 수정하세요.*

---

## ⚠️ 멀티지점 고려사항 (2026-03-21 추가)

### 데이터 격리
- 개별 학생 성적 분석은 해당 학생의 `academyId` 기준으로 조회
- 지점 관리자는 자신의 지점 학생 성적만 분석 가능

### 시험 과목 동적화 (중요 변경)
- 성적 비교·분석 화면에서 과목 목록을 `exam_subjects` 테이블에서 동적으로 로드
- 기존 하드코딩된 Subject enum 비교 로직 → 지점별 동적 과목 기준으로 변경
- 지점별로 서로 다른 과목 구성이 가능 (경찰 vs 소방 등)

### 개발 시 주의사항
- 성적 분석 API: `where: { student: { academyId: ctx.academyId } }` 필터 적용
- 백분위 계산: 같은 지점 학생들 기준으로만 계산
