# PRD: 참수리 아침모의고사 성적 관리 시스템

> **작성일**: 2026-03-07 (최종 업데이트: 2026-03-07)
> **버전**: 2.3 (최종)
> **목적**: 이 문서는 AI 개발자가 시스템을 구현하기 위한 완전한 명세서입니다.

---

## 1. 프로젝트 개요

경찰공무원 시험 대비 학원의 아침 모의고사 수강생 성적/출결을 관리하는 웹 시스템.
기존 Excel+VBA 운영 방식을 웹 애플리케이션으로 완전 전환한다.

### 강좌 개요
- **목적**: 매일 아침모의고사를 통해 복습 습관 형성 (기본반 강의 복습 모의고사)
- **일정 예시**: 3/9(화) ~ 5/1(금), 8주
- **시험 시간**: 08:30 ~ (20분간)
- **수강생**: 약 300명 (공채반 + 경채반 구분)

### 시험 유형 구분 (중요)
| 구분 | 과목 | 비고 |
|------|------|------|
| **공채 (일반공채)** | 형법, 형사소송법, 경찰학, 헌법 | 주 5회 |
| **경채 (경행경채)** | 형법, 형사소송법, 경찰학, 범죄학 | 주 5회, 범죄학은 3월부터 진행 |

> ⚠️ 공채와 경채는 수강생 명단, 성적, 석차를 **완전히 분리**하여 관리한다.
> ⚠️ 범죄학 아침모의고사는 1~2월에는 진행되지 않으며, 3월부터 진행된다.

### 운영 주기
- **2개월 단위** 반복 운영 (예: 1-2월, 3-4월, 5-6월...)
- **월별 성적 공지**: 1개월 단위로 별도 공지 (월말 우수자 시상)
- **통합 성적 공지**: 2개월 기간 종료 후 통합 공지

---

## 2. 기술 스택 (확정)

| 영역 | 기술 | 이유 |
|------|------|------|
| 프레임워크 | **Next.js 14** (App Router) | 풀스택 단일 프레임워크 |
| 데이터베이스 | **Supabase** (PostgreSQL) | Auth 내장, 실시간, 무료 충분 |
| ORM | **Prisma** | 타입 안전 DB 쿼리 |
| 배포 | **Vercel** | 무료, 자동 HTTPS, CI/CD |
| UI | **TailwindCSS + shadcn/ui** | 빠른 개발, 한국어 친화 |
| 테이블 | **TanStack Table** | 300명×대용량 그리드 |
| 알림 | **Solapi** (카카오 알림톡 + SMS) | 한국 표준 알림 API |
| 차트 | **Recharts** | 성적 분석 시각화 |
| 파일 저장 | **Supabase Storage** | 시험지 파일 보관 |
| XLS 파싱 | **SheetJS (xlsx)** | 오프라인 표준 XLS 파싱 (Node.js 전용, xlrd 대체) |
| HTML 파싱 | **cheerio** | 온라인 HTML-in-XLS 파싱 (pandas 대체) |

> ⚠️ **파싱 라이브러리 중요**: xlrd·pandas는 Python 전용이므로 Next.js(Node.js) 환경에서 사용 불가.
> 오프라인 XLS → SheetJS, 온라인 HTML-XLS → SheetJS + cheerio 로 대체한다.

**Vercel + Supabase 선택 이유**: 어디서나 접속 가능, 서버 관리 불필요, 학생 포털 추가 시 그대로 확장, 300명×수년치 데이터도 무료 플랜 충분.

---

## 3. 핵심 운영 규정 (시스템이 반드시 반영해야 할 규칙)

### 3-1. 응시 유형
| 유형 | 설명 | 성적 장학 | 석차 RANK | 개근 포인트 |
|------|------|-----------|-----------|-------------|
| 현장(일반) | 08:30 현장 응시 | ✅ 반영 | ✅ 포함 | ✅ 반영 |
| 온라인(라이브) | 08:30 온라인 동시 응시 | ❌ 제외 | ❌ **제외** | ✅ 반영 |
| 사유 불참 | 사유서 제출 후 인정 | ❌ | ❌ 제외 | 아래 3-3 참고 |
| 무단 불참 | 사유 없는 불참 | ❌ | ❌ 제외 | ❌ |

> **온라인(LIVE) 응시자 석차 제외 이유**: 오픈북 응시 가능성으로 현장 응시자와 동등 비교 불가.
> LIVE 응시자도 본인 점수 및 전체 평균 확인은 가능하나, 석차 컬럼은 `-` 로 표시.
> **석차 RANK 계산 대상 = 현장(NORMAL) 응시 기록이 있는 수강생만.**

### 3-2. 탈락/경고 판정 규칙 (중요)
```
[주차 기준 - 매주 독립 평가]
한 주 5회 시험 중 3회 이상 무단 불참 → 🔴 탈락
  - 탈락 시: 해당 월 남은 시험 응시 불가 (현장/온라인 모두)
  - 복귀: 다음 달부터 응시 가능 (관리자가 복귀 시작일 지정)
  - 예) 3월에 탈락 → 3월 남은 시험 응시 불가, 4월부터 재응시 가능

한 주 2회 무단 불참 → 🟠 2차 경고
한 주 1회 무단 불참 → 🟡 1차 경고
무단 불참 없음       → ✅ 정상

⚠️ 경고는 매주 독립 평가 (누적 상향 없음)
   예) 1주차 1차 경고 + 2주차 1차 경고 → 각각 1차 경고 유지 (2차 경고로 상향 안 됨)
   단, 탈락은 월 누적 기준으로도 별도 체크

[월 누적 기준 - 경고와 별개로 탈락만 적용]
한 달 무단 불참 누적 8회 이상 → 🔴 탈락 (동일 복귀 기준 적용)

판정 우선순위: 주차 탈락(3회) > 월 누적 탈락(8회) > 2차 경고(2회) > 1차 경고(1회)
```

### 3-3. 사유서 규정
- 불가피한 사정에 한해 학원에서 사유서 작성
- 승인 시: 해당 날짜 시험지 별도 배부
- **불인정 사유**: 늦잠, 지각 등 개인적 사유 (증명 서류 필수)
- **시험 종료 후 사유서 작성 불가**

**개근 인정 기준** (사유서 승인 시):
| 사유 유형 | 개근 인정 | 처리 |
|-----------|-----------|------|
| 예비군 | ✅ **자동 인정** | 예비군 통지서 첨부 시 무조건 개근 인정 |
| 그 외 (병원, 경조사 등) | 관리자 판단 | 사유서 승인 시 "개근 인정 여부" 체크박스로 결정 |

> 사유서 승인 화면에 "개근 인정" / "사유 처리(개근 미인정)" 두 가지 선택지 제공
> 예비군(absenceCategory = MILITARY)은 승인 즉시 자동으로 개근 인정 처리

### 3-4. 포인트/장학 혜택
| 혜택 | 조건 | 포인트 |
|------|------|--------|
| 개근 장학 | 1개월 무단 불참 0회 (현장+온라인 포함) | 10,000P |
| 성적 우수 | 월별 성적 상위자 (관리자 지정) | 별도 지급 |
| 주관식 우수 | 월별 주관식 우수자 (관리자 지정) | 별도 지급 |

> 온라인 응시자는 성적 장학 포인트 미반영, 개근 포인트만 지급

### 3-5. 시험 구조 상세

#### 과목별 문항 수 및 배점
| 과목 | 문항 수 | 점당 배점 | 만점 | 비고 |
|------|---------|-----------|------|------|
| 형법 | 20문항 | 5점 | 100점 | 공채·경채 공통 |
| 형사소송법 | 20문항 | 5점 | 100점 | 공채·경채 공통 |
| 경찰학 (객관식) | 20문항 | 5점 | 100점 | rawScore |
| 경찰학 (OX) | 10문항 | 10점 | 100점 | oxScore (추가점수) |
| 헌법 | 20문항 | 5점 | 100점 | 공채 전용 |
| 범죄학 | 20문항 | 5점 | 100점 | 경채 전용, 3월부터 |
| 누적 모의고사 | - | - | 100점 | 목요일, 전 주 전 범위 복합 |

> 경찰학 finalScore = rawScore + oxScore (최대 200점)
> 평균 계산 시 경찰학은 finalScore를 100점 만점으로 정규화:
> **정규화 점수 = finalScore / 2** (석차·평균 계산에 사용)

#### 요일별 고정 과목 순서
| 요일 | 공채 | 경채 |
|------|------|------|
| 월 | 경찰학 | 경찰학 |
| 화 | 헌법 | 범죄학 (3월부터, 1~2월은 미실시) |
| 수 | 형사소송법 | 형사소송법 |
| 목 | 누적 모의고사 | 누적 모의고사 |
| 금 | 형법 | 형법 |

> **누적 모의고사 (목요일)**: 전 주 전 범위를 포괄하는 복합 모의고사.
> 특정 단일 과목이 아닌 별도 시험 유형으로 처리. Subject enum = CUMULATIVE

#### 경채 1~2월 범죄학 미실시 기간 평균 계산
```
1~2월 경채 응시 과목: 형법, 형소법, 경찰학 (3과목)
→ 범죄학 제외하고 3과목 평균으로 계산
→ 범죄학 ExamSession은 1~2월에 생성하지 않음
→ 석차 계산 시 "해당 기간에 존재하는 과목"의 평균만 사용
```

---

### 3-6. 월별/통합 성적 공지 구조
```
2개월 기간 (예: 3-4월) 운영 시:

① 3월 종료 시점:
  - 3월 전체 성적 공지 (석차, 참여율)
  - 3월 성적 우수자 시상 + 포인트 지급
  - 3월 개근자 시상 + 10,000P 지급

② 4월 종료 시점:
  - 4월 전체 성적 공지 (석차, 참여율)
  - 4월 성적 우수자 시상 + 포인트 지급
  - 4월 개근자 시상 + 10,000P 지급

③ 3~4월 통합 종료 시점:
  - 3~4월 통합 성적 공지 (통합 석차, 통합 참여율)
  - 통합 성적 우수자 시상
```

---

## 4. 데이터 모델 (Database Schema)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// 수강생 마스터 (수험번호 = Primary Key)
model Student {
  examNumber    String       @id            // 수험번호 (오프라인 채점 파일의 "학번")
  name          String
  phone         String?
  generation    Int?                        // 기수 (예: 49)
  className     String?                     // 반 (예: 기본이론반)
  examType      ExamType                    // 공채 / 경채
  studentType   StudentType  @default(EXISTING) // 신규생 / 기존생 (성적 별도 공지용)
  onlineId      String?      @unique        // 온라인 플랫폼 수강자ID (온라인 파일 매칭용)
  registeredAt  DateTime?
  note          String?
  isActive      Boolean      @default(true)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  scores              Score[]
  absenceNotes        AbsenceNote[]
  notifications       NotificationLog[]
  counselingRecords   CounselingRecord[]
  pointLogs           PointLog[]
  studentAnswers      StudentAnswer[]

  @@map("students")
}

// 시험 기간 (2개월 단위)
model ExamPeriod {
  id          Int      @id @default(autoincrement())
  name        String                        // 예: "2026년 3-4월 아침모의고사"
  startDate   DateTime
  endDate     DateTime
  totalWeeks  Int      @default(8)          // 8~9주
  isActive    Boolean  @default(false)      // 현재 진행중인 기간
  createdAt   DateTime @default(now())

  sessions         ExamSession[]
  monthlyResults   MonthlyResult[]

  @@map("exam_periods")
}

// 월별 집계 (1개월 단위 공지용)
model MonthlyResult {
  id           Int        @id @default(autoincrement())
  periodId     Int
  period       ExamPeriod @relation(fields: [periodId], references: [id])
  month        Int                          // 월 (1~12)
  year         Int                          // 연도
  publishedAt  DateTime?                   // 성적 공지 일시
  isPublished  Boolean    @default(false)

  @@unique([periodId, year, month])
  @@map("monthly_results")
}

// 시험 회차 (특정 날짜 × 특정 과목 × 공채/경채)
model ExamSession {
  id           Int        @id @default(autoincrement())
  periodId     Int
  period       ExamPeriod @relation(fields: [periodId], references: [id])
  examType     ExamType                     // 공채 / 경채 (과목 구분)
  week         Int                          // 주차 (1~9)
  subject      Subject                      // 과목
  examDate     DateTime                     // 시험 날짜
  createdAt    DateTime   @default(now())

  scores       Score[]

  @@unique([periodId, examType, examDate, subject])
  // examDate + subject 기준 (같은 날 같은 과목은 불가)
  // week는 집계용으로만 사용, PK 역할 아님
  @@map("exam_sessions")
}

// 성적 (수험번호 + 시험 회차 = 1개 성적)
model Score {
  id           Int         @id @default(autoincrement())
  examNumber   String
  student      Student     @relation(fields: [examNumber], references: [examNumber])
  sessionId    Int
  session      ExamSession @relation(fields: [sessionId], references: [id])
  rawScore     Float?                       // 객관식 원점수 (오프라인: "원점수", 온라인: 기본 점수)
  oxScore      Float?                       // OX/주관식 추가점수 (경찰학 과목만, 파일명의 "주관식")
  finalScore   Float?                       // 최종점수 = rawScore + oxScore (오프라인 "최종점수")
  attendType   AttendType                   // 응시 유형
  sourceType   ScoreSource                  // 어떤 파일에서 가져온 성적인지
  note         String?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  @@unique([examNumber, sessionId])
  @@map("scores")
}

// 사유서
model AbsenceNote {
  id           Int           @id @default(autoincrement())
  examNumber   String
  student      Student       @relation(fields: [examNumber], references: [examNumber])
  sessionId    Int                          // 해당 시험 회차
  reason       String                       // 사유 내용
  absenceCategory String?                  // "MILITARY"(예비군) / "MEDICAL" / "FAMILY" / "OTHER"
  // documentUrl 필드 없음 - 증빙 서류는 파일 첨부 없이 관리자 육안 확인
  submittedAt  DateTime?                    // 사유서 제출일
  approvedAt   DateTime?
  status       AbsenceStatus @default(PENDING)
  attendGrantsPerfectAttendance Boolean @default(false)
  // 개근 인정 여부:
  // - absenceCategory = "MILITARY" 이면 승인 시 자동 true
  // - 그 외: 관리자가 승인 화면에서 수동 체크
  adminNote    String?                      // 관리자 메모
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@map("absence_notes")
}

// 알림 발송 이력
model NotificationLog {
  id           Int                 @id @default(autoincrement())
  examNumber   String
  student      Student             @relation(fields: [examNumber], references: [examNumber])
  type         NotificationType
  channel      NotificationChannel
  message      String
  status       String              @default("sent")
  sentAt       DateTime            @default(now())
  failReason   String?

  @@map("notification_logs")
}

// 면담 기록
model CounselingRecord {
  id           Int      @id @default(autoincrement())
  examNumber   String
  student      Student  @relation(fields: [examNumber], references: [examNumber])
  counselorName String                      // 담당 강사
  content      String                       // 면담 내용
  recommendation String?                   // 추천 학습 방향
  nextSchedule DateTime?                   // 다음 면담 예정일
  counseledAt  DateTime
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("counseling_records")
}

// 시험 문항 정보 (채점 파일의 Errata/채점표 시트에서 파싱)
model ExamQuestion {
  id                  Int         @id @default(autoincrement())
  sessionId           Int
  session             ExamSession @relation(fields: [sessionId], references: [id])
  questionNo          Int                          // 문항 번호 (1~25 등)
  correctAnswer       String                       // 정답 (1/2/3/4 또는 O/X)
  correctRate         Float?                       // 정답률 (%)
  difficulty          String?                      // 난이도 (용이/보통/어려움)
  answerDistribution  Json?
  // 각 선지 선택 비율 (%)
  // 객관식 예시: {"1": 12.5, "2": 45.0, "3": 30.0, "4": 12.5}
  // OX 예시:    {"O": 72.0, "X": 28.0}
  createdAt           DateTime    @default(now())

  studentAnswers        StudentAnswer[]
  wrongNoteBookmarks    WrongNoteBookmark[]

  @@unique([sessionId, questionNo])
  @@map("exam_questions")
}

// 학생별 문항 응답 (채점 파일 Errata/채점표 시트에서 파싱)
model StudentAnswer {
  id           Int          @id @default(autoincrement())
  examNumber   String
  student      Student      @relation(fields: [examNumber], references: [examNumber])
  questionId   Int
  question     ExamQuestion @relation(fields: [questionId], references: [id])
  answer       String                       // 학생이 선택한 답 (1/2/3/4 또는 O/X)
  isCorrect    Boolean                      // 정오표 (O/X)
  createdAt    DateTime     @default(now())

  @@unique([examNumber, questionId])
  @@map("student_answers")
}

// 포인트 지급 이력
model PointLog {
  id           Int       @id @default(autoincrement())
  examNumber   String
  student      Student   @relation(fields: [examNumber], references: [examNumber])
  type         PointType
  amount       Int                          // 포인트 금액
  reason       String                       // 지급 사유
  periodId     Int?                         // 연관 시험 기간
  month        Int?                         // 연관 월
  year         Int?
  grantedAt    DateTime  @default(now())
  grantedBy    String?                      // 지급한 관리자

  @@map("point_logs")
}

// ──────── Enums ────────

enum ExamType {
  GONGCHAE   // 공채 (일반공채) - 헌법 포함
  GYEONGCHAE // 경채 (경행경채) - 범죄학 포함
}

enum StudentType {
  NEW       // 신규생 - 별도 성적 공지 대상
  EXISTING  // 기존생 - 전체 성적에 포함
}

enum Subject {
  CONSTITUTIONAL_LAW  // 헌법 (공채 전용)
  CRIMINOLOGY         // 범죄학 (경채 전용, 3월부터)
  CRIMINAL_PROCEDURE  // 형사소송법
  CRIMINAL_LAW        // 형법
  POLICE_SCIENCE      // 경찰학
  CUMULATIVE          // 누적 모의고사 (목요일, 전 주 전 범위 복합)
}

enum AttendType {
  NORMAL    // 현장 응시 (일반) - 성적장학+개근 모두 반영
  LIVE      // 온라인 응시 - 개근만 반영, 성적장학 미반영
  EXCUSED   // 사유 불참 (승인된 사유서)
  ABSENT    // 무단 불참 - 탈락/경고 판정에 반영
}

enum AbsenceStatus {
  PENDING   // 검토중
  APPROVED  // 승인
  REJECTED  // 반려
}

enum NotificationType {
  WARNING_1  // 1차 경고
  WARNING_2  // 2차 경고
  DROPOUT    // 탈락
  NOTICE     // 일반 공지
}

enum NotificationChannel {
  ALIMTALK   // 카카오 알림톡
  SMS        // 문자
}

enum PointType {
  PERFECT_ATTENDANCE  // 개근 장학 (10,000P)
  SCORE_EXCELLENCE    // 성적 우수
  ESSAY_EXCELLENCE    // 주관식 우수
  MANUAL              // 수동 지급 (관리자 직접)
}

enum ScoreSource {
  OFFLINE_UPLOAD  // 오프라인 채점 파일 (모의고사채점표.xls)
  ONLINE_UPLOAD   // 온라인 채점 파일 (데이터_날짜.xls)
  MANUAL_INPUT    // 관리자 직접 입력
  PASTE_INPUT     // 붙여넣기 입력
}

enum AdminRole {
  SUPER_ADMIN   // 전체 권한 (기간 삭제, 계정 관리 포함)
  TEACHER       // 성적 입력, 면담 기록, 알림 발송
  VIEWER        // 조회 전용
}
```

> **신규 모델** (스키마에 함께 추가)

```prisma
// 관리자 계정 (Supabase Auth user.id 연동)
model AdminUser {
  id        String    @id  // Supabase Auth user.id (cuid)
  email     String    @unique
  name      String
  role      AdminRole @default(TEACHER)
  isActive  Boolean   @default(true)
  createdAt DateTime  @default(now())

  auditLogs AuditLog[]

  @@map("admin_users")
}

// 데이터 변경 감사 로그 (성적 수정 이력)
model AuditLog {
  id         Int       @id @default(autoincrement())
  adminId    String
  admin      AdminUser @relation(fields: [adminId], references: [id])
  action     String    // SCORE_UPDATE / SCORE_DELETE / STATUS_CHANGE / STUDENT_UPDATE 등
  targetType String    // Score / Student / AbsenceNote / PointLog 등
  targetId   String    // 변경된 레코드 ID
  before     Json?     // 변경 전 값 (스냅샷)
  after      Json?     // 변경 후 값 (스냅샷)
  ipAddress  String?
  createdAt  DateTime  @default(now())

  @@map("audit_logs")
}

// 공지사항 (관리자 작성 → 수강생 포털 노출)
model Notice {
  id          Int       @id @default(autoincrement())
  title       String
  content     String
  targetType  String    @default("ALL")  // ALL / GONGCHAE / GYEONGCHAE
  isPublished Boolean   @default(false)
  publishedAt DateTime?
  createdAt   DateTime  @default(now())

  @@map("notices")
}

// 오답 노트 북마크 (수강생 포털 - 틀린 문제 저장)
model WrongNoteBookmark {
  id         Int          @id @default(autoincrement())
  examNumber String
  student    Student      @relation(fields: [examNumber], references: [examNumber])
  questionId Int
  question   ExamQuestion @relation(fields: [questionId], references: [id])
  memo       String?      // 학생이 직접 작성하는 메모
  createdAt  DateTime     @default(now())

  @@unique([examNumber, questionId])
  @@map("wrong_note_bookmarks")
}
```

> **기존 모델 추가 필드** (각 모델에 아래 필드 추가 필요)

```
// Student 모델 추가 필드:
  notificationConsent Boolean   @default(false)  // 알림 수신 동의 여부
  consentedAt         DateTime?                  // 동의 일시
  targetScores        Json?     // 과목별 목표 점수 예: {"CRIMINAL_LAW": 90, "CRIMINAL_PROCEDURE": 85}
  currentStatus       String    @default("NORMAL")
  // 탈락/경고 상태 캐시: NORMAL / WARNING_1 / WARNING_2 / DROPOUT
  // 성적 입력 시마다 자동 재계산하여 업데이트
  statusUpdatedAt     DateTime?  // 마지막 상태 변경 일시
  wrongNoteBookmarks  WrongNoteBookmark[]

// ExamSession 모델 추가 필드:
  isCancelled   Boolean   @default(false)  // 시험 취소 여부 (공휴일, 행사 등)
  cancelReason  String?                    // 취소 사유
  questions     ExamQuestion[]             // 문항 역관계 추가
```

---

## 4. 채점 파일 데이터 명세 (파일 파싱 핵심)

> 이 섹션은 성적 입력 기능(F-03) 구현에 필수. 두 가지 완전히 다른 파일 형식을 처리해야 한다.

### 4-1. 오프라인 응시 채점 파일 (표준 XLS)

**파일명 패턴**: `모의고사채점표-YYYY-MM-DD-HH-mm-ss.xls`

**파일 형식**: 표준 Binary XLS → **SheetJS(xlsx npm)** 라이브러리로 파싱 (Node.js 환경)

#### Sheet 1: "Score" (성적 처리에 사용)
| 컬럼명 | 설명 | 시스템 매핑 |
|--------|------|-------------|
| 학번 | **수험번호** (수강생 매칭 기준) | `Student.examNumber` |
| 이름 | 참고용 (매칭 확인) | `Score` 입력 후 검증용 |
| 모의고시점수 | 사용 안 함 (항상 0) | 무시 |
| 주관식추가점수 | **경찰학 OX 추가점수** | `Score.oxScore` |
| 학번(정정) | 학번 오류 정정 시 사용 (있으면 우선 사용) | 매칭 시 우선 참조 |
| 원점수 | 객관식 점수만 | `Score.rawScore` |
| 최종점수 | 원점수 + 주관식추가점수 합산 | `Score.finalScore` |

```
파싱 규칙:
1. 헤더 행 건너뜀 (1행)
2. "학번(정정)" 값이 있으면 "학번" 대신 사용 (정정된 수험번호 우선)
3. 수험번호로 Student 테이블 조회 → 매칭
4. 매칭 실패 시: "❌ 미등록" 표시, 건너뜀 처리
5. 경찰학 과목 시험이면 oxScore 저장, 다른 과목이면 무시
6. finalScore = rawScore + oxScore (oxScore null이면 rawScore = finalScore)
```

#### Sheet 2: "Errata" (문항 분석용, **필수 파싱**)
- 학번별 각 문항 응답 기록 (1~20번 객관식 컬럼, 1~10번 주관식/OX 컬럼)
- **성적 분석 기능을 위해 반드시 파싱하여 저장**
- 파싱 결과 → `ExamQuestion` + `StudentAnswer` 테이블에 저장
```
파싱 규칙:
1. 각 문항 컬럼(1.0~20.0)의 값 = 학생이 선택한 답 (1/2/3/4)
2. 문항분석표(Moon 시트) 또는 별도 정답 데이터와 대조하여 isCorrect 계산
3. 문항별 정답률 = 해당 문항 정답자수 / 전체 응시자수 × 100%
4. 오답률 = 1 - 정답률
5. 각 선지(1~4) 선택 비율 계산하여 저장 (ExamQuestion.answerDistribution)
```

---

**파일명 패턴**: `문항분석표-YYYY-MM-DD-HH-mm-ss.xls`

**Sheet "Moon"**: 문항별 정답률/난이도 분석 데이터
- 성적 처리에는 사용 안 함, 향후 문항 분석 기능에서 활용 가능

---

### 4-2. 온라인 응시 채점 파일 (HTML-in-XLS)

> ⚠️ 온라인 파일은 HTML 테이블을 .xls로 저장한 형식. SheetJS로 원시 HTML 추출.
> **파싱 방법**: SheetJS로 파일 열기 → HTML string 추출 → **cheerio**로 테이블 파싱 (Node.js 환경)

#### 파일 A: 일반 시험 성적 파일
**파일명 패턴**: `데이터_YYYY년MM월DD일.xls`

| 컬럼명 | 설명 | 시스템 매핑 |
|--------|------|-------------|
| 번호 | 순번 (무시) | - |
| 시험명(제목) | 시험 정보 포함 (파싱 불필요) | 참고용 |
| 시험시간 | 응시 일시 | 참고용 |
| 수강자ID | **온라인 플랫폼 로그인 ID** | `Student.onlineId` 기준 매칭 |
| 이름 | 참고용 | 매칭 검증 |
| 반명 | 참고용 | - |
| 점수 | 객관식 점수 | `Score.rawScore` |

#### 파일 B: 경찰학 OX 성적 파일
**파일명 패턴**: `데이터_YYYY년MM월DD일_경찰학 o,X.xls`

- 동일 구조 (번호, 시험명, 시험시간, 수강자ID, 이름, 반명, 점수)
- **점수** = 경찰학 OX 점수 → `Score.oxScore`
- 파일 A와 수강자ID 기준으로 합산 처리

#### 파일 C, D: 채점 상세 파일 (**문항 분석용, 필수 파싱**)
- `데이터_YYYY년MM월DD일_채점표.xls` → 문항별 학생 응답 기록 (행=문항, 열=학생)
- `데이터_YYYY년MM월DD일_경찰학 o,X_채점표.xls` → OX 문항별 응답
- **파싱 방법**: 행/열 전치(transpose) → 학생별 문항 응답으로 변환
- 파싱 결과 → `StudentAnswer` 테이블에 저장
```
온라인 채점표 파싱 규칙:
1. 헤더 행1: 시험명, 과목번호, 과목명 (무시)
2. 헤더 행2: 수강자ID 목록
3. 데이터 행: 각 문항의 점수/응답값 (- 는 미응답)
4. 수강자ID → Student.onlineId 기준으로 examNumber 조회
5. StudentAnswer 테이블에 upsert
```

---

### 4-3. 온라인 ID 매칭 전략 (중요)

```
문제: 온라인 파일에는 수험번호가 없고 수강자ID(플랫폼 ID)만 있음

해결 방법:
1. Student 테이블에 onlineId 필드 추가
2. 최초 온라인 파일 업로드 시:
   a. 수강자ID로 Student.onlineId 조회 → 있으면 즉시 매칭
   b. 없으면 이름(name)으로 자동 매칭 시도
   c. 이름 매칭 성공: 관리자 확인 화면 표시 (onlineId 저장 여부 선택)
   d. 이름 매칭 실패(동명이인 or 미등록): 관리자 수동 지정
3. onlineId 한 번 저장되면 이후 파일에서 자동 매칭
4. 미매칭 학생은 "미매칭" 목록으로 분리하여 관리자 처리 대기
```

---

### 4-4. 두 파일 유형 비교 요약

| 항목 | 오프라인 (현장) | 온라인 (라이브) |
|------|----------------|----------------|
| 파일 형식 | 표준 XLS (Binary) | HTML-in-XLS |
| 파싱 라이브러리 | SheetJS(xlsx) | SheetJS + cheerio |
| 학생 식별자 | **학번** (수험번호) | **수강자ID** (플랫폼 ID) |
| 매칭 방식 | 수험번호 직접 매칭 | onlineId → 이름 순서로 매칭 |
| OX 점수 위치 | 메인 파일의 "주관식추가점수" | 별도 파일 (`경찰학 o,X.xls`) |
| 파일 수 | 1~2개 (채점표 + 문항분석) | 2~4개 (성적 + OX + 각 채점표) |
| 최종점수 | 파일에 계산된 값 존재 | 직접 합산 (일반점수 + OX점수) |

---

## 5. 비즈니스 로직

### 5-1. 주간 집계
```
주간평균 = 해당 주차에 점수가 입력된 과목 평균 (빈 과목 + ABSENT 제외)
주간 불참수 = 해당 주차에 attendType = ABSENT 횟수 (5회 시험 기준)
월 누적 불참수 = 해당 월의 모든 주차 ABSENT 합산

[경찰학 점수 정규화]
경찰학 finalScore = rawScore + oxScore (최대 200점)
평균/석차 계산 시: normalizedScore = finalScore / 2 (100점 만점 환산)
주간현황 그리드에는 finalScore 원점수 표시 + 정규화 점수 별도 컬럼

[누적 모의고사 (목요일, Subject=CUMULATIVE) 처리]
- 누적 모의고사 점수는 개별 과목 평균 계산에서 제외
- 주간평균 계산 시 포함 (단, 경찰학과 동일하게 100점 만점으로 처리)
- 탈락/경고 판정의 불참 계산에는 포함
```

### 5-2. 탈락/경고 판정 로직
```
판정은 공채/경채 각각 독립적으로 계산

[우선 순위 체크]
1. 한 주 5회 중 ABSENT 3회 이상 → 🔴 탈락
2. 해당 월 ABSENT 누적 8회 이상 → 🔴 탈락
3. 위 조건 없으면:
   - 어느 한 주라도 ABSENT 2회 → 🟠 2차 경고
   - 어느 한 주라도 ABSENT 1회 → 🟡 1차 경고
   - 전체 ABSENT 0회 → ✅ 정상

탈락 시 복귀 가능일 = 다음 달 1일 (관리자가 정확한 날짜 조정 가능)
예) 3월 탈락 → 복귀 가능일 기본값: 4월 1일

[탈락 후 복귀 시 신규생 상태]
신규생(StudentType=NEW)이 탈락 후 복귀해도 신규생 상태 유지
→ 4월 신규생 석차에 계속 포함됨
→ studentType은 관리자가 수동으로만 변경 가능
```

### 5-3. 성적 공지 단위 및 석차 구분 (중요)

석차는 아래 3가지 범위로 각각 계산되며, 모두 공채/경채는 완전 분리된다.

```
[주차별 성적 공지]
- 전체 석차: 기존생 + 신규생 통합 RANK
- 신규생 별도 석차: 신규생(StudentType=NEW)만의 RANK
- 공지 타이밍: 해당 주차 성적 입력 완료 후 관리자가 공지 발행

[월별 성적 공지]
- 전체 석차: 기존생 + 신규생 통합 월 평균 RANK
- 신규생 별도 석차: 신규생만의 월 평균 RANK
- 개근 판정: 해당 월 ABSENT = 0 (전체 공지 + 신규생 공지 모두)
- 성적 우수자: 현장(NORMAL) 응시자만 대상
- 공지 타이밍: 월 마지막 주차 입력 후 관리자가 공지 발행

[2개월 통합 공지]
- 전체 석차: 기존생 + 신규생 통합 통합 평균 RANK
- 신규생 별도 석차: 신규생만의 통합 평균 RANK
```

### 5-4. 성적 집계 공식
```
[공통]
평균 = 입력된 성적의 평균
  - ABSENT(무단불참): 제외 (0점 처리 아님)
  - EXCUSED(사유불참): 제외
  - LIVE(온라인): 점수는 저장하되 석차 계산 제외
참여율 = (총 시험수 - ABSENT수) / 총 시험수 × 100%
개근 = ABSENT 0회 AND 응시 기록 1개 이상
  - EXCUSED + attendGrantsPerfectAttendance=true → 개근 인정 (ABSENT 0으로 취급)
  - EXCUSED + attendGrantsPerfectAttendance=false → 개근 불인정

[석차 RANK 공통 규칙]
- 대상: AttendType = NORMAL(현장) 기록이 있는 수강생만 포함
- LIVE 전용 응시자(NORMAL 기록 없음): 석차 컬럼 "-" 표시
- 동점 처리: SQL RANK() 함수 방식 → 동점이면 같은 순위, 다음 순위는 건너뜀
  예) 85점 2명 → 1위, 1위, 3위 (2위 없음)

[주차 성적]
주간평균 = 해당 주차 NORMAL 응시 과목 점수 평균 (LIVE 점수는 평균에서 제외)
주간 전체 석차 = RANK(주간평균, NORMAL응시자 전체, 내림차순)
주간 신규생 석차 = RANK(주간평균, NORMAL응시자 중 신규생만, 내림차순)

[월별 성적]
월 평균 = 해당 월 NORMAL 응시 점수 평균
월 전체 석차 = RANK(월평균, NORMAL응시자 전체, 내림차순)
월 신규생 석차 = RANK(월평균, NORMAL응시자 중 신규생만, 내림차순)

[통합 성적]
통합 평균 = 전체 기간 NORMAL 응시 점수 평균
통합 전체 석차 = RANK(통합평균, NORMAL응시자 전체, 내림차순)
통합 신규생 석차 = RANK(통합평균, NORMAL응시자 중 신규생만, 내림차순)
```

### 5-5. 포인트 지급 기준
```
개근 포인트: 해당 월 ABSENT = 0 → 10,000P 자동 판정 (관리자 최종 확인 후 지급)
  ※ LIVE(온라인) 응시는 개근 인정, EXCUSED(사유)는 운영 정책에 따라 관리자 결정
  ※ 성적 장학: 관리자가 수동으로 대상자 선택 후 포인트 입력
```

### 5-6. 성적 장학 대상 필터 조건
```
현장(NORMAL) 응시자만 성적 장학 대상
온라인(LIVE) 응시자는 성적 장학 제외, 개근 포인트만 대상
```

---

## 6. 기능 명세

### F-00. 관리자 인증 및 권한 관리
- **경로**: `/admin/settings/accounts`
- **인증**: Supabase Auth (이메일+비밀번호)
- **역할(Role) 체계**:

| 역할 | 가능한 작업 |
|------|-------------|
| SUPER_ADMIN | 전체 권한 (계정 생성/삭제, 기간 삭제, 모든 데이터 수정) |
| TEACHER | 성적 입력, 면담 기록, 알림 발송, 사유서 승인, 포인트 지급 |
| VIEWER | 조회/출력만 가능 (데이터 변경 불가) |

- 관리자 목록 조회/초대/역할 변경/비활성화
- 비밀번호 재설정: Supabase Auth 이메일 재설정 링크 발송
- 로그인 후 role 기반으로 사이드바 메뉴/버튼 자동 제어 (VIEWER는 편집 버튼 숨김)
- 세션 만료: 24시간 자동 로그아웃


---

### F-01. 시험 기간 관리
- **경로**: `/admin/periods`
- 2개월 단위 시험 기간 생성/수정/종료
- 필드: 기간명, 시작일, 종료일, 총 주차, 포함 월(자동 계산)
- 현재 진행 중인 기간 1개 활성화
- 종료된 기간 데이터는 조회 전용 (삭제 불가)
- 기간 생성 시 시험 회차(ExamSession) 일괄 생성 도구 제공
  - 공채/경채 구분, 주차별 날짜, 과목 자동 배치
- **시험 취소/연기 처리**:
  - 개별 회차에 "취소" 버튼 → `isCancelled=true` + 취소 사유 입력 (공휴일, 행사 등)
  - 취소된 회차는 출결 계산(불참수/탈락 판정)에서 **자동 제외**
  - 연기 시: 날짜 수정 → 해당 회차의 기존 성적 날짜도 동기화

### F-02. 수강생 관리 (CRUD)
- **경로**: `/admin/students`
- **공채/경채 탭 분리** (수강생 목록이 완전히 분리)
- 수험번호 중복 검증
- 수험번호+이름으로 검색, 기수/반별 필터
- 퇴원/비활성화 처리 (데이터 유지)
- **수험번호로 전체 시험 기간 성적 이력 조회**: `/admin/students/[examNumber]/history`

### F-02-B. 수강생 명단 붙여넣기 등록
- **경로**: `/admin/students/paste-import`
- **목적**: 별도 수강접수 엑셀 파일에서 복사 → 웹 붙여넣기로 일괄 등록
- 붙여넣기 형식: `수험번호\t이름\t연락처\t기수\t반\t등록일` (엑셀 복사 그대로)
- 파싱 즉시 미리보기 테이블 표시 + 수정 가능
- **공채/경채 유형 선택** (등록 전 반드시 지정)
- **신규생/기존생 유형 선택** (등록 전 반드시 지정, 기본값: 신규생)
- 수험번호 중복 시: 업데이트/건너뜀/덮어쓰기 선택
- 열 순서 매핑 UI (열 순서가 다를 경우 드래그로 조정)
- 엑셀 파일 직접 업로드(.xlsx) 병행 지원

### F-03. 성적 입력
- **경로**: `/admin/scores/input`
- 입력 방식 선택: **① 오프라인 파일 업로드** / **② 온라인 파일 업로드** / **③ 직접 붙여넣기**

#### F-03-A. 오프라인 채점 파일 업로드 (주요 방식)
**파일**: `모의고사채점표-YYYY-MM-DD-HH-mm-ss.xls`

```
처리 흐름:
단계 1. 시험 기간 / 공채·경채 / 주차 / 과목 / 날짜 선택
단계 2. 파일 업로드 (.xls 파일 선택 또는 드래그앤드롭)
단계 3. 서버에서 SheetJS(xlsx)로 "Score" 시트 파싱
        - "학번(정정)" 있으면 우선 사용, 없으면 "학번" 사용
        - 수험번호로 Student 테이블 조회 → 매칭 결과 반환
단계 4. 매칭 결과 미리보기 테이블 표시:
        ┌ 학번 ┬ 이름 ┬ 원점수 ┬ OX점수 ┬ 최종점수 ┬ 매칭 상태 ┐
        │35357 │홍길동│   80   │   10   │    90    │ ✅ 매칭   │
        │99999 │알수없│   70   │    -   │    70    │ ❌ 미등록 │
        - 미등록 수험번호: 빨간 행 표시, 건너뜀 처리 (관리자 확인)
단계 5. 응시 유형 일괄 설정: NORMAL (현장) 기본값
단계 6. "성적 반영" 버튼 → DB 저장 + 탈락/경고 자동 재계산
```

**경찰학 과목 특이사항**: 업로드 시 "주관식추가점수" → `Score.oxScore` 자동 저장
(다른 과목은 oxScore 무시)

---

#### F-03-B. 온라인 채점 파일 업로드
**파일 세트**: `데이터_YYYY년MM월DD일.xls` + (경찰학인 경우) `데이터_YYYY년MM월DD일_경찰학 o,X.xls`

```
처리 흐름:
단계 1. 시험 기간 / 공채·경채 / 주차 / 과목 / 날짜 선택
단계 2. 파일 업로드
        - 일반 성적 파일 필수 업로드
        - 경찰학 과목인 경우 OX 파일 추가 업로드 (선택)
단계 3. 서버에서 SheetJS + cheerio로 HTML 테이블 파싱
        - "수강자ID" 기준으로 Student.onlineId 조회 → 매칭
        - onlineId 미등록 시: 이름으로 재시도 자동 매칭
단계 4. 매칭 결과 미리보기:
        ┌ 수강자ID   ┬ 이름 ┬ 점수 ┬ OX점수 ┬ 매칭수험번호┬ 상태      ┐
        │helen0308  │이혜영│  85  │   -    │   35357    │ ✅ 자동매칭│
        │unknown123 │김철수│  90  │   -    │    -       │ ⚠️ 수동지정│
        - "⚠️ 수동지정": 드롭다운으로 수강생 선택 → onlineId 저장 여부 체크박스
단계 5. 응시 유형 일괄 설정: LIVE (온라인) 기본값
단계 6. 경찰학 OX 파일 있으면: 수강자ID 기준으로 oxScore에 OX 점수 저장 (rawScore와 별도)
단계 7. "성적 반영" 버튼 → DB 저장 + 탈락/경고 자동 재계산
        - onlineId 신규 저장된 항목은 Student 테이블도 업데이트
```

---

#### F-03-C. 직접 붙여넣기 입력 (보조 방식)
```
단계 1. 시험 기간 / 공채·경채 / 주차 / 과목 / 날짜 선택
단계 2. 붙여넣기 영역에 텍스트 붙여넣기
        형식: 수험번호[TAB]이름[TAB]점수 (행 구분: 줄바꿈)
        → 엑셀에서 3열 선택 후 복사한 그대로 붙여넣기 가능
단계 3. 파싱 후 즉시 수험번호 매칭 결과 표시
단계 4. 응시 유형 행별 선택
단계 5. "성적 반영"
```

---

#### 공통: 성적 반영 버튼 처리 로직
```
1. 이미 입력된 성적 존재 시: 덮어쓰기 확인 모달 표시
2. DB 저장 (Score upsert)
3. 해당 수강생들의 주간 불참수 재계산
4. 탈락/경고 상태 재판정
5. 상태 변경된 수강생 목록 반환 → 알림 발송 여부 팝업
```

### F-04. 주간 현황 그리드
- **경로**: `/admin/weekly`
- 필터: 시험 기간, **공채/경채 탭**, 주차 선택
- 수강생 × (과목별 점수 | 주간평균 | 출결상태) 그리드
- 라이브 응시: "90(라)" 표시
- 탈락자 행: 빨간 배경, 경고자 행: 주황/노랑 배경
- 열 고정 (번호/수험번호/이름 스크롤 고정)
- Excel 내보내기

### F-05. 탈락·경고 관리
- **경로**: `/admin/dropout`
- **공채/경채 탭 분리**
- 현재 기간 전체 수강생 상태 목록
- 상태별 필터 (탈락/2차경고/1차경고/정상)
- 탈락자 복귀 가능일 표시 + **관리자가 복귀 시작일 수동 조정 가능**
- 상태 수동 조정 (관리자 재량 경고 취소 등) + 사유 필수 입력

### F-05-B. 주차별 성적 공지
- **경로**: `/admin/results/weekly`
- **공채/경채 탭 분리**
- 주차 선택 → 해당 주차 성적 표시
- **두 가지 뷰 전환**:
  - "전체 성적" 탭: 기존생 + 신규생 통합 석차
  - "신규생 성적" 탭: 신규생(StudentType=NEW)만의 별도 석차
- 주간 성적표 Excel 내보내기
- **주차 공지 발행**: 발행 버튼으로 학생 포털 공개 제어

### F-06. 월별 성적 집계 및 공지
- **경로**: `/admin/results/monthly`
- **공채/경채 탭 분리**
- 월 선택 → 해당 월 석차, 참여율, 개근 여부 표시
- **두 가지 뷰 전환**:
  - "전체 성적" 탭: 기존생 + 신규생 통합 월 석차
  - "신규생 성적" 탭: 신규생만의 월 별도 석차
- **성적 우수자 필터**: 상위 N명 or 상위 N% (현장 NORMAL 응시자만 대상)
- **개근자 필터**: 해당 월 ABSENT=0 학생만 필터
- 포인트 지급 대상자 선택 → 포인트 지급 처리
- 월별 성적표 Excel 내보내기 (전체 / 신규생 각각)
- **성적 공지 발행**: 학생 포털에 공개 여부 제어

### F-07. 통합(2개월) 성적 집계
- **경로**: `/admin/results/integrated`
- **공채/경채 탭 분리**
- 통합 평균, 통합 석차, 통합 참여율, 개근 여부
- **두 가지 뷰 전환**:
  - "전체 성적" 탭: 기존생 + 신규생 통합 석차
  - "신규생 성적" 탭: 신규생만의 통합 별도 석차
- 성적 우수자 / 개근자 필터
- 통합 성적표 Excel 내보내기 (전체 / 신규생 각각)

### F-08. 다차원 조회
- **경로**: `/admin/query`
- **날짜별 조회**: 특정 날짜 시험 전체 성적 (공채/경채 구분)
- **과목별 조회**: 특정 과목의 전체 기간 성적 추이
- **학생별 조회**: 수험번호 or 이름 → 전체 시험 기간 통합 이력
- 검색 결과 Excel 내보내기

### F-09. 알림 발송 (카카오 알림톡 + SMS)
- **경로**: `/admin/notifications`
- **자동 트리거**: 성적 반영 후 경고/탈락 상태 변경 시 발송 여부 확인 팝업
- **수동 발송**: 체크박스 대상 선택 → 템플릿 선택 → 발송
- **템플릿 종류**:
  - 1차 경고 알림 (주차/불참횟수 자동 삽입)
  - 2차 경고 알림
  - 탈락 알림 (복귀 가능일 포함)
  - 포인트 지급 안내
  - 일반 공지
- **발송 이력**: 날짜/대상자/채널/성공여부 로그
- **API**: Solapi (카카오 알림톡 우선, 실패 시 SMS 폴백)
- **설정**: `/admin/settings/notifications` → API Key, 발신번호, 템플릿 ID
- **수신 동의 체크**: `Student.notificationConsent = false` 인 수강생은 발송 목록에서 자동 제외
  - 발송 화면에 "미동의자 N명 제외됨" 안내 표시
  - 수강생 등록 시 동의 여부 기입, 언제든 수정 가능

### F-10. 사유서 관리
- **경로**: `/admin/absence-notes`
- 수강생별 결석 사유 등록/수정/삭제 (관리자만)
- **규정 표시**: 사유서 작성 불가 조건 (시험 종료 후, 늦잠/지각 등) 화면에 표시
- 증빙 서류는 파일 첨부 없음 (관리자가 직접 육안 확인 후 처리)
- 사유 유형 선택: 예비군 / 의료 / 경조사 / 기타 → `absenceCategory` 저장
- 상태: 검토중 → 승인 / 반려

**승인 처리 로직**:
```
1. absenceCategory = "MILITARY" (예비군):
   → attendGrantsPerfectAttendance = true 자동 설정
   → 관리자 확인 없이 즉시 개근 인정

2. 그 외 사유:
   → 승인 화면에 "개근 인정 여부" 토글 표시
   → 관리자가 직접 true / false 선택

3. Score 존재 여부에 따른 처리:
   a. Score 레코드가 이미 있는 경우 (ABSENT):
      → attendType = EXCUSED 로 변경
   b. Score 레코드가 없는 경우 (성적 파일 미포함):
      → Score 신규 생성: examNumber, sessionId, rawScore=null,
        attendType=EXCUSED, sourceType=MANUAL_INPUT
```

- 승인 시 탈락/경고 상태 자동 재계산
- 목록 필터: 기간별, 상태별, 수강생별, 사유 유형별

### F-11. 포인트 관리
- **경로**: `/admin/points`
- **개근 포인트 자동 판정**: 월 종료 시 개근 대상자 자동 추출 → 관리자 확인 후 일괄 지급
  - 개근 기준: 해당 월 ABSENT = 0 (온라인 응시 포함 인정)
  - 지급액: 10,000P
- **성적 우수 포인트 수동 지급**: 관리자가 대상자 선택 + 포인트 금액 입력
- **주관식 우수 포인트 수동 지급**: 동일
- 포인트 지급 이력 전체 조회
- 수강생별 누적 포인트 조회

### F-12. 대시보드 (메인, 핵심 요약만)
- **경로**: `/admin/dashboard`
- **목표**: 담당자가 출근 후 30초 안에 오늘 할 일을 파악할 수 있는 화면

```
┌─────────────────────────────────────────────────────┐
│ 현재 기간: 2026년 3-4월   공채 270명 | 경채 30명     │
├──────────────┬──────────────┬───────────────────────┤
│ 오늘 시험    │ 성적 입력    │ 탈락/경고 현황        │
│ 과목×일정    │ 완료/미완료  │ 탈락N | 2차경고N      │
├──────────────┴──────────────┴───────────────────────┤
│ 미처리 사유서 N건          미발송 알림 N건           │
│ [사유서 처리 →]            [알림 발송 →]             │
└─────────────────────────────────────────────────────┘
```

- 성적 입력 완료 현황: 오늘 날짜 회차 기준 (공채/경채 각각)
- 탈락/경고 현황: 클릭 시 F-05 탈락관리 화면으로 이동
- 미처리 사유서: 클릭 시 F-10 사유서 관리로 이동
- 미발송 알림: 상태 변경 후 미발송된 경고/탈락 알림 카운트

### F-13. 성적 분석 (관리자용)
- **경로**: `/admin/analytics`
- 3가지 분석 탭: **일일 성적 분석** / **월별 성적 분석** / **과목별 성적 분석**

#### F-13-A. 일일 성적 분석
날짜 선택 + 수험번호 검색 → 해당 날짜 시험 성적 분석

**시험 정보 카드**:
- 시험일자, 시험과목, 만점, 응시인원, 전체 평균, 상위 10% 평균, 상위 30% 평균, 최고점

**오답률 TOP5**:
- 순서, 문항 번호, 오답률(%), 선지 선택 비율 (1번/2번/3번/4번 각각 몇 %)
- `StudentAnswer` + `ExamQuestion` 기반 집계

**문항 분석표** (전체 문항):
- 문항번호, 정답, 최다오답, 답지반응률(1/2/3/4/기타%), 정답률(%), 난이도

**성적 분포도**:
- 점수대별 (0점, 5점이상, 10점이상 ... 95점이상, 100점) 인원수 + 비율
- 막대 그래프 시각화

---

#### F-13-B. 월별 성적 분석 (수험번호별 개인 조회)
연월 선택 + 수험번호 입력 → 해당 수험생의 해당 월 종합 분석

**수험생 정보**:
- 응시직렬 (공채/경채), 시험명, 이름, 수험번호, 응시율

**전체 성적분석 테이블**:
| 과목명 | 내 평균 | 내 석차/응시인원 | 전체평균 | 상위 10% 평균 | 상위 30% 평균 |
|--------|---------|----------------|---------|--------------|--------------|

**과목별 성취도**:
- 레이더 차트: 4과목(공채: 헌법/형법/형소법/경찰학, 경채: 범죄학/형법/형소법/경찰학)
- 과목별 평가: 우수/보통/미흡 (전체평균 대비 편차로 자동 판정)

**과목별 평균성적 막대 그래프**:
- 내 성적(파란색) vs 응시자 평균(녹색) 나란히 비교

---

#### F-13-C. 과목별 성적 분석 (추이)
과목 탭 선택 (형사소송법 / 경찰학 / 형법 / 헌법 / 범죄학) + 수험번호 검색

**회차별 성적 테이블**:
- 일시, 응시인원, 평균, 상위 10%, 상위 30%

**회차별 성적 변화 꺾은선 그래프**:
- 전체 평균(파랑), 상위 10%(노랑), 상위 30%(빨강) 3선 동시 표시
- X축: 회차 날짜, Y축: 점수

---

#### F-13-D. 개인 성적 상세 (관리자용 + 면담 지원)
- **경로**: `/admin/students/[examNumber]/analysis`

**수험생 정보**: 시험일자, 응시직렬, 이름, 수험번호, 석차(N위/전체)

**직렬 내 경쟁자 분석 차트**:
- 막대 그래프: 최고점 / 내 점수 / 상위 10% / 상위 30% 비교

**과목별 위치 및 성취도 분석 테이블**:
| 과목명 | 내 점수 | 백분율(%) | 내 석차 | 최고점 | 상위 10% 평균 |
|--------|---------|-----------|---------|-------|--------------|

**과목별 성취도 + 레이더 차트**:
- 과목명, 내 점수, 전체 평균, 상위 10%, 석차, 상위%, 평가(우수/보통/미흡)
- 레이더 차트: 내 점수(파랑) vs 응시자 평균(녹색) 오버레이

**응시자 과목별 평균성적 막대 그래프**:
- 응시자 평균(녹색) vs 내 점수(파랑) 과목별 비교

**문항 채점표**:
- 과목 탭 전환 (전체/형법/형소법/경찰학/헌법)
- 총 문항수, 정답수, 오답수, 정답률 요약
- 표: 문항번호, 과목, 정답, 학생답안, 정오표(O/X), 정답률(%), 난이도

**오답률 TOP5** (과목별):
- 순서, 문항, 과목, 정답률, 오답률, 나의 결과(O/X)

### F-14. 학생 면담 지원
- **경로**: `/admin/counseling`
- 수험번호 or 이름 검색 → 종합 프로필 화면
- **면담 화면 구성**:
  - 학생 기본정보 (이름, 수험번호, 응시유형, 연락처)
  - 최근 4주 성적 요약 (과목별 + 주간평균)
  - 강점/약점 과목 시각적 표시
  - 출결 현황 + 경고/탈락 이력
  - 누적 포인트 현황
  - 과거 면담 이력 목록
- **면담 기록 입력**: 날짜, 담당 강사, 내용, 추천 학습 방향, 다음 면담 일정
- **과목별 목표 점수 설정**: 면담 화면에서 과목별 목표 입력 → `Student.targetScores` 저장
  - 예: 형법 90점, 형소법 85점, 경찰학 80점, 헌법 75점
  - 성적 분석 차트(F-13)와 수강생 포털(F-15)에 목표선으로 시각화
  - 목표 대비 달성률: `(현재 평균 / 목표 점수) × 100%` → 면담 화면에 표시
- 면담 기록 PDF 출력

### F-15. 수강생 포털 (수험번호로 본인 성적 조회)
- **경로**: `/student`
- **로그인**: 수험번호 + 이름 입력 (인증 없이 단순 조회)
- **3가지 분석 탭**: 일일 성적 분석 / 월별 성적 분석 / 과목별 성적 분석
- 관리자가 전체 포털 활성화/비활성화 제어

#### F-15-A. 일일 성적 분석 (수강생 개인 뷰)
날짜 선택 → 해당 날짜 본인 성적 상세

- **시험 정보**: 시험일자, 시험과목, 만점, 응시인원, 전체 평균, 상위 10%, 상위 30%, 최고점
- **수험생 정보**: 시험일자, 응시직렬, 이름, 수험번호, 석차(N위/전체)
- **직렬 내 경쟁자 분석 막대 차트**: 최고점 / 내 점수 / 상위 10% / 상위 30%
- **과목별 위치 분석 테이블**: 내 점수, 백분율(%), 내 석차, 최고점, 상위 10% 평균
- **과목별 성취도 레이더 차트**: 내 점수(파랑) vs 응시자 평균(녹색)
- **문항 채점표** (과목 탭 전환):
  - 총 문항수 / 정답수 / 오답수 / 정답률 요약
  - 문항, 과목, 정답, 학생답안, 정오표(O/X), 해당 문항 정답률(%), 난이도
- **오답률 TOP5** (과목별): 문항번호, 정답률, 오답률, 나의 결과

#### F-15-B. 월별 성적 분석 (수강생 개인 뷰)
연월 선택 → 해당 월 종합 분석

- **수험생 정보**: 응시직렬, 시험명, 이름, 수험번호, 응시율
- **전체 성적분석 테이블**:
  | 과목명 | 내 평균 | 내 석차/응시인원 | 전체평균 | 상위 10% | 상위 30% |
- **과목별 성취도**: 레이더 차트 + 우수/보통/미흡 평가
- **과목별 평균성적 막대 그래프**: 내 성적 vs 응시자 평균

#### F-15-C. 과목별 성적 분석 (수강생 개인 뷰)
과목 탭 선택 → 해당 과목 전체 회차 추이

- **회차별 성적 테이블**: 일시, 응시인원, 전체 평균, 상위 10%, 상위 30%
  - 내 점수를 별도 컬럼으로 표시
- **회차별 성적 변화 꺾은선 그래프**:
  - 전체 평균(녹색), 상위 10%(노랑), 상위 30%(빨강), **내 점수(파랑)** 4선 표시
  - 목표 점수 설정 시 목표선(점선 회색)도 함께 표시

#### F-15-D. 오답 노트 (수강생 포털)
- **경로**: `/student/wrong-notes`
- **목적**: 수강생이 틀린 문제를 저장하고 메모하며 자기주도 복습 지원

```
기능:
- 일일 성적 분석(F-15-A) 문항 채점표에서 오답 문항 옆 "노트 저장" 버튼
- 저장 시 WrongNoteBookmark 생성 (문항번호, 과목, 정답, 정답률, 내 답안 함께 저장)
- /student/wrong-notes 목록:
  ┌ 날짜 ┬ 과목 ┬ 문항번호 ┬ 내 답 ┬ 정답 ┬ 정답률 ┬ 메모 ┬ 삭제 ┐
  - 과목 탭 필터 (전체 / 형법 / 형소법 / 경찰학 / 헌법)
  - 날짜 범위 필터
  - 메모 입력/수정 (인라인 편집)
  - 개별 삭제 / 전체 삭제
- 오답 노트는 수강생 본인만 열람 가능 (관리자 열람 불가)
```

---

### F-16. 감사 로그 (Audit Log)
- **경로**: `/admin/audit-log`
- **권한**: SUPER_ADMIN만 열람 가능
- 성적 변경, 탈락 상태 수동 조정, 포인트 지급 등 모든 데이터 변경 이력 기록
- **조회 필터**: 날짜 범위, 작업자(관리자 계정), 작업 종류(SCORE_UPDATE 등), 수강생
- **목록 컬럼**: 일시, 작업자, 작업 종류, 대상(학생명+수험번호), 변경 전, 변경 후
- 변경 전/후 상세 보기: 클릭 시 JSON diff 모달 표시
- 삭제/수정 불가 (읽기 전용)

---

### F-17. 데이터 내보내기 (CSV / xlsx)
- **경로**: `/admin/export`
- 내보내기 항목별 개별 다운로드:

| 내보내기 항목 | 형식 | 필터 옵션 |
|--------------|------|-----------|
| 수강생 명단 | xlsx + csv | 공채/경채, 활성/비활성, 기수 |
| 전체 성적 raw | xlsx + csv | 기간 선택, 공채/경채 |
| 주간 성적 집계 | xlsx + csv | 기간 + 주차 선택 |
| 월별 성적 집계 | xlsx + csv | 연월 선택 |
| 포인트 지급 이력 | xlsx + csv | 기간 선택 |
| 알림 발송 이력 | xlsx + csv | 날짜 범위 |
| 감사 로그 | xlsx + csv | 날짜 범위 |

- **한글 인코딩**: xlsx는 기본, CSV는 UTF-8 BOM (`﻿`) 포함 (Excel에서 깨짐 방지)
- **파일명 규칙**: `수강생명단_2026-03-07.xlsx` 형태로 날짜 자동 포함

---

### F-18. 기존 엑셀 데이터 마이그레이션 도구
- **경로**: `/admin/migration`
- **목적**: 기존 Excel 운영 데이터를 DB로 1회성 이전
- **권한**: SUPER_ADMIN만 접근

```
마이그레이션 흐름:
단계 1. 마이그레이션 유형 선택
        ① 수강생 명단 마이그레이션
        ② 성적 데이터 마이그레이션
단계 2. 엑셀 파일 업로드 (.xlsx)
단계 3. 열 매핑 UI:
        파일의 열 → 시스템 필드 매핑 (드래그 or 드롭다운)
        예) A열(학번) → examNumber, B열(성명) → name
단계 4. 파싱 결과 미리보기 (상위 20행)
        - 유효/무효 행 분류 (수험번호 중복, 필수값 누락 등)
단계 5. "DB 저장" 버튼 → 유효 행만 일괄 upsert
단계 6. 결과 리포트: 성공 N건 / 실패 N건 / 건너뜀 N건
```

- 마이그레이션 실행 이력 AuditLog에 자동 기록
- 잘못 실행 시 마이그레이션 취소(롤백) 기능 제공

---

### F-19. 수강생 포털 공지사항
- **관리자 경로**: `/admin/notices`
- **수강생 경로**: `/student/notices`

**관리자 기능**:
- 공지 작성 (제목, 내용 rich text 또는 마크다운)
- 대상 설정: 전체 / 공채 수강생만 / 경채 수강생만
- 발행/비발행 토글 (임시저장 → 발행)
- 발행 시 알림톡 일괄 발송 여부 선택

**수강생 포털 공지 목록**:
- 최신순 정렬, 제목+날짜 목록
- 수강생의 examType 기준으로 해당 공지만 표시 (전체 + 본인 직렬 공지)
- 미읽음 뱃지 (새 공지 강조)

---

### F-20. 출결 현황 캘린더 뷰
- **경로**: `/admin/attendance/calendar`
- 월 달력 형태로 수강생 전체 출결 현황 시각화

```
캘린더 셀 (날짜별):
┌──────────────────────────────┐
│ 3월 10일 (화)                │
│ 형법 / 공채                  │
│ 현장 120명 · 온라인 30명     │
│ 불참 15명 ⚠️ 경고3 🔴탈락1  │
└──────────────────────────────┘
```

- 취소된 날짜는 회색 처리 + "취소" 표시
- 날짜 클릭 → 해당 날짜 성적 상세 팝업 (응시 유형별 명단, 점수 요약)
- 공채/경채 탭 전환
- 탈락 발생 날짜: 빨간 하이라이트

---

## 7. UI/UX 요구사항

### 7-1. 디자인 시스템 원칙

| 원칙 | 상세 규칙 |
|------|-----------|
| **반응형** | 모바일 우선(Mobile First). 관리자 PC + 학생 포털 모바일 모두 최적화 |
| **그림자 없음** | `box-shadow: none`, `drop-shadow: none` 전면 금지. 모든 카드/컴포넌트에 그림자 효과 사용 불가 |
| **사각형 디자인** | `border-radius: 0` 전면 적용. 버튼, 카드, 입력창, 테이블, 뱃지 등 모든 요소 직각 처리 |
| **메인 색상** | Primary Blue `#1B4FBB` (경찰 계열 블루). 헤더, 주요 버튼, 활성 탭, 강조 텍스트에 사용 |
| **테이블 스타일** | 1px solid 테두리, 셀 내부 패딩 minimal, 헤더 배경 `#1B4FBB` + 흰 글씨, 행 hover 시 `#EBF0FB` |
| **폰트** | Noto Sans KR (한국어 기본), 숫자 데이터는 tabular-nums |

### 7-2. 컬러 팔레트 (Tailwind Config)

```js
// tailwind.config.js
colors: {
  primary:         '#1B4FBB',   // 메인 블루 (버튼, 헤더, 활성 탭)
  'primary-dark':  '#153D91',   // 호버 상태
  'primary-light': '#EBF0FB',   // 행 hover, 선택 배경
  'primary-muted': '#6B8ED6',   // 비활성 탭, 보조 텍스트

  // 상태 색상
  success:         '#16A34A',   // 정상 / 개근
  warning:         '#D97706',   // 경고
  danger:          '#DC2626',   // 탈락 / 에러
  'warn-light':    '#FEF3C7',
  'danger-light':  '#FEE2E2',

  // 중립
  gray: {
    50:  '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    700: '#374151',
    900: '#111827',
  }
}
```

### 7-3. 공통 컴포넌트 명세

#### 버튼
```
Primary  : bg-primary text-white border border-primary rounded-none px-4 py-2 font-semibold
           hover: bg-primary-dark
Secondary: bg-white text-primary border border-primary rounded-none px-4 py-2
Danger   : bg-danger text-white border border-danger rounded-none px-4 py-2
Disabled : bg-gray-200 text-gray-400 cursor-not-allowed
크기     : 주요 액션 버튼 최소 h-10 (모바일 터치 친화)
```

#### 카드 / 패널
```
border        : 1px solid #D1D5DB (gray-300)
border-radius : 0  ← 절대 rounded 사용 금지
padding       : p-4 (모바일) / p-6 (PC)
background    : white
shadow        : none  ← 절대 사용 금지
```

#### 입력 필드 / Select
```
border        : 1px solid #D1D5DB
border-radius : 0
focus         : outline 2px solid #1B4FBB (ring-primary)
height        : h-9 ~ h-10
```

#### 테이블
```
전체 테두리 : 1px solid #D1D5DB
헤더 행     : bg-[#1B4FBB] text-white font-semibold, border 1px solid #153D91
데이터 행   : bg-white, border 1px solid #E5E7EB (x/y 모두)
홀수 행     : bg-gray-50 (zebra stripe)
hover 행    : bg-[#EBF0FB]
고정 열     : sticky, bg-white, z-index 적절히
숫자 정렬   : text-right tabular-nums
셀 패딩     : px-3 py-2 (compact)
```

#### 탭 (공채/경채, 전체/신규생 구분 등)
```
활성 탭          : bg-primary text-white border-b-0
비활성 탭        : bg-white text-primary-muted border border-gray-300
border-radius    : 0
탭 컨테이너 하단 : 1px solid gray-300으로 연결
```

#### 상태 뱃지
```
탈락  : bg-danger text-white px-2 py-0.5 text-xs rounded-none
경고  : bg-warning text-white px-2 py-0.5 text-xs rounded-none
정상  : bg-success text-white px-2 py-0.5 text-xs rounded-none
신규생: bg-primary-light text-primary border border-primary px-2 py-0.5 text-xs rounded-none
```

### 7-4. 반응형 레이아웃

#### PC 레이아웃 너비 정책 (1920px 기준)

> 전역 max-width를 1200px로 고정하지 않는다.
> 이 시스템의 핵심은 300명 × 다수 열 테이블이므로, 화면 유형별로 너비를 다르게 적용한다.

```
전체 레이아웃 구조:
┌──────────┬──────────────────────────────────────────┐
│ sidebar  │            content area                  │
│  240px   │  calc(100vw - 240px)  ← 전역 제한 없음   │
└──────────┴──────────────────────────────────────────┘

화면 유형별 콘텐츠 최대 너비:

① 대용량 테이블 페이지 (주간현황, 전체성적, 탈락관리, 다차원조회)
   → w-full, 전역 max-width 없음
   → 열이 많을 경우 overflow-x-auto + 수험번호/이름 열 sticky

② 대시보드 / 성적 분석 차트
   → max-w-[1400px] mx-auto
   → 1920px 화면에서 양옆 여백 확보, 차트 가독성 최적

③ 폼 / 설정 / 공지 작성 / 사유서 / 면담 기록
   → max-w-[800px] mx-auto
   → 입력폼이 너무 넓으면 눈 이동 불편 → 적정 너비 유지

④ 수강생 포털 (모바일 기준 설계)
   → max-w-[640px] mx-auto
   → 성적 조회/오답 노트 등 좁게 집중
```

#### 브레이크포인트별 레이아웃

```
모바일 (< 768px):
  - 사이드바 → 하단 네비게이션 바 (주요 5개 메뉴)
  - 넓은 테이블 → 가로 스크롤 (overflow-x-auto + 성명/수험번호 열 sticky)
  - 카드 그리드 → 1열 스택
  - 성적 분석 탭 → 드롭다운 Select로 대체

태블릿 (768px ~ 1024px):
  - 사이드바 접힘 (아이콘만 표시), 클릭 시 expand
  - 테이블 보조 열 숨김 (핵심 열만 표시)
  - 카드 그리드 → 2열

PC (1024px ~ 1440px):
  - 사이드바 항상 펼침 (240px 고정)
  - 전체 열 테이블 표시
  - 카드 그리드 3열

와이드 PC (> 1440px, 1920px 포함):
  - 사이드바 240px 고정 유지
  - 테이블: 남은 공간 전부 활용 (w-full)
  - 대시보드/폼: 중앙 정렬 + 유형별 max-width 적용
  - 카드 그리드 4열
```

### 7-5. UX 원칙

- 비개발자 담당자도 즉시 사용 가능한 직관적 UI
- 성적 입력: 단계별 명확한 안내 (Step 1 → 2 → 3 → 반영)
- 주요 버튼: 크고 명확 (최소 h-10, 터치 영역 확보)
- 위험 액션(삭제, 덮어쓰기): 반드시 확인 모달
- **공채/경채 구분**: 모든 주요 화면에 탭으로 명확히 구분 (탭 전환 시 URL 파라미터 반영)
- 한국어 에러 메시지, 성공/실패 토스트 알림 (화면 우상단, 3초 후 자동 닫힘)
- 로딩 상태: 스켈레톤 UI (spinner 최소화)
- 빈 데이터 상태: 안내 문구 + 액션 버튼 표시

---

## 8. 화면 구조 (라우트 맵)

```
/                                         → /admin/dashboard 리다이렉트
/admin/dashboard                          → 대시보드 (메인)
/admin/periods                            → 시험 기간 관리
/admin/periods/new                        → 새 기간 생성
/admin/students                           → 수강생 목록 (공채/경채 탭)
/admin/students/paste-import              → 붙여넣기 일괄 등록
/admin/students/[examNumber]              → 수강생 상세/수정
/admin/students/[examNumber]/history      → 전체 기간 성적 이력
/admin/students/[examNumber]/analysis     → 개인 성적 분석
/admin/scores/input                       → 성적 입력
/admin/weekly                             → 주간 현황 그리드
/admin/dropout                            → 탈락/경고 관리
/admin/absence-notes                      → 사유서 관리
/admin/results/monthly                    → 월별 성적 집계/공지
/admin/results/integrated                 → 통합(2개월) 성적 집계
/admin/points                             → 포인트 관리
/admin/query                              → 다차원 조회
/admin/notifications                      → 알림 발송 및 이력
/admin/analytics                          → 성적 분석 차트
/admin/counseling                         → 학생 면담 지원
/admin/settings                           → 시스템 설정
/admin/settings/accounts                  → 관리자 계정 관리 (F-00)
/admin/audit-log                          → 감사 로그 (F-16)
/admin/export                             → 데이터 내보내기 CSV/xlsx (F-17)
/admin/migration                          → 기존 엑셀 마이그레이션 (F-18)
/admin/notices                            → 공지사항 관리 (F-19)
/admin/attendance/calendar                → 출결 캘린더 뷰 (F-20)
/student                                  → 수강생 포털 메인
/student/notices                          → 공지사항 (F-19)
/student/wrong-notes                      → 오답 노트 (F-15-D)
```

---

## 9. API 엔드포인트 명세

```
# 시험 기간
GET    /api/periods
POST   /api/periods
PUT    /api/periods/[id]
PUT    /api/periods/[id]/activate

# 수강생
GET    /api/students?examType=GONGCHAE|GYEONGCHAE&search=&generation=
POST   /api/students
PUT    /api/students/[examNumber]
DELETE /api/students/[examNumber]       → 비활성화
GET    /api/students/[examNumber]/scores
POST   /api/students/paste-import       → 붙여넣기 일괄 등록

# 성적
GET    /api/scores?periodId=&examType=&week=&subject=&examNumber=&date=
POST   /api/scores/bulk                 → 일괄 입력 (성적 반영)
POST   /api/scores/upload/offline       → 오프라인 채점 파일(XLS) 파싱 + 미리보기
POST   /api/scores/upload/online        → 온라인 채점 파일(HTML-XLS) 파싱 + 미리보기
PUT    /api/scores/[id]
DELETE /api/scores/[id]

# 집계 (studentType 파라미터로 전체/신규생 구분)
GET    /api/aggregate/weekly?periodId=&examType=&week=&studentType=ALL|NEW
GET    /api/aggregate/monthly?periodId=&examType=&year=&month=&studentType=ALL|NEW
GET    /api/aggregate/integrated?periodId=&examType=&studentType=ALL|NEW
GET    /api/aggregate/dropout?periodId=&examType=

# 포인트
GET    /api/points?examNumber=&periodId=
POST   /api/points/grant               → 포인트 지급
GET    /api/points/attendance-check?periodId=&year=&month=  → 개근 대상자 자동 추출

# 사유서
GET    /api/absence-notes
POST   /api/absence-notes
PUT    /api/absence-notes/[id]

# 알림
POST   /api/notifications/send
GET    /api/notifications/logs

# 면담
GET    /api/counseling?examNumber=
POST   /api/counseling
PUT    /api/counseling/[id]

# 학생 포털
POST   /api/student/lookup             → 수험번호+이름으로 본인 성적 조회
GET    /api/student/wrong-notes        → 오답 노트 목록
POST   /api/student/wrong-notes        → 오답 노트 저장
PUT    /api/student/wrong-notes/[id]   → 메모 수정
DELETE /api/student/wrong-notes/[id]   → 삭제

# 관리자 인증 (Supabase Auth 기반)
GET    /api/admin/me                   → 현재 로그인 관리자 정보
GET    /api/admin/accounts             → 관리자 목록 (SUPER_ADMIN만)
POST   /api/admin/accounts/invite      → 새 관리자 초대
PUT    /api/admin/accounts/[id]/role   → 역할 변경
DELETE /api/admin/accounts/[id]        → 비활성화

# 감사 로그
GET    /api/audit-log?admin=&action=&date=&examNumber=

# 데이터 내보내기
GET    /api/export/students?examType=&format=xlsx|csv
GET    /api/export/scores?periodId=&examType=&format=xlsx|csv
GET    /api/export/points?periodId=&format=xlsx|csv
GET    /api/export/audit-log?date=&format=xlsx|csv

# 마이그레이션
POST   /api/migration/students/preview  → 파싱 미리보기
POST   /api/migration/students/execute  → DB 저장 실행
POST   /api/migration/scores/preview
POST   /api/migration/scores/execute

# 공지사항
GET    /api/notices?targetType=&published=
POST   /api/notices
PUT    /api/notices/[id]
DELETE /api/notices/[id]
PUT    /api/notices/[id]/publish

# 출결 캘린더
GET    /api/attendance/calendar?periodId=&examType=&year=&month=
```

---

## 10. 외부 연동

### 카카오 알림톡 (Solapi)
- 서비스: [Solapi](https://solapi.com) 가입 + 카카오 채널 연결 필요
- 알림톡 템플릿 사전 등록 필요 (카카오 비즈니스 채널 심사 **1~2주 소요 → 개발 전 미리 신청**)
- 알림톡 실패 시 SMS 자동 폴백

### Supabase Storage (파일 저장)
```
버킷 구조:
  exam-files/      → 시험지 PDF, 해설지 PDF
                     접근 권한: 관리자 업로드 / 인증된 수강생 다운로드

파일명 규칙:
  exam-files/{sessionId}_exam.pdf
  exam-files/{sessionId}_solution.pdf
```

---

## 11. 환경변수 목록

```env
# Supabase
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Solapi (알림톡/SMS)
SOLAPI_API_KEY=xxx
SOLAPI_API_SECRET=xxx
SOLAPI_SENDER_NUMBER=010xxxxxxxx
SOLAPI_KAKAO_CHANNEL_ID=xxx

# 앱
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
```

---

## 12. 향후 확장 검토 기능 (현재 개발 범위 외)

| 기능 | 설명 | 예상 시점 |
|------|------|---------|
| 알림 템플릿 편집기 | 알림 메시지를 UI에서 직접 수정 | Phase 4 포함 가능 |
| QR 체크인 | 시험 시작 전 QR 스캔으로 출석 자동 기록 | 별도 프로젝트 |
| 면담 일정 리마인더 | 다음 면담일 D-1 알림 자동 발송 | Phase 5 포함 가능 |
| 학부모 알림 | 보호자 연락처에 경고/탈락 동시 발송 | 요구사항 확정 후 |
| 알림 예약 발송 | 월말 성적 공지 발송 일시 예약 | 별도 검토 |

---

## 13. 개발 Phase 계획

> 운영 전환 가능 기준: Phase 1~3 완료 시 실제 성적 관리 가능
> Phase 4~6은 운영 중 순차 추가

### Phase 1 - 기반 구축 + 인증 + 마이그레이션
- [ ] Next.js 14 + Supabase + Prisma 프로젝트 설정
- [ ] DB 스키마 전체 마이그레이션 (공채/경채, 신규생/기존생 구분 포함)
- [ ] 관리자 인증 + 역할 기반 접근 제어 (F-00, Supabase Auth)
- [ ] 기존 엑셀 데이터 마이그레이션 도구 (F-18) — 수강생 명단 이전 필수

### Phase 2 - 핵심 데이터 입력
- [ ] 시험 기간 + 회차 관리 (F-01, 취소/연기 처리 포함)
- [ ] 수강생 CRUD + 붙여넣기 등록 (F-02, F-02-B)
- [ ] 오프라인 채점 파일 파싱 SheetJS (F-03-A)
- [ ] 온라인 채점 파일 파싱 cheerio (F-03-B)
- [ ] 직접 붙여넣기 입력 (F-03-C)
- [ ] 데이터 내보내기 CSV/xlsx (F-17) — 수강생 명단 + 성적 raw 다운로드

### Phase 3 - 집계 + 판정 + 대시보드
- [ ] 주간현황 그리드 (F-04)
- [ ] 탈락/경고 자동 판정 (F-05) — 주 3회 + 월 8회 이중 기준
- [ ] 주차별/월별/통합 성적 집계 (F-05-B, F-06, F-07)
- [ ] 신규생/기존생 석차 분리 (전 집계 화면)
- [ ] 포인트 관리 (F-11)
- [ ] 출결 캘린더 뷰 (F-20)
- [ ] 대시보드 핵심 요약 (F-12)

### Phase 4 - 알림 + 사유서 + 보안
- [ ] 알림톡/SMS 연동 + 수신 동의 체크 (F-09, Solapi)
- [ ] 사유서 관리 (F-10)
- [ ] 다차원 조회 (F-08)
- [ ] 감사 로그 (F-16)

### Phase 5 - 분석 + 면담 + 공지
- [ ] 성적 분석 차트 (F-13) — 일일/월별/과목별/개인
- [ ] 학생 면담 지원 + 목표 점수 설정 (F-14)
- [ ] 수강생 포털 공지사항 (F-19)

### Phase 6 - 수강생 포털 완성
- [ ] 수강생 포털 성적 조회 (F-15-A, B, C)
- [ ] 오답 노트 (F-15-D)
- [ ] UI 반응형 최적화 + 한국어 폰트 최종 점검
- [ ] E2E 검증 (전체 시나리오 테스트)

---

## 14. 검증 기준

**파일 파싱 검증**
1. 오프라인 XLS: "학번(정정)" 값 있으면 우선 사용, "주관식추가점수" → oxScore 저장
2. 온라인 HTML-XLS: cheerio 파싱 성공, 수강자ID → onlineId 매칭
3. 온라인 경찰학 OX 파일: 별도 업로드 후 rawScore에 합산 처리
4. 미매칭 수험번호/수강자ID: 관리자 수동 지정 화면 정상 작동

**석차 계산 검증**
5. 신규생 별도 석차: 신규생(StudentType=NEW)끼리만 RANK 계산 확인
6. 전체 석차: 신규생 + 기존생 통합 RANK 확인
7. 공채/경채 성적/석차 완전 분리 확인
8. 주차별, 월별, 통합 각각 석차 계산 정확성

**탈락 판정 검증**
9. 주 3회 불참 → 탈락 + 다음 달 복귀 가능일 계산
10. 월 8회 누적 불참 → 탈락 판정 (주차 기준 미달해도 월 누적으로 탈락)

**포인트/개근 검증**
11. 개근 판정: ABSENT=0인 학생만 10,000P 대상 추출
12. 온라인 응시자: 성적 장학 제외, 개근 포인트 포함 확인

**성능 + 기타**
13. 300명 기준 주간현황 그리드 3초 이내 로딩
14. 알림톡 실패 시 SMS 폴백 동작 확인

---

## 15. 참고: 기존 엑셀 파일

**파일명**: `1월 아침모의고사 기본이론반_전체성적.xlsx`

- **시트 1~6 (NEW, VBA 설계본)**: 📋수강생명단_NEW, 📊주간현황, 📥성적붙여넣기, 🚨탈락관리, 🏆전체성적
- **시트 7~끝 (실제 운영 원본)**: 수강생명단, 1주차~5주차 채점 데이터, 성적입력란, 주간성적, 탈락자관리, 전체성적

**마이그레이션 우선 참고**: 시트 7~끝의 실제 운영 데이터 구조 기준으로 마이그레이션 후, 시트 1~6의 자동화 로직을 서버사이드로 구현.

---

## 16. ⚠️ 개발 시 주의사항

1. **공채/경채 분리**: 수강생 등록부터 성적 입력, 석차 계산, 포인트 지급까지 모든 단계에서 examType 기준으로 완전 분리
2. **LIVE 응시자 석차 제외**: 석차 RANK 계산 시 NORMAL 응시 기록 있는 수강생만 포함. LIVE 전용 수강생은 석차 컬럼 "-" 표시
3. **경고 주차별 독립 평가**: 경고는 매주 리셋되어 독립 판정. 누적 상향 없음. 탈락만 월 누적(8회) 이중 체크
4. **예비군 자동 개근 인정**: absenceCategory="MILITARY" 승인 시 attendGrantsPerfectAttendance=true 자동 설정
5. **개근 계산 시 EXCUSED 처리**: attendGrantsPerfectAttendance=true인 사유서만 개근 인정 (false면 불참으로 간주)
6. **RANK() 동점 처리**: SQL RANK() 사용 (1, 1, 3 방식). DENSE_RANK() 사용 금지
7. **탈락 기준 이중 체크**: 주차 기준(3회) + 월 누적 기준(8회) 모두 체크
8. **복귀 가능일**: 기본값은 다음 달 1일이나 관리자가 조정 가능하도록 구현
9. **사유서 마감**: 시험 종료 후 사유서 접수 불가 → 시험 날짜 기준으로 등록 기간 제한 UI 필요
10. **수험번호 PK 정정**: 수험번호가 잘못 입력된 경우 CASCADE UPDATE 또는 새 수험번호로 데이터 이전 + 구 수험번호 비활성화 처리 필요 (단순 PK 변경 불가)
11. **비활성화 학생 석차**: isActive=false 수강생은 석차 계산에서 제외
12. **카카오 알림톡 심사**: 개발 착수 전 템플릿 사전 심사 신청 필수 (1~2주 소요)
13. **경찰학 점수 정규화**: 석차·평균 계산 시 finalScore(최대 200점)를 2로 나눠 100점 환산. 그리드 표시는 원점수(finalScore) 사용
14. **누적 모의고사(목요일, CUMULATIVE)**: 개별 과목 평균 계산에서 제외하되 불참 계산·주간평균에는 포함
15. **요일별 과목 순서 고정**: 월=경찰학, 화=헌법(공채)/범죄학(경채), 수=형소법, 목=누적, 금=형법 → 기간 생성 시 자동 배치 로직에 반영
