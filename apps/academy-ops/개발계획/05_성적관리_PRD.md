# 성적 관리 PRD (통합 모의고사)

**작성일**: 2026-03-13
**우선순위**: Phase 0 (기존 기능 통합·개선)
**관련 개발 룰**: 00_개발공통룰.md

---

## 0. 개요

> 현재 시스템의 **아침모의고사**와 **월말 평가 모의고사**를 단일 페이지로 통합한다.
> 기존 엑셀에서 별도로 관리하던 모의고사 명단/수납/통계를 모두 이 페이지에서 처리한다.

```
/admin/exams  ← 통합 모의고사 페이지

탭:
  [아침모의고사]  [월말평가]  [특강모의고사]  [외부모의고사]
```

### 모의고사 유형 정의

| 유형 | 코드 | 설명 | 수강료 |
|---|---|---|---|
| 아침모의고사 | `MORNING` | 매일 오전 정기 모의고사 | 월정액 (예: 60,000원) |
| 월말평가 | `MONTHLY` | 매월 말 전체 평가 | 별도 참가비 (예: 3,000원) |
| 특강모의고사 | `SPECIAL` | 특강 수강생 대상 별도 시험 | 특강비에 포함 |
| 외부모의고사 | `EXTERNAL` | 경찰청/공단 주관 외부 시험 | 없음 (성적만 등록) |

---

## 1. 아침모의고사 관리

### 1-1. 아침모의고사 수강 명단 (기수별)

> **현재 엑셀 시트 구조 재현**: "1~2월 아침모의고사" 형태의 명단을 시스템에서 동일하게 관리

```
/admin/exams/morning

아침모의고사 수강 명단
══════════════════════════════════════════════════════
기간 탭: [ 1~2월 ▼ ]  기수 필터: [ 전체 ▼ ]  수험유형: [ 전체 ▼ ]

기수별 현황 요약
  ┌─────┬─────┬─────┬─────┬──────┬──────┬──────┐
  │ 49기 │ 50기 │ 51기 │ 52기 │일반생│ 기타  │ 합계 │
  ├─────┼─────┼─────┼─────┼──────┼──────┼──────┤
  │  38  │  25  │  70  │  96  │   6  │  43  │ 278  │
  │  14% │   9% │  25% │  35% │   2% │  15% │      │
  └─────┴─────┴─────┴─────┴──────┴──────┴──────┘

수험유형별 현황
  공채: 272명 / 경채: 6명
  스터디 멘티: 21명 / 스터디 멘토: 0명
  무료 수강: 109명

수강 명단 (총 278명)
No. 온라인ID  수험번호  이름  기수  연락처  공채  경채  아모스터디  현금  카드  포인트  계좌  무료  결제일  확인  비고
1   adl0518  32832   안도근  49  010-4107-9811  O  -    -         -  60,000  -   -    -   12월 26일  12월 29일
2   a        ...     ...    50  ...            O  -    -         -  60,000  -   -    -   12월 26일  12월 29일
...
9   h        ...     ...    51  ...            O  -    O         -  60,000  -   -    -   12월 26일  12월 29일  스터디 장민지, 이정연...
10  d        ...     ...    52  ...            O  -    -         -  43,000  -  17,000  -  12월 26일  12월 29일

[수강생 등록]  [엑셀 내보내기]  [문자 발송]
══════════════════════════════════════════════════════
```

### 1-2. 아침모의고사 스터디 (멘티/멘토)

```
아침모의고사 스터디 관리
  스터디 참여 여부 설정 (수강 등록 시 또는 이후 변경 가능)
  역할: [ 멘티  /  멘토 ]
  스터디 그룹 배정: [ 그룹 1 ▼ ]

스터디 그룹 현황
  그룹 1: 멘토 1명 + 멘티 X명
  그룹 2: 멘토 1명 + 멘티X명
  ...
```

### 1-3. 아침모의고사 수강 등록

```
/admin/exams/morning/enroll

수강 등록
  학생 검색: [ 수험번호 또는 이름 ]  [검색]
  기수: [ 52기 (공채) ▼ ]
  수험 유형: [ 공채 ▼ ]
  온라인 아이디: [ adl0518 ]  (홈페이지 계정이 있는 경우)
  스터디 참여: [ ● 미참여  ○ 멘티  ○ 멘토 ]

수강료
  월정액: [ 60,000 ] 원
  할인: [ 없음 ▼ ] (무료, 포인트 차감 등)
  결제수단: [ ● 카드  ○ 현금  ○ 포인트  ○ 계좌  ○ 무료 ]

결제일: [ 2026-12-26 ]  확인일: [ 2026-12-29 ]  ← 결제일과 확인일 별도 관리
[등록 완료]
```

### 1-4. 아침모의고사 성적 관리

기존 기능 유지 + 기수별/수험유형별 필터 추가:

```
/admin/exams/morning/scores

회차 선택: [ 2026-03-13 (321회) ▼ ]
기수 필터: [ 전체 ▼ ]  수험유형: [ 공채 ▼ ]

성적 업로드 [xlsx 업로드]  [붙여넣기]
```

---

## 2. 월말 평가 모의고사

### 2-1. 월말 모의고사 개요

> **현재 엑셀 시트 구조 재현**: "1월 95모의고사" 형태의 명단

```
특징:
  - 아침모의고사 수강생과 별도로 접수
  - 별도 참가비 (예: 3,000원)
  - 성별 (남/여) 구분 관리
  - 접수증 발급일 별도 관리
  - 온라인 접수 포함 (홈페이지)
  - 접수인원 vs 응시인원 통계 (응시율)
  - 공채_남자 / 공채_여자 / 온라인 구분 통계
```

### 2-2. 월말 모의고사 접수 명단

```
/admin/exams/monthly/[id]

1월 95모의고사  (2026-01-xx)
══════════════════════════════════════════════════════
통계 요약 (우측 상단)
  접수인원: 219  /  응시인원: [입력]  /  응시율: 0%
  공채_남자: 80  /  공채_여자: 93  /  온라인: 46

접수 명단
No.  수험번호  이름  연락처  현금  카드  포인트  계좌  무료  결제일  확인일  성별  접수증 발급일  비고
9   36948    ...   ...     -     -    3,000   -    -  1월 28일  02월 02일  남  1월 28일
...

[접수 등록]  [엑셀 내보내기]  [접수증 일괄 발급]
══════════════════════════════════════════════════════
```

### 2-3. 월말 모의고사 개별 접수

```
모의고사 접수 등록
  학생 검색: [ 수험번호 또는 이름 ]  [검색]
  시험: [ 1월 95모의고사 ▼ ]
  성별: [ 남 ▼ ]
  수험유형: [ 공채 ▼ ]
  접수 채널: [ ● 현장  ○ 온라인 ]

참가비: 3,000원
결제수단: [ ● 포인트  ○ 현금  ○ 카드  ○ 무료 ]

접수증 발급: [ ● 즉시 발급  ○ 나중에 ]
[접수 완료]
```

### 2-4. 월말 모의고사 성적 입력 및 통계

```
/admin/exams/monthly/[id]/scores

성적 업로드 [xlsx 업로드]  [붙여넣기]

통계:
  전체 평균: xx점  /  과목별 평균
  공채_남자 평균  /  공채_여자 평균  /  온라인 평균
  기수별 평균 비교
```

---

## 3. 특강 모의고사

특강 수강생을 대상으로 별도로 진행되는 시험.

```
/admin/exams/special

특강 모의고사 목록
  시험명                      특강명               날짜         대상   상태
  형법 1차 진도 확인 테스트    25년 테마특강        2026-03-25   279명  예정

[시험 생성]
```

---

## 4. 외부 모의고사

경찰청/공단 주관 외부 시험 성적 등록.

```
/admin/exams/external

외부 시험 목록
  시험명                        주관기관   날짜         대상   성적 입력
  경찰 공개채용 1차 필기 모의   경찰청     2026-xx-xx  입력전

[외부 시험 등록]
성적 입력: 수험번호별 과목별 점수 수동 입력
```

---

## 5. 학생 통합 성적 뷰

학생 상세 페이지에서 모든 시험 유형의 성적 통합 조회.

```
/admin/students/[examNumber] → [성적] 탭

성적 이력
  시험 유형 필터: [ 전체 ▼ ] [ 아침모의고사 ] [ 월말평가 ] [ 특강 ] [ 외부 ]

  날짜        시험명           유형      과목   점수  석차  메모
  2026-03-13  321회 아침모의고사  아침     형법   85점  12/243
  2026-03-01  95 월말평가        월말     전과목  종합석차 23위
  2026-02-25  형법 테마특강 테스트  특강   형법   90점   5/56

  성적 추이 차트 (기간 선택)
  면담 연동: 성적 조회 화면에서 바로 면담 기록 작성 가능
```

---

## 6. DB 모델

```prisma
// 모의고사 시험 마스터
model ExamEvent {
  id              String    @id @default(cuid())
  title           String    // "1월 95모의고사"
  examType        ExamType  // MORNING / MONTHLY / SPECIAL / EXTERNAL
  examDate        DateTime
  targetCohortIds String[]  // 대상 기수 (빈 배열 = 전체)
  entryFee        Int       @default(0)   // 참가비 (월말 = 3000, 아침 = 0)
  organizer       String?   // 외부 모의고사 주관 기관

  // 월말 모의고사 통계 (비정규화)
  registeredCount Int       @default(0)
  attendedCount   Int       @default(0)
  maleCount       Int       @default(0)
  femaleCount     Int       @default(0)
  onlineCount     Int       @default(0)

  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())

  registrations   ExamRegistration[]
  scores          ExamScore[]

  @@map("exam_events")
}

// 모의고사 접수 (월말/특강 등 별도 참가비가 있는 경우)
model ExamRegistration {
  id              String    @id @default(cuid())
  examEventId     String
  examNumber      String
  gender          Gender?   // MALE / FEMALE
  examCategory    ExamCategory?  // GONGCHAE / GYEONGCHAE
  channel         RegistrationChannel  // ONSITE / ONLINE
  paymentId       String?   // Payment 연결
  receiptIssuedAt DateTime? // 접수증 발급일
  attended        Boolean   @default(false)  // 응시 여부
  createdAt       DateTime  @default(now())

  @@unique([examEventId, examNumber])
  @@map("exam_registrations")
}

// 아침모의고사 수강 등록 (월정액 관리)
model MorningExamSubscription {
  id              String    @id @default(cuid())
  examNumber      String
  cohortId        String?
  examCategory    ExamCategory  // GONGCHAE / GYEONGCHAE
  studentType     StudentType   // ACADEMY / GENERAL / FREE / ONLINE
  onlineId        String?       // 홈페이지 아이디
  studyRole       StudyRole?    // MENTOR / MENTEE / null

  // 월별 납부 내역은 Payment 테이블에서 관리
  startMonth      String    // "2026-01"
  endMonth        String?
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())

  @@map("morning_exam_subscriptions")
}

enum ExamType              { MORNING MONTHLY SPECIAL EXTERNAL }
enum Gender                { MALE FEMALE }
enum RegistrationChannel   { ONSITE ONLINE }
enum StudyRole             { MENTOR MENTEE }
enum DiscountType          { RATE FIXED }
```

---

## 7. API 엔드포인트

```
# 모의고사 시험 관리
GET    /api/exams?type=&month=              시험 목록
POST   /api/exams                           시험 생성
GET    /api/exams/[id]                      시험 상세

# 아침모의고사 수강 명단
GET    /api/exams/morning/subscriptions?cohortId=&month=  수강 명단
POST   /api/exams/morning/subscriptions     수강 등록

# 월말 모의고사 접수
GET    /api/exams/[id]/registrations        접수 명단
POST   /api/exams/[id]/registrations        접수 등록
PATCH  /api/exams/[id]/registrations/[rid]  접수 수정 (출석 확인 등)
POST   /api/exams/[id]/registrations/[rid]/receipt  접수증 발급

# 성적 관리 (기존 API 확장)
GET    /api/exams/[id]/scores               성적 목록
POST   /api/exams/[id]/scores/upload        성적 일괄 업로드

# 학생 통합 성적
GET    /api/students/[examNumber]/scores?type=&from=&to=  통합 성적
```

---

## 8. 주요 화면 경로

```
/admin/exams                          ← 통합 모의고사 허브
/admin/exams/morning                  ← 아침모의고사 수강 명단
/admin/exams/morning/enroll           ← 아침모의고사 수강 등록
/admin/exams/morning/[sessionId]      ← 회차별 성적 조회/입력
/admin/exams/monthly                  ← 월말 모의고사 목록
/admin/exams/monthly/new              ← 월말 모의고사 시험 생성
/admin/exams/monthly/[id]             ← 접수 명단 + 성적
/admin/exams/special                  ← 특강 모의고사
/admin/exams/external                 ← 외부 모의고사
```

---

*이 PRD는 `03_수강관리_PRD.md`(기수 관리)와 연동된다. 기수별 아침모의고사 수강 통계는 기수 관리 페이지에서도 확인 가능해야 한다.*

---

## ⚠️ 멀티지점 고려사항 (2026-03-21 추가)

### 데이터 격리
- 모든 성적 데이터 (Score, ExamSession, ExamPeriod)는 `academyId`로 격리됨
- 지점 관리자는 자신의 지점 성적 데이터만 접근 가능

### 시험 과목 동적화 (중요 변경)
- 기존 하드코딩된 `Subject` enum은 더 이상 사용하지 않음
- 성적 입력 폼에서 과목 목록을 `exam_subjects` 테이블에서 동적으로 로드:
  ```typescript
  const subjects = await prisma.examSubject.findMany({
    where: { academyId: ctx.academyId, isActive: true },
    orderBy: { displayOrder: 'asc' }
  })
  ```
- 각 지점이 `/admin/settings/exam-subjects`에서 과목 목록 관리

### 설정 독립화
- 시험 과목 목록: 지점별 독립 (`/admin/settings/exam-subjects`)
- 성적 처리 규칙 (합격기준, 우수기준, 순위표시): 지점별 독립 (`/admin/settings/scoring-rules`)

### 개발 시 주의사항
- ExamPeriod 생성: `academyId` 포함
- ExamSession 생성: `academyId` 포함
- 성적 분석 API: `where: { academyId: ctx.academyId }` 필터 적용
