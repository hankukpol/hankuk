# 시간통제 자습반 성적 분석 구현 계획

작성일: 2026-09-08 (4차 개정 — 운영 인터뷰 반영: 아침 시험 종류 통합, 회차 제거, 권한·공개 범위 확정)
대상 앱: `apps/study-hall`
참고 프로그램: `G:\앱 프로그램\정기모의고사 성적` (Google Apps Script, `Code.gs` `getScoreAnalysis_`)
입력 파일 표본:
- 아침: `모의고사채점표-2026-09-08-20-17-19.xls`, `문항분석표-2026-09-08-20-44-41.xls` (헌법, 203명)
- 정기: `모의고사채점표-2026-09-08-20-53-51.xls`, `문항분석표-2026-09-08-20-53-56.xls` (2026-08-15, 320명)

---

## 1. 배경과 목표

| | 아침 모의고사 | 정기 모의고사 |
|---|---|---|
| 주기 | 매일 | 월 1회 |
| 범위 | 진도별 | 전범위 |
| 구성 | 과목당 20문항 × 5점 = 100점 | 100문항 × 2.5점 = **250점** (헌법 **또는** 범죄학 20 + 형사법 40 + 경찰학 40) |
| 난이도 | 학습 확인용 | **실제 시험과 동일** |
| 역할 | 진도 이해도·꾸준함 | **합격 가능성을 가장 정확히 보여주는 지표** |

채점 시스템이 매번 내주는 **채점표·문항분석표 두 파일을 그대로 가져와서**, 각 시험 성격에 맞는 분석을 관리자와 학생에게 제공한다.

**확정된 결정**
1. 문항 분석 파일은 항상 있다 → 문항 단위 데이터가 모델의 중심.
2. **예측권역(합격확실권 등)은 만들지 않는다.**
3. 하락 감지 기준은 일반 시험 기준 기본값 + `division_settings`에서 수정 가능.
4. 경찰 수험번호는 **무조건 5자리** → 앱 `studentNumber`와 직접 매칭.

**운영 인터뷰로 확정된 사실 (2026-09-08)**

| 항목 | 확정 내용 | 설계 영향 |
|---|---|---|
| 공채·경채 시험지 | **같은 시험지**. 헌법(공채)·범죄학(경채)만 다르다 | 아침 시험 종류를 **하나로 통합**하고 헌법·범죄학을 택1 그룹으로. 정기와 같은 구조 |
| 아침 시험 빈도 | **하루 1과목, 요일별 순환** | 하루 파일 한 쌍. 일괄 업로드 불필요 |
| 누적모의고사 | **주 1회** (예: 금요일) | 주간 단위로 진도 평균 대비 누적 점수 비교 |
| 정기 회차 | **회차 개념 없음, 날짜로 구분** | `examRound` 입력을 없애고 날짜를 키로. 충돌·자동 증가 문제 소멸 |
| 잘못된 가져오기 | **목록에서 삭제** | 가져오기 이력 화면 + 세션 삭제 기능 필요 |
| 분석 화면 권한 | **관리자만** (조교 제외) | `["ADMIN","SUPER_ADMIN"]` 유지 |
| 학생 문항 공개 | **전체 채점표까지** | 학생도 문항별 정답·내 답·O/X·정답률 전부 열람 |
| 학생 외부 석차 | **석차 + 상위% 모두 공개** | 외부 집단(200~320명) 기준 위치를 학생에게 노출 |
| 하락 표시 위치 | **성적 분석 화면 안에만** | 경고 대상자·대시보드에 성적 신호를 넣지 않는다 |
| 아침 하락 판정 단위 | **과목별** | 요일 순환이라 한 과목은 주 1회. 과목별 시계열로 판정 |
| 진도 라벨 | **매일 입력 가능** | 단원별 취약 분석을 정식 기능으로 |
| 사용 시점 | **새 학기 시작부터** | 과거 데이터 소급 없음. 첫 달 빈 상태 설계 필요 |

## 2. 입력 파일 형식 (두 표본으로 확정)

두 파일 모두 **BIFF `.xls`**(구형 Excel). `exceljs`는 이 형식을 읽지 못한다(§8.1).

### 2.1 채점표 — `Score` 시트

| 시험 | 열 |
|---|---|
| 아침 | 수험번호 · 성명 · 응시분야 · 지원지역 · 생년월일 · **객관식** · 주관식 |
| 정기 | 수험번호 · 성명 · 응시분야 · 지원지역 · 생년월일 · **헌법/범죄학 · 형사법 · 경찰학 · 총점** |

- 아침은 과목이 하나라 총점 한 열, 정기는 **과목별 점수 열**이 있다. `헌법/범죄학`은 공채·경채 택1 과목을 한 열에 합친 것.
- 응시자 전원(아침 203, 정기 320). 자습반 학생은 이 중 일부다.
- 수험번호는 5자리. 정기 표본에 빈칸 4·4자리 1·2자리 1의 **불량 행**이 있다 → 건너뛰고 미리보기에 표시.
- `응시분야` 값은 0/1/2/4/5로 의미가 불투명하다. **공채·경채 판별에 쓰지 않는다**(§8.3).
- `지원지역`은 전원에게 있다(17·10·4·2…). 지역별 비교가 가능하다(§5.2).

### 2.2 채점표 — `Errata` 시트

- 학생마다 **3행 블록**: ① 정답 키(전원 동일) ② 학생 답안 ③ O/X.
- 문항 열 헤더는 **과목마다 1부터 다시 시작**한다. 정기: `1~20 | 1~20 | 1~40 | 1~40` = 120열. 아침: `1~20` + 여백 10열.
- **열 블록의 과목 순서는 문항분석표의 과목 순서와 다르다.** 정기 표본: Errata는 `헌법 → 범죄학 → 형사법 → 경찰학`, 문항분석표는 `헌법 → 범죄학 → 경찰학 → 형사법`. 위치로 매핑하면 형사법·경찰학 점수가 뒤바뀐다. **정답 키 대조로 매핑한다**(§8.3).
- 정기에서 학생이 안 본 택1 과목 블록은 ②가 비어 있고 ③은 **전부 X**로 채워져 있다. 그대로 세면 20문항 오답이 된다 → 반드시 제외.
- 복수정답 `3,4`(아침 표본), 복수 선택 `2,4`, 무응답 빈칸이 있다. 정오는 ③을 신뢰한다.
- 실제 문항 수 = 정답 키 행에서 값이 있는 열 수.

### 2.3 문항분석표 — `Moon` 시트

```
r1: 시험일자 | 2026-08-15 | · | 과목명 | 경찰학, 형사법, 범죄학, 헌법 | · | · | 응시인원 | 320 명
r3: 문항번호 | 정답 | 최다오답선택지 | 1 | 2 | 3 | 4 | 기타 | 정답률(%) | 과목명
r4: 1 | 2 | 3 | 6.1% | 67.8% | 19.9% | 4.1% | 1.9% | 67.8% | 헌법
```
- 문항별 정답률·답지반응률·최다오답·**과목명**. 문항번호는 과목마다 1부터.
- **배점 열이 없다** → 배점은 앱의 `ExamSubject.pointsPerItem`에서 온다.
- 아침 표본은 21~25행이 여백(정답 없음). 정답 없는 행은 버린다.

### 2.4 재현 검증 결과

정기 표본 320명 중 정상 309명에 대해 **문항 O 개수 × 2.5 = 채점표 과목 점수**가 전원 일치(0건 불일치). 따라서:
- 문항 데이터로 과목 점수·총점을 **정확히 재구성**할 수 있고, 수기 입력이 사라진다.
- 정기 배점은 **전 과목 2.5점**이다. 헌법도 20문항 × 2.5 = 50점.

나머지 11명은 택1 과목 블록에 답이 없거나(일부 과목 미응시), 전 과목 0점(결시)이다 → "일부 미응시"로 표시하고 응답 있는 과목만 저장한다.

### 2.5 이 형식이 설계에 주는 의미

- **응시 집단이 200~320명이다.** 참고 프로그램의 "전체 응시자 비교"가 파일로 주어진다. 자습반 내부(20~30명) 표본 문제가 사라진다.
- 분석은 **두 층**: ① 외부 집단(파일 전원) 대비 ② 자습반 내부(매칭 학생) 대비.
- 파일의 `지원지역`으로 **지역 비교**(참고 프로그램 기능)를 되살릴 수 있다. 집계값만 저장한다.

## 3. 앱 현재 상태와 **바로잡을 설정 오류**

- `ExamType` + `ExamSubject(totalItems, pointsPerItem)`, `ExamScore(scores Json)`, `MorningExamScore`, `ScoreTarget` 존재. 성적 입력은 수기(`saveExamScores`).
- `Student.studentNumber` 자유 문자열. 경찰은 5자리로 통일한다(결정 4).
- `recharts ^3.8`, 색 토큰 `--admin-chart-1~6`.
- 운영 DB 성적 데이터 전 지점 **0건**.

**설정 오류 (Phase 1에서 수정)**

| 항목 | 현재 (운영 DB) | 실제 | 조치 |
|---|---|---|---|
| `정기 모의고사 / 헌법` | 20문항 × **5점** = 100 (총 300점) | 20 × **2.5** = 50 (총 **250점**) | `points_per_item` 2.5로 수정 |
| `정기 모의고사` 경채 과목 | 없음 (헌법만) | 경채는 **범죄학** | 범죄학 추가 + 택1 그룹 지정 |
| 아침 시험 종류 | `(공채)`·`(경채)` **2개**, 형사소송법·형법·경찰학·누적모의고사가 **양쪽에 중복** | 공채·경채가 **같은 시험지**를 본다 | **하나로 통합**. 헌법·범죄학만 택1 그룹, 나머지 4과목은 공통 |

**아침 시험 종류를 통합해야 하는 이유.** 두 종류의 `study_track`이 모두 `"경찰"`이고 지점 직렬 목록도 `["경찰"]` 하나뿐이라, 앱은 공채·경채 학생을 **구분하지 못한다**(`isStudentEligible`은 `student.studyTrack === examType.studyTrack`만 본다). 어느 날 형법 파일이 오면 어느 종류로 넣어도 절반이 잘못 기록되고, 경채 학생의 범죄학은 경채 종류에 형법은 공채 종류에 흩어져 **주간 석차와 추세가 깨진다.** 성적 데이터가 0건인 지금이 통합 비용이 가장 낮다.

## 4. 참고 프로그램에서 가져올 것 / 버릴 것

| 항목 | 규칙 | 처리 |
|---|---|---|
| 석차 | 동점자 동일 석차, 다음 석차 건너뜀 (1,1,3) | 가져옴 |
| 상위 % · 백분위 | `rank/n×100` · 동점 보정 `(아래+0.5×동점)/n×100` | 가져옴 |
| 과목 성취도 판정 | n<10 성취율(80/60), n≥10 상위%(30/60) → 우수/보통/취약 | 가져옴 (외부 n 기준) |
| 과목 균형 | 만점 정규화 점수 표준편차 `<7/<12/<18` | 가져옴 |
| 상위 10%·30% 평균 · 성적 분포 · 익명 경쟁자 | | 가져옴 |
| **지역 비교** | 지원지역별 석차·평균·상위10% | **되살림** (파일에 지역이 있음) |
| 문항 분석 | 정답률·난이도·오답 TOP5·**나만 틀린 문제**·킬러 정복률·채점표 | 가져옴 — 중심 |
| RawData 3행 파싱 | `importRawStudentData_` | 가져옴 |
| **예측권역** | | **버림** |
| 시각 스타일 | `glass-card`·그라데이션·Chart.js | 버림 |

## 5. 분석 모델

### 5.1 공통 — 두 층 비교, `n=` 상시 표기
외부 집단(파일 전원)과 자습반 내부를 나란히 둔다. 참고 프로그램의 n<10·n<30 가드는 **내부 지표에만** 적용한다.

### 5.2 정기 모의고사 — 합격 실력 진단 (예측권역 없음)

**개인 리포트** (학생 = 관리자 드릴다운, 같은 컴포넌트)
1. 요약: 총점 / 외부 석차·상위% (n=320) / **내 지역 석차** (n=지역 인원) / 반 석차 / 백분위
   학생 화면에도 **외부 석차와 상위%를 모두 노출**한다(운영 확정).
2. 과목별 표: 내 점수 · 외부 평균 · 지역 평균 · 반 평균 · 상위10% 평균 · 성취율 · 판정
3. 과목 레이더(내 점수 vs 외부 vs 반, 만점 정규화)
4. 과목 균형 + 조언
5. 성적 분포 막대(외부 집단, 내 구간 강조)
6. **문항 분석**: 채점표(과목·번호·정답·내 답·O/X·정답률·난이도) · **나만 틀린 문제** · 오답률 TOP5 · 킬러 정복률
7. **날짜별 추이** + 목표 대비
8. 반 내 주변 석차(익명)

**반 리포트** (관리자)
1. **시험 날짜 선택** → 응시 n, 외부 평균 vs 반 평균
2. 과목별 격차 → 반 취약 과목
3. **반 오답률 TOP10** (외부 정답률과 나란히 — 우리 반만 유독 틀린 문항)
4. 석차표(실명·총점·과목·외부 상위%·**직전 시험 대비** ▲▼)
5. 하락 학생(§6) · 일부 미응시 학생
6. 학생 클릭 → 개인 리포트 SlideOver

### 5.3 아침 모의고사 — 추세·일관성·진도 (예측권역 없음)

하루 1과목 요일별 순환이므로 **한 과목은 주 1회**다. 이동평균·기울기의 창은 날짜가 아니라 **그 과목의 응시 회차**로 센다(§6).

**개인**: 기간 평균 / 외부·반 평균 대비 / 주간 석차 변동 / 응시율 → **과목별** 추세선(최근 4회 이동평균) → 변동성·기울기·연속 하락 → **날짜별 나만 틀린 문제·오답 TOP5** → 누적모의고사(주 1회) vs 그 주 진도 시험 평균 격차
**반**: 날짜 × 과목 히트맵 → 날짜별 반 오답 TOP5 → **과목별** 하락 감지 학생 → 응시율 낮은 학생

### 5.4 진도 라벨
가져오기 화면에서 **매번 입력한다**(운영 확정). 예: `헌법 총론 3강`. 개인·반 리포트에 "단원별 취약" 표를 정식으로 넣는다. 빈 값도 허용하되 그 세션은 단원 표에서 빠진다.

### 5.5 첫 달 빈 상태
새 학기부터 쓰므로 과거 데이터가 없다. 세션이 1건일 때는 추이·직전 대비·하락 감지가 나올 수 없다. 각 영역에 `.admin-empty-state`로 **왜 비어 있는지** 적는다: "직전 시험이 없어 비교할 수 없습니다. 다음 회차부터 표시됩니다." 숫자를 0으로 채우거나 영역을 숨기지 않는다.

## 6. 하락 감지 기준 — 기본값과 설정

`division_settings.exam_analysis`(JSONB). 만점이 다른 두 시험에 같은 기준을 쓰도록 **만점 대비 %**로 둔다.

아침은 **하루 1과목 요일 순환**이라 한 과목이 주 1회다. 창을 날짜(7일·28일)로 잡으면 한 과목당 점이 1개뿐이라 의미가 없다. 그래서 **그 과목의 응시 회차 수**로 센다. 판정은 **과목별로** 하고, 학생당 여러 과목이 동시에 걸릴 수 있다.

| 키 | 기본값 | 근거 |
|---|---|---|
| `morning.consecutiveDrops` | **3회** | 2회는 잡음, 3회부터 추세 |
| `morning.classGapPercent` | **15%** | 20문항 100점 시험의 표준편차 ≈ 15점 → 약 1σ |
| `morning.ownAverageDropPercent` | **10%** | 최근 3회 vs 그 이전 구간, 한 등급 폭 |
| `morning.movingAverageSessions` | **4회** | 과목별 이동평균 창. 하루 1과목 순환이라 한 과목은 주 1회 → 약 4주 |
| `morning.trendWindowSessions` | **8회** | 기울기 창. 약 두 달 |
| `morning.attendanceRatePercent` | **70%** | 미만이면 추세 해석 보류 |
| `regular.totalDropPercent` | **10%** (25점) | 관행적 "유의미한 변화" |
| `regular.rankDropPercent` | **20%** | 반 인원 대비 (20명이면 4계단) |
| `regular.targetGapPercent` | **10%** | 목표 대비 미달 |
| `common.weakSubjectRatePercent` | **60%** | 참고 프로그램 판정 |
| `common.balanceStdDev` | **18** | 참고 프로그램 |
| `common.easyMissedRatePercent` | **70%** | 정답률 70%↑인데 오답 = 나만 틀린 문제 |
| `common.killerRatePercent` | **40%** | 정답률 40%↓ = 킬러 |

스키마 `lib/exam-analysis-settings.ts`(zod + `normalize…`, 누락은 기본값), 마이그레이션 `division_settings ADD COLUMN exam_analysis JSONB`, `RulesSettingsManager`에 **"성적 분석 기준"** 섹션. 감지 로직은 이 값만 읽는다.

## 7. 데이터 모델 추가

```prisma
/// 가져온 파일 한 쌍 = 세션 하나 (아침: 날짜·과목당 1건, 정기: 시험 날짜당 1건)
/// 회차 개념이 없으므로 examDate 가 유일 키다.
model ExamSession {
  id                 String   @id @default(cuid())
  divisionId         String
  examTypeId         String
  examDate           DateTime @db.Date
  topic              String?            // 아침 진도 라벨 (매 가져오기마다 입력)
  itemCount          Int
  fullScore          Float
  externalCohortSize Int                // 파일 응시인원
  externalStats      Json               // 평균·분포·과목별·지역별 집계 (개인정보 없음)
  sourceFileName     String
  importedById       String
  importedAt         DateTime @default(now())
  /// 아침은 같은 날 과목이 다르면 세션이 따로다 → subjectId 를 키에 포함
  primarySubjectId   String?            // 아침만. 정기는 null
  @@unique([examTypeId, examDate, primarySubjectId])
  @@index([divisionId, examDate])
}

/// 문항 정보 + 외부 집단 통계. 번호는 과목마다 1부터 → (과목, 번호)가 식별자
model ExamSessionItem {
  id              String  @id @default(cuid())
  sessionId       String
  subjectId       String
  itemNo          Int                  // 과목 내 번호
  position        Int                  // Errata 열 순서 (전체 정렬용)
  answerKey       String               // "3,4" 허용
  points          Float
  correctRatePct  Float                // 외부 정답률
  choiceRates     Json                 // {"1":6.1,"2":67.8,"3":19.9,"4":4.1,"etc":1.9}
  mostCommonWrong String?
  @@unique([sessionId, subjectId, itemNo])
}

/// 우리 학생의 세션 참여 요약 (외부 석차·지역은 파일에서만 알 수 있으므로 여기 보관)
model ExamSessionParticipant {
  id                 String  @id @default(cuid())
  sessionId          String
  studentId          String
  region             String?            // 파일 지원지역 코드
  externalRank       Int?
  externalPercentile Float?
  regionalRank       Int?
  subjectScores      Json               // {subjectId: score}, 미응시 과목은 없음
  totalScore         Float
  isPartial          Boolean @default(false)  // 일부 과목 미응시
  @@unique([sessionId, studentId])
}

/// 문항별 응답 (Errata ②·③). 미응시 과목 블록은 저장하지 않는다
model ExamItemResponse {
  id         String  @id @default(cuid())
  sessionId  String
  studentId  String
  subjectId  String
  itemNo     Int
  answer     String?           // null = 무응답
  isCorrect  Boolean
  @@unique([sessionId, studentId, subjectId, itemNo])
  @@index([studentId, sessionId])
}
```

**`ExamSubject`에 `alternateGroup String?` 추가.** 정기·아침 모두 헌법·범죄학에 같은 그룹명(`"헌법/범죄학"`)을 준다. "학생당 그룹에서 하나만 응시"로 취급하고 만점은 그룹당 하나만 더한다(정기: 20×2.5 + 100 + 100 = 250). 시험 종류를 공채·경채로 나누지 않는 이유: 파일이 하나로 오고, 나머지 과목은 두 집단이 **같은 문항**을 봐서 함께 비교하는 것이 맞다(운영 확정).

**통합 후 아침 시험 종류 구성** — 종류 1개, 과목 6개:
| 과목 | 문항×배점 | 택1 그룹 |
|---|---|---|
| 헌법 | 20×5 | `헌법/범죄학` |
| 범죄학 | 20×5 | `헌법/범죄학` |
| 형사소송법 | 20×5 | — |
| 형법 | 20×5 | — |
| 경찰학 | 20×5 | — |
| 누적모의고사 | 100×1 | — (주 1회) |

기존 `ExamScore`·`MorningExamScore`는 가져오기가 자동으로 채운다 → 기존 화면이 그대로 동작한다.

## 8. 파일 가져오기 설계

### 8.1 파서 라이브러리 — SheetJS 최신판
`exceljs`는 `.xlsx`만 읽는다. **SheetJS를 CDN tgz로 설치**한다: `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. npm 레지스트리의 0.18.5는 CVE-2023-30533 미수정이라 쓰지 않는다. 서버 라우트 전용.

### 8.2 흐름
```
[관리자] 시험 관리 → 2차 탭 "가져오기"
  1. 채점표 + 문항분석표 업로드 (한 세션)
  2. 서버 파싱 → 미리보기
     · 시험일자 · 과목 목록 · 응시인원 · 문항 수 · 시험 종류 자동 추정
     · 블록↔과목 매핑 결과와 재현 검증 결과 (§8.3)
     · 매칭: 자동(수험번호 일치) N / 미매칭(우리 학생 아님) K / 형식 오류 J
     · 일부 미응시 학생 목록
  3. 아침이면 진도 라벨 입력(예: 헌법 총론 3강) → 확정
     정기는 시험 날짜가 곧 키라 추가 입력 없음
  4. 트랜잭션: Session + Items + Participants + Responses + ExamScore/MorningExamScore
     같은 (examType, date, 과목) 재업로드는 덮어쓰기 확인
```

### 8.3 파싱 규칙 (표본에서 확정)

1. **블록 경계**: Errata 헤더 번호가 1로 되돌아가는 지점.
2. **블록↔과목 매핑은 정답 키 대조로**: 각 블록의 정답 열을 문항분석표 과목별 정답 열과 비교해 일치하는 과목을 붙인다. 위치·순서 가정 금지(표본에서 실제로 어긋났다).
3. **재현 검증**: 매핑 후 `Σ(O × pointsPerItem)`이 채점표 과목 점수와 **전원 일치**해야 확정 버튼이 열린다. 불일치가 있으면 원인(배점 설정·매핑)을 미리보기에 표시하고 막는다.
4. **택1 과목 판별**: `alternateGroup` 안에서 ②(학생 답안)가 있는 블록을 응시 과목으로 본다. 없는 블록은 ③이 X여도 **저장하지 않는다**. `응시분야` 코드는 쓰지 않는다.
5. **일부 미응시**: 그룹 어느 블록에도 답이 없으면 `isPartial=true`, 응답 있는 과목만 저장.
6. **수험번호**: 5자리 문자열 그대로(앞 0 보존). 그 외 길이는 형식 오류로 분류.
7. **외부 통계**: Score 시트 전원으로 평균·분포·과목별·지역별(지원지역 코드 기준) 집계 → `externalStats`. 미매칭 응시자의 성명·생년월일은 **집계 즉시 버리고 저장하지 않는다.** 파일도 서버에 남기지 않는다.
8. 아침 파일은 Score `객관식` 한 열이 곧 그 과목 점수.

### 8.4 API

| 라우트 | 메서드 | 권한 |
|---|---|---|
| `/api/[division]/exam-imports/preview` | POST multipart | ADMIN, SUPER_ADMIN |
| `/api/[division]/exam-imports` | POST 확정 | ADMIN, SUPER_ADMIN |
| `/api/[division]/exam-imports` | GET 이력 목록 | ADMIN, SUPER_ADMIN |
| `/api/[division]/exam-imports/[sessionId]` | DELETE 세션 삭제 | ADMIN, SUPER_ADMIN |
| `/api/[division]/exams/analysis?examTypeId&examDate` | GET | ADMIN, SUPER_ADMIN |
| `/api/[division]/exams/analysis/student/[studentId]?…` | GET | ADMIN, SUPER_ADMIN **또는 본인** |
| `/api/[division]/morning-exams/analysis?examTypeId&from&to` | GET | ADMIN, SUPER_ADMIN |
| `/api/[division]/morning-exams/analysis/student/[studentId]?…` | GET | ADMIN, SUPER_ADMIN **또는 본인** |

**조교(ASSISTANT)는 분석·가져오기 어느 것도 볼 수 없다**(운영 확정). 학생은 자기 리포트만.

**가져오기 삭제**: `ExamSession` 삭제 시 `ExamSessionItem`·`ExamSessionParticipant`·`ExamItemResponse`가 cascade 되고, 그 세션에서 파생된 `ExamScore`/`MorningExamScore` 행도 같은 트랜잭션에서 지운다. 삭제 전 확인 모달에 "이 시험의 성적·문항 기록이 모두 지워집니다"와 대상 학생 수를 보여준다.

`requireApiAuth` → `getDivisionFeatureDisabledError(division, "examManagement")` → zod → 서비스 → `toApiErrorResponse`. 본인 확인은 [morning-exams/student/[studentId]/route.ts](../apps/study-hall/app/api/[division]/morning-exams/student/[studentId]/route.ts)의 IDOR 가드. 업로드 상한 5MB.

## 9. 구조

- `lib/exam-import-parser.ts` — `Buffer → { score, errata, moon, meta }` 순수 함수. 표본 축약 픽스처로 테스트.
- `lib/exam-analysis-meta.ts` — 석차·백분위·판정·균형·분포·문항 진단·이동평균·기울기·하락 감지. 순수 함수, 수치 테스트.
- `lib/services/exam-import.service.ts` — 미리보기(매핑·재현·매칭)·확정(트랜잭션).
- `lib/services/exam-analysis.service.ts` — **로더는 원시 행만, 어셈블러 하나를 mock/DB가 공유**(채팅에서 이 구조 미비로 버그 4건). 학생 viewer는 서버에서 실명 제거·수험번호 마스킹.
- 캐시 `unstable_cache` 키 `(division, examType, date|round)`, 가져오기 확정 시 무효화.
- 화면: 관리자 `/admin/exams` 1차 탭(아침/정기) 안에 **2차 탭 `입력 | 가져오기 | 분석`**. 학생 `/student/exams`에 리포트. `components/exams/import/ExamImportWizard.tsx`, `components/exams/analysis/{RegularCohortAnalysis, RegularStudentReport, MorningCohortAnalysis, MorningStudentReport, ItemAnalysisTable}.tsx`, `charts/{SubjectRadar, DistributionBars, TrendLines, SubjectHeatmap}.tsx`.
- DESIGN.md: `.admin-flat-page` · `.admin-metric-strip` · 표 §5.8 · 카드 안 카드 금지 · 색 `--admin-chart-1~6` · 768px 미만 레이더·히트맵은 표.

## 10. 단계

### Phase 1 — 가져오기와 문항 데이터 (기반)
1. **설정 정리**: `ExamSubject.alternateGroup` 마이그레이션. 관리자가 시험 설정 화면에서 ① 정기 헌법 배점 2.5로 수정 ② 정기에 범죄학 추가 ③ 아침 시험 종류 통합(과목 6개) ④ 헌법·범죄학에 택1 그룹 지정. **데이터 보정을 마이그레이션에 박지 않는다**(직렬 하드코딩 금지)
2. 마이그레이션: `ExamSession`·`ExamSessionItem`·`ExamSessionParticipant`·`ExamItemResponse`, `division_settings.exam_analysis`
3. SheetJS 설치 + `exam-import-parser.ts` + 픽스처 테스트(아침·정기 각 1개, 개인정보 축약)
4. `exam-import.service.ts` + API 4개(미리보기·확정·이력·삭제) — 정답 키 매핑·재현 검증·택1 판별·미응시 처리
5. `ExamImportWizard` + **가져오기 이력 목록**(날짜·과목·응시 인원·가져온 사람·삭제)
6. 확정 시 `ExamScore`/`MorningExamScore` 자동 생성 → 기존 화면 즉시 채워짐
7. `exam-analysis-settings.ts` + 규칙 설정 "성적 분석 기준" 섹션

### Phase 2 — 정기 분석
순수 함수(참고 알고리즘 + 문항 진단 + 지역 비교 + 정기 하락) → 서비스 → API 2개 → 반 리포트 · 개인 리포트 드로어 · 학생 페이지

### Phase 3 — 아침 분석
추세·일관성·아침 하락 → 서비스 → API 2개 → 히트맵 · 날짜별 오답 TOP · 하락 학생 · 개인 리포트

### Phase 4 — 보고서와 마무리
**경고 대상자·대시보드 연결은 하지 않는다**(운영 확정: 하락은 성적 분석 화면 안에만). 남는 것은:
- 보고서 엑셀 내보내기(시험 날짜별 석차표·과목 평균·반 오답 TOP)
- 첫 달 빈 상태 문구 점검
- 진도 라벨이 쌓인 뒤 단원별 취약 표 검증

## 11. 검증

- `typecheck` · `lint` · `test` · `test:integration`
- 파서 픽스처: 아침(20문항·여백 10열·복수정답 `3,4`·여백 행 5) / 정기(120문항·4블록·**블록 순서 ≠ 문항분석표 순서**·미응시 블록 X·불량 수험번호 6건·일부 미응시 5명)
- **재현 검증 0건 불일치**를 테스트로 고정(정기 표본 309명)
- 순수 함수: 참고 프로그램 동일 입력→동일 출력(동점 3명, n=8, n=12, n=320), 하락 기준 경계값
- 서비스: `loadService` 하네스로 직렬 필터·mock/DB 동일 결과·학생 마스킹
- 가져오기 E2E: mock 학생 5명(5자리 학번) 시드 → 정기 표본 업로드 → 미리보기(자동 매칭·형식 오류 6·일부 미응시 5) → 확정 → 과목 점수·총점 250 만점 확인
- 응답 본문에 미매칭 응시자 성명·생년월일이 없음을 테스트
- 학생 계정 타인 `studentId` 403 · 390/768/1280px DESIGN.md §9 점검

## 12. 위험

| 위험 | 대응 |
|---|---|
| 블록↔과목 매핑 오류 (표본에서 실제 발생) | 정답 키 대조 + 재현 검증 통과 전 확정 불가 |
| 미응시 블록의 X를 오답으로 집계 | 택1 그룹 판별 후 미응시 블록 미저장 |
| 헌법 배점 설정 오류로 총점 300 | Phase 1 첫 작업으로 수정, 재현 검증이 재발을 막음 |
| `.xls` 파서 | SheetJS CDN tgz, 서버 전용 |
| 외부 응시자 개인정보 | 집계 후 즉시 폐기, 저장·로그 금지 |
| 채점 시스템이 열 순서·형식을 바꿈 | 파서가 헤더 이름으로 열을 찾고, 재현 검증이 깨지면 가져오기를 막는다 |
| mock/DB 갈라짐 | 로더-어셈블러 분리 |
| 학생 화면 실명 유출 | 서버 마스킹 + 응답 본문 테스트 |
