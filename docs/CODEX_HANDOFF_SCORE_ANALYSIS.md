# 코덱스 작업 지시서 — study-hall 성적 분석 구현 (Phase 1~4 전체)

이 문서는 실행 지침이다. **무엇을 만드는지**는 [`STUDY_HALL_SCORE_ANALYSIS_PLAN.md`](./STUDY_HALL_SCORE_ANALYSIS_PLAN.md)를 먼저 끝까지 읽어라. 이 문서는 그 계획을 이 저장소의 규칙대로 구현하기 위한 순서·패턴·계약·금지 사항이다.

저장소: `D:\코딩\학원 포탈 프로그램\hankuk`
앱: `apps/study-hall` (Next.js 14 App Router · TypeScript · Prisma · Supabase · Tailwind 3.4 · recharts ^3.8)
패키지 매니저: npm (`apps/study-hall`에서 실행)

---

## 0-A. 운영 인터뷰로 확정된 사실 (설계 전제 — 바꾸지 말 것)

| 항목 | 확정 |
|---|---|
| 공채·경채 | **같은 시험지**. 헌법(공채)·범죄학(경채)만 다름 → 아침 시험 종류를 **1개로 통합**, 두 과목은 택1 그룹 |
| 아침 빈도 | **하루 1과목, 요일 순환** → 한 과목은 주 1회. 파일 한 쌍/일 |
| 누적모의고사 | **주 1회** |
| 정기 회차 | **회차 개념 없음. 시험 날짜가 키** → `examRound` 만들지 말 것 |
| 가져오기 취소 | **이력 목록에서 삭제** |
| 분석 권한 | **관리자만.** 조교 접근 불가 |
| 학생 문항 공개 | **전체 채점표까지** 공개 |
| 학생 외부 석차 | **석차 + 상위% 모두** 공개 |
| 하락 표시 | **성적 분석 화면 안에만.** 경고 대상자·대시보드에 넣지 말 것 |
| 아침 하락 판정 | **과목별** |
| 진도 라벨 | **매 가져오기마다 입력** |
| 사용 시점 | **새 학기부터.** 과거 소급 없음 → 첫 달 빈 상태 문구 필요 |

## 0-B. 첫 가져오기 전 관리자가 해야 할 준비 (코드가 아님)

Phase 1 완료 후 사용자에게 **이 체크리스트를 안내**한다. 이걸 안 하면 첫 파일에서 재현 검증이 막힌다.

1. 시험 설정 → `정기 모의고사` → 헌법 배점을 **5 → 2.5**로 수정 (총점 250)
2. 같은 화면에서 **범죄학**(20문항 × 2.5) 추가
3. 헌법·범죄학 둘 다 택1 그룹에 `헌법/범죄학` 입력
4. 아침 시험 종류 **통합**: `(공채) 아침 모의고사`를 `아침 모의고사`로 바꾸고 **범죄학 추가**(20×5), 헌법·범죄학에 택1 그룹 `헌법/범죄학` 지정. `(경채) 아침 모의고사`는 **비활성화**
5. 학생 학번을 채점 시스템 **수험번호 5자리**와 일치시킨다

## 0. 시작 전 반드시 읽을 것

1. `apps/study-hall/CLAUDE.md`, `AGENTS.md` — 프로젝트 규칙
2. `apps/study-hall/DESIGN.md` — **UI를 한 줄이라도 만지기 전에** 전부. 특히 §2 색 토큰, §5.2 평면 페이지, §5.3 카드·요약 박스, §5.5 2차 탭, §5.8 표, §5.10 드로어, §9 검증 스니펫
3. `docs/STUDY_HALL_SCORE_ANALYSIS_PLAN.md` — 계획 전문

## 1. 작업 범위와 순서

| Phase | 결과물 | 완료 기준 |
|---|---|---|
| 1 | 택1 그룹 · 마이그레이션 · SheetJS · 파서 · 가져오기 서비스/API(4개) · 마법사 · 이력·삭제 · 분석 기준 설정 | 표본 두 쌍을 가져오면 `ExamScore`/`MorningExamScore`가 자동 생성되고 기존 화면에 뜬다. 정기 총점 250. 이력에서 삭제하면 파생 성적까지 지워진다 |
| 2 | 정기 분석: 순수 함수 → 서비스 → API → 반·개인 리포트 → 학생 화면 | 참고 알고리즘 동일 입력→동일 출력, 학생 응답에 타인 실명 없음 |
| 3 | 아침 분석: **과목별** 추세·하락 감지 → 서비스 → API → 히트맵·개인 추세·단원별 취약 | 하락 감지가 설정값만 읽음 |
| 4 | 보고서 내보내기 · 빈 상태 점검 | **경고 대상자·대시보드 연결 없음**(§0-A) |

**Phase 1이 끝나기 전에 Phase 2 UI를 시작하지 않는다.** Phase가 끝날 때마다 §8 검증을 돌리고 **Phase 단위로 커밋**한다. Phase 사이에 멈추지 말고 이어서 진행하되, 각 Phase 종료 보고를 남긴다.

## 2. 이 저장소의 핵심 규칙 (위반하면 리뷰에서 되돌린다)

- **직렬 완전 분리**: 모든 Prisma 조회·쓰기에 `divisionId` 또는 `division: { slug }` 필터. 세션·문항·응답·참여 테이블 예외 없음.
- **하드코딩 금지**: 하락 기준·판정 임계값·배점·과목명·직렬명을 코드에 쓰지 않는다. 임계값은 `division_settings.exam_analysis`, 배점·과목은 `ExamSubject`, 택1 관계는 `ExamSubject.alternateGroup`.
- **MOCK_MODE 필수**: `scripts/run-tests.mjs`가 `MOCK_MODE=true`와 도달 불가 DSN을 강제한다. 새 서비스 함수는 `isMockMode()` 분기를 **맨 앞에서 early return**으로 두고, mock 슬라이스를 `lib/mock-store.ts`에 추가해야 테스트가 돈다.
- **mock/DB 갈라짐 방지**: 로더(mock·DB)는 "원시 행 배열"만 돌려주고, 필터·정렬·집계·마스킹은 **두 경로가 공유하는 어셈블러 하나**에서만 한다. 조회 조건을 로더에 두지 않는다. (직원 채팅에서 이 구조가 없어 실제 버그 4건이 나왔다.)
- **한국어 UI / 영어 코드·커밋·파일명.** UTF-8 유지.
- **ExcelJS·SheetJS는 서버 라우트에서만** import.
- **UI는 `--admin-*` 토큰과 `.admin-*` 클래스만.** 새 클래스는 `app/globals.css`에 정의하고 **같은 커밋에서 DESIGN.md에 규격을 적는다.**
- **`react.cache`·`next/cache`에 의존하는 서비스는 순수 함수와 분리**한다. 순수 계산은 `lib/*-meta.ts`에 두어 Node 테스트에서 바로 import되게 한다.

## 3. 그대로 복사할 패턴

| 목적 | 참고 파일 |
|---|---|
| API 라우트 골격 (`requireApiAuth` → 기능 가드 → `safeParse` → 서비스 → `toApiErrorResponse`) | `app/api/[division]/announcements/route.ts` |
| 학생 본인 확인(IDOR 가드) | `app/api/[division]/morning-exams/student/[studentId]/route.ts` |
| 서비스 mock/DB 분기 · 직렬화 공유 | `lib/services/chat.service.ts` |
| mock 슬라이스 추가 (`MockState` 타입 · `createInitialState` · `normalizeMockState`와 그 반환, 정확히 3곳) | `lib/mock-store.ts`의 `chatMessagesByDivision` |
| JSONB 설정 정규화 | `lib/division-features.ts` `normalizeDivisionFeatureFlags` |
| 규칙 설정 화면 섹션 | `components/settings/RulesSettingsManager.tsx`, `lib/settings-schemas.ts` |
| 손으로 쓰는 멱등 마이그레이션 | `prisma/migrations/20260909000000_staff_chat/migration.sql` |
| 2차 탭 | `components/ui/AdminTabs.tsx` `variant="secondary"` |
| 드로어 | `components/ui/SlideOver.tsx` — `widthClassName` 넘기지 말 것 |
| 차트 | `components/exams/ExamScoreChart.tsx`, `components/reports/ReportsTrendChart.tsx` |
| 순수 함수 테스트 | `tests/unit/chat-meta.test.ts` |
| 서비스 테스트 (stub prisma) | `tests/performance/services.test.ts`의 `loadService` |
| 캐시 무효화 | `lib/revalidation.ts` |
| 보고서 내보내기 (Phase 4) | `lib/services/report.service.ts` `getPointExportRows`, `components/reports/ReportsDashboard.tsx` |

---

## 4. Phase 1 — 가져오기와 문항 데이터

### 4.1 택1 그룹 지원 (첫 작업)

현재 문제:
- `정기 모의고사 / 헌법`이 `points_per_item = 5`(실제 2.5), 경채용 **범죄학이 없다**
- 아침 시험 종류가 `(공채)`·`(경채)` **2개**인데 형사소송법·형법·경찰학·누적모의고사가 **양쪽에 중복**이고, 두 종류의 `study_track`이 모두 `"경찰"`이라 앱이 공채·경채를 **구분하지 못한다**(`isStudentEligible`은 `student.studyTrack === examType.studyTrack`만 본다). 같은 시험지를 보므로 종류를 나눌 이유도 없다.

코드가 할 일:
1. 마이그레이션 `prisma/migrations/2026MMDDHHMMSS_exam_subject_alternate_group/migration.sql`: `study_hall.exam_subjects ADD COLUMN IF NOT EXISTS alternate_group TEXT`
2. `ExamSubject`에 `alternateGroup String? @map("alternate_group")`
3. `ExamTypeManager`에 **"택1 그룹"** 입력칸 추가 (같은 그룹명을 가진 과목은 학생당 하나만 응시)
4. 만점 = `Σ(그룹 없는 과목 만점) + Σ(그룹별 max 만점)`. `lib/exam-analysis-meta.ts`의 `computeFullScore(subjects)` **한 곳에만** 둔다
5. `isStudentEligible`은 그대로 둔다. 통합 후 종류가 하나라 판별이 필요 없어진다

**데이터 보정(배점 수정·범죄학 추가·아침 통합)은 마이그레이션에 넣지 않는다.** 특정 지점 데이터를 코드에 박는 것이고, 관리자가 §0-B 체크리스트로 화면에서 한다. 재현 검증이 안전망이다.

### 4.2 마이그레이션

계획서 §7의 4개 모델(`ExamSession`, `ExamSessionItem`, `ExamSessionParticipant`, `ExamItemResponse`) + `division_settings.exam_analysis JSONB`.

- **`examRound` 컬럼을 만들지 않는다.** 회차 개념이 없다(§0-A). `ExamSession` 유일 키는 `(examTypeId, examDate, primarySubjectId)` — 아침은 같은 날 과목이 다르면 세션이 따로이고, 정기는 `primarySubjectId = null`.
- `npm run db:deploy`는 **하지 말고** 사용자에게 알린다.
- `Student`에는 아무것도 추가하지 않는다. 매칭은 `studentNumber` 완전 일치(5자리).

### 4.3 SheetJS 설치

```bash
cd apps/study-hall
npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```
npm 레지스트리의 `xlsx@0.18.5`는 CVE-2023-30533 미수정 — **쓰지 않는다.**

### 4.4 파서 `lib/exam-import-parser.ts` — 확정된 규칙

표본 분석으로 확정된 사실이다. 추측으로 바꾸지 말 것.

1. 시트 이름: 채점표 `Score`·`Errata`, 문항분석표 `Moon`. 열은 **헤더 이름으로** 찾는다.
2. `Errata`는 학생당 3행 블록: ① 정답 키(전원 동일) ② 학생 답안 ③ O/X.
3. 문항 열 헤더는 **과목마다 1부터 재시작** → 1로 되돌아가는 지점이 블록 경계.
4. **블록↔과목 매핑은 정답 키 대조로 한다.** 정기 표본에서 Errata 순서(헌법·범죄학·형사법·경찰학)와 Moon 순서(헌법·범죄학·경찰학·형사법)가 **실제로 달랐다.** 위치로 매핑하면 형사법·경찰학이 뒤바뀐다.
5. **재현 검증**: `Σ(③이 O인 문항 × pointsPerItem)`이 `Score`의 과목 점수와 **전원 일치**해야 확정 가능. 정기 표본 309명 0건 불일치가 기준.
6. **택1 판별**: `alternateGroup` 안의 블록 중 ②에 답이 있는 쪽이 응시 과목. 미응시 블록은 ③이 **전부 X**이므로 저장 금지. `응시분야` 코드는 쓰지 않는다.
7. 그룹 어느 블록에도 답이 없으면 `isPartial = true`, 답 있는 과목만 저장.
8. 정답 키 `3,4`(복수정답), 학생 답 `2,4`, 빈칸(무응답). 정오는 ③을 신뢰.
9. 수험번호 **5자리 문자열** 그대로. 그 외 길이는 "형식 오류".
10. `Moon`에 배점 열이 없다 → `ExamSubject.pointsPerItem`. 정답 없는 행은 버린다.
11. 아침 파일은 `Score`의 `객관식`이 곧 과목 점수. 과목은 `Moon` r1 `과목명`(하루 1과목이라 하나뿐).
12. `Moon` r1에 `시험일자`·`응시인원`.
13. 아침 시험 종류는 **통합된 1개**다. 파일의 과목명으로 그 종류의 `ExamSubject`를 찾으면 되고, 공채·경채를 고르는 단계가 없다. 헌법 파일이면 범죄학 학생은 그 세션에 응답이 없을 뿐 `isPartial`이 아니다.

파서 반환 타입:
```ts
export type ParsedExamFiles = {
  examDate: string;                       // YYYY-MM-DD
  subjectNames: string[];                 // Moon 순서
  externalCohortSize: number;
  scoreRows: Array<{ studentNumber: string; name: string; region: string | null;
                     subjectScores: Record<string, number>; total: number | null; formatError: string | null }>;
  blocks: Array<{ position: number; subjectName: string; itemNos: number[]; answerKey: string[] }>;
  responses: Array<{ studentNumber: string; blockPosition: number; answers: (string | null)[]; marks: ("O" | "X")[] }>;
  items: Array<{ subjectName: string; itemNo: number; answerKey: string; correctRatePct: number;
                 choiceRates: Record<"1" | "2" | "3" | "4" | "etc", number>; mostCommonWrong: string | null }>;
};
```

### 4.5 픽스처

표본 원본(사용자 데스크톱):
- 아침: `C:\Users\kunry\Desktop\모의고사채점표-2026-09-08-20-17-19.xls` + `문항분석표-2026-09-08-20-44-41.xls`
- 정기: `C:\Users\kunry\Desktop\모의고사채점표-2026-09-08-20-53-51.xls` + `문항분석표-2026-09-08-20-53-56.xls`

**원본을 저장소에 넣지 않는다.** `scripts/build-exam-import-fixtures.mjs`로 성명 `학생01`, 생년월일 빈칸, 수험번호 `90001`부터 재부여해 `tests/fixtures/exam-import/`에 재생성한다(정기 12명: 공채 6·경채 4·일부 미응시 1·결시 1 / 아침 8명). 스크립트도 커밋.

### 4.6 개인정보

미매칭 응시자의 성명·생년월일은 **집계 즉시 버린다.** 업로드 파일은 메모리에서만. `externalStats`에는 집계값만.

### 4.7 가져오기 서비스 `lib/services/exam-import.service.ts`

```ts
previewExamImport(divisionSlug, actor, files: { score: Buffer; moon: Buffer }): Promise<ExamImportPreview>
confirmExamImport(divisionSlug, actor, input: ExamImportConfirmInput): Promise<{ sessionId: string }>
listExamImports(divisionSlug, options?: { examTypeId?: string }): Promise<ExamImportHistoryRow[]>
deleteExamImport(divisionSlug, actor, sessionId: string): Promise<{ removedStudents: number; keptManualScores: number }>
```

`ExamImportHistoryRow`: `{ sessionId, examTypeName, examDate, primarySubjectName, topic, itemCount, externalCohortSize, matchedStudentCount, importedByName, importedAt }`.

**`deleteExamImport`는 한 트랜잭션에서** `ExamItemResponse` → `ExamSessionParticipant` → `ExamSessionItem` → 파생 `ExamScore`/`MorningExamScore` → `ExamSession` 순으로 지운다. 파생 성적은 세션의 `(examTypeId, examDate)`(+아침은 `subjectId`)로 찾는다. **수기 입력분과 구분이 안 되면 지우지 말고** `keptManualScores`에 세어 UI에서 알린다.
`ExamImportPreview`에 반드시: 시험일자·과목·응시인원·문항 수·추정 시험 종류 / 블록↔과목 매핑 / 재현 검증(일치 n·불일치 목록) / 매칭(자동 N·미매칭 K·형식 오류 J) / 일부 미응시 목록 / 재업로드 충돌 여부.
확정은 `prisma.$transaction`으로 Session·Items·Participants·Responses·`ExamScore`/`MorningExamScore`를 한 번에. 미리보기 토큰 없이 파일을 다시 받아 재파싱해도 된다(서버에 파일을 남기지 않기 위해).

### 4.8 가져오기 마법사와 이력

`app/[division]/admin/exams/page.tsx` 1차 탭(아침/정기) 각각 안에 2차 탭 `입력 | 가져오기 | 분석`.

**가져오기 탭 = 업로드 마법사 + 이력 목록** 한 화면.

미리보기에 반드시 보일 것: 시험일자·과목·응시인원·문항 수 / 블록↔과목 매핑 / 재현 검증(일치 n·불일치 목록) / 매칭(자동 N·미매칭 K·형식 오류 J) / 일부 미응시. **재현 불일치면 확정 버튼 비활성**이고 원인 추정을 함께 보여준다 — 예: "헌법 배점이 5로 설정돼 있습니다. 시험 설정에서 2.5로 고쳐 주세요."

아침이면 **진도 라벨 입력칸**(예: `헌법 총론 3강`). 정기는 회차 입력이 **없다** — 시험 날짜가 키다.

이력 목록은 표(§5.8 규격): 시험일 · 종류 · 과목 · 문항 수 · 외부 응시 · 매칭 학생 · 가져온 사람 · 시각 · 삭제. 삭제는 `useConfirmDialog` 중앙 모달로 "이 시험의 성적·문항 기록이 모두 지워집니다 (대상 학생 N명)" 확인.

### 4.9 분석 기준 설정 `lib/exam-analysis-settings.ts`

```ts
export const examAnalysisSettingsSchema = z.object({
  morning: z.object({
    consecutiveDrops: z.number().int().min(2).max(10),        // 3
    classGapPercent: z.number().min(0).max(100),               // 15
    ownAverageDropPercent: z.number().min(0).max(100),         // 10
    movingAverageSessions: z.number().int().min(2).max(20),    // 4  (그 과목의 응시 회차 수)
    trendWindowSessions: z.number().int().min(3).max(40),      // 8
    attendanceRatePercent: z.number().min(0).max(100),         // 70
  }),
  regular: z.object({
    totalDropPercent: z.number().min(0).max(100),              // 10
    rankDropPercent: z.number().min(0).max(100),               // 20
    targetGapPercent: z.number().min(0).max(100),              // 10
  }),
  common: z.object({
    weakSubjectRatePercent: z.number().min(0).max(100),        // 60
    balanceStdDev: z.number().min(0).max(100),                 // 18
    easyMissedRatePercent: z.number().min(0).max(100),         // 70
    killerRatePercent: z.number().min(0).max(100),             // 40
  }),
});
export const DEFAULT_EXAM_ANALYSIS_SETTINGS: ExamAnalysisSettings = { /* 위 주석값 */ };
export function normalizeExamAnalysisSettings(value: unknown): ExamAnalysisSettings  // 누락·오류 → 기본값
```
`settings.service.ts`에 `getExamAnalysisSettings(divisionSlug)` / `updateExamAnalysisSettings(...)`, `RulesSettingsManager`에 "성적 분석 기준" 섹션(각 값 옆 한 줄 설명), 저장 시 `revalidateDivisionRuntimePaths`.

---

## 5. Phase 2 — 정기 모의고사 분석

### 5.1 순수 계산 `lib/exam-analysis-meta.ts`

참고 프로그램 `G:\앱 프로그램\정기모의고사 성적\Code.gs` 984~1572행의 규칙을 **수치 그대로** 이식한다. 코드는 옮기지 않는다(ES5·Sheets 의존). 아래 시그니처와 규칙을 따른다.

```ts
export type ScoreRow = { id: string; total: number; subjectScores: Record<string, number> };

/** 동점자 동일 석차, 다음 석차 건너뜀 (1,1,3). 내림차순. */
export function rankWithTies(rows: ScoreRow[], key: (r: ScoreRow) => number): Map<string, number>;

/** rank/count×100, 소수 1자리, 0~100 클램프. count 0 → 100 */
export function topPercent(rank: number, count: number): number;

/** 동점 보정 백분위: (아래 + 0.5×동점)/n×100, 소수 1자리. 클수록 상위 */
export function percentileRank(values: number[], mine: number): number;

/** n<10: 성취율 80↑우수 / 60↑보통 / 그 외 취약 (basis "scoreRate")
 *  n≥10: 상위% 30↓우수 / 60↓보통 / 그 외 취약 (basis "percentile") */
export function gradeSubject(input: { my: number; fullScore: number; topPercent: number; n: number }):
  { grade: "우수" | "보통" | "취약"; basis: "scoreRate" | "percentile"; scoreRate: number };

/** 과목별 (my/과목최고점×100)의 모표준편차 → <7 매우 균형 / <12 균형 / <18 보통 / 그 외 불균형
 *  "불균형" 임계는 settings.common.balanceStdDev 를 받는다(기본 18) */
export function balanceAssessment(ratios: number[], unbalancedStdDev: number):
  { stdDev: number; assessment: "매우 균형" | "균형" | "보통" | "불균형" };

/** 만점 ≤100 → 10점, ≤200 → 20점, 그 외 25점 구간. 상한 초과는 마지막 구간 */
export function buildDistributionBins(totals: number[], fullScore: number, myTotal?: number):
  { binSize: number; bins: Array<{ lo: number; hi: number; count: number; ratio: number }>; myBinIndex: number | null };

/** 내림차순 정렬 후 상위 ceil(n×ratio) 평균, 소수 1자리 */
export function topGroupAverage(values: number[], ratio: number): number;

/** 참고 프로그램 1425행 조언 규칙:
 *  - 취약 과목마다 "{과목}이 상대적으로 취약합니다. 집중 학습이 필요합니다."
 *  - my < avg − max(fullScore×0.05, 5) 이면 "{과목} 점수가 전체 평균보다 낮습니다."
 *  - 불균형이면 "과목 간 점수 편차가 매우 큽니다. 취약 과목 보완이 시급합니다." */
export function buildAdvice(subjects: SubjectStat[], balance: { assessment: string }): string[];

/** 문항 진단. 난이도 라벨은 settings 의 easyMissed(70)·killer(40) 두 임계로 3단계:
 *  정답률 ≥ easy → "쉬움", ≤ killer → "어려움", 그 외 "보통" (새 임계값을 만들지 않는다) */
export function itemDiagnostics(
  items: Array<{ subjectId: string; itemNo: number; position: number; answerKey: string; externalCorrectRatePct: number; internalCorrectRatePct: number | null }>,
  myResponses: Array<{ subjectId: string; itemNo: number; answer: string | null; isCorrect: boolean }>,
  settings: ExamAnalysisSettings["common"],
): {
  list: ItemDiagnosticRow[];
  summary: { total: number; correct: number; wrong: number; unanswered: number; myCorrectRate: number;
             killerTotal: number; killerCorrect: number; killerConquerRate: number };
  easyMissed: ItemDiagnosticRow[];   // 정답률 ≥ easyMissed 인데 오답, 정답률 내림차순
  killerTop5: ItemDiagnosticRow[];   // 정답률 오름차순 상위 5
};

/** 정기 하락 감지. 이전 회차가 없으면 total/rank 판정은 건너뛴다 */
export function detectRegularDecline(input: {
  current: { total: number; internalRank: number; internalCount: number; subjectScoreRates: Record<string, number> };
  previous: { total: number; internalRank: number } | null;
  target: number | null;
  fullScore: number;
  settings: ExamAnalysisSettings;
}): Array<{ kind: "totalDrop" | "rankDrop" | "targetGap" | "weakSubject"; detail: string }>;
```

규칙 고정:
- `totalDrop`: `previous.total − current.total ≥ fullScore × regular.totalDropPercent/100`
- `rankDrop`: `current.internalRank − previous.internalRank ≥ ceil(internalCount × regular.rankDropPercent/100)`
- `targetGap`: `target − current.total ≥ fullScore × regular.targetGapPercent/100`
- `weakSubject`: 과목 성취율 `< common.weakSubjectRatePercent`

### 5.2 서비스 `lib/services/exam-analysis.service.ts` — 로더/어셈블러 분리

```ts
// 로더: 원시 행만. mock·DB 각각 구현. 조건은 (division, session) 뿐
type RegularRawBundle = {
  session: ExamSessionRow; subjects: ExamSubjectRow[]; items: ExamSessionItemRow[];
  participants: ExamSessionParticipantRow[];          // 우리 학생 전원
  responses: ExamItemResponseRow[];                   // 우리 학생 전원
  students: Array<{ id: string; name: string; studentNumber: string }>;
  previousParticipants: ExamSessionParticipantRow[];  // 직전 시험(같은 examType, 더 이른 examDate 중 최신)
  targets: Array<{ studentId: string; targetScore: number }>;
  settings: ExamAnalysisSettings;
};
async function loadRegularBundle(divisionSlug, examTypeId, examDate): Promise<RegularRawBundle>  // isMockMode 분기 내부

// 어셈블러: 순수. 두 경로 공유
export function assembleRegularCohort(bundle: RegularRawBundle): RegularCohortAnalysis;
export function assembleRegularStudentReport(bundle: RegularRawBundle, studentId: string, viewer: Viewer): RegularStudentReport;

// 공개 API
export async function getRegularCohortAnalysis(divisionSlug, examTypeId, examDate): Promise<RegularCohortAnalysis>;
export async function getRegularStudentReport(divisionSlug, examTypeId, examDate, studentId, viewer): Promise<RegularStudentReport>;
export async function listRegularSessions(divisionSlug, examTypeId): Promise<Array<{ sessionId; examDate; participantCount }>>;  // 최신 날짜 먼저
```

`Viewer = { role: "ADMIN" | "SUPER_ADMIN" | "ASSISTANT" | "STUDENT"; studentId?: string }`. **`viewer.role === "STUDENT"`이면 어셈블러가 이름을 제거하고 수험번호를 `앞 2자리 + ***`로 마스킹한다.** 클라이언트에 실명이 내려가지 않는다. 외부 집단 지표는 `session.externalStats`에서 읽는다(파일 전원 기준, 개인 없음).

캐시: `unstable_cache` 키 `["exam-analysis", divisionSlug, examTypeId, examDate]`, 태그 `exam-analysis:${divisionSlug}`. `confirmExamImport`·`deleteExamImport`에서 `revalidateTag`.

### 5.3 응답 계약

```ts
export type RegularCohortAnalysis = {
  session: { id; examTypeId; examTypeName; examDate; fullScore; itemCount; externalCohortSize; topic };
  subjects: Array<{ id; name; fullScore; itemCount; alternateGroup: string | null }>;
  external: { average; top10Avg; top30Avg; max; min;
              distribution: { binSize; bins };
              subjectAverages: Record<string, number>;
              regions: Array<{ code: string; count: number; average: number; top10Avg: number }> };
  internal: { count; average; max; min; stdDev; subjectAverages: Record<string, number>;
              weakSubjects: Array<{ subjectId; name; gapVsExternal: number; weakCount: number }>;
              isReliable: boolean };                                   // count ≥ 10
  classWrongTop: Array<{ subjectId; subjectName; itemNo; position; answerKey; externalCorrectRatePct; internalCorrectRatePct; gap }>; // 내부 오답률 상위 10
  ranking: Array<{ studentId; name; studentNumber; totalScore; subjectScores; isPartial;
                   externalRank; externalTopPercent; internalRank;
                   delta: { total: number; rank: number } | null;   // 직전 시험 없으면 null
                   flags: Array<{ kind; detail }> }>;
  declines: Array<{ studentId; name; flags }>;
  partials: Array<{ studentId; name; missingSubjects: string[] }>;
};

export type RegularStudentReport = {
  session; subjects;
  student: { id; name: string | null; studentNumber: string; region: string | null };   // 학생 viewer: name null, studentNumber 마스킹
  myScore: { total; subjectScores; isPartial };
  ranks: { external: { rank; count; topPercent; percentile };
           region: { code; rank; count; topPercent; percentile } | null;
           internal: { rank; count; topPercent; percentile; isReliable } };
  stats: { external: { average; top10Avg; top30Avg; max; min }; internal: { average; max; min };
           subjects: Array<{ subjectId; name; my; fullScore; scoreRate; externalAvg; regionAvg; internalAvg; top10Avg; top30Avg;
                             externalRank; externalTopPercent; externalPercentile; grade; gradeBasis }>;
           balance: { stdDev; assessment }; advice: string[] };
  distribution: { binSize; bins; myBinIndex };
  items: ReturnType<typeof itemDiagnostics>;
  competitors: Array<{ studentNumber: string; rank; total; subjectScores }>;  // 내부, 내 앞 5·뒤 4, 항상 마스킹
  trend: /* listStudentExamResults 출력 그대로 */;
  target: { targetScore; gap; gapPercent } | null;
  flags: Array<{ kind; detail }>;
};
```

### 5.4 API

| 라우트 | 메서드 | 권한 | 쿼리 |
|---|---|---|---|
| `/api/[division]/exams/analysis/sessions` | GET | ADMIN, SUPER_ADMIN | `examTypeId` |
| `/api/[division]/exams/analysis` | GET | ADMIN, SUPER_ADMIN | `examTypeId`, `examDate` |
| `/api/[division]/exams/analysis/student/[studentId]` | GET | ADMIN, SUPER_ADMIN **또는 본인** | `examTypeId`, `examDate` |

스키마 `lib/exam-analysis-schemas.ts`: `examAnalysisQuerySchema = z.object({ examTypeId: z.string().min(1), examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })`. 본인 확인은 §3의 IDOR 가드 그대로. **조교는 어떤 분석 라우트에도 접근할 수 없다** — `allowedRoles`에 `"ASSISTANT"`를 넣지 않는다. 응답 헤더 `Cache-Control: private, no-store`.

### 5.5 화면

**반 리포트** `components/exams/analysis/RegularCohortAnalysis.tsx` (2차 탭 "분석", 정기)
1. **시험 날짜 선택** (`.admin-filter-bar`, `listRegularSessions`, 최신 먼저)
2. `.admin-metric-strip`: 응시 n / 외부 평균 vs 반 평균 / 반 최고·최저 / 외부 응시인원
3. 과목별 표(§5.8 규격): 과목 · 반 평균 · 외부 평균 · 격차 · 취약 인원
4. `DistributionBars` (외부 분포)
5. 반 오답률 TOP10 표: 과목 · 번호 · 정답 · 반 정답률 · 외부 정답률 · 격차
6. 석차표: 이름(`.admin-table-name`) · 총점 · 과목별 · 외부 상위% · **직전 시험 대비** ▲▼ · 표시(`.admin-badge`: 하락/일부 미응시). 직전 시험이 없으면 셀에 `—`
7. 행 클릭 → `SlideOver`에 `RegularStudentReport` (관리자 viewer)

**개인 리포트** `components/exams/analysis/RegularStudentReport.tsx` — 관리자 드로어와 학생 페이지 **공용**. props로 `report`와 `mode: "admin" | "student"`.
1. `.admin-metric-strip`: 총점 / 외부 석차 (n=) · 상위% / 지역 석차 (n=) / 반 석차 (n=) / 백분위. **학생 화면도 외부 석차·상위%를 그대로 노출**(§0-A)
2. 신뢰도 한 줄(`.admin-help`): 반 n<10이면 "반 내 지표는 참고용입니다(응시 n명)"
3. 과목별 표 + `SubjectRadar`(내 점수 · 외부 평균 · 반 평균, 만점 정규화) — 768px 미만은 표만
4. 균형 평가 + 조언(`.admin-notice`, 톤 없음)
5. `DistributionBars` (내 구간 강조 — 강조는 `--admin-accent`)
6. `ItemAnalysisTable`: 요약 스트립(정답/오답/무응답/킬러 정복률) → 나만 틀린 문제 → 오답률 TOP5 → 전체 채점표(접힘). **학생도 전체 채점표를 본다**(§0-A)
7. **날짜별 추이**(`ExamScoreChart` 재사용) + 목표 대비. 시험이 1건뿐이면 `.admin-empty-state`로 "직전 시험이 없어 비교할 수 없습니다. 다음 시험부터 표시됩니다."
8. 내 주변 석차(익명 표)

**학생 페이지** `app/[division]/student/exams/page.tsx`: 정기 탭에 **시험 날짜 선택** → `RegularStudentReport mode="student"`. 데이터는 서버 컴포넌트에서 `getRegularStudentReport(..., { role: "STUDENT", studentId })`로.

**차트** `components/exams/analysis/charts/`: `SubjectRadar.tsx`(recharts `RadarChart`), `DistributionBars.tsx`(`BarChart`, 내 구간만 accent). 색은 `--admin-chart-1~6`만. 축·범례 13px.

### 5.6 테스트

- `tests/unit/exam-analysis-meta.test.ts`
  - `rankWithTies`: [90,90,80] → 1,1,3
  - `percentileRank`: 참고 프로그램 동일 입력 픽스처 3개
  - `gradeSubject`: n=8·n=12 경계, 성취율 80/60·상위% 30/60 경계
  - `balanceAssessment`: 7/12/18 경계, 임계 주입
  - `buildDistributionBins`: 만점 100·250·300 구간 크기, 상한 초과 클램프
  - `itemDiagnostics`: 나만 틀린 문제 정렬, 킬러 정복률, 무응답 집계
  - `detectRegularDecline`: 4개 kind 경계값, 이전 회차 없음
- `tests/performance/services.test.ts`
  - `loadService("exam-analysis", ...)`로 어셈블러에 동일 번들 주입 → mock/DB 로더 결과 `deepEqual`
  - 학생 viewer 응답에 `name === null`, `studentNumber`가 `/^\d{2}\*+$/`, competitors 전원 마스킹
  - 직렬 필터: 로더 `where`에 `divisionId` 존재
- 통합: 새 라우트 401/403 자동 검사 통과

---

## 6. Phase 3 — 아침 모의고사 분석

### 6.1 순수 계산 (같은 `lib/exam-analysis-meta.ts`에 추가)

```ts
/** 한 과목의 응시 시계열. 하루 1과목 요일 순환이라 한 과목은 주 1회다.
 *  창은 날짜가 아니라 **응시 회차 수**로 센다(§0-A). */
export type SessionPoint = { date: string; score: number };   // 미응시는 배열에 넣지 않는다

/** 최근 windowSessions 회 이동평균. 점이 부족하면 있는 만큼으로 계산하고, 0개면 null */
export function movingAverage(series: SessionPoint[], windowSessions: number): Array<{ date: string; value: number }>;

/** 최근 windowSessions 회에 대한 최소제곱 기울기(점/회). 점이 2개 미만이면 null */
export function trendSlope(series: SessionPoint[], windowSessions: number): number | null;

/** 응시 점수의 모표준편차 */
export function consistency(series: SessionPoint[]): number | null;

/** 아침 하락 감지. **과목 하나에 대해** 판정한다(§0-A).
 *  응시율이 기준 미만이면 다른 판정을 하지 않고 lowAttendance 만 돌려준다. */
export function detectMorningDecline(input: {
  series: SessionPoint[];               // 이 학생·이 과목의 응시 회차
  classSeries: SessionPoint[];          // 같은 과목 반 평균(같은 날짜 축)
  expectedSessions: number;             // 기간 내 이 과목 시험 횟수
  fullScore: number;                    // 이 과목 만점 (아침 100, 누적 100)
  settings: ExamAnalysisSettings;
}): Array<{ kind: "lowAttendance" | "consecutiveDrops" | "classGap" | "ownAverageDrop"; detail: string }>;
```

규칙 고정:
- `lowAttendance`: `series.length / expectedSessions × 100 < morning.attendanceRatePercent` → **이것만** 반환
- `consecutiveDrops`: 최근 점수가 `morning.consecutiveDrops + 1`개 이상 있고 **연속으로 직전보다 낮음**(같으면 끊김)
- `classGap`: 최근 `movingAverageSessions` 회 이동평균이 반 이동평균보다 `fullScore × classGapPercent/100` 이상 낮음
- `ownAverageDrop`: 최근 3회 평균이 그 이전 `trendWindowSessions` 회 평균보다 `fullScore × ownAverageDropPercent/100` 이상 낮음 (이전 구간이 3회 미만이면 판정 안 함)

### 6.2 서비스

```ts
type MorningRawBundle = {
  examType; subjects; sessions: ExamSessionRow[] /* 기간 내 */; items; participants; responses;
  students; weeklyRankings /* getMorningExamWeeklySummary 재사용 */; settings;
};
export async function getMorningCohortAnalysis(divisionSlug, examTypeId, range: { from; to }): Promise<MorningCohortAnalysis>;
export async function getMorningStudentReport(divisionSlug, examTypeId, studentId, range, viewer): Promise<MorningStudentReport>;
```
기간 기본값: 최근 **84일**(과목당 약 12회). 로더/어셈블러 분리 동일. 하락 판정은 **학생 × 과목**마다 돌린다.

### 6.3 응답 계약

```ts
export type MorningCohortAnalysis = {
  examType; subjects; range: { from; to }; sessionCount;
  heatmap: Array<{ date; subjectId; internalAvg: number | null; externalAvg: number; count: number; topic: string | null }>;
  subjectTrends: Array<{ subjectId; name; series: Array<{ date; internalAvg; externalAvg }> }>;
  dailyWrongTop: Array<{ date; subjectId; subjectName; items: Array<{ itemNo; answerKey; internalCorrectRatePct; externalCorrectRatePct }> }>; // 날짜별 상위 5
  declines: Array<{ studentId; name; subjectId; subjectName; flags }>;
  lowAttendance: Array<{ studentId; name; attended; expected; ratePercent }>;
};

export type MorningStudentReport = {
  student; examType; subjects; range;
  summary: { average; externalGap; internalGap; attendanceRatePercent; thisWeekRank: number | null; rankDelta: number | null };
  subjects: Array<{ subjectId; name; average; internalAvg; externalAvg; gap; stdDev; slope; consecutiveDrops; flags;
                    series: Array<{ date; score; ma; classMa; topic }> }>;
  topics: Array<{ topic; subjectId; myAvg; internalAvg; gap }>;      // topic 없는 세션은 제외
  dailyItems: Array<{ date; subjectId; easyMissed: ItemDiagnosticRow[]; wrongTop5: ItemDiagnosticRow[] }>;
  cumulativeGap: { cumulativeAvg; progressAvg; gap } | null;         // 누적모의고사 과목이 있을 때만
  weeklyRanks: Array<{ weekYear; weekNumber; rank; count }>;
};
```
"누적모의고사"는 이름으로 찾지 않는다. `ExamSubject.totalItems ≥ 100`이면 누적 과목으로 본다 — 판별은 `exam-analysis-meta.ts`의 `findCumulativeSubject(subjects)` 한 곳에. 주 1회 시행이므로(§0-A) `cumulativeGap`은 **그 주의 진도 과목 평균**과 비교한다.

### 6.4 API

| 라우트 | 메서드 | 권한 | 쿼리 |
|---|---|---|---|
| `/api/[division]/morning-exams/analysis` | GET | ADMIN, SUPER_ADMIN | `examTypeId`, `from`, `to` |
| `/api/[division]/morning-exams/analysis/student/[studentId]` | GET | ADMIN, SUPER_ADMIN **또는 본인** | 동일 |

`from`/`to`는 `YYYY-MM-DD`, `to − from ≤ 92일`.

### 6.5 화면

**반 리포트** `MorningCohortAnalysis.tsx` (2차 탭 "분석", 아침)
1. 필터: 시험 종류(공채/경채 등 MORNING 타입) · 기간(기본 28일)
2. `SubjectHeatmap`: 행=과목, 열=날짜, 셀=반 평균, 색=외부 평균 대비(`--admin-chart-2` 위 / `--admin-chart-3` 아래, 2단계만). 768px 미만은 날짜×과목 표
3. `TrendLines`: 과목별 반 평균 vs 외부 평균
4. 날짜별 반 오답 TOP5 (아코디언, 최근 날짜 먼저)
5. 하락 감지 학생 표: 이름 · 과목 · 사유(`flags[].detail`) → 행 클릭 드로어
6. 응시율 낮은 학생 표

**개인 리포트** `MorningStudentReport.tsx` — 드로어·학생 페이지 공용
1. `.admin-metric-strip`: 기간 평균 / 외부 대비 / 반 대비 / 이번 주 반 석차(▲▼) / 응시율
2. 응시율이 기준 미만이면 `.admin-notice`로 "응시율 n%라 추세를 판단하지 않습니다"만 표시하고 하락 표시 생략
3. 과목별 `TrendLines`(내 점수 · 내 7일 이동평균 · 반 이동평균) + 표(평균·갭·변동성·기울기·연속 하락)
4. **단원별 취약 표** — `topic`이 매번 입력되므로 정식 기능이다(§0-A). 단원 · 응시 · 내 평균 · 반 평균 · 격차, 격차 큰 순
5. 날짜별 나만 틀린 문제·오답 TOP5 (아코디언)
6. 누적 vs 진도 격차(있을 때만)
7. 주간 석차 변동

### 6.6 테스트

- `movingAverage`·`trendSlope`·`consistency`: 미응시 null 처리, 점 1개, 창 경계
- `detectMorningDecline`: 4개 kind 경계, **응시율 미만이면 다른 kind 없음**, 연속 하락에서 동점은 끊김
- `findCumulativeSubject`: 100문항 과목 판별, 없음
- 서비스 mock/DB 동일 결과, 학생 마스킹, 직렬 필터

---

## 7. Phase 4 — 보고서와 마무리

**경고 대상자·면담·대시보드 연결은 하지 않는다.** 하락은 **성적 분석 화면 안에서만** 보여준다(§0-A). `policy-review.service.ts`, `warnings/page.tsx`, `WarningStudentsManager.tsx`, `student-dashboard.service.ts`, `StudentDashboard.tsx`를 **건드리지 않는다.** 이 파일들은 다른 세션이 면담·경고 개선을 진행 중이다(§9).

### 7.1 보고서 내보내기

`lib/services/report.service.ts`에 추가 (ExcelJS, 서버 전용):
```ts
getExamAnalysisExportRows(divisionSlug, input:
  | { kind: "regular"; examTypeId: string; examDate: string }
  | { kind: "morning"; examTypeId: string; from: string; to: string }
): Promise<{ sheets: Array<{ name: string; header: string[]; rows: (string | number | null)[][] }> }>
```
- 정기: ① 석차표(이름·총점·과목별·외부 상위%·직전 대비) ② 과목별 반·외부 평균 ③ 반 오답 TOP20
- 아침: ① 학생 × 과목 평균·응시율 ② 날짜 × 과목 반 평균 ③ 단원별 평균

`components/reports/ReportsDashboard.tsx`에 "성적 분석 내보내기" 항목, `app/api/[division]/reports/[type]/route.ts`에 `type = "exam-analysis"`. 관리자 전용이므로 **마스킹하지 않는다**. `ReportsDashboard.tsx`가 다른 세션에서 수정 중이면 서비스·라우트까지만 만들고 화면 배선은 diff로 제안한다.

### 7.2 빈 상태 점검

새 학기부터 쓰므로 첫 달에는 세션이 1~2건뿐이다(§0-A). 아래가 모두 `.admin-empty-state`로 **이유를 적어** 나오는지 확인한다. 숫자를 0으로 채우거나 영역을 숨기지 않는다.

| 영역 | 문구 |
|---|---|
| 정기 날짜별 추이 | 직전 시험이 없어 비교할 수 없습니다. 다음 시험부터 표시됩니다. |
| 정기 직전 대비 열 | 셀에 `—` |
| 정기 하락 학생 | 비교할 직전 시험이 없습니다. |
| 아침 과목 추세 | 이 과목은 아직 n회만 응시했습니다. 4회부터 추세를 표시합니다. |
| 아침 하락 감지 | 판정에 필요한 응시 회차가 부족합니다. |
| 단원별 취약 | 진도 라벨이 입력된 시험이 없습니다. |
| 반 오답 TOP | 매칭된 학생이 없습니다. |

### 7.3 테스트

- 내보내기: 시트 수·헤더·행 수, 관리자용이라 실명 포함
- 빈 상태: 세션 1건인 번들로 어셈블러를 돌려 추이·직전 대비·하락이 **빈 배열/null**이고 예외가 없는지

## 8. 검증 (각 Phase 종료 시)

```bash
cd apps/study-hall
npm run typecheck        # 오류 0
npm run lint             # 경고·오류 0
npm test                 # 전부 통과 (시작 시점 266)
npm run test:integration # PASS — 새 라우트를 자동 발견해 401/403/400을 검사한다
```

빌드 확인은 **개발 서버를 내린 뒤** `MOCK_MODE=true npm run build`.

DESIGN.md §9 브라우저 점검: 새 화면마다 390/768/1280px에서 중첩 검출 스니펫 `n === 0`, 계산값 스니펫 `fonts`는 Pretendard만, `offScale`은 `[]`.

Phase 별 수용 기준:
- **1**: 파서 픽스처(아침 20문항·여백·복수정답 / 정기 4블록·순서 어긋남·미응시 X 제외·형식 오류·일부 미응시), 재현 0건 불일치, mock 학생 5명 시드 → 정기 픽스처 → 확정 → 총점 250, 학생 타인 `studentId` 403
- **2**: 참고 알고리즘 픽스처 통과, 학생 viewer 응답에 `name === null`·수험번호 마스킹·competitors 마스킹, 반 n<10 신뢰도 문구
- **3**: 응시율 미만 시 하락 판정 생략, 하락 감지가 설정값 변경에 즉시 반응(설정 20% → 15%로 바꾸면 결과 달라짐을 테스트)
- **4**: 내보내기 파일이 열리고 시트 3개가 맞다. 세션 1건 상태에서 모든 화면이 빈 상태 문구로 뜨고 예외가 없다

## 9. 동시 작업 주의

이 저장소는 **다른 세션이 동시에 편집한다.** 최근 수정 중이던 파일: `lib/services/attendance.service.ts`, `lib/attendance-meta.ts`, `components/attendance/AdminAttendanceBoard.tsx`, `app/api/[division]/attendance/recurring/route.ts`, `lib/services/student-dashboard.service.ts`, `lib/services/admin-dashboard.service.ts`, `lib/services/report.service.ts`, `components/chat/*`, `lib/services/chat.service.ts`. 다른 세션이 면담(`interview.*`)·경고 대상자(`WarningStudentsManager.tsx`, `warnings/page.tsx`) 개선(후속 확인 날짜, 면담 미리 채우기, 다음 단계까지 N점)을 진행 중이다.

- 작업 시작 시와 **각 Phase 시작 시** `git status`로 남의 미커밋 변경을 확인하고 **그 파일들을 건드리지 않는다.**
- 커밋할 때 `git add`에 **본인이 만든 파일만** 명시. `git add -A` 금지.
- 남의 파일 때문에 typecheck가 깨지면 고치거나 되돌리지 말고 사용자에게 알린다.
- Phase 4에서 `ReportsDashboard.tsx`가 수정 중이면 서비스·라우트까지만 만들고 화면 배선은 diff로 제안한다.
- 경고 대상자·면담·학생 대시보드 파일은 **이 작업 범위가 아니다.** 열지도 말 것.

## 10. 하지 말 것

- 예측권역(합격확실권/유력권/가능권/도전권) 어떤 형태로도 만들지 않는다.
- 임계값·배점·과목명·직렬명을 코드에 박지 않는다. 난이도 라벨도 새 임계값을 만들지 말고 `easyMissed`·`killer` 두 값으로 3단계.
- Errata 블록을 위치·순서로 과목에 매핑하지 않는다.
- 미응시 블록의 X를 오답으로 세지 않는다.
- 외부 응시자 개인정보를 저장·로그하지 않는다. 표본 원본을 저장소에 넣지 않는다.
- 아침 분석에 백분위·상위% 강조나 합격 관련 문구를 넣지 않는다.
- `npm run db:deploy`를 임의로 실행하지 않는다.
- `npm run build`를 **개발 서버가 떠 있는 상태에서** 돌리지 않는다.
- `vercel env pull`로 받은 파일은 작업 후 **반드시 삭제**한다.
- 커밋 메시지에 `[deploy study-hall]` 태그는 **사용자가 배포를 승인한 커밋에만** 붙인다.

## 11. 커밋

Phase 단위, 영어 제목, 본문에 **왜** 그렇게 했는지. 예:

```
feat(study-hall): import exam grading files and derive scores from items

Errata column blocks are matched to subjects by comparing answer keys
against the item analysis sheet, not by position: the regular exam sample
lists 형사법 before 경찰학 in Errata but the other way round in Moon, so
positional mapping swapped the two subjects' scores.

The untaken alternate subject block (헌법 or 범죄학) is filled with X in
the source, so it is excluded before scoring rather than counted as 20
wrong answers.
```

Phase 1 첫 커밋 전에 사용자에게 `db:deploy` 여부와 배포 태그 여부를 묻는다. 이후 Phase는 같은 답을 따른다.
