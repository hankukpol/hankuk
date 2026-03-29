# 수강관리 PRD (종합반 + 특강 단과)

**작성일**: 2026-03-13
**우선순위**: Phase 0~1 (핵심 기반)
**관련 개발 룰**: 00_개발공통룰.md

---

## 0. 수강 체계 개요

> 현재 엑셀 기반으로 관리하는 시트 구조를 시스템화한 것이다.
> 기존 엑셀의 모든 컬럼 데이터를 시스템에서 동일하게 관리·조회·출력할 수 있어야 한다.

```
수강 종류
│
├── 종합반 (COMPREHENSIVE)
│     공채/경채 × 기간(개월) × 기수(期數)
│     예) 27년 1차 대비 공채 12개월 종합반 52기
│     → 학원 전체 수익
│     → 수강계약서 의무 발행
│
├── 특강 단과 (SPECIAL_LECTURE)
│     종합반 수강 중 추가 수강하는 테마특강
│     예) 25년 2차 대비 테마특강 (형법+형소법+경찰학+헌법)
│     → 과목 조합 선택 가능 (전과목/형법+형소법/형법+경찰학 등)
│     → 강의 형태: 라이브(온라인) / 현장강의 구분
│     → 강사 배분율(%) + 학원 수익 분리
│     → 강사별 개별 정산 필요
│     → 좌석 번호 배정 (강의실별)
│
└── 면접 코칭반 (INTERVIEW_COACHING)
      필기합격 후 면접 준비 특강
      예) 25년 1차 최종 면접 코칭
      → 응시청, 직급 정보 포함
      → 조편성 (그룹 편성) 필요
      → 첫수강/재수강 × 학원생/일반생 가격 매트릭스
```

### 학생 구분 코드 (StudentType)

| 코드 | 이름 | 설명 |
|---|---|---|
| `ACADEMY` | 학원생 | 종합반 수강 중인 학원생 |
| `GENERAL` | 일반생 | 외부 일반 수강생 |
| `OWNER` | 오너티생 | 오너 특별 대상 (원장 설정) |
| `FREE` | 무료 | 무료 수강 대상 (혜택, 포인트 등) |
| `ONLINE` | 온라인 | 온라인 전용 수강생 |

---

## 1. 종합반 (Comprehensive Course)

### 1-1. 종합반 기본 구조

```
종합반 = 목표 시험 × 수험 유형 × 수강 기간 × 기수

예시:
  27년 1차 대비 공채 12개월 종합반 52기
  27년 1차 대비 경채 10개월 종합반 53기
  27년 1차 대비 공채 프리미엄 12개월 종합반 52기 (독서실 포함)
```

#### A. 수험 유형 (ExamCategory)

| 코드 | 이름 | 설명 |
|---|---|---|
| `GONGCHAE` | 공채 | 공개채용 (7·9급 공무원) |
| `GYEONGCHAE` | 경채 | 경력채용 (경찰청 등) |
| `SOGANG` | 소방 | 소방공무원 |
| `CUSTOM` | 기타 | 원장이 직접 설정 |

> 수험 유형은 관리자 설정에서 추가/수정 가능 (SystemConfig)

#### B. 종합반 상품 구성 (ComprehensiveCourseProduct)

```
/admin/settings/courses → [종합반 상품 관리]

상품 예시:
  상품명           유형    기간    정가          판매가        비고
  공채 12개월 기본  GONGCHAE  12   3,340,000   3,100,000    기본+심화+문제풀이
  공채 12개월 프리  GONGCHAE  12   4,060,000   3,940,000    +학원독서실 12개월
  경채 10개월      GYEONGCHAE 10   2,800,000   2,500,000
  경채 8개월       GYEONGCHAE  8   2,200,000   2,000,000
```

#### C. 기수(期數) 관리

> **기수 = 4개월 단위로 구성되는 수강생 코호트**
> 수험 유형별로 독립 기수 운영 (공채 52기, 경채 52기 등)

```
/admin/settings/cohorts

기수 관리
══════════════════════════════════════════════════════
기수 목록
  기수명         수험 유형  수강 기간                     현재 수강생  상태
  52기 (공채)   공채       2026-03-01 ~ 2026-06-30 (4개월)  96명       ●모집중
  53기 (공채)   공채       2026-07-01 ~ 2026-10-31 (4개월)   0명       ○예정
  52기 (경채)   경채       2026-03-10 ~ 2026-07-09 (4개월)   6명       ●모집중
  49기 (공채)   공채       2025-03-01 ~ 2025-06-30            38명      종료
  50기 (공채)   공채       2025-07-01 ~ 2025-10-31            25명      종료

[기수 추가]  [엑셀 내보내기]

기수 등록/수정
  기수명: [ 53기 ]
  수험 유형: [ 공채 ▼ ]
  수강 시작일: [ 2026-07-01 ]
  수강 기간: [ 4 ] 개월 → 종료일 자동 계산: 2026-10-31
  목표 시험일: [ 2027-01-xx ] (예정)
  비고: [ ]
  [저장]
══════════════════════════════════════════════════════

기수별 그룹 관리
  /admin/cohorts/[id]/members

  52기 공채 (96명)
  ┌──────────┬──────────┬──────────┬──────────┐
  │ 수험번호  │ 이름     │ 연락처    │ 수강상태  │
  ├──────────┼──────────┼──────────┼──────────┤
  │ 2605001  │ 홍길동   │ 010-...  │ 수강중    │
  │ 2605002  │ 김수험   │ 010-...  │ 수강중    │
  └──────────┴──────────┴──────────┴──────────┘

  기수 단체 발송
  [카카오 알림톡 발송]  [문자 발송]  [공지사항 등록]

  예) "52기 공채 수강생 여러분, 이번 주 월요일 아침 모의고사 일정 안내..."
══════════════════════════════════════════════════════
```

### 1-2. 종합반 수강 등록

```
/admin/enrollments/new (종합반)

수강 등록
══════════════════════════════════════════════════════
학생 검색
  [ 수험번호 또는 이름 또는 연락처 ]  [검색]
  → 홍길동 (2605001) / 010-1234-5678 / 현재: 수강없음  [선택]

수강 정보
  수험 유형: [ 공채 ▼ ]  기수: [ 52기 ▼ ]
  상품: [ 공채 12개월 기본반 (3,100,000원) ▼ ]

수강료 설정
  정상가: 3,340,000원
  판매가: 3,100,000원
  할인: [ 조기납부 할인  -100,000원 ]
  포인트 사용: [ 0 ] P
  최종 수강료: 3,000,000원

납부 방법
  [ ○ 일시납  ● 분할납부 ]
  분할 설정: [ 2 ]회  첫 납부: 2026-03-01  간격: 1개월
    → 1회: 2026-03-01  1,500,000원
    → 2회: 2026-04-01  1,500,000원

담당 직원: [ 김교무 ▼ ]
등록 경로: [ 방문 ▼ ]

[등록 완료] → 수강계약서 자동 생성 + 수납 화면으로 이동
══════════════════════════════════════════════════════
```

### 1-3. 연도별 · 기수별 수강 현황 통계

```
/admin/enrollments/stats

종합반 수강 현황 통계
══════════════════════════════════════════════════════
기준: [ 2026년 ▼ ]  유형: [ 공채 ▼ ]  기수: [ 전체 ▼ ]

기수별 현황 (공채, 2026년)
┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│ 기수  │ 등록  │ 환불  │ 재등록│ 필기  │ 최종  │ 합격률 │
├──────┼──────┼──────┼──────┼──────┼──────┼──────┤
│ 52기 │  58명 │   3명 │   2명 │  12명 │   8명 │ 13.8%│
│ 51기 │  63명 │   5명 │   4명 │  18명 │  11명 │ 17.5%│
│ 50기 │  55명 │   4명 │   3명 │  15명 │   9명 │ 16.4%│
└──────┴──────┴──────┴──────┴──────┴──────┴──────┘

수강료 수납 현황 (52기)
  총 수강료 계획: 179,800,000원
  실제 수납:     162,000,000원
  미납:           17,800,000원

[엑셀 내보내기]
══════════════════════════════════════════════════════
```

---

## 2. 특강 단과 (Special Lecture)

### 2-1. 특강 단과 기본 구조

```
특강 단과 = 종합반 수강 중 추가 신청하는 특강
→ 정기 강의와 별도 편성 (단기, 테마특강 등)
→ 강사별 수익 배분 설정 필수
→ 종합반 정산과 완전히 분리
```

### 2-2. 특강 상품 관리

```
/admin/settings/special-lectures

특강 목록
══════════════════════════════════════════════════════
  강좌명                     형태    과목수  수강료(전과목)  강사배분율  상태
  25년 2차 테마특강           복합    4과목  660,000원      70%        ●모집중
  형법 테마특강 (3월)         단일    1과목   80,000원      70%        ●모집중
  경찰학 심화특강              단일    1과목   60,000원      65%        ●모집중

[특강 추가]
══════════════════════════════════════════════════════

특강 등록/수정
  강좌명: [ 25년 2차 대비 테마특강 ]
  강의 형태: [ ● 복합 (과목 선택)  ○ 단일 과목 ]
  담당 강사: 과목별 설정
  수강 기간: [ 2026-03-10 ] ~ [ 2026-05-01 ]

  [복합 과목 구성]
  ┌──────────┬──────────┬──────────┬──────────────┐
  │ 과목명   │ 담당강사  │ 개별가격  │ 강사배분율    │
  ├──────────┼──────────┼──────────┼──────────────┤
  │ 형법     │ 이형법   │ 200,000  │ 70%          │
  │ 형사소송법│ 김형소   │ 180,000  │ 70%          │
  │ 경찰학   │ 박경찰   │ 160,000  │ 65%          │
  │ 헌법     │ 최헌법   │ 120,000  │ 65%          │
  └──────────┴──────────┴──────────┴──────────────┘
  전과목 패키지: [ 600,000 ] 원

  강의 방식: [ ● 현장 + 라이브  ○ 현장만  ○ 라이브만 ]
  정원 (현장): [ 300 ] 명   정원 (라이브): [ 200 ] 명

  할인 정책 설정
  ┌─────────────────────┬──────────┬───────────────────────┐
  │ 할인 유형            │ 할인율   │ 조건                   │
  ├─────────────────────┼──────────┼───────────────────────┤
  │ 종합반 학원생 할인   │ -10%     │ 현재 종합반 수강 중    │
  │ 재수강 할인          │ -50%     │ 24년 1,2차 합격자      │
  │ 팔당 할인            │ -5%      │ 팔당 캠프 수강생       │
  │ 오너티생 할인        │ 별도     │ 오너 지정 대상         │
  └─────────────────────┴──────────┴───────────────────────┘
  ※ 팔당 할인과 재수강 할인은 중복 적용 불가

  좌석 관리: [ ● 과목별 좌석 배정  ○ 좌석 없음 ]
  [저장]
```

> **강사 배분율은 원장(DIRECTOR) 권한만 설정 및 수정 가능**

### 2-3. 특강 수강 등록

```
/admin/enrollments/new?type=special

특강 수강 등록 — 25년 2차 대비 테마특강
══════════════════════════════════════════════════════
학생 검색
  [ 수험번호 또는 이름 ]  [검색]
  → 홍길동 (2605001) / 공채 52기 종합반 수강 중  [선택]

학생 구분: [ 학원생 ▼ ]  (종합반 수강 중 → 자동 감지)
재수강 여부: [ ● 아니오  ○ 예 (24년 1,2차 합격자) ]

수강 과목 선택
  [ ☑ 형법 ]  강의 방식: [ ● 현장  ○ 라이브 ]  좌석: [ 1-N12 ]
  [ ☑ 형사소송법 ]  강의 방식: [ ● 현장  ○ 라이브 ]  좌석: [ 1-N12 ]
  [ ☑ 경찰학 ]  강의 방식: [ ● 현장  ○ 라이브 ]  좌석: [ 1-N12 ]
  [ ☐ 헌법 ]

수강료 계산
  형법:      200,000원
  형사소송법: 180,000원
  경찰학:    160,000원
  소계:      540,000원
  할인 적용: [ 학원생 할인 -54,000원 (10%) ▼ ]
  최종:      486,000원

인강 제공 여부: [ ● 제공  ○ 미제공 ]
쿠폰 지급 여부: [ ● 지급  ○ 미지급 ]
응시청: [       ] (면접 코칭 시)
직급:   [       ] (면접 코칭 시)

[등록 완료] → 수납 화면으로 이동
══════════════════════════════════════════════════════
```

### 2-4. 특강 수강 명단 (관리자 조회)

```
/admin/enrollments?type=special&lectureId=xxx

25년 2차 대비 테마특강 수강 명단
══════════════════════════════════════════════════════
상단 통계:
  전체 인원: 형법 279명 / 형소법 259명 / 경찰학 276명 / 헌법 234명
  강의 형태: 라이브 (형법52/형소54/경찰52/헌법58) + 현장 (나머지)
  학원생/일반생: 학원생 합계 X명 / 일반생 합계 Y명

필터: [ 전체 ▼ ] [ 전과목 ▼ ] [ 현장/라이브 ▼ ] [ 미납 포함 ▼ ]

No.  학번    이름    연락처         구분    재수강  현금  카드  포인트  계좌  무료  결제일     확인    형법좌석  형소좌석  경찰좌석  헌법좌석  인강  쿠폰  비고
1   23871  발연하  010-3030-3005  학원생    O      -     -     -    320,000  -  04월 17일  04월 17일  1-N12  1-N12  1-N12   -     ●   -
...

[엑셀 내보내기]  [좌석배치도 출력]  [인강 미발급자 목록]
══════════════════════════════════════════════════════
```

### 2-5. 특강별 커스텀 필드 설정

> **각 특강 강좌마다 필요한 항목이 다르기 때문에**, 관리자가 해당 특강에 필요한 필드를 선택·추가·수정할 수 있어야 한다.

```
/admin/settings/special-lectures/[id]/fields

특강 커스텀 필드 설정 — 25년 2차 대비 테마특강
══════════════════════════════════════════════════════
기본 필드 (모든 특강 공통 — 수정 불가)
  수험번호, 이름, 연락처, 결제수단, 결제일, 확인일, 수강료, 비고

추가 필드 (이 특강에서 사용하는 항목 선택)
  ┌───────────────────────────┬──────────┬──────────────────────────┐
  │ 필드명                     │ 유형     │ 활성화                   │
  ├───────────────────────────┼──────────┼──────────────────────────┤
  │ 수강 과목 선택             │ 다중선택  │  ✅ 사용                 │
  │ 강의 방식 (현장/라이브)    │ 선택     │  ✅ 사용                 │
  │ 과목별 좌석번호            │ 텍스트   │  ✅ 사용 (좌석 배정 ON)  │
  │ 재수강 여부                │ 체크박스 │  ✅ 사용                 │
  │ 학생 구분/할인             │ 선택     │  ✅ 사용                 │
  │ 인강 제공 여부             │ 체크박스 │  ✅ 사용                 │
  │ 쿠폰 지급                  │ 체크박스 │  ✅ 사용                 │
  │ 응시청                     │ 텍스트   │  ❌ 미사용               │
  │ 직급                       │ 텍스트   │  ❌ 미사용               │
  │ 조편성                     │ 선택     │  ❌ 미사용               │
  │ 홈페이지 아이디            │ 텍스트   │  ❌ 미사용               │
  │ 성별                       │ 선택     │  ❌ 미사용               │
  └───────────────────────────┴──────────┴──────────────────────────┘

  [+ 커스텀 필드 직접 추가]
  → 필드명: [ ] / 유형: [ 텍스트 ▼ ] / 필수여부: [ ○ 필수  ● 선택 ] / [추가]

  예시 — 면접 코칭반 활성 필드:
  ✅ 조편성, ✅ 조장명, ✅ 응시청, ✅ 직급, ✅ 성별, ✅ 재수강여부

  예시 — 한능검 준비반 활성 필드:
  ✅ 학생구분, ✅ 홈페이지아이디, ✅ 인강신청, ✅ 인강지급일, ✅ 합격여부

[저장] → 이 설정에 따라 수강 등록 폼과 명단 컬럼이 자동으로 구성됨
══════════════════════════════════════════════════════
```

**구현 방식:**
- `SpecialLectureFieldConfig` 테이블에 특강별 활성 필드 목록 저장
- 수강 등록 폼은 해당 특강의 필드 설정을 읽어서 동적으로 렌더링
- 수강 명단 컬럼도 동일하게 동적 구성
- 커스텀 데이터는 `CourseEnrollment.extraData` (JSON) 필드에 저장

```prisma
model SpecialLectureFieldConfig {
  id           String  @id @default(cuid())
  lectureId    String
  fieldKey     String  // "응시청", "조편성", "인강여부" 등
  fieldLabel   String  // 화면에 표시되는 이름
  fieldType    FieldType  // TEXT / SELECT / CHECKBOX / DATE / NUMBER
  options      String?    // SELECT 유형의 옵션 목록 (JSON)
  isRequired   Boolean @default(false)
  sortOrder    Int     @default(0)
  isActive     Boolean @default(true)

  @@unique([lectureId, fieldKey])
  @@map("special_lecture_field_configs")
}

enum FieldType { TEXT SELECT CHECKBOX DATE NUMBER MULTI_SELECT }
```

### 2-6. 면접 코칭반 (Interview Coaching)

면접 코칭반은 특강 단과의 특수한 형태로, 아래 추가 기능이 필요하다.

```
/admin/enrollments/new?type=interview-coaching

면접 코칭반 수강 등록
══════════════════════════════════════════════════════
학생 검색
  [ 수험번호 또는 이름 ]  [검색]

강좌: [ 25년 1차 최종 면접 코칭 ▼ ]

학생 구분: [ 학원생 ▼ ]  재수강 여부: [ 아니오 ▼ ]
→ 수강료 자동 계산: 학원생 45만원 / 재수강 40만원 / 일반생 48만원

응시청: [ 경찰청 서울청 ▼ ]   직급: [ 순경 ▼ ]
성별:   [ 남 ▼ ]
조편성: [ 3조 ▼ ]   조장: [ 김조장 ▼ ]
[등록 완료]
══════════════════════════════════════════════════════
```

**면접 코칭반 통계:**
```
  구분              첫수강(학원생)  첫수강(일반생)  재수강(학원생)  재수강(일반생)  합계
  인원               86             95             20              18             219
  남/여            161명 남 / 58명 여
```

### 2-6. 특강 강사별 정산

```
/admin/settlements/special-lectures

특강 강사별 정산
══════════════════════════════════════════════════════
기간: [ 2026-03-01 ] ~ [ 2026-03-31 ]  강사: [ 전체 ▼ ]

강사별 정산 현황
┌─────────┬──────────────────┬──────┬──────────┬──────────┬──────────┐
│ 강사명   │ 특강명            │ 수강  │ 총 수강료  │ 강사 정산 │ 학원 수입 │
├─────────┼──────────────────┼──────┼──────────┼──────────┼──────────┤
│ 이형법   │ 형법 테마특강     │  42명 │ 3,360,000│ 2,352,000│ 1,008,000│
│ 박경찰   │ 경찰학 심화특강   │  35명 │ 2,100,000│ 1,365,000│   735,000│
├─────────┼──────────────────┼──────┼──────────┼──────────┼──────────┤
│ 합계    │                  │  77명 │ 5,460,000│ 3,717,000│ 1,743,000│
└─────────┴──────────────────┴──────┴──────────┴──────────┴──────────┘

[강사별 정산서 출력]  [엑셀 내보내기]
══════════════════════════════════════════════════════
```

#### 강사 정산서 출력

```
이형법 강사 정산서 (2026년 3월)

강좌: 형법 테마특강 (3월)
기간: 2026-03-15 ~ 2026-03-31
수강생: 42명

  수강생명    수험번호   수강료
  홍길동     2605001   80,000원
  김수험     2605002   80,000원
  ...

  총 수강료 합계:  3,360,000원
  강사 배분율:       70%
  강사 정산액:     2,352,000원

  정산일: 2026-04-05
  지급 방법: 계좌이체

[PDF 출력]
```

---

## 3. 수강 상태 관리 (공통)

### 3-1. 수강 상태 흐름

```
PENDING (수강 신청)
  ↓ 수납 완료
ACTIVE (수강 중)
  ↓ 휴원 신청 + 승인
SUSPENDED (휴원)
  ↓ 복귀 처리
ACTIVE (수강 재개)
  ↓ 기간 만료 또는 퇴원
COMPLETED (수강 완료) 또는 WITHDRAWN (퇴원)
```

### 3-2. 대기자 관리

```
정원 초과 시:
  [대기 등록] 선택 → status = WAITING
  순번 자동 부여

결원 발생 시 (CANCELLED/WITHDRAWN):
  대기자 1순위에게 자동 SMS/카카오 알림톡 발송
  "○○ 특강에 자리가 생겼습니다. 48시간 내 등록해 주세요."

  48시간 미등록 → 다음 순번으로 자동 넘김
```

---

## 4. 강사 마스터 관리

```
/admin/settings/instructors

강사 목록
  이름     담당 과목  연락처        이메일              상태
  이형법    형법      010-1111-2222  law@xxx.com         ●재직
  박경찰    경찰학    010-2222-3333  police@xxx.com      ●재직
  최헌법    헌법      010-3333-4444  const@xxx.com       ●재직

[강사 추가]
```

```prisma
model Instructor {
  id          String    @id @default(cuid())
  name        String
  subject     String    // 담당 과목
  phone       String?
  email       String?
  bankName    String?   // 정산 계좌 은행
  bankAccount String?   // 계좌번호
  bankHolder  String?   // 예금주
  isActive    Boolean   @default(true)
  specialLectures SpecialLecture[]
  createdAt   DateTime  @default(now())

  @@map("instructors")
}
```

---

## 5. DB 모델

```prisma
// 종합반 상품 마스터 (관리자 설정)
model ComprehensiveCourseProduct {
  id              String    @id @default(cuid())
  name            String    // "공채 12개월 기본반"
  examCategory    ExamCategory   // GONGCHAE / GYEONGCHAE / SOGANG / CUSTOM
  durationMonths  Int       // 12, 10, 8 ...
  regularPrice    Int       // 정가
  salePrice       Int       // 판매가
  features        String?   // JSON 혹은 텍스트 (혜택 목록)
  isActive        Boolean   @default(true)
  enrollments     CourseEnrollment[]

  @@map("comprehensive_course_products")
}

// 기수(期數) 마스터
model Cohort {
  id              String    @id @default(cuid())
  name            String    // "52기"
  examCategory    ExamCategory
  targetExamYear  Int       // 목표 시험 연도 (예: 2027)
  startDate       DateTime  // 수강 시작일
  endDate         DateTime  // 수강 종료일 (예정)
  isActive        Boolean   @default(true)
  enrollments     CourseEnrollment[]

  @@map("cohorts")
}

// 수강 등록 (종합반 + 특강 공통)
model CourseEnrollment {
  id              String    @id @default(cuid())
  examNumber      String    // 수강생
  courseType      CourseType        // COMPREHENSIVE / SPECIAL_LECTURE

  // 종합반 전용
  productId       String?   // ComprehensiveCourseProduct.id
  cohortId        String?   // Cohort.id

  // 특강 전용
  specialLectureId String?  // SpecialLecture.id

  startDate       DateTime
  endDate         DateTime?
  regularFee      Int       // 정상 수강료
  discountAmount  Int       @default(0)
  finalFee        Int       // 최종 수강료

  status          EnrollmentStatus  // ACTIVE/WAITING/SUSPENDED/COMPLETED/WITHDRAWN/CANCELLED
  enrollSource    EnrollSource?     // VISIT/PHONE/ONLINE/REFERRAL/SNS/OTHER
  staffId         String    // 등록 처리 직원

  // 재등록 여부
  isRe            Boolean   @default(false)  // 재등록 여부
  prevEnrollmentId String?  // 이전 수강 등록 ID

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  student         Student   @relation(...)
  product         ComprehensiveCourseProduct? @relation(...)
  cohort          Cohort?   @relation(...)
  specialLecture  SpecialLecture? @relation(...)
  staff           AdminUser @relation(...)
  payments        Payment[]
  leaveRecords    LeaveRecord[]

  @@map("course_enrollments")
}

// 특강 단과 마스터 (관리자 설정)
model SpecialLecture {
  id                String    @id @default(cuid())
  name              String    // "25년 2차 대비 테마특강"
  lectureType       SpecialLectureType  // THEMED / SINGLE / INTERVIEW_COACHING
  examCategory      ExamCategory?  // 해당 수험 유형 (null이면 전체)
  startDate         DateTime
  endDate           DateTime

  // 복합 과목 여부
  isMultiSubject    Boolean   @default(false)
  fullPackagePrice  Int?      // 전과목 패키지 가격

  // 좌석 배정 여부 (특강별 설정 — 모든 특강에 적용되지 않음)
  hasSeatAssignment Boolean   @default(false)

  // 강의 방식 (라이브/현장 동시 운영 가능)
  hasLive           Boolean   @default(false)
  hasOffline        Boolean   @default(true)
  maxCapacityLive   Int?
  maxCapacityOffline Int?

  waitlistAllowed   Boolean   @default(true)
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())

  subjects          SpecialLectureSubject[]  // 복합 과목 목록
  enrollments       CourseEnrollment[]
  discountPolicies  SpecialLectureDiscount[]

  @@map("special_lectures")
}

// 특강 과목별 상세 (복합 특강)
model SpecialLectureSubject {
  id              String    @id @default(cuid())
  lectureId       String
  subjectName     String    // "형법", "형사소송법"
  instructorId    String
  price           Int       // 개별 수강료
  instructorRate  Int       // 강사 배분율 %
  sortOrder       Int       @default(0)

  lecture         SpecialLecture @relation(...)
  instructor      Instructor @relation(...)
  seatAssignments SeatAssignment[]

  @@map("special_lecture_subjects")
}

// 좌석 배정 (hasSeatAssignment = true인 특강만 사용)
model SeatAssignment {
  id              String    @id @default(cuid())
  subjectId       String    // SpecialLectureSubject.id
  enrollmentId    String    // CourseEnrollment.id
  seatNumber      String    // "1-N12", "지-L3" 등
  assignedAt      DateTime  @default(now())

  @@unique([subjectId, seatNumber])
  @@map("seat_assignments")
}

// 특강 할인 정책
model SpecialLectureDiscount {
  id              String    @id @default(cuid())
  lectureId       String
  name            String    // "종합반 학원생 할인"
  discountType    DiscountType  // RATE / FIXED
  discountValue   Int       // % 또는 원
  condition       String?   // 적용 조건 설명
  isExclusive     Boolean   @default(false)  // 중복 적용 불가 여부
  isActive        Boolean   @default(true)

  @@map("special_lecture_discounts")
}

enum SpecialLectureType { THEMED SINGLE INTERVIEW_COACHING }

// 특강 강사 정산 기록
model SpecialLectureSettlement {
  id                  String    @id @default(cuid())
  specialLectureId    String
  instructorId        String
  settlementMonth     String    // "2026-03"
  totalRevenue        Int       // 총 수강료 합계
  instructorRate      Int       // 배분율 (스냅샷)
  instructorAmount    Int       // 강사 정산액
  academyAmount       Int       // 학원 수입
  status              SettlementStatus  // PENDING / PAID
  paidAt              DateTime?
  note                String?
  createdAt           DateTime  @default(now())

  @@unique([specialLectureId, settlementMonth])
  @@map("special_lecture_settlements")
}

enum CourseType       { COMPREHENSIVE SPECIAL_LECTURE }
enum ExamCategory     { GONGCHAE GYEONGCHAE SOGANG CUSTOM }
enum EnrollmentStatus { ACTIVE WAITING SUSPENDED COMPLETED WITHDRAWN CANCELLED }
enum EnrollSource     { VISIT PHONE ONLINE REFERRAL SNS OTHER }
enum SettlementStatus { PENDING PAID CANCELLED }
```

---

## 6. API 엔드포인트

```
# 종합반 상품 관리
GET    /api/settings/comprehensive-products         상품 목록
POST   /api/settings/comprehensive-products         상품 등록
PATCH  /api/settings/comprehensive-products/[id]    상품 수정

# 기수 관리
GET    /api/settings/cohorts                        기수 목록
POST   /api/settings/cohorts                        기수 등록
PATCH  /api/settings/cohorts/[id]                   기수 수정

# 특강 단과 관리
GET    /api/settings/special-lectures               특강 목록
POST   /api/settings/special-lectures               특강 등록
PATCH  /api/settings/special-lectures/[id]          특강 수정 (배분율 수정 = 원장만)

# 수강 등록
GET    /api/enrollments?examNumber=&type=&status=   수강 조회
POST   /api/enrollments                             수강 등록
PATCH  /api/enrollments/[id]                        수강 변경
DELETE /api/enrollments/[id]                        퇴원 처리 (status = WITHDRAWN)
POST   /api/enrollments/[id]/leave                  휴원 신청
PATCH  /api/enrollments/[id]/leave/return           복귀 처리

# 강사 관리
GET    /api/instructors                             강사 목록
POST   /api/instructors                             강사 등록
PATCH  /api/instructors/[id]                        강사 정보 수정

# 정산
GET    /api/settlements/special-lectures?month=     특강 강사 정산 조회
POST   /api/settlements/special-lectures/[id]/pay   정산 완료 처리

# 통계
GET    /api/enrollments/stats?year=&examCategory=&cohortId=  수강 현황 통계
```

---

## 7. 주요 화면 경로

```
/admin/enrollments                    ← 수강 등록/관리 목록
/admin/enrollments/new                ← 신규 수강 등록 (종합반/특강 선택)
/admin/enrollments/[id]               ← 수강 상세
/admin/enrollments/stats              ← 기수별 수강 현황 통계

/admin/settings/comprehensive-products ← 종합반 상품 관리
/admin/settings/cohorts               ← 기수 관리
/admin/settings/special-lectures      ← 특강 단과 관리
/admin/settings/instructors           ← 강사 마스터

/admin/settlements/special-lectures   ← 특강 강사별 정산
```

---

## 8. 수납 연계 정책

| 수강 유형 | 수납 카테고리 | 정산 방식 |
|---|---|---|
| 종합반 | `COMPREHENSIVE` | 전액 학원 수익 |
| 특강 단과 | `SPECIAL_LECTURE` | 강사 배분율 % 분리 |

**정산 분리 원칙:**
- 종합반 수강료와 특강 단과 수강료는 동일한 `Payment` 테이블에 기록
- `courseType` 필드로 구분
- 일계표/월계표에서 별도 탭으로 표시
- 특강 단과는 추가로 `SpecialLectureSettlement`에 강사별 정산 기록

---

## 9. 원생 등록 (Student Master)

> **학번 = 수험번호 (examNumber)**
> 학원이 자체 부여하는 원생 고유 번호 (예: 81697).
> 공무원 시험 수험번호와 무관하며, 시스템 전반의 원생 식별자로 사용된다.
> 원생이 처음 학원에 방문할 때 자동 채번되며, 이후 모든 수강·성적·납부 기록에 이 번호로 연결된다.

### 9-1. 원생 등록 화면

```
/admin/students/new  (또는 원생 등록 모달)

원생 등록
══════════════════════════════════════════════════════
기본 정보
  학번(수험번호): [ 81697 자동채번 ]  등급: [ 상담 ▼ ]

  이름: [        ]   별칭: [        ]
  성별: [ 남자 ▼ ]   생년월일: [ 년 ] [ 월 ] [ 일 ]  [ 양력 ▼ ]
  나이: [   ]

  출입 카드: [              ] [변경]
  NFC:      [              ] [변경]
  담임 선생님: [ 선택 안함 ▼ ]

  원생 구분: [ 미취학원생 ▼ ]  [ 선택안함 ▼ ]
  직업:      [        ]
  학교/학년: [        ] [  0 ]학년

연락처
  전화번호:        [ 02 ▼ ] [       ] - [       ]
  원생 휴대전화:   [ 010 ▼ ] [      ] - [       ]
  부모 이름:       [        ]  [ 어머니 ▼ ]
  부모 휴대전화:   [ 010 ▼ ] [      ] - [       ]
  e-메일:          [        ] @ [ 메일선택 ▼ ]
  우편번호:        [        ] [찾기]
  주소:            [                                    ]
  메모:            [                                    ]

기타
  등록 동기: [ 등록 동기 ▼ ]
  방문 동기: [ 방문 동기 ▼ ]
  최초 등록일자: [ 2026-03-15 ]

[형제 등록]  [확인]  [창 닫기]
══════════════════════════════════════════════════════
```

### 9-2. 원생 등급 코드 (StudentGrade)

| 코드 | 이름 | 설명 |
|---|---|---|
| `CONSULTING` | 상담 | 방문 상담 중 (수강 전) |
| `ENROLLED` | 수강 | 현재 수강 중 |
| `SUSPENDED` | 휴원 | 휴원 처리됨 |
| `WITHDRAWN` | 퇴원 | 퇴원 처리됨 |
| `GRADUATED` | 수료 | 수강 완료 |

### 9-3. 학번(수험번호) 채번 규칙

```
- 시스템 자동 채번 (관리자가 직접 입력 불가)
- 순차 증가 방식 (예: 81697, 81698, 81699, ...)
- 한 번 부여된 학번은 변경 불가
- 퇴원 후 재등록 시 동일 학번 유지
```

```prisma
// 원생 마스터 (기존 Student 모델 확장)
model Student {
  examNumber    String   @id  // 학번=수험번호 (학원 자동채번, 불변)
  name          String
  nickname      String?  // 별칭
  gender        Gender?  // MALE / FEMALE
  birthDate     DateTime?
  birthDateType BirthDateType?  // SOLAR / LUNAR
  grade         StudentGrade @default(CONSULTING)

  // 연락처
  phone         String?   // 일반 전화
  mobile        String?   // 원생 휴대전화
  email         String?
  address       String?
  zipCode       String?

  // 부모 정보
  parentName    String?
  parentRelation String?  // "어머니" / "아버지"
  parentMobile  String?

  // 학교/직업
  school        String?
  schoolYear    Int?
  occupation    String?

  // 원생 구분 (StudentType 기존 정의와 동일)
  studentType   StudentType  @default(ACADEMY)

  // 카드/NFC
  cardId        String?   // 출입 카드 ID
  nfcId         String?

  // 관리
  teacherId     String?   // 담임 선생님
  enrollReason  String?   // 등록 동기
  visitReason   String?   // 방문 동기
  memo          String?
  firstRegisteredAt DateTime @default(now())

  @@map("students")
}

enum BirthDateType { SOLAR LUNAR }
enum StudentGrade  { CONSULTING ENROLLED SUSPENDED WITHDRAWN GRADUATED }
```

---

## 10. 수강대장 (Enrollment Ledger)

> **기존 엑셀 "2025년 1월 수강대장" 형식을 시스템에서 동일하게 조회·출력**
> 매일 또는 월별 출력하여 대표님/원장님께 보고하는 공식 문서.

### 10-1. 수강번호 채번 규칙

```
수강번호 = YY-NNNN 형식
예) 26-0101  (26년도 101번째 수강 등록)

- YY: 등록 연도 뒤 2자리
- NNNN: 해당 연도 순차 번호 (4자리, 0패딩)
- 수험번호(학번)와 완전히 별개
- 취소·환불 시에도 번호 유지 (삭제 불가)
```

### 10-2. 수강대장 화면

```
/admin/enrollments/ledger

종합반 수강대장 (2026년 1월)
══════════════════════════════════════════════════════
기간: [ 2026-01 ▼ ]  기수: [ 전체 ▼ ]  유형: [ 공채 ▼ ]  상태: [ 전체 ▼ ]

No.  수강번호  학번(수험번호)  성명  직렬  신규수강과목
     단과수강과목  원수강료  할인금액(사유)  결제수강료  교재비  교재이벤트
     납부방법  카드입금자(카드사)  결제금액
     등록일  검정제  수업시작일  수강일수  수강종료일
     핸드폰  학교/학과  재수강횟수  현금영수증번호  환불금액

예시 행:
1  26-0101  81697  홍길동  공채  12개월 기본반
            형법테마특강  3,340,000  -240,000(재수강)  3,100,000  80,000  -
            계좌이체  -  3,180,000
            2026-01-03  -  2026-01-06  365일  2026-12-31
            010-1234-5678  서울대/법학과  1회  2026-012345  -

[엑셀 내보내기]  [수강대장 출력(PDF)]
══════════════════════════════════════════════════════
```

### 10-3. 수강대장 컬럼 전체 명세

| 컬럼 | 설명 | 비고 |
|---|---|---|
| 수강번호 | YY-NNNN 자동채번 | 수강 등록 시 부여 |
| 학번(수험번호) | 원생 고유 ID | 학원 자동채번 |
| 성명 | 원생 이름 | |
| 직렬 | 공채/경채/소방 | ExamCategory |
| 신규수강과목 | 등록한 종합반 상품명 | |
| 단과수강과목 | 동시 등록한 특강 단과 과목 | 없으면 빈칸 |
| 원수강료 | 정상 수강료 | regularFee |
| 할인금액 | 할인액 + 사유 | discountAmount + 사유 |
| 결제수강료 | 최종 수강료 | finalFee |
| 교재비 | 교재 판매 금액 | 0이면 빈칸 |
| 교재이벤트 | 설명회 무료 등 이벤트 | |
| 납부방법 | 계좌/카드/현금/포인트 | |
| 카드입금자(카드사) | 카드사명 또는 이체인 성명 | BC/롯데/KB/신한/현대 등 |
| 결제금액 | 실제 납부 금액 | 분납 시 1회차 금액 |
| 등록일 | 수강 등록일 | createdAt |
| 검정제 | 만능검/영어 등 검정 과정 | 별도 등록 시 표시 |
| 수업시작일 | 실제 수업 시작일 | startDate |
| 수강일수 | 수강 기간(일수) | |
| 수강종료일 | 수강 만료일 | endDate |
| 핸드폰 | 원생 휴대전화 | |
| 학교/학과 | 학교명 및 학과 | |
| 재수강횟수 | 이전 수강 횟수 | |
| 현금영수증번호 | 현금영수증 발급 번호 | 카드 결제 시 빈칸 |
| 환불금액 | 환불된 금액 | 0이면 빈칸 |

### 10-4. 수강대장 DB 추가 필드

```prisma
// CourseEnrollment에 추가
model CourseEnrollment {
  // ... 기존 필드 ...

  enrollmentNumber  String   @unique  // 수강번호 (YY-NNNN)
  textbookFee       Int      @default(0)  // 교재비
  textbookEvent     String?             // 교재 이벤트명 (설명회 무료 등)
  cardCompany       String?             // 카드사명 (BC/롯데/KB/신한 등)
  cardHolder        String?             // 카드입금자 (이체인 성명)
  certificationProg String?             // 검정 과정 (만능검/영어 등)
  reEnrollCount     Int      @default(0) // 재수강 횟수
  cashReceiptNo     String?             // 현금영수증 번호
}
```

---

## 11. 일일 수강료 입금 내역서 (Daily Report)

> 매일 당일 등록자 목록과 수납 집계를 출력하여 대표님/원장님께 보고

### 11-1. 일일 내역서 화면

```
/admin/enrollments/daily-report

일일 수강료 입금 내역서
══════════════════════════════════════════════════════
날짜: [ 2026-01-03 ◀ ▶ ]     [오늘]

당일 등록자 목록
No.  성명   수강번호  직렬  신규수강과목  결제수강료  교재비  결제방식    등록일       현금영수증
1   홍길동  26-0101  공채  12개월기본반  3,100,000   80,000  계좌이체  2026-01-03  번호없음
2   김영희  26-0102  경채  10개월경채반  2,500,000       -   카드(KB)  2026-01-03  -
3   이철수  26-0103  공채  8개월기본반    2,000,000   50,000  현금      2026-01-03  2026-00123

══════════════════════════════════════════════════════
일일 수강 종합 현황

구분        현금              계좌이체           카드             합계
수강료  800,000원 / 1건  3,100,000원 / 1건  2,500,000원 / 1건  6,400,000원 / 3건
교재비   50,000원 / 1건         80,000원 / 1건          -        130,000원 / 2건
합계    850,000원 / 1건  3,180,000원 / 1건  2,500,000원 / 1건  6,530,000원 / 3건

[출력(PDF)]  [엑셀 내보내기]
══════════════════════════════════════════════════════
```

### 11-2. API

```
GET  /api/enrollments/daily-report?date=2026-01-03
→ { data: { enrollments: [...], summary: { cash, transfer, card, total } } }
```

---

## 12. 미납자 관리 (종합반 전용)

> 수강료를 미납한 종합반 수강생 현황 조회 및 독촉 발송

### 12-1. 미납 현황 화면

```
/admin/enrollments/unpaid

미납자 현황 (종합반)
══════════════════════════════════════════════════════
기준: [ 2026-03 ▼ ]  기수: [ 전체 ▼ ]  유형: [ 공채 ▼ ]

미납 요약
  총 미납 인원: 17명   미납 총액: 17,800,000원

미납자 목록
No.  수강번호  학번  성명  기수  수강료    납부금액  미납금액  미납회차  최종납부일  연락처          비고
1   26-0015  72341  박○○  52기  3,100,000  1,550,000  1,550,000   2회차  2026-01-15  010-xxxx-xxxx
2   26-0023  69127  최○○  52기  2,500,000         0   2,500,000   전미납  -          010-xxxx-xxxx

[선택] [문자 발송]  [카카오 알림톡 발송]  [엑셀 내보내기]
══════════════════════════════════════════════════════

미납 독촉 문자 발송
  대상: 선택된 미납자 X명
  발송 내용: "안녕하세요. ○○원입니다. 수강료 [금액]원이 미납 중입니다. 납부 후 영수증 제출 부탁드립니다."
  [발송]
══════════════════════════════════════════════════════
```

### 12-2. 분납 스케줄 및 미납 판별

```
분납 설정 예:
  2회 분납: 1회차 2026-03-01 / 2회차 2026-04-01

미납 판별 기준:
  → 분납 회차별 납부 예정일 기준으로 미납 여부 판단
  → 분납 스케줄은 PaymentSchedule 테이블로 관리
```

```prisma
// 분납 스케줄
model PaymentSchedule {
  id             String    @id @default(cuid())
  enrollmentId   String
  installmentNo  Int       // 회차 (1, 2, 3, ...)
  dueDate        DateTime  // 납부 예정일
  amount         Int       // 예정 금액
  paidAt         DateTime? // 실제 납부일 (null = 미납)
  paymentId      String?   // 연결된 Payment 레코드
  status         PaymentScheduleStatus  // PENDING / PAID / OVERDUE / CANCELLED

  @@unique([enrollmentId, installmentNo])
  @@map("payment_schedules")
}

enum PaymentScheduleStatus { PENDING PAID OVERDUE CANCELLED }
```

### 12-3. API

```
GET  /api/enrollments/unpaid?month=&cohortId=&examCategory=  미납자 목록
POST /api/enrollments/unpaid/notify                          독촉 문자/알림 발송
```

---

## 13. 환불자 관리 및 결산 (종합반 전용)

> 학원법 §18 환불 계산 기준을 적용한 환불 처리 및 월별·연도별 환불 결산

### 13-1. 환불 계산 기준 (학원법 §18)

```
수강 개시 전:  전액 환불
수강 기간 1/3 경과 전:  이미 납부한 수강료의 2/3 환불
수강 기간 1/2 경과 전:  이미 납부한 수강료의 1/2 환불
수강 기간 1/2 경과 후:  환불 없음

공제 항목:
  - 행정 수수료: 원장 설정 (예: 10,000원)
  - 교재비: 이미 수령한 교재는 공제
  - 기타 공제 사유: 메모 입력

환불 금액 = 환불 대상 금액 - 공제 항목 합계
```

### 13-2. 환불 처리 화면

```
/admin/enrollments/[id]/refund

환불 처리 — 홍길동 (26-0101)
══════════════════════════════════════════════════════
수강 정보
  수강 상품:   공채 12개월 기본반
  수강 기간:   2026-01-06 ~ 2026-12-31 (365일)
  납부 금액:   3,100,000원
  환불 신청일: [ 2026-02-15 ]

수강 기간 경과 계산
  전체 기간:  365일
  경과 일수:  40일 (11%)
  → 1/3(122일) 경과 전  ∴ 납부액의 2/3 환불 가능

환불 계산
  환불 가능 금액: 3,100,000 × 2/3 = 2,066,667원
  공제 항목:
    행정 수수료:  [ 10,000 ] 원
    교재비 공제:  [ 80,000 ] 원  ☑ 교재 수령 완료
    기타 공제:    [        ] 원  사유: [               ]
  공제 합계:      90,000원
  실제 환불 금액: 1,976,667원

환불 사유: [ 개인 사정 ▼ ]
           [ 취업        ]
           [ 군입대      ]
           [ 질병/부상   ]
           [ 이사        ]
           [ 기타: ____  ]
환불 메모: [                                         ]

환불 방법: [ 계좌이체 ▼ ]
환불 계좌: [ 은행 ▼ ] [ 계좌번호 ] [ 예금주 ]

담당자: [ 김교무 ▼ ]

[환불 처리] → 수강 상태 = WITHDRAWN + Refund 레코드 생성
══════════════════════════════════════════════════════
```

### 13-3. 환불 결산 화면

```
/admin/enrollments/refund-settlement

환불자 결산
══════════════════════════════════════════════════════
조회 기간: [ 2026년 ▼ ] [ 1월 ▼ ] ~ [ 3월 ▼ ]  유형: [ 공채 ▼ ]  기수: [ 전체 ▼ ]

환불 요약
  환불 건수: 8건   총 결제 금액: 24,800,000원
  총 공제 금액: 720,000원   실제 환불 금액: 18,340,000원

환불자 목록
No.  수강번호  학번   성명   기수  직렬  결제수강료   환불유형    환불사유  공제금액  환불금액    환불일       처리자
1   26-0015  72341  박○○  52기  공채  3,100,000  2/3 환불    개인사정   90,000  1,976,667  2026-02-15  김교무
2   26-0023  69127  최○○  51기  경채  2,500,000  전액 환불   취업           -  2,500,000  2026-01-20  이교무
...

[월별 환불 현황]  [연도별 환불 현황]  [엑셀 내보내기]  [환불 결산서 출력]
══════════════════════════════════════════════════════

월별 환불 현황 (2026년)
월        건수   결제금액 합계    공제금액   환불금액    환불률
1월         2건    5,600,000      100,000   5,243,333   2.1%
2월         3건    9,300,000      270,000   6,696,667   3.0%
3월         3건    9,900,000      350,000   6,400,000   2.8%
══════════════════════════════════════════════════════
```

### 13-4. DB 모델

```prisma
// 환불 레코드 (금전 레코드 삭제 불가 → 별도 테이블)
model Refund {
  id                String    @id @default(cuid())
  enrollmentId      String    // CourseEnrollment.id
  examNumber        String    // 수강생 학번
  refundType        RefundType     // FULL / TWO_THIRDS / HALF / NONE / CUSTOM
  refundReason      RefundReason   // PERSONAL / EMPLOYMENT / MILITARY / ILLNESS / RELOCATION / OTHER
  refundReasonNote  String?   // 기타 사유 상세

  paidAmount        Int       // 원래 납부 금액
  refundableAmount  Int       // 환불 가능 금액 (법 기준 계산)
  adminFee          Int       @default(0)  // 행정 수수료 공제
  textbookFee       Int       @default(0)  // 교재비 공제
  etcDeduction      Int       @default(0)  // 기타 공제
  etcDeductionNote  String?   // 기타 공제 사유
  actualRefundAmount Int      // 실제 환불 금액

  refundMethod      RefundMethod   // TRANSFER / CASH / CARD_CANCEL / POINT
  refundBankName    String?   // 환불 계좌 은행
  refundBankAccount String?   // 환불 계좌번호
  refundBankHolder  String?   // 예금주

  refundDate        DateTime  // 환불 처리일
  staffId           String    // 처리 직원

  // 경과 기간 스냅샷 (계산 근거 보관)
  totalDays         Int       // 전체 수강 기간
  elapsedDays       Int       // 경과 일수
  elapsedRate       Float     // 경과 비율 (0.0~1.0)

  createdAt         DateTime  @default(now())

  @@map("refunds")
}

enum RefundType   { FULL TWO_THIRDS HALF NONE CUSTOM }
enum RefundReason { PERSONAL EMPLOYMENT MILITARY ILLNESS RELOCATION OTHER }
enum RefundMethod { TRANSFER CASH CARD_CANCEL POINT }
```

### 13-5. API

```
POST  /api/enrollments/[id]/refund                환불 처리
GET   /api/refunds?from=&to=&cohortId=&examCategory=  환불 목록 조회
GET   /api/refunds/settlement?year=&month=        환불 결산 집계
GET   /api/refunds/[id]                           환불 상세
```

---

## 14. 수강 등록 UI 상세 (Modern Enrollment UX)

> 기존 프로그램의 수업 등록 화면을 현대적 UI로 재해석.
> **왼쪽**: 강의 선택 (연도별 트리) / **오른쪽**: 학생 정보 + 등록 설정

### 14-1. 수강 등록 화면 레이아웃

```
/admin/enrollments/new

수강 등록
══════════════════════════════════════════════════════
┌────────────────────────────────┬────────────────────────────────────┐
│  강의 선택                      │  학생 정보                          │
│  ──────────────────────────    │  학번: 81697  이름: 홍길동          │
│  검색: [         ] [찾기]       │  ─────────────────────────────     │
│  ☑ 그룹별로 보기                │  선택 강의                          │
│                                 │  [왼쪽 목록에서 강의를 선택하세요]  │
│  ▼ 2026년 수강반                │                                     │
│    [공채 26년] 12개월 종합반    │  담당 선생님: [ 김재일 ▼ ]          │
│      (현재 58명)                │  강의실: [ 6층 ▼ ]                  │
│    [공채 26년] 8개월 종합반     │  추가 정보: [            ]          │
│    참수리 52기                  │                                     │
│  ▶ 2025년 수강반                │  수강료: [ 3,100,000 ] 원           │
│                                 │  교재비: [    80,000 ] 원           │
│                                 │  수강 시작일: [ 2026-03-15 ▼ ]     │
│                                 │  고정 할인: [ 고정할인없음 ▼ ]      │
│                                 │                                     │
│                                 │  현재 인원: 58명 / 정원 120명       │
│                                 │                                     │
│                                 │  납부 방법: [ 카드 ▼ ]              │
│                                 │  ☑ 이 수업에 납부일 알림 SMS 전송   │
│                                 │  ☑ 수업 등록시 해당 교재 출고 처리  │
│                                 │  ☑ 수업 시간표 적용                 │
│                                 │  ☑ 등록된 수업의 시간표와 병합      │
└────────────────────────────────┴────────────────────────────────────┘

[강의계획 확인]  [시간표 확인]  [교재 보기]           [확인]  [창 닫기]
══════════════════════════════════════════════════════
```

### 14-2. 수납 처리 화면

```
/admin/payments/[enrollmentId]  (또는 학생 카드에서 [수납] 탭)

수납 — 홍길동 (81697)
마지막 납부: 26년 3월 아침모의고사납부 (-60,000원 / 03월 15일) [자세히 보기]
══════════════════════════════════════════════════════
납부 항목 목록
구분    납부 항목          납부          미납   할인   구분    수강기간                  회수
수강료  공채 12개월 기본반  3,100,000      0      0           2026-03-15 ~ 2026-12-31
수강료  아침모의고사        60,000         0      0    2026년 10월분  26-03-15 ~ 26-10-23

[수강료 추가]  [교재비 추가]  [교구비 추가]  [원서비 추가]  [기타 추가]  [수정]  [삭제]

──────────────────────────────────────────────────────
금액 합계:  3,160,000원 (할인 있음)
납부 금액:  3,160,000원
미납 금액:      0원
할인 금액:      0원

납부 방법:  [ 현금 결제 ▼ ]         [ 납부자: 학생 본인 ▼ ]  □ 현금영수증
납부 일자:  [ 2026-03-15 ▼ ]
메모:       [                                              ]

□ 0원 항목 표시  ☑ 교재비 자동 추가  ☑ 영수증 출력  □ 수강증 출력  □ 수납 알림 SMS 전송

* 현금영수증을 발행해야하는 원생입니다.

[확인]  [창 닫기]
══════════════════════════════════════════════════════
```

**납부 항목 카테고리 코드:**

| 버튼 | 카테고리 | 설명 |
|---|---|---|
| 수강료 추가 | `COMPREHENSIVE` / `SPECIAL_LECTURE` | 종합반·특강 수강료 |
| 교재비 추가 | `TEXTBOOK` | 교재 판매 |
| 교구비 추가 | `SUPPLIES` | 기타 교구 |
| 원서비 추가 | `APPLICATION_FEE` | 시험 원서 대행 |
| 기타 추가 | `ETC` | 기타 수납 |

---

## 15. 학생 상세 페이지 (Student Detail)

> 기존 프로그램의 학생 카드를 현대적 웹 UI로 재구성.
> 미납금·포인트·등록기간이 상단에 항상 표시되며, 탭별로 상세 정보 접근.

### 15-1. 학생 상세 페이지 구조

```
/admin/students/[examNumber]

══════════════════════════════════════════════════════
상단 학생 카드 (항상 표시)
┌─────────────────────────────────────────────────────────────────────┐
│ [사진]  홍길동 (81697)  별칭: 빈장  남 · 성적우수자               │
│         담임: 김재일  /  등록: 2010-01-04  (194개월)               │
│         미납금: 60,000원 ⚠  포인트: 9,500P  다음납부일: 04-01     │
│         [수납 처리]  [SMS 발송]  [수강 등록]  [상담 기록]          │
└─────────────────────────────────────────────────────────────────────┘

탭 메뉴:
[ 기본 ] [ 수업 ] [ 교재 ] [ 수납 ] [ 출결 ] [ 성적 ]
[ 상담 ] [ SMS ] [ 가족 ] [ 연기 ]
══════════════════════════════════════════════════════
```

### 15-2. 탭별 내용 요약

| 탭 | 내용 |
|---|---|
| 기본 | 개인정보, 원생구분, 직업, 학교, 이메일, 등록동기, 방문동기, 형제, 현금영수증 여부 + **선생님 메모** |
| 수업 | 현재 수강 중인 강의 목록, 수강 이력 |
| 교재 | 교재 구매·출고 이력 |
| 수납 | 전체 납부 이력, 미납 현황, 수납 처리 |
| 출결 | 출결 달력, 출석률 통계 |
| 성적 | 성적 이력, 아침·월말·외부 모의고사 통합 조회 |
| 상담 | 면담 기록, 상담 일지 |
| SMS | 발송 이력, 수신 거부 여부 |
| 가족 | 가족/형제 연결 정보 |
| 연기 | 수강 연기 이력 |

### 15-3. 기본 탭 (기존 프로그램 참고)

```
기본 탭
┌─────────────────────────────┬──────────────────────────────────────┐
│ 원생 구분: [ 일반인 ]        │ ● 요약 정보  ○ 추가 입력 정보         │
│ 직업:      [         ]       │ ○ 선생님 메모                         │
│ 학교:      [    ] [   학년]  │                                       │
│ e-메일:    [         ]       │ ┌──────────────────────────────────┐  │
│ 다음납부일:[         ]       │ │ (선생님 메모 영역 — 자유 입력)   │  │
│ 미납금:    60,000원 [변경]   │ │                                  │  │
│ 포인트:     9,500P  [변경]   │ │                                  │  │
│ 학원등록일: 2010-01-04       │ │                                  │  │
│            (194개월)         │ └──────────────────────────────────┘  │
│ 등록동기:  [         ]       │                                       │
│ 방문동기:  [         ]       │                                       │
│ 형제:      [         ][변경] │                                       │
│ ☑ 현금영수증 발급원생        │                                       │
└─────────────────────────────┴──────────────────────────────────────┘
```

### 15-4. 학생 상세 추가 DB 필드

```prisma
// Student 모델 추가 필드
model Student {
  // ... 기존 필드 ...
  teacherMemo    String?   // 선생님 메모 (자유 입력)
  grade          StudentGradeLabel?  // 등급 레이블 (성적우수자, VIP 등)
  cashReceiptRequired Boolean @default(false)  // 현금영수증 발급 의무
  nextPaymentDate DateTime?  // 다음 납부 예정일
  siblingExamNumber String?  // 형제 학번 연결
}
```

---

## 16. 수강반 조회 (Class Browser)

> 연도별·과정별 수강생 현황을 트리 구조로 탐색하고 수강반별 인원 및 정보를 확인한다.
> 기존 프로그램의 "전체 수업" 트리와 동일한 방식의 탐색 UI 제공.

### 14-1. 수강반 트리 화면

```
/admin/classes

수강반 조회
══════════════════════════════════════════════════════
검색: [ 수강반명 또는 원생 이름 ]  [찾기]

▼ 전체 수업
  ▶ 2026년 수강반
  ▼ 2025년 수강반
      ★ 26년 1차대비 리스타트 종합반       (32명)
      [공채 25년] 12개월 종합반             (58명)
      [공채/경채 25년] 6개월 종합반         (24명)
      [공채 25년] 8개월 종합반              (41명)
      [공채 25년] 10개월 종합반             (36명)
      [공채 25년] 14개월 종합반             (19명)
      참수리 49기                           (38명)
      참수리 50기                           (25명)
      참수리 51기                           (70명)
      [25년 9월] 26년 1차대비 종합반        (96명)
  ▶ 2024년 수강반
  ▶ 2023년 수강반
  ...
  ▼ 합격자 명단
      13년 2차 최종합격자
      14년 1차 필기합격자
      14년 1차 최종합격자
      ...
══════════════════════════════════════════════════════
```

### 14-2. 수강반 상세 (클릭 시)

```
수강반 상세 — [공채 25년] 12개월 종합반
══════════════════════════════════════════════════════
기간: 2025-01-06 ~ 2025-12-31  /  기수: 49기  /  총 58명

수강 상태별 요약
  수강중: 42명  /  퇴원: 10명  /  수료: 6명  /  미납: 3명

수강생 목록
No.  학번    성명   등록일       수강료       납부상태  연락처          현재상태  비고
1   72341  홍길동  2025-01-06  3,100,000   완납       010-1234-5678  수강중
2   69127  김수험  2025-01-08  3,100,000   미납1회    010-2345-6789  수강중    ⚠ 2회차 미납
3   81203  이합격  2025-01-10  3,100,000   완납       010-3456-7890  수료      ✓ 필기합격

[전체 명단 엑셀 내보내기]  [문자 발송]  [미납자 보기]
══════════════════════════════════════════════════════
```

### 14-3. 수강반 분류 체계

```
수강반은 연도 + 과정명 조합으로 자동 분류된다.

연도별 그룹: 수강 시작일의 연도 기준
과정명: ComprehensiveCourseProduct.name 또는 Cohort.name
표시 순서: 최신 연도 우선, 같은 연도 내에서는 시작일 기준 정렬

기수(참수리 49기 등) = Cohort 기준 별도 분류 가능
특강반 / 설명회반 등은 SpecialLecture 별도 트리 항목
```

### 14-4. API

```
GET  /api/classes/tree                    수강반 트리 전체 구조 (연도별 그룹)
GET  /api/classes/[classId]/members       수강반 수강생 목록
GET  /api/classes/search?q=               수강반명 또는 원생명 검색
```

---

## 17. 합격자 명단 관리

> 필기합격자 · 최종합격자를 연도별 · 시험차수별로 등록·조회한다.
> 학원의 핵심 성과 지표이며, 기수별 합격률 통계에 활용된다.

### 17-1. 합격자 명단 화면

```
/admin/passers

합격자 명단
══════════════════════════════════════════════════════
조회: [ 2026년 ▼ ]  차수: [ 전체 ▼ ]  유형: [ 전체 ▼ ]  기수: [ 전체 ▼ ]

합격 유형별 탭:
  [ 필기합격자 (Written) ]  [ 최종합격자 (Final) ]  [ 전체 ]

──────────────────────────────────────────────────────
▼ 2026년 1차 필기합격자
No.  학번    성명   기수  공채/경채  시험일       등록일       비고
1   72341  홍길동  52기   공채     2026-04-20  2026-04-25  서울청 순경
2   69127  김수험  51기   공채     2026-04-20  2026-04-25

▼ 2026년 1차 최종합격자
...
──────────────────────────────────────────────────────

[합격자 등록]  [엑셀 내보내기]  [합격 현황 통계]
══════════════════════════════════════════════════════
```

### 15-2. 합격자 등록

```
합격자 등록
  학생 검색: [ 학번 또는 이름 ]  [검색]
  합격 유형: [ ● 필기합격  ○ 최종합격 ]
  시험 연도: [ 2026 ]  차수: [ 1차 ▼ ]
  시험일:    [ 2026-04-20 ]
  응시청:    [ 경찰청 서울청 ▼ ]
  직급:      [ 순경 ▼ ]
  비고:      [                ]
  [등록]
```

### 15-3. 합격 현황 통계

```
/admin/passers/stats

합격 현황 통계
══════════════════════════════════════════════════════
기준: [ 2026년 ▼ ]  기수: [ 전체 ▼ ]

기수별 합격 현황
기수    등록  퇴원  수료  필기합격  최종합격  최종합격률
52기     96    3    0     12        8       8.3%
51기     70    5    4     18       11      15.7%
50기     25    4    3     15        9      36.0%
49기     38    2    8     20       14      36.8%

연도별 합격자 추이 (차트)
  2022: 필기 XX명 / 최종 XX명
  2023: 필기 XX명 / 최종 XX명
  2024: 필기 XX명 / 최종 XX명
  2025: 필기 XX명 / 최종 XX명

[엑셀 내보내기]
══════════════════════════════════════════════════════
```

### 15-4. DB 모델

```prisma
// 합격자 기록
model PassRecord {
  id            String      @id @default(cuid())
  examNumber    String      // 학번(수험번호)
  passType      PassType    // WRITTEN / FINAL
  examYear      Int         // 시험 연도 (2026)
  examCycle     Int         // 차수 (1, 2, 3)
  examDate      DateTime?   // 시험일
  examAgency    String?     // 응시청 (경찰청 서울청 등)
  rank          String?     // 직급 (순경, 경장 등)
  cohortId      String?     // 기수 ID
  note          String?
  registeredAt  DateTime    @default(now())
  staffId       String?     // 등록 처리 직원

  @@unique([examNumber, passType, examYear, examCycle])
  @@map("pass_records")
}

enum PassType { WRITTEN FINAL }
```

### 15-5. API

```
GET   /api/passers?year=&cycle=&type=&cohortId=    합격자 목록
POST  /api/passers                                  합격자 등록
PATCH /api/passers/[id]                             합격자 정보 수정
GET   /api/passers/stats?year=&cohortId=            합격 현황 통계
```

---

---

## 18. 미등록자(상담) 관리

> 학원에 방문하거나 전화/온라인으로 상담했지만 **아직 수강 등록을 하지 않은 방문자**를 별도 관리한다.
> 상담 전환율(미등록→등록) 분석 및 후속 연락 관리에 활용된다.

### 18-1. 미등록자 목록 화면

```
/admin/consultations

미등록자(상담 방문자) 관리
══════════════════════════════════════════════════════
조회: [ 전체 ▼ ]  기간: [ 2026-01-01 ~ 2026-12-31 ]  전환: [ 전체 ▼ ]
[검색어 입력]  [검색]

──────────────────────────────────────────────────────
번호  방문일      성명    연락처          관심강좌         상담자  전환여부  비고
1    2026-03-10  이방문  010-5555-6666  26년 종합반 52기  김실장  미전환    재연락 예정
2    2026-03-08  박상담  010-7777-8888  특강 단과        이상담  ✅ 전환   26-0052

[미등록자 등록]  [엑셀 내보내기]  [전환율 통계]
══════════════════════════════════════════════════════
```

### 18-2. 미등록자 등록

```
미등록자 등록
  방문일:      [ 2026-03-10 ]
  방문 경로:   [ ● 직접방문  ○ 전화  ○ 온라인  ○ 소개 ]
  성명:        [ 이방문 ]
  연락처:      [ 010-5555-6666 ]
  생년월일:    [ 1998-05-20 ] (선택)
  관심 강좌:   [ 26년 종합반 52기 ▼ ] (복수 선택 가능)
  상담자:      [ 김실장 ▼ ]
  상담 내용:   [                                     ]
  재연락 예정: [ 2026-03-15 ]
  비고:        [                                     ]
  [등록]
```

### 18-3. 미등록자 상세

```
미등록자 상세
──────────────────────────────────────────────────────
이름: 이방문   연락처: 010-5555-6666   방문일: 2026-03-10
관심강좌: 26년 종합반 52기

상담 이력
  2026-03-10  김실장  "수강료 문의, 할부 가능 여부 확인 요청"
  2026-03-12  이상담  "재연락 - 등록 의사 있음, 다음주 방문 예정"

재연락 예약: 2026-03-17

[수강 등록 전환]  [상담 이력 추가]  [삭제]
──────────────────────────────────────────────────────
```

- **수강 등록 전환** 버튼 클릭 시: 원생 등록(§9) 화면으로 이동하며 이름·연락처 자동 채워짐
- 전환 완료 시: 미등록자 레코드에 `enrolledAt`, `enrollmentNumber` 기록 및 전환 상태 표시

### 18-4. 전환율 통계

```
/admin/consultations/stats

전환율 통계
══════════════════════════════════════════════════════
기간: [ 2026년 1월 ▼ ~ 3월 ▼ ]  강좌: [ 전체 ▼ ]

방문자       등록전환      전환율
직접방문  43명     28명       65.1%
전화      17명      6명       35.3%
온라인    12명      5명       41.7%
소개      8명       7명       87.5%
──────────────
합계      80명     46명       57.5%

[엑셀 내보내기]
══════════════════════════════════════════════════════
```

### 18-5. DB 모델

```prisma
// 미등록자(상담 방문자)
model ConsultationVisit {
  id              String          @id @default(cuid())
  visitDate       DateTime
  visitChannel    VisitChannel    // WALK_IN / PHONE / ONLINE / REFERRAL
  name            String
  mobile          String
  birthDate       DateTime?
  interestedCourses String[]      // 관심 강좌명 배열
  consultantId    String?         // 상담 담당자 (Staff.id)
  note            String?
  followUpDate    DateTime?       // 재연락 예정일
  convertedAt     DateTime?       // 등록 전환 일시
  enrollmentNumber String?        // 전환 후 수강번호
  examNumber      String?         // 전환 후 학번
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  consultLogs     ConsultLog[]
  @@map("consultation_visits")
}

// 상담 이력 (미등록자 및 재학생 공용)
model ConsultLog {
  id              String          @id @default(cuid())
  visitId         String?         // ConsultationVisit.id (미등록자)
  examNumber      String?         // 재학생 상담시
  logDate         DateTime        @default(now())
  staffId         String
  content         String
  @@map("consult_logs")
}

enum VisitChannel { WALK_IN PHONE ONLINE REFERRAL }
```

### 18-6. API

```
GET   /api/consultations?channel=&converted=&from=&to=  미등록자 목록
POST  /api/consultations                                  미등록자 등록
GET   /api/consultations/[id]                            상세 조회
PATCH /api/consultations/[id]                            정보 수정
POST  /api/consultations/[id]/logs                       상담 이력 추가
POST  /api/consultations/[id]/convert                    수강 등록 전환
GET   /api/consultations/stats?from=&to=&channel=        전환율 통계
```

---

## 19. 모바일 수강증

> 학원에 등록한 모든 수강생에게 **모바일 수강증**을 발급한다.
> 종합반은 좌석번호 포함, 단과 특강은 강의실·시간 정보 포함.
> 학생 포털 앱에서 QR로 조회·표시하며, 출입 확인 및 신분 증명에 사용한다.

### 19-1. 모바일 수강증 형식

```
┌─────────────────────────────────┐
│  ⬛ [QR Code]            [학원 로고] │
│                                 │
│  홍길동                          │
│  수험번호: 81697                  │
│  수강번호: 26-0052               │
│                                 │
│  강좌명: 27년 1차 대비 종합반 52기    │
│  수강기간: 2026-01-03 ~ 2026-12-31  │
│                                 │
│  ┌──────────────┐               │
│  │  좌석번호         │               │
│  │   A-15          │               │
│  └──────────────┘               │
│                                 │
│  ⚠ 본 수강증은 본인만 사용 가능합니다 │
└─────────────────────────────────┘
```

- **단과 특강** 수강증: 좌석번호 대신 강의실명 + 강의 일시 표시
- **면접 코칭반** 수강증: 조 편성(그룹) 번호 표시
- 유효기간 = 수강 종료일까지 자동 만료

### 19-2. 수강증 발급 경로

| 경로 | 설명 |
|---|---|
| 수강 등록 완료 즉시 | 시스템이 자동 생성, 학생 포털에 즉시 표시 |
| 카카오 알림톡 | 등록 완료 알림 메시지에 포털 링크 포함 |
| 이메일 | 등록 완료 이메일에 수강증 링크/PDF 첨부 |
| 관리자 재발급 | 학생 상세 → 수납 탭 → [수강증 재발급] 버튼 |

### 19-3. 수강증 표시 정보

| 항목 | 종합반 | 단과 특강 | 면접 코칭반 |
|---|---|---|---|
| 학번(수험번호) | ✅ | ✅ | ✅ |
| 수강번호 | ✅ | ✅ | ✅ |
| 성명 | ✅ | ✅ | ✅ |
| 강좌명 | ✅ | ✅ | ✅ |
| 수강기간 | ✅ | ✅ | ✅ |
| **좌석번호** | ✅ 필수 | ✅ 선택 | ➖ |
| 강의실 | ➖ | ✅ | ✅ |
| **조 편성** | ➖ | ➖ | ✅ |
| QR 코드 | ✅ | ✅ | ✅ |

### 19-4. 좌석 배정 관리

```
/admin/enrollments/seats

좌석 배정 관리 — 27년 1차 대비 종합반 52기
══════════════════════════════════════════════════════
[강의실 선택: A강의실 ▼]  [일괄 자동 배정]  [엑셀 내보내기]

배정 현황: 96명 / 정원 100석

A-01 홍길동 (81697)   A-02 김수험 (72341)   A-03 [빈자리]  ...
A-04 이등록 (65291)   A-05 [빈자리]          A-06 박신청 (81234) ...

[개별 변경]  [미배정자 목록]
══════════════════════════════════════════════════════
```

### 19-5. DB 모델

```prisma
// CourseEnrollment에 좌석 추가 (기존 모델 확장)
// 이미 courseEnrollment에 seatNumber 필드 추가 필요
// → §10 수강대장의 CourseEnrollment 모델에 포함

// 수강증 발급 이력
model StudentCard {
  id              String     @id @default(cuid())
  enrollmentNumber String    // 수강번호 (YY-NNNN)
  examNumber      String
  issuedAt        DateTime   @default(now())
  issuedBy        String?    // 관리자 재발급시 staffId
  qrToken         String     @unique @default(cuid()) // QR 검증용
  revokedAt       DateTime?  // 무효화 일시
  @@map("student_cards")
}
```

### 19-6. API

```
GET   /api/students/[examNumber]/card              수강증 조회 (학생 포털)
POST  /api/enrollments/[enrollmentNumber]/card/reissue  관리자 재발급
GET   /api/enrollments/seats?courseId=             좌석 현황 조회
PATCH /api/enrollments/[id]/seat                   좌석 변경
POST  /api/enrollments/seats/auto-assign           자동 배정
```

---

## 20. 수강계약서 (학원법 §14)

> 종합반 수강 등록 시 **학원의 설립·운영 및 과외교습에 관한 법률 §14**에 따라
> 수강계약서를 의무 발행한다.

### 20-1. 수강계약서 발행 정책

| 구분 | 정책 |
|---|---|
| 발행 대상 | 종합반 등록 전원 (단과 특강·면접 코칭반은 선택) |
| 발행 시점 | 수납 완료 또는 수강 등록 완료 즉시 |
| 발행 형식 | B5 종이 출력 or 카카오 알림톡 링크 or 이메일 PDF 첨부 |
| 서명 방식 | 오프라인: 원생 직접 서명 후 사본 보관 / 디지털: 모바일 서명 (추후 구현) |
| 보관 | 원본 학원 보관, 사본 원생 교부 (학원법 의무) |

### 20-2. 수강계약서 포함 내용 (학원법 §14 기준)

```
══════════════════════════════════════════════════════
           경   찰   공   무   원   학   원
               수   강   계   약   서
══════════════════════════════════════════════════════

[원생 정보]
  성명: 홍길동                학번: 81697
  생년월일: 1999-03-15        연락처: 010-1234-5678
  주소: 서울시 강남구 테헤란로 123

[수강 정보]
  강좌명: 27년 1차 대비 종합반 52기
  수강번호: 26-0052
  수강기간: 2026-01-03 ~ 2026-12-31 (12개월)
  수강료: 1,200,000원

[납부 정보]
  납부 방법: □ 일시납  ■ 할부 (3회)
  납부 일정:
    1회: 2026-01-03  400,000원  (카드 국민은행)
    2회: 2026-02-03  400,000원
    3회: 2026-03-03  400,000원
  교재비: 50,000원  (별도)

[환불 규정] ← 학원법 §18 명시 의무
  수강 시작 전:    전액 환불
  1/3 경과 전:    2/3 환불
  1/2 경과 전:    1/2 환불
  1/2 경과 후:    환불 불가

[개인정보 수집·이용 동의] ← 필수 항목
  □ 동의  □ 미동의

원생(보호자) 서명: ________________   일자: 2026-01-03
학원 원장 서명:   ________________
══════════════════════════════════════════════════════
```

### 20-3. 수강계약서 발행 흐름

```
수납 완료
    │
    ▼
수강계약서 자동 생성 (DB 저장)
    │
    ├── [B5 출력] ──── 관리자 PC에서 PDF 출력 → 프린터 (B5)
    │
    ├── [카카오 발송] ─ 카카오 알림톡으로 계약서 PDF 링크 발송
    │
    └── [이메일 발송] ─ 등록 이메일로 계약서 PDF 첨부 발송
```

### 20-4. DB 모델

```prisma
model CourseContract {
  id                  String     @id @default(cuid())
  enrollmentNumber    String     @unique // 수강번호 1:1
  examNumber          String
  contractDate        DateTime
  courseName          String
  startDate           DateTime
  endDate             DateTime
  totalFee            Int
  textbookFee         Int        @default(0)
  paymentMethod       String     // 일시납/할부
  installmentCount    Int        @default(1)
  refundPolicyText    String     // 환불 규정 스냅샷 (발행 시점 기준)
  consentPersonalInfo Boolean    @default(false)
  issuedAt            DateTime   @default(now())
  printedAt           DateTime?
  kakaoSentAt         DateTime?
  emailSentAt         DateTime?
  signedAt            DateTime?  // 서명 일시 (디지털)
  staffId             String     // 발행 처리 직원
  @@map("course_contracts")
}
```

### 20-5. API

```
GET   /api/contracts/[enrollmentNumber]          수강계약서 조회
POST  /api/contracts/[enrollmentNumber]/print    PDF 생성 (B5 출력용)
POST  /api/contracts/[enrollmentNumber]/send/kakao  카카오 발송
POST  /api/contracts/[enrollmentNumber]/send/email  이메일 발송
PATCH /api/contracts/[enrollmentNumber]/sign     서명 처리
```

---

---

## 21. 기수제 운영 및 학가 관리

> 인터뷰 확정 사항 (2026-03-16)

### 21-1 기수제 개요

| 항목 | 내용 |
|------|------|
| 기수 단위 | 1개월(4주) |
| 기수 번호 | 연도+순번 (예: 2026-1기, 2026-2기) |
| 학가 계산 | 등록일부터 해당 강좌의 기수 종료일까지 |
| 기수 종료일 | 강좌(반)별로 관리자가 직접 설정 — 반마다 다름 |
| 중간 등록 | 가능 (기수 중간 등록 시 해당 기수 종료일까지 적용) |

### 21-2 기수 설정 UI

```
/admin/courses/[id]/settings

기수 설정
──────────────────────────────
2026-1기  시작: 2026-03-01  종료: 2026-03-31  [수정] [삭제]
2026-2기  시작: 2026-04-01  종료: 2026-04-30  [수정] [삭제]
                                              [+ 기수 추가]
```

---

## 22. 수강 변경 처리

> 인터뷰 확정 사항 (2026-03-16)

### 22-1 정책

- 수강 변경(반 이동, 강좌 추가/삭제)은 **창구 직원이 직접 처리**
- 학생 포털에서 온라인 신청 없음

### 22-2 변경 유형

| 유형 | 설명 | 처리 |
|------|------|------|
| 반 이동 | 동일 강좌 내 반 변경 (예: A반 → B반) | Enrollment 업데이트 |
| 강좌 추가 | 기존 수강 유지 + 새 강좌 추가 등록 | 신규 Enrollment 생성 |
| 강좌 삭제 | 기존 수강 강좌 수강 중단 | Enrollment 취소 + 환불 처리 |
| 수강료 조정 | 특별 할인 또는 추가 청구 | Payment 조정 레코드 생성 |

### 22-3 변경 이력 추적

```prisma
model EnrollmentChange {
  id            Int        @id @default(autoincrement())
  enrollmentId  Int
  enrollment    Enrollment @relation(fields: [enrollmentId], references: [id])
  changeType    String     // ROOM_CHANGE, COURSE_ADD, COURSE_DROP, FEE_ADJUST
  beforeValue   Json       // 변경 전 값
  afterValue    Json       // 변경 후 값
  reason        String?
  staffId       Int
  staff         Staff      @relation(fields: [staffId], references: [id])
  createdAt     DateTime   @default(now())
}
```

---

## 23. 휴원·복교 처리

> 인터뷰 확정 사항 (2026-03-16)

### 23-1 정책

- 휴원 시 학가(잔여 수강 기간) 보존
- 복교 시 잔여 학가를 이어받아 재개
- 휴원 기간의 수강료는 청구하지 않음 (잔여 기간 연장으로 처리)

### 23-2 처리 흐름

```
[수강 중]
   │
   │ 직원이 휴원 처리 (휴원 시작일 입력)
   ↓
[휴원 중]  (Enrollment status = PAUSED)
   │  pausedAt 기록, 잔여 일수 저장
   │
   │ 직원이 복교 처리 (복교일 입력)
   ↓
[수강 중]  (Enrollment status = ACTIVE)
      새 만료일 = 복교일 + 잔여 일수
```

### 23-3 API

```
POST   /api/enrollments/[id]/pause     # 휴원 처리
POST   /api/enrollments/[id]/resume    # 복교 처리
GET    /api/enrollments?status=PAUSED  # 현재 휴원 학생 목록
```

---

---

## 24. 강좌 정원 및 대기자 관리

> 인터뷰 확정 사항 (2026-03-16)

### 24-1 정원 관리

```prisma
// Course 모델에 추가
model Course {
  // 기존 필드...
  maxCapacity     Int?     // null = 무제한
  currentCount    Int      @default(0)   // 현재 수강 인원 (캐시)
  waitlistEnabled Boolean  @default(true)
  waitlist        Waitlist[]
}
```

### 24-2 대기자 모델

```prisma
model Waitlist {
  id          Int        @id @default(autoincrement())
  courseId    Int
  course      Course     @relation(fields: [courseId], references: [id])
  studentId   Int
  student     Student    @relation(fields: [studentId], references: [id])
  rank        Int        // 대기 순번
  status      WaitStatus @default(WAITING)
  notifiedAt  DateTime?  // 자리 있음 알림 발송 시각
  enrolledAt  DateTime?  // 실제 수강 등록 시각
  staffId     Int?       // 수동 안내 처리한 직원
  createdAt   DateTime   @default(now())
}

enum WaitStatus {
  WAITING    // 대기 중
  NOTIFIED   // 자리 있음 알림 발송됨
  ENROLLED   // 수강 등록 완료
  CANCELLED  // 취소
}
```

### 24-3 대기자 안내 방식 (두 가지 모두 지원)

- **자동**: 빈 자리 발생 시 카카오 알림톡 자동 발송 (1순위 대기자부터)
- **수동**: 직원이 대기자 명단 확인 후 직접 연락

### 24-4 포털 로그인 방식

학번(examNumber) + 생년월일 6자리 (예: 850601)
→ 비밀번호 초기화는 직원이 처리 후 연락

---

## ⚠️ 멀티지점 고려사항 (2026-03-21 추가)

### 데이터 격리
- 모든 수강 데이터 (CourseEnrollment, Student, ConsultationRecord, LeaveRecord)는 `academyId`로 격리됨
- 지점 관리자는 자신의 지점 학생/수강 데이터만 접근 가능
- SUPER_ADMIN은 전 지점 조회 가능

### 설정 독립화
- 강좌 마스터 (Course): 지점별 독립 생성·관리
- 기수 (Cohort): 지점별 독립 운영
- 특강 목록: 지점별 독립

### 개발 시 주의사항
- 수강 등록 API: `academyId` 반드시 포함
- 학생 검색: `where: { academyId: ctx.academyId }` 필터 적용
- 담임반 (Classroom): 지점별 독립 관리

*이 PRD는 `04_수납결제_정산_PRD.md`와 함께 읽는다. 수납 처리 상세 내용은 해당 문서를 참조.*
