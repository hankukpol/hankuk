# PRD: 합격자 관리 + 성적 팔로우 + 상담 활용 자료

**작성일**: 2026-03-13
**목적**:
- 필기합격자/최종합격자 각각 관리
- 합격자들의 수강 기간 전체 성적 추이를 팔로우
- 신규 수강생 상담 시 "이렇게 공부하면 합격한다"는 데이터 기반 자료로 활용

---

## 1. 핵심 개념

```
일반 수강생
   │
   ├─ 필기합격 → 면접 준비 모드 유지
   │     │
   │     └─ 최종합격 → 졸업생 전환
   │
   └─ 불합격 → 다음 기수 재수강 (수강 이력 연속 유지)

합격자 성적 데이터 활용
   └─ "합격자 평균 성적 라인" 생성
         └─ 신규 상담 시 "이 점수대면 X개월 후 합격 가능" 근거 자료
```

---

## 2. 합격자 관리 (GraduateRecord 확장)

### 2-1. 합격 단계

| 단계 | 코드 | 설명 |
|---|---|---|
| 필기합격 | WRITTEN_PASS | 필기시험 합격, 면접 대기 |
| 최종합격 | FINAL_PASS | 면접까지 통과, 임용 대기 |
| 임용 | APPOINTED | 실제 임용 완료 |
| 필기불합격 | WRITTEN_FAIL | 필기 탈락 |
| 최종불합격 | FINAL_FAIL | 필기합격 후 면접 탈락 |

### 2-2. 합격 등록 워크플로우

```
학생이 합격 연락
    ↓
[합격 등록] 버튼 클릭 (/admin/graduates/new)
    ↓
입력 항목:
  - 학생 검색 (이름 / 수험번호)
  - 시험명 (선택: 공무원 시험 캘린더에서)
  - 합격 구분: [ 필기합격 ▼ ] / [ 최종합격 ▼ ]
  - 합격일
  - 수강 기간: 자동 계산 (첫 수강일 ~ 합격일)
  - 담당 강사: 자동 (담임 기준)
  - 합격 수기 (선택 입력)
    ↓
[저장]
  → 합격 포인트 자동 지급 (설정값 기준)
  → 축하 SMS 자동 발송
  → 학생 상태: 재원 → 필기합격 (또는 최종합격) 으로 변경
  → 성적 스냅샷 자동 생성 (합격 시점 성적 요약 저장)
```

### 2-3. 필기합격자 면접 준비 관리

필기합격 후 → **면접 준비 기간** 별도 관리.

```
/admin/graduates/written-pass

필기합격자 현황 (면접 준비 중)
┌──────────────────────────────────────────────────────────────┐
│ 이름    합격시험         필기합격일  면접예정일  면접까지   │
│ 홍길동  경찰공무원(순경) 04/26      06/05      D-41일     │
│ 김철수  경찰공무원(순경) 04/26      06/05      D-41일     │
└──────────────────────────────────────────────────────────────┘
  → 면접 일정 알림 (D-14, D-7, D-1)
  → 면접 준비 면담 자동 일정 추가
```

### 2-4. 합격자 현황판

```
/admin/graduates

2026년도 합격 현황 (2026-03-13 기준)
┌──────────────────────────────────────────────────────────────┐
│  구분          인원    전년동기    변화                      │
│  필기합격       8명      6명       +2명                     │
│  최종합격       3명      2명       +1명                     │
│  임용           1명      -         -                        │
│  수강중(재수)  42명     38명       +4명                     │
└──────────────────────────────────────────────────────────────┘

[시험별 보기]  [월별 추이]  [담당 강사별]  [수강 기간 분석]

전체 합격자 목록
  필터: [전체] [필기합격] [최종합격] [임용] [공채] [경채]
  ──────────────────────────────────────────────────────────────
  이름    수험번호  수강기간  합격시험         단계     합격일
  홍길동  2024001  18개월   경찰공무원(순경)  최종합격  07/15
  김철수  2023001  24개월   경찰공무원(순경)  필기합격  04/26
```

---

## 3. 합격자 성적 팔로우 시스템

합격한 학생의 **수강 기간 전체 성적 궤적**을 데이터로 보관하고 분석한다.

### 3-1. 합격 시점 성적 스냅샷

합격 등록 시 자동으로 생성되는 스냅샷:

```typescript
// DB 모델
model GraduateScoreSnapshot {
  id              String    @id @default(cuid())
  graduateId      String    // GraduateRecord.id
  examNumber      String
  snapshotType    SnapshotType  // AT_WRITTEN_PASS / AT_FINAL_PASS

  // 전체 기간 종합
  totalEnrolledMonths Int        // 총 수강 기간 (월)
  overallAverage      Float?     // 전체 기간 평균
  finalMonthAverage   Float?     // 합격 직전 월 평균
  attendanceRate      Float?     // 전체 출석률

  // 과목별 최종 평균 (합격 시점)
  subjectAverages     Json       // { CONSTITUTIONAL_LAW: 82.4, CRIMINAL_LAW: 78.1, ... }

  // 성적 추이 (월별)
  monthlyAverages     Json       // [{ year: 2025, month: 1, avg: 65.2 }, ...]

  // 처음 3개월 평균 (신규생 비교용)
  first3MonthsAvg     Float?

  createdAt           DateTime   @default(now())
}

enum SnapshotType { AT_WRITTEN_PASS AT_FINAL_PASS AT_APPOINTED }
```

### 3-2. 합격자 성적 추이 분석

```
/admin/graduates/[id]/score-journey

홍길동 합격 성적 여정

수강 기간: 2024-09 ~ 2026-07 (22개월)
합격 시험: 2026 경찰공무원(순경)
최종 합격일: 2026-07-15

[성적 추이 차트 — 전체 수강 기간]
점수
90  ────────────────────────────── 합격 기준선 (80점)
80                       ··▲·····
70              ···▲····
65  ▲·····▲····
60
    2024.09  2025.01  2025.06  2025.12  2026.04  2026.07(합격)

과목별 최종 평균 (합격 시점)
  형법     78.4점   목표 80점
  헌법     82.1점   목표 80점  ✓
  경찰학   74.2점   목표 75점
  소송법   80.3점   목표 78점  ✓

합격 전 마지막 3개월 평균: 79.2점
```

---

## 4. 신규 상담 활용 자료 (핵심 기능)

### 4-1. "합격자 성적 벤치마크" 데이터

신규 상담 시 학생에게 보여줄 수 있는 데이터 기반 자료.

**분석 항목**:
- 합격자들이 수강 1개월/3개월/6개월/12개월 시점에 평균 몇 점이었는가?
- 합격자들의 수강 기간은 평균 몇 개월인가?
- 특정 점수대(예: 현재 60점대)에서 합격까지 걸린 시간은?

#### A. 합격자 성적 곡선 (Benchmark Chart)

```typescript
// 계산 함수
async function getGraduateBenchmarkData(input: {
  examType: ExamType
  passType: 'WRITTEN_PASS' | 'FINAL_PASS'
}): Promise<{
  // 합격자 수
  totalGraduates: number

  // 수강 기간별 합격자 분포
  durationDistribution: Array<{
    months: number        // 수강 기간 (월)
    count: number         // 해당 기간 합격자 수
    percentage: number    // 전체 대비 %
  }>

  // 합격자 평균 성적 추이 (수강 후 N개월 시점)
  scoreTimeline: Array<{
    monthFromStart: number  // 수강 시작 후 몇 개월
    avgScore: number        // 합격자들의 해당 시점 평균
    top25Score: number      // 상위 25% 기준점
    bottom25Score: number   // 하위 25% 기준점
  }>

  // 과목별 합격자 평균
  subjectAverages: Array<{
    subject: Subject
    averageAtPass: number
    minimumAtPass: number
  }>

  // 평균 수강 기간
  avgEnrolledMonths: number
}>
```

#### B. 상담 화면 — 합격자 성적 비교 차트

```
/admin/consultations/[id]/benchmark
또는
/admin/members/[id] → "합격 가능성 분석" 섹션

개인 성적 vs 합격자 기준선 비교

[ 홍길동 — 수강 3개월차 현재 ]

점수
90  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ 합격 기준 (목표)
80  ···· 합격자 상위 25% 라인  ····
75         ■ 홍길동 현재: 74.2점
72  ━━━━━━ 합격자 평균 3개월차 ━━━
65  ···· 합격자 하위 25% 라인  ····
    수강 1개월  2개월  3개월(현재)  예상 6개월  예상 12개월

해석:
  → 현재 합격자 평균(72점)보다 2.2점 높은 출발점
  → 이 성장률 유지 시 예상 합격 시점: 약 12~15개월 후
  → 취약 과목: 경찰학 (합격자 평균 대비 -5.2점)
```

#### C. 수강 기간별 합격 분포 차트

```
합격자 수강 기간 분포 (공채, 최종합격 기준)

6개월 이하  ████ 8%
7~12개월    ████████████████ 32%
13~18개월   ████████████████████ 40%
19~24개월   ████████ 16%
24개월 초과 ██ 4%

평균: 14.3개월
최단: 6개월  최장: 36개월
```

### 4-2. 상담 활용 방식

#### 신규 방문 상담 (`/admin/consultations/[id]`)

상담 기록 작성 시 하단에 "합격자 데이터 참고" 패널 추가:

```
[ 합격자 데이터 참고 ]  공채 최종합격자 기준 (N=47명)

이 학생의 현재 수준과 합격자 초기 수준 비교:
  - 합격자 수강 1개월 평균: 65.2점
  - 이 학생 현재 (모의고사 결과 입력 시): 62.0점
  - 차이: -3.2점 (합격자 평균보다 약간 낮은 출발)

예상 합격까지 소요 기간: 15~18개월
(합격자 유사 출발점 그룹 기준)

[차트로 보기]  → 상담 화면에서 학생에게 직접 보여줄 수 있음
```

### 4-3. 인쇄용 상담 자료

상담 시 프린트해서 학생에게 줄 수 있는 A4 자료.

```
/admin/consultations/benchmark-report?examType=GONGCHAE

─────────────────────────────────────────────────
       ○○공무원학원 합격자 성적 분석 자료
             2026 공채 경찰관 기준
─────────────────────────────────────────────────

■ 합격자 수강 기간 분포 (최근 3년 최종합격자 기준)
  6개월 미만:  8%    1~1.5년: 40%
  6개월~1년: 32%    1.5~2년: 16%

■ 합격자 성적 출발점 분포
  60점 미만 출발 합격자: 21%
  60~70점 출발 합격자:  47%
  70점 이상 출발 합격자: 32%

■ 과목별 합격자 최종 평균 성적
  형법: 78.4점  헌법: 80.2점  경찰학: 76.1점  소송법: 79.3점

■ 핵심 메시지
  꾸준한 출석과 아침 모의고사 참여만으로도 충분합니다.
  우리 학원 합격자의 95%는 무단결석 월 2회 이하입니다.
─────────────────────────────────────────────────
```

---

## 5. 필요한 DB 모델 (기존 PRD에서 확장)

```prisma
// 합격 기록 (기존 GraduateRecord 확장)
model GraduateRecord {
  id              String    @id @default(cuid())
  examNumber      String
  examId          Int?      // CivilServiceExam.id (null=직접입력)
  examName        String    // 시험명 직접 입력 (examId 없을 때)
  passType        PassType  // WRITTEN_PASS / FINAL_PASS / APPOINTED
  writtenPassDate DateTime? // 필기 합격일
  finalPassDate   DateTime? // 최종 합격일
  appointedDate   DateTime? // 임용일
  enrolledMonths  Int?      // 수강 기간 (월) — 자동 계산
  testimony       String?   // 합격 수기
  isPublic        Boolean   @default(false)  // 수기 공개 여부
  staffId         String
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  student         Student   @relation(...)
  exam            CivilServiceExam? @relation(...)
  scoreSnapshot   GraduateScoreSnapshot?

  @@map("graduate_records")
}

// 합격 시점 성적 스냅샷
model GraduateScoreSnapshot {
  id                  String   @id @default(cuid())
  graduateId          String   @unique
  examNumber          String
  totalEnrolledMonths Int
  overallAverage      Float?
  finalMonthAverage   Float?
  attendanceRate      Float?
  subjectAverages     Json     // Record<Subject, number>
  monthlyAverages     Json     // Array<{ year, month, avg }>
  first3MonthsAvg     Float?
  last3MonthsAvg      Float?   // 합격 직전 3개월 평균
  createdAt           DateTime @default(now())

  graduate            GraduateRecord @relation(...)

  @@map("graduate_score_snapshots")
}

enum PassType {
  WRITTEN_PASS
  FINAL_PASS
  APPOINTED
  WRITTEN_FAIL
  FINAL_FAIL
}
```

---

## 6. 주요 화면 목록

```
/admin/graduates                           합격자 현황판 (전체)
/admin/graduates/new                       합격 등록
/admin/graduates/written-pass              필기합격자 (면접 준비 중)
/admin/graduates/[id]                      합격자 상세
/admin/graduates/[id]/score-journey        합격자 성적 여정
/admin/graduates/benchmark                 합격자 성적 벤치마크 데이터
/admin/graduates/benchmark-report          인쇄용 상담 자료
/admin/members/[id]                        → "합격 가능성 분석" 섹션 추가
/admin/consultations/[id]                  → "합격자 데이터 참고" 패널 추가
```

---

## 7. 구현 순서

```
Step 1: GraduateRecord 테이블 + 합격 등록 UI
Step 2: 필기합격/최종합격 상태 분리 관리
Step 3: GraduateScoreSnapshot 자동 생성 (합격 등록 시 트리거)
Step 4: 합격자 현황판 (집계 차트)
Step 5: 벤치마크 데이터 집계 함수 (getGraduateBenchmarkData)
Step 6: 상담 화면에 합격자 비교 패널 연동
Step 7: 인쇄용 상담 자료 페이지
```

---

*이 PRD는 `2026-03-13_출결관리_문서출력_공무원학원특화_PRD.md`의 합격자 관리 섹션을 상세 확장한 문서입니다.*

---

## ⚠️ 멀티지점 고려사항 (2026-03-21 추가)

### 데이터 격리
- 합격자 데이터는 `academyId`로 격리됨
- 지점 관리자는 자신의 지점 합격자 데이터만 접근 가능
- SUPER_ADMIN은 전 지점 합격자 통계 조회 가능

### 개발 시 주의사항
- 합격자 등록 API: `academyId` 포함
- 합격률 통계: 지점별 집계
- 연도·차수별 관리 기준도 지점별 독립
