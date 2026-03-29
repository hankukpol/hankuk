# 수납·결제·정산 시스템 PRD

**작성일**: 2026-03-13
**우선순위**: Phase 0~1 (핵심 기반)
**목적**: 이중 결제 방지, 카드 결제/취소/환불, 교재 판매, 일일·월별 정산, 수납 유형별 분리 정산을 완전하게 설계한다.

---

## 0. 설계 원칙

| 원칙 | 내용 |
|---|---|
| 이중 결제 방지 | 모든 결제 요청에 클라이언트 생성 idempotency key 적용 |
| 불변 이력 | 결제 기록은 절대 삭제하지 않음 — 취소/환불은 새 레코드로 |
| 분리 정산 | 수강료 / 시설비 / 교재 판매를 별도 원장(Ledger)으로 관리 |
| 실시간 잔액 | 학생별 미수금은 항상 최신 상태 유지 |
| 감사 추적 | 모든 금전 처리에 처리 직원 + 처리 시각 기록 |

---

## 1. 수납 유형 분류

```
수납 유형 (PaymentCategory)
│
├── TUITION          수강료 (강좌별 등록)
├── FACILITY         시설비 (사물함 / 스터디룸 / 자습실)
├── TEXTBOOK         교재 판매
├── MATERIAL         교구·소모품 판매
├── SINGLE_COURSE    단과 강좌 (POS)
├── PENALTY          위약금 (환불 시 공제액 별도 기록)
└── ETC              기타 수납
```

각 유형은 독립된 일계표 및 월계표로 집계된다.

---

## 2. 결제 수단

```
결제 수단 (PaymentMethod)
│
├── CASH             현금
├── CARD             카드 (VAN 단말기 연동)
├── TRANSFER         계좌이체
├── POINT            포인트 (전액 또는 부분 적용)
└── MIXED            혼합 결제 (예: 카드 50만 + 포인트 1만)
```

---

## 3. 결제 상태 흐름

```
PENDING ──────────────────→ APPROVED ──→ PARTIAL_REFUNDED
   │                            │
   │ (취소/실패)                 └──→ FULLY_REFUNDED
   ↓
CANCELLED
```

| 상태 | 설명 |
|---|---|
| `PENDING` | 처리 중 (카드 단말기 응답 대기) |
| `APPROVED` | 승인 완료 |
| `PARTIAL_REFUNDED` | 일부 환불 완료 |
| `FULLY_REFUNDED` | 전액 환불 완료 |
| `CANCELLED` | 결제 시도 취소/실패 |

---

## 4. 이중 결제 방지

### 4-1. Idempotency Key 방식

```
클라이언트가 결제 요청 전 UUID를 생성 → 요청 헤더에 포함
서버는 해당 키가 이미 처리된 결제인지 확인:
  - 처리된 키 → 기존 결제 결과 그대로 반환 (재처리 안 함)
  - 미처리 키 → 정상 처리 후 키 저장

X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

### 4-2. 동시성 잠금 (낙관적 잠금)

```
결제 처리 시:
  1. 학생 미수금 레코드에 version 컬럼 확인
  2. UPDATE ... WHERE version = :current_version
  3. 0 rows affected → 동시 수정 감지 → 에러 반환 (재시도 안내)
```

### 4-3. UI 단 이중 제출 방지

```
[수납 처리] 버튼 클릭 시:
  - 버튼 즉시 비활성화 (disabled)
  - 로딩 스피너 표시
  - 응답 완료 후 결과 화면으로 전환
  - 뒤로가기 방지 (popstate 이벤트 처리)
```

---

## 5. 수납 등록 화면 설계

### 5-1. 수강료 수납

```
/admin/payments/new?category=TUITION

수강료 수납 등록
══════════════════════════════════════════════════════
학생: [ 홍길동 (2605001) ]  [검색]

강좌: [ 2026 공채 종합반 ▼ ]
기간: 2026-03-01 ~ 2026-05-31
정상 수강료: 600,000원
할인:        ─ 30,000원  [ 재수강 5% ▼ ]
쿠폰:        ─ 10,000원  [쿠폰 코드 입력]
──────────────────────────────────────────
청구 금액:   560,000원

결제 수단
  [ ○ 현금  ● 카드  ○ 계좌이체  ○ 혼합 ]

카드 결제
  금액: 560,000원
  [카드 결제 요청 →]

현금영수증 발행
  [ ● 소득공제용  ○ 지출증빙용  ○ 발행 안함 ]
  휴대폰: 010-1234-5678  (자동)

비고: [                    ]
══════════════════════════════════════════════════════
[취소]                              [수납 처리]
```

### 5-2. 혼합 결제 (카드 + 포인트)

```
결제 수단: [ ○ 현금  ○ 카드  ○ 계좌이체  ● 혼합 ]

혼합 결제 내역
  카드:   [ 550,000 ] 원
  포인트: [  10,000 ] 원  (보유: 12,500P)
  ─────────────────────────
  합계:     560,000 원  ✅ 청구금액 일치

[카드 결제 요청 →]  (포인트는 카드 승인 후 자동 차감)
```

### 5-3. 교재 판매 수납

```
/admin/payments/new?category=TEXTBOOK

교재 판매
══════════════════════════════════════════════════════
학생: [ 홍길동 (2605001) ]  [검색]  (없으면 일반 판매 체크)
  [ ☐ 비회원 일반 판매 ]

교재 선택
  ┌──────────────────────────────────────────────────┐
  │ 교재명                  단가      수량   소계     │
  │ 2026 형법 기본서         25,000    [1]   25,000   │
  │ 2026 경찰학개론          22,000    [1]   22,000   │
  │ 2026 형소법 문제집       18,000    [0]       -    │
  │ [+ 교재 추가]                                    │
  └──────────────────────────────────────────────────┘

합계: 47,000원

결제 수단: [ ○ 현금  ● 카드  ○ 계좌이체 ]
══════════════════════════════════════════════════════
[취소]                              [판매 처리]
```

### 5-4. 시설비 수납 (사물함/스터디룸)

```
/admin/payments/new?category=FACILITY

시설비 수납
══════════════════════════════════════════════════════
학생: [ 홍길동 (2605001) ]

시설 선택
  [ ● 사물함  ○ 스터디룸  ○ 자습실 ]

사물함 배정
  구역: [ A구역 ▼ ]  번호: [ A-12 ▼ ]
  기간: 2026-03-01 ~ 2026-05-31  (3개월)
  금액: 30,000원

결제 수단: [ ● 현금  ○ 카드  ○ 계좌이체 ]
══════════════════════════════════════════════════════
[취소]                              [수납 처리]
```

---

## 6. 카드 결제 상세 흐름 (VAN사: KSNET 확정)

> **VAN사: KSNET** (2026-03-13 확정)
> - KSNET TCP/IP 통신 규격 준수
> - PC 에이전트 방식 (웹앱 → 로컬 에이전트 → KSNET 단말기)
> - KSNET 개발 문서: https://www.ksnet.co.kr (개발자 포털 연동 필요)

### 6-1. 정상 승인

```
① 웹앱: POST /api/payments/card/request
   Body: { amount, studentId, category, idempotencyKey }
   → DB에 PENDING 레코드 생성

② PC 에이전트 → VAN사 서버 → 단말기

③ 학생이 카드 삽입/태그/비밀번호 입력

④ VAN 승인 응답 수신:
   { approvalNo, cardCompany, cardNoMasked, installment, approvedAt }

⑤ 웹앱: POST /api/payments/card/confirm
   → PENDING → APPROVED
   → CardPayment 레코드 생성
   → 포인트 차감 (혼합 결제인 경우)
   → 현금영수증 발행 (설정된 경우)

⑥ 영수증 출력 화면 표시
```

### 6-2. 단말기 타임아웃/오류

```
60초 내 응답 없음 → 웹앱: 결제 상태 조회
  → VAN사에 거래 조회 전문 전송
  → 승인됨: APPROVED 처리
  → 미승인: CANCELLED 처리 + 사용자에게 안내
  → 조회 불가: 직원 수동 확인 안내
```

---

## 7. 취소 처리

### 7-1. 당일 카드 취소

```
결제 상세 → [결제 취소]

취소 요청
  원거래: 2026-03-13 09:15  승인번호: 12345678
  카드: 신한카드 **** 1234
  취소 금액: 600,000원 (전액)
  취소 사유: [드롭다운 또는 직접 입력]
  [취소 확인]

처리:
  VAN사에 취소 전문 전송 → 취소 승인번호 수신
  Payment 상태 → FULLY_REFUNDED
  RefundRecord 생성 (type: CARD_CANCEL)
  포인트 복원 (혼합 결제인 경우)
  현금영수증 취소 전송 (발행된 경우)
```

### 7-2. 익일 이후 카드 환불

```
취소 불가 기간 초과 시:
  ┌─────────────────────────────────────┐
  │ ⚠️ 카드 원거래 취소 불가            │
  │ 승인일: 2026-02-01                  │
  │                                     │
  │ 처리 방법을 선택하세요:             │
  │ ● 현금 환불로 처리                  │
  │ ○ 계좌이체 환불로 처리              │
  │                                     │
  │ 환불 금액: 300,000원                │
  │ 계좌: [은행 ▼] [계좌번호    ]       │
  └─────────────────────────────────────┘
  [환불 처리]

처리:
  Payment 상태 → FULLY_REFUNDED
  RefundRecord 생성 (type: CASH_REFUND / TRANSFER_REFUND)
  지급 처리 기록 (직원 서명 또는 처리자 ID)
```

---

## 8. 환불 처리 (전액 / 부분 환불)

### 8-1. 환불 정책 (학원법 기준)

학원법 환불 기준은 시스템 설정에서 관리자가 직접 설정한다.

```
/admin/settings/refund-policy

환불 정책 설정
  기준: 수강 시작일 기준

  [ + 구간 추가 ]

  수강 기간    환불 비율  환불 금액 계산
  ──────────────────────────────────────────
  1/3 미경과    →  전액 환불
  1/3 ~ 1/2    →  2/3 환불
  1/2 초과     →  환불 없음
  ──────────────────────────────────────────
  위약금 항목: [ ☐ 교재비 공제  ☑ 사물함 잔여일 환불 ]
```

### 8-2. 환불 계산기 (자동)

```
/admin/payments/[id]/refund

환불 계산
══════════════════════════════════════════════════════
수강생: 홍길동  강좌: 공채 종합반
수강 시작: 2026-03-01  퇴원 신청: 2026-03-28
수강 기간: 90일  경과: 27일 (30%)

환불 금액 계산
  원납부액:           600,000원
  경과 비율:          30% → 1/3 미경과 기준 적용
  환불 비율:          100% (전액)
  위약금:             ─ 0원
  교재비:             ─ 47,000원  (배부된 교재)
  ────────────────────────────────
  최종 환불액:        553,000원

환불 방법
  결제 수단 (원거래): 카드
  ┌────────────────────────────────────────┐
  │ 원거래 카드 취소 가능 여부: 불가       │
  │ (원거래 2026-02-15, 45일 경과)         │
  └────────────────────────────────────────┘
  환불 수단: [ ● 계좌이체  ○ 현금 ]
  계좌: [ 국민은행 ▼ ] [ 123-456-789012 ] 예금주: [홍길동]

승인: 원장 승인 필요 (금액 200,000원 이상)
══════════════════════════════════════════════════════
[저장 (승인 대기)]
```

### 8-3. 부분 환불

```
부분 환불 사례:
  - 혼합 결제: 교재 중 일부만 반품
  - 분할납부: 일부 회차만 납부된 상태에서 환불
  - 강좌 변경: 가격 차이만큼 환불 또는 추가 납부

부분 환불 처리:
  환불 금액: [200,000] 원  (원거래: 600,000원)
  잔여 납부 금액: 400,000원으로 조정

  Payment 상태 → PARTIAL_REFUNDED
  RefundRecord 생성 (amount: 200,000, type: PARTIAL)
  분할납부인 경우 → 잔여 납부 계획 자동 재계산
```

### 8-4. 환불 승인 워크플로우

```
환불 신청 (직원) → 승인 대기 (PENDING_APPROVAL)
    ↓
원장/교무 승인 화면 알림
    ↓
[승인] → 환불 처리 실행
[반려] → 신청 직원에게 반려 사유 알림
    ↓
환불 완료 → 학생 SMS 발송
```

---

## 9. 결제 이력 조회

### 9-1. 학생별 수납 이력

```
/admin/members/[id]/payments

홍길동 수납 이력
══════════════════════════════════════════════════════
              [전체 ▼] [전체 기간 ▼]  [검색]

날짜         유형       내역                   금액       결제 수단    상태
2026-03-13   수강료     공채 종합반 3월분       560,000원  카드        완납
2026-03-13   교재       형법기본서 외 1         47,000원   현금        완납
2026-03-01   시설비     A-12 사물함 3개월       30,000원   이체        완납
2026-02-15   수강료     공채 종합반 2월분       560,000원  카드        전액환불
  └ 환불      환불       퇴원 환불              -553,000원  계좌이체   완료

누계 납부:   1,197,000원
미수금:          0원

[수납 내역 PDF 출력]  [엑셀 다운로드]
══════════════════════════════════════════════════════
```

### 9-2. 전체 수납 이력

```
/admin/payments

수납 이력 전체
══════════════════════════════════════════════════════
기간: [2026-03-01] ~ [2026-03-31]
유형: [전체 ▼]  수단: [전체 ▼]  상태: [전체 ▼]
학생: [이름 또는 수험번호 검색]
[조회]

날짜         학생        유형      내역              금액       수단    처리자   상태
2026-03-13  홍길동      수강료    공채 종합반       560,000    카드    김교무   완납
2026-03-13  홍길동      교재      형법기본서 외     47,000     현금    박수납   완납
2026-03-13  김철수      수강료    경찰 종합반       520,000    이체    김교무   완납
...

합계: 1,127,000원  (건수: 3)
══════════════════════════════════════════════════════
```

---

## 10. 일일 정산 (일계표)

### 10-1. 일계표 화면

```
/admin/settlements/daily

일계표 — 2026-03-13 (목)
══════════════════════════════════════════════════════
[◀ 전날]  2026-03-13  [다음날 ▶]  [오늘]  [마감 처리]

──────────────────────────────────────────────────────
수납 집계
──────────────────────────────────────────────────────
유형          건수     금액
수강료           8    4,320,000원
교재 판매        5      235,000원
시설비           3       90,000원
단과 POS         2       80,000원
기타             1       50,000원
──────────────────────────────────────────────────────
수납 소계       19    4,775,000원

──────────────────────────────────────────────────────
결제 수단별 분류
──────────────────────────────────────────────────────
현금                  1,200,000원  (8건)
카드                  2,800,000원  (9건)
계좌이체               775,000원  (2건)
포인트 사용             없음
──────────────────────────────────────────────────────
수납 합계             4,775,000원

──────────────────────────────────────────────────────
환불 집계
──────────────────────────────────────────────────────
카드 취소                   0원  (0건)
현금/이체 환불         -300,000원  (1건)
──────────────────────────────────────────────────────
환불 합계              -300,000원

──────────────────────────────────────────────────────
실수입 합계           4,475,000원
══════════════════════════════════════════════════════

현금 시재 확인
  시스템 기록 현금: 1,200,000원
  실제 시재:       [1,200,000] 원  [확인]
  차이:                    0원  ✅

[일계표 출력]  [엑셀]  [마감 처리 →]
══════════════════════════════════════════════════════
```

### 10-2. 마감 처리

```
마감 처리 후:
  - DailySettlement 레코드 생성 (closedAt, closedBy)
  - 마감된 날은 수정 불가 (관리자만 재오픈 가능)
  - 마감 완료 배지 표시 🔒 마감됨

재오픈 조건:
  역할: SUPER_ADMIN 또는 원장
  재오픈 사유 기록 필수
```

---

## 11. 월별 정산 (월계표)

### 11-1. 월계표 화면

```
/admin/settlements/monthly

월계표 — 2026년 3월
══════════════════════════════════════════════════════
[◀ 전달]  2026-03  [다음달 ▶]

──────────────────────────────────────────────────────
유형별 월 수납 집계
──────────────────────────────────────────────────────
유형          건수       수납액       환불액      실수입
수강료          87    48,720,000    -2,400,000  46,320,000
교재 판매       54     2,890,000             -   2,890,000
시설비          31     2,325,000       -90,000   2,235,000
단과 POS        23       920,000             -     920,000
기타             8       420,000             -     420,000
──────────────────────────────────────────────────────
합계           203    55,275,000    -2,490,000  52,785,000

──────────────────────────────────────────────────────
결제 수단별 집계
──────────────────────────────────────────────────────
현금              12,400,000원 (45건)
카드              35,200,000원 (120건)
계좌이체           7,675,000원  (38건)
──────────────────────────────────────────────────────

──────────────────────────────────────────────────────
일별 수납 추이
──────────────────────────────────────────────────────
  5,000,000 ┤          ▪
  4,000,000 ┤    ▪  ▪  ▪  ▪
  3,000,000 ┤ ▪  ▪  ▪  ▪  ▪  ▪
  2,000,000 ┤ ▪  ▪  ▪  ▪  ▪  ▪  ▪
              1   5  10  15  20  25  31
──────────────────────────────────────────────────────

[월계표 출력]  [엑셀 다운로드]
══════════════════════════════════════════════════════
```

### 11-2. 강좌별 매출 분석

```
강좌별 매출 (3월)
──────────────────────────────────────────────────────
강좌명             수강생    수납액       점유율
공채 종합반            52   28,800,000    55.9%
경찰 종합반            28   14,560,000    28.3%
소방 종합반            12    5,360,000    10.4%
단과 (형법)             8      480,000     0.9%
단과 (경찰학)           5      200,000     0.4%
──────────────────────────────────────────────────────
합계                  105   49,400,000   100%
```

---

## 12. 교재 판매 마스터 관리

### 12-1. 교재 목록 (설정 화면)

```
/admin/settings/textbooks

교재·교구 목록 관리
══════════════════════════════════════════════════════
[+ 교재 추가]  [엑셀 일괄 등록]

ISBN/코드      교재명                     과목     단가     재고   판매중
TXT-2026-001  2026 형법 기본서            형법     25,000   42개   ✅
TXT-2026-002  2026 형법 문제집            형법     18,000   37개   ✅
TXT-2026-003  2026 경찰학개론             경찰학   22,000   28개   ✅
TXT-2026-004  2026 형사소송법 기본서      형소법   23,000    8개   ✅
MTL-001       OMR 카드 (100매)            -         3,000  150개   ✅
MTL-002       형광펜 세트                 -         2,500   63개   ✅

[편집] [재고 수정] [숨기기]
══════════════════════════════════════════════════════
```

### 12-2. 교재 추가/수정

```
교재 추가
  분류:      [ ● 교재  ○ 교구·소모품 ]
  교재명:    [ 2026 행정법 기본서 ]
  과목 연결: [ 행정법 ▼ ]  (과목 마스터에서 선택)
  저자/출판: [ 홍길동 저 / ○○출판 ]
  ISBN:      [ 979-11-000-0000-0 ]
  단가:      [ 26,000 ] 원
  재고:      [ 50 ] 권
  [저장]
```

### 12-3. 재고 관리

```
재고 이동 이력
  날짜         교재명           입고/출고  수량  잔고  비고
  2026-03-13  형법 기본서       출고       -5    42    판매 (영수증 #289)
  2026-03-10  형법 기본서       입고      +50    47    신규 입고
  2026-03-05  경찰학개론        출고       -3    28    판매 (영수증 #271)

재고 부족 알림: 잔고 10권 이하 → 대시보드 알림 표시
```

---

## 13. 마스터 데이터 관리자 설정 (전체)

> **원칙**: 강좌명, 과목명, 교재명, 시설명 등 **모든 명칭은 관리자가 설정 화면에서 자유롭게 등록·수정·삭제**할 수 있다.

### 13-1. 설정 가능한 마스터 목록

| 설정 항목 | 관리 경로 | 사용처 |
|---|---|---|
| 강좌 마스터 (이름·기간·수강료) | `/admin/settings/courses` | 수강 등록, 수납, 정산 |
| 과목 마스터 (과목명·약칭·색상) | `/admin/settings/subjects` | 성적 입력, 교재 연결 |
| 교재·교구 목록 | `/admin/settings/textbooks` | 교재 판매, 재고 |
| 사물함 구역·번호 | `/admin/settings/lockers` | 시설 배정, 시설비 수납 |
| 스터디룸 목록 (이름·정원·요금) | `/admin/settings/study-rooms` | 예약, 시설비 수납 |
| 자습실 목록 (층·구역·좌석 수) | `/admin/settings/reading-rooms` | 입퇴실 관리 |
| 할인 정책 (이름·할인율·조건) | `/admin/settings/discounts` | 수강료 수납 |
| 쿠폰 (코드·금액·유효기간) | `/admin/settings/coupons` | 수납 |
| 환불 정책 (구간·비율) | `/admin/settings/refund-policy` | 환불 계산 |
| 포인트 정책 (적립 규칙) | `/admin/settings/point-policy` | 포인트 적립·사용 |
| VAN 단말기 설정 | `/admin/settings/card-terminal` | 카드 결제 |
| 현금영수증 설정 | `/admin/settings/cash-receipt` | 현금영수증 발행 |
| SMS 설정 | `/admin/settings/sms` | 알림 발송 |
| 수험번호 부여 규칙 | `/admin/settings/exam-number` | 학생 등록 |

### 13-2. 강좌 마스터 예시

```
강좌 추가
  강좌명:     [ 2026 공채 종합반 ]
  약칭:       [ 공채반 ]  (목록 표시용)
  기수:       [ 52기 ]
  과목 구성:  [ ☑ 형법  ☑ 형소법  ☑ 경찰학  ☑ 범죄학  ☑ 헌법 ]
  정원:       [ 60 ] 명
  수강 기간:  2026-03-01 ~ 2026-05-31
  정상 수강료: [ 600,000 ] 원
  분할납부:   [ ● 허용  ○ 불허 ]
  최대 분할:  [ 3 ] 회
  상태:       [ ● 모집중  ○ 수강중  ○ 종료 ]
  [저장]
```

### 13-3. 과목 마스터 예시

```
과목 목록
  코드      과목명       약칭   색상      성적 입력 여부
  CRIM_LAW  형법         형법   🔴 빨강   ✅
  CRIM_PRO  형사소송법   형소법 🟠 주황   ✅
  POLICE    경찰학개론   경찰학 🟡 노랑   ✅
  CRIME     범죄학       범죄학 🟢 초록   ✅
  CONST     헌법         헌법   🔵 파랑   ✅
  [+ 과목 추가]  ← 관리자가 자유롭게 추가 가능
```

---

## 14. DB 스키마

### 14-1. 핵심 결제 모델

```prisma
model Payment {
  id               String          @id @default(cuid())
  idempotencyKey   String?         @unique    // 이중 결제 방지
  examNumber       String?                    // null = 비회원 판매
  category         PaymentCategory
  method           PaymentMethod
  status           PaymentStatus
  grossAmount      Int                        // 원청구금액
  discountAmount   Int             @default(0)
  couponAmount     Int             @default(0)
  pointAmount      Int             @default(0)
  netAmount        Int                        // 실납부금액
  note             String?
  processedBy      String                     // 처리 직원 userId
  processedAt      DateTime        @default(now())

  // 관계
  student          Student?        @relation(...)
  items            PaymentItem[]   // 명세 (강좌/교재/시설 각 1건 이상)
  cardPayment      CardPayment?
  cashReceipt      CashReceipt?
  refunds          Refund[]
  installments     Installment[]

  @@index([examNumber])
  @@index([processedAt])
  @@map("payments")
}

model PaymentItem {
  id          String          @id @default(cuid())
  paymentId   String
  itemType    PaymentCategory // 동일 Payment 내 여러 유형 가능
  itemId      String?         // 강좌ID / 교재ID / 시설ID
  itemName    String          // 스냅샷 (마스터 변경 대비)
  unitPrice   Int
  quantity    Int             @default(1)
  amount      Int             // unitPrice × quantity

  payment     Payment         @relation(...)
  @@map("payment_items")
}

model Refund {
  id             String       @id @default(cuid())
  paymentId      String
  refundType     RefundType   // CARD_CANCEL / CASH / TRANSFER / PARTIAL
  amount         Int
  reason         String
  approvedBy     String?      // 원장 승인자
  approvedAt     DateTime?
  processedBy    String
  processedAt    DateTime     @default(now())
  bankName       String?      // 계좌이체 환불 시
  accountNo      String?
  accountHolder  String?
  cardCancelNo   String?      // 카드 취소 승인번호

  payment        Payment      @relation(...)
  @@map("refunds")
}

model Installment {
  id          String             @id @default(cuid())
  paymentId   String
  seq         Int                // 1, 2, 3...
  amount      Int
  dueDate     DateTime
  paidAt      DateTime?
  paidPaymentId String?          // 납부 시 새 Payment ID

  payment     Payment            @relation(...)
  @@map("installments")
}
```

### 14-2. 교재 판매 모델

```prisma
model Textbook {
  id          String    @id @default(cuid())
  code        String    @unique           // TXT-2026-001
  name        String
  subjectId   String?                     // 과목 연결 (선택)
  author      String?
  publisher   String?
  isbn        String?
  unitPrice   Int
  stock       Int       @default(0)
  isActive    Boolean   @default(true)
  isTextbook  Boolean   @default(true)   // false = 교구/소모품

  subject     Subject?  @relation(...)
  stockLogs   TextbookStockLog[]
  @@map("textbooks")
}

model TextbookStockLog {
  id          String    @id @default(cuid())
  textbookId  String
  delta       Int                         // +입고, -출고
  stockAfter  Int
  reason      String                      // 판매 / 입고 / 재고조정
  refPaymentId String?                    // 판매 건 연결
  processedBy String
  processedAt DateTime  @default(now())

  textbook    Textbook  @relation(...)
  @@map("textbook_stock_logs")
}
```

### 14-3. 일일 정산 모델

```prisma
model DailySettlement {
  id              String    @id @default(cuid())
  date            DateTime  @db.Date       @unique
  tuitionTotal    Int
  facilityTotal   Int
  textbookTotal   Int
  posTotal        Int
  etcTotal        Int
  grossTotal      Int
  refundTotal     Int
  netTotal        Int
  cashAmount      Int
  cardAmount      Int
  transferAmount  Int
  cashActual      Int?                    // 실제 시재 (직원 확인값)
  cashDiff        Int?                    // 차이
  closedAt        DateTime?
  closedBy        String?
  reopenedAt      DateTime?
  reopenedBy      String?
  reopenReason    String?

  @@map("daily_settlements")
}
```

### 14-4. Enum 정의

```prisma
enum PaymentCategory {
  TUITION
  FACILITY
  TEXTBOOK
  MATERIAL
  SINGLE_COURSE
  PENALTY
  ETC
}

enum PaymentMethod {
  CASH
  CARD
  TRANSFER
  POINT
  MIXED
}

enum PaymentStatus {
  PENDING
  APPROVED
  PARTIAL_REFUNDED
  FULLY_REFUNDED
  CANCELLED
}

enum RefundType {
  CARD_CANCEL
  CASH
  TRANSFER
  PARTIAL
}
```

---

## 15. API 엔드포인트

| 메서드 | URL | 설명 |
|---|---|---|
| `POST` | `/api/payments` | 수납 등록 (idempotency key 필수) |
| `GET` | `/api/payments` | 수납 이력 목록 (필터) |
| `GET` | `/api/payments/[id]` | 수납 상세 |
| `POST` | `/api/payments/card/request` | 카드 결제 요청 |
| `POST` | `/api/payments/card/confirm` | 카드 결제 확인 |
| `POST` | `/api/payments/card/cancel` | 카드 당일 취소 |
| `POST` | `/api/payments/[id]/refund` | 환불 처리 |
| `POST` | `/api/payments/[id]/refund/approve` | 환불 승인 (원장) |
| `GET` | `/api/settlements/daily` | 일계표 조회 |
| `POST` | `/api/settlements/daily/close` | 일계표 마감 |
| `GET` | `/api/settlements/monthly` | 월계표 조회 |
| `GET` | `/api/textbooks` | 교재 목록 |
| `POST` | `/api/textbooks` | 교재 등록 |
| `PATCH` | `/api/textbooks/[id]` | 교재 수정 |
| `POST` | `/api/textbooks/[id]/stock` | 재고 조정 |

---

## 16. 주요 화면 파일 목록

```
web/src/
├── app/admin/
│   ├── payments/
│   │   ├── page.tsx                    전체 수납 이력
│   │   ├── new/page.tsx                수납 등록 (유형 선택)
│   │   └── [id]/
│   │       ├── page.tsx                수납 상세
│   │       └── refund/page.tsx         환불 처리
│   └── settlements/
│       ├── daily/page.tsx              일계표
│       └── monthly/page.tsx            월계표
├── app/api/
│   ├── payments/
│   │   ├── route.ts
│   │   ├── card/request/route.ts
│   │   ├── card/confirm/route.ts
│   │   └── [id]/refund/route.ts
│   ├── settlements/
│   │   ├── daily/route.ts
│   │   └── monthly/route.ts
│   └── textbooks/
│       ├── route.ts
│       └── [id]/stock/route.ts
├── components/payments/
│   ├── payment-form.tsx                수납 등록 폼 (유형별 분기)
│   ├── tuition-form.tsx                수강료 수납 폼
│   ├── textbook-sale-form.tsx          교재 판매 폼
│   ├── facility-form.tsx               시설비 수납 폼
│   ├── card-payment-modal.tsx          카드 결제 모달
│   ├── refund-form.tsx                 환불 처리 폼
│   ├── payment-history-table.tsx       수납 이력 테이블
│   └── receipt-print.tsx              영수증 출력
├── components/settlements/
│   ├── daily-settlement-table.tsx      일계표
│   ├── monthly-settlement-chart.tsx    월계표 차트
│   └── cash-confirm-panel.tsx         현금 시재 확인
└── lib/payments/
    ├── service.ts                      수납 서비스 (핵심 로직)
    ├── refund-calculator.ts            환불 금액 자동 계산
    ├── idempotency.ts                  이중 결제 방지
    └── settlement.ts                   정산 집계 쿼리
```

---

---

## 추가 §A. 온라인 결제 링크 (Payment Link)

> 인터뷰 확정 사항 (2026-03-16)

### A-1 개요

직원이 강좌 상품을 선택하여 결제 링크를 생성한 후 카카오톡·문자로 학생에게 전송한다.
학생은 링크를 클릭하여 비대면 온라인 결제(카드/계좌이체)를 완료하면 시스템에 자동으로 수강 등록된다.

**PG사: 포트원(PortOne) + KSNET 갑(GAP) VAN 동시 지원**

### A-2 결제 링크 생성 흐름

```
직원                          시스템                         학생(포털)
 │                              │                              │
 │ 강좌 선택 + 가격 설정         │                              │
 │ (유효기간·할인 설정 후 생성)  │                              │
 │──────────────────────────→  │                              │
 │                              │ PaymentLink 레코드 생성      │
 │                              │ (UUID 토큰, 만료일 포함)     │
 │  링크 반환                   │                              │
 │ ←──────────────────────────  │                              │
 │                              │                              │
 │ 카카오톡/문자로 링크 전송     │                              │
 │──────────────────────────────────────────────────────────→ │
 │                              │                              │
 │                              │   학생이 링크 접속            │
 │                              │ ←────────────────────────── │
 │                              │                              │
 │                              │ 미가입 학생 → 전화번호 입력   │
 │                              │ 자동 포털 계정 생성 + 수강 예약 │
 │                              │                              │
 │                              │   포트원 결제 위젯 표시       │
 │                              │ ──────────────────────────→ │
 │                              │                              │
 │                              │   결제 완료 웹훅             │
 │                              │ ←────────────────────────── │
 │                              │                              │
 │                              │ 수강 등록 자동 처리          │
 │                              │ 카카오 알림 "수강등록 완료"  │
 │                              │ ──────────────────────────→ │
```

### A-3 데이터 모델

```prisma
model PaymentLink {
  id              Int               @id @default(autoincrement())
  token           String            @unique @default(cuid())  // URL 토큰
  title           String            // 링크 제목 (예: "2026 공채 종합반 3월 등록")
  courseId        Int?              // 연결 강좌
  course          Course?           @relation(fields: [courseId], references: [id])
  amount          Int               // 결제 금액
  discountAmount  Int               @default(0)
  finalAmount     Int               // 실결제 금액 = amount - discountAmount
  allowPoint      Boolean           @default(true)   // 포인트 사용 허용
  expiresAt       DateTime          // 링크 만료일
  maxUsage        Int?              // 최대 사용 횟수 (null = 무제한)
  usageCount      Int               @default(0)
  staffId         Int               // 생성한 직원
  staff           Staff             @relation(fields: [staffId], references: [id])
  payments        Payment[]         // 이 링크를 통한 결제 내역
  status          LinkStatus        @default(ACTIVE)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
}

enum LinkStatus {
  ACTIVE    // 사용 가능
  EXPIRED   // 만료
  DISABLED  // 직원이 비활성화
  USED_UP   // maxUsage 도달
}
```

### A-4 결제 링크 URL 형식

```
https://[도메인]/pay/[token]
예: https://kpa.kr/pay/abc123xyz789
```

### A-5 결제 페이지 UI (`/pay/[token]`)

```
┌──────────────────────────────────────┐
│ 한국경찰학원                          │
│                                      │
│  2026 공채 종합반 3월 등록            │
│  수강 기간: 2026.03.01 ~ 03.31       │
│                                      │
│  결제 금액: 600,000원                 │
│  할인:     ─ 30,000원                │
│  ──────────────────────────          │
│  결제 금액: 570,000원                │
│                                      │
│  포인트 사용: [ 10,000 P ] 보유량     │
│  최종 결제:  560,000원                │
│                                      │
│  [ 카드 결제 ] [ 계좌이체 ]           │
│                                      │
│  이미 학생이신가요? [로그인]          │
│  처음이신가요? [전화번호로 시작]       │
└──────────────────────────────────────┘
```

### A-6 미등록 학생 처리

1. 전화번호 입력 → 기존 학생 검색
2. 없으면 → 자동으로 임시 계정 생성 (examNumber 자동 채번)
3. 결제 완료 후 → 포털 초기 비밀번호 문자 전송 (생년월일 뒷 6자리)
4. 직원이 나중에 나머지 학생 정보 보완

### A-7 API

```
POST   /api/payment-links             # 링크 생성 (직원)
GET    /api/payment-links             # 링크 목록 조회 (직원)
GET    /api/payment-links/[token]     # 링크 상세 (결제 페이지에서 호출)
DELETE /api/payment-links/[id]        # 링크 비활성화 (직원)
POST   /api/payment-links/[token]/pay # 결제 처리 (포트원 웹훅 또는 직접 호출)
POST   /api/webhooks/portone          # 포트원 결제 웹훅 수신
```

### A-8 카카오 알림 연동

결제 링크 전송 시 기존 알림 채널 활용:
- 카카오톡: 알림톡 + 링크 버튼 (카카오링크)
- 문자(SMS): 문자 + 단축 URL (SMS 서비스 결정 후 연동)

---

## 추가 §B. 학가(수강료 적용 기간) 계산 정책

> 인터뷰 확정 사항 (2026-03-16)

### B-1 정책

- **등록일부터 관리자가 지정한 종료일까지** 개별 적용
- 강좌(반)마다 종료일이 다름 — 관리자가 강좌별로 직접 설정
- 기수제(1개월 = 4주)로 운영하되, 각 강좌의 기수 종료일은 관리자가 입력

```prisma
// Course 모델에 추가
model Course {
  // 기존 필드들...
  cohortStartDate  DateTime?   // 기수 시작일
  cohortEndDate    DateTime?   // 기수 종료일 (학가 기준)
  // 등록일 ~ cohortEndDate = 학생의 수강 유효 기간
}
```

### B-2 수강 유효기간 계산

```typescript
// 수강 등록 시 유효기간 자동 설정
function calcEnrollmentEndDate(
  enrollDate: Date,
  course: { cohortEndDate: Date | null }
): Date {
  // 강좌에 기수 종료일이 설정된 경우 → 기수 종료일 사용
  if (course.cohortEndDate) return course.cohortEndDate;
  // 설정 없으면 등록일 + 30일 (기본값)
  return addDays(enrollDate, 30);
}
```

### B-3 휴원/복교

- **휴원**: 학가(잔여 기간)가 보존된 상태로 수강 일시 정지
- **복교**: 잔여 학가를 이어받아 재개 (복교일부터 잔여 기간 재계산)

```prisma
model Enrollment {
  // 기존 필드들...
  pausedAt       DateTime?   // 휴원 시작일
  resumedAt      DateTime?   // 복교일
  pausedDays     Int         @default(0) // 누적 휴원 일수
  // 실제 만료일 = cohortEndDate + pausedDays
}
```

---

## 추가 §C. 현금영수증·세금계산서 처리 방침

> 인터뷰 확정 사항 (2026-03-16)

| 항목 | 내용 |
|------|------|
| 발행 수단 | KSNET VAN 단말기(POS)에서 직접 발행 — 시스템 별도 발행 없음 |
| 의무 발행 | 10만원 이상 결제 시 필수 |
| 소액 | 10만원 미만은 학생 요청 시에만 발행 |
| 시스템 처리 | 결제 레코드에 `cashReceiptIssued: Boolean` 필드로 발행 여부만 기록 |

```prisma
// Payment 모델에 추가
model Payment {
  // 기존 필드들...
  cashReceiptIssued  Boolean  @default(false)  // 현금영수증 발행 여부
  cashReceiptNumber  String?                   // 현금영수증 승인번호 (수동 입력)
}
```

---

---

## 추가 §D. 수강료 할인 체계

> 인터뷰 확정 사항 (2026-03-16) — 학원 홈페이지 이벤트 페이지 기준

### D-1 종합반 할인 유형

| # | 할인 유형 | 할인 금액/율 | 확인 방법 | 비고 |
|---|-----------|------------|----------|------|
| 1 | 2인 이상 동시 수강 | 50,000원 고정 | 동시 등록 확인 | |
| 2 | 형제 동시 수강 | 100,000원 고정 | 관계 확인 | |
| 3 | 경찰행정학과 재학생 | 100,000원 고정 | 학생증 지참 | |
| 4 | 경찰공무원 직계 가족 | 100,000원 고정 | 공무원증 지참 | |
| 5 | 종합반 재수강 | 30% 할인 | 수강 이력 확인 | |
| 6 | 2개월 이론반 재수강 | 50% 할인 | 수강 이력 확인 | |
| 7 | 인강생 혜택 | 인강 결제금액의 50% | 자체 인강 플랫폼 아이디 확인 후 직원 수동 적용 | |
| 8 | 타학원 환승 | 타학원 결제금액의 30% | 결제 내역 서류 지참 후 직원 확인 | 최근 1년 이내 수강 기준 |
| 9 | 관리자 직접 입력 | 직접 입력 | — | 원장 추천, 특별 사유 등 |

**중복 적용 규칙:**
- 최대 2가지 혜택 중복 적용
- 최대 할인 한도: 500,000원

### D-2 단과 특강 가격 3단계

| 단계 | 대상 | 기준 |
|------|------|------|
| 일반가 | 첫 방문 / 미수강 이력자 | 기본 가격 |
| 학원생가 | 수강 이력이 있는 모든 학생 | 이전에 한 번이라도 등록한 경우 |
| 재수강가 | 동일 단과 강좌를 이전에 수강한 학생 | 해당 단과 재수강 |

- 단과 특강에는 추가로 **관리자가 직접 할인 금액 입력** 가능

### D-3 쿠폰·추천 코드

```prisma
model DiscountCode {
  id            Int          @id @default(autoincrement())
  code          String       @unique  // 예: "POLICE2026", "REF-HONG"
  type          CodeType
  discountType  DiscountType // FIXED (고정액) | PERCENT (%)
  discountValue Int          // 금액 또는 퍼센트
  maxUsage      Int?         // null = 무제한
  usageCount    Int          @default(0)
  validFrom     DateTime
  validUntil    DateTime?
  isActive      Boolean      @default(true)
  staffId       Int          // 발급한 직원
  usages        DiscountCodeUsage[]
  createdAt     DateTime     @default(now())
}

enum CodeType {
  REFERRAL   // 추천인 코드
  ENROLLMENT // 입소 코드
  CAMPAIGN   // 캠페인 코드
}

model DiscountCodeUsage {
  id          Int      @id @default(autoincrement())
  codeId      Int
  code        DiscountCode @relation(fields: [codeId], references: [id])
  paymentId   Int
  studentId   Int
  usedAt      DateTime @default(now())
}
```

### D-4 할인 적용 데이터 모델

```prisma
model PaymentDiscount {
  id            Int          @id @default(autoincrement())
  paymentId     Int
  payment       Payment      @relation(fields: [paymentId], references: [id])
  discountType  String       // "SIBLING", "RETURNING_30", "TRANSFER_30", "ADMIN_MANUAL" 등
  description   String       // 표시용 설명 (예: "형제 동시 수강 할인")
  amount        Int          // 할인 금액 (양수)
  verifiedBy    Int?         // 확인한 직원 (증빙 필요 할인)
  note          String?      // 증빙 메모 (예: "학생증 확인")
}
```

### D-5 할인 적용 규칙 (서버 검증)

```typescript
function applyDiscounts(
  discounts: DiscountInput[],
  baseAmount: number
): { appliedDiscounts: AppliedDiscount[]; totalDiscount: number } {
  // 최대 2개 중복
  const limited = discounts.slice(0, 2);

  let totalDiscount = limited.reduce((sum, d) => sum + calcAmount(d, baseAmount), 0);

  // 최대 50만원 한도
  totalDiscount = Math.min(totalDiscount, 500_000);

  // 결제금액 이하로 제한
  totalDiscount = Math.min(totalDiscount, baseAmount);

  return { appliedDiscounts: limited, totalDiscount };
}
```

---

## 추가 §E. 운영 정보 요약

> 인터뷰 확정 사항 (2026-03-16)

| 항목 | 내용 |
|------|------|
| 영업시간 | 평일 09:00~21:00 / 주말 09:00~18:00 |
| 자동 알림 발송 시간대 | 영업시간 내로 제한 (야간 발송 금지) |
| 강사 정산 주기 | 월별 정산 |
| 강사 정산 방식 | 엑셀 이메일 + PDF 출력 둘 다 지원 |
| 강사 배분율 | 강사별 계약 시 원장이 직접 설정 |
| 인강 시스템 | 자체 개발 인강 플랫폼 별도 운영 (시스템 연동 없음) |
| 모바일 | 모바일 웹 + PWA (네이티브 앱 불필요) |
| 오픈 목표 | 2026년 상반기 (6월 이전) |
| 개발 우선순위 | ① 수강 등록 + 수납 관리 → ② 성적·출결 → ③ 포털·시설 |

---

*이 PRD는 수납·결제 시스템의 전체 설계 기준이 된다. 구현 시 이중 결제 방지와 불변 이력 원칙을 최우선으로 적용한다.*

---

## ⚠️ 멀티지점 고려사항 (2026-03-21 추가)

### 데이터 격리
- 모든 결제 데이터 (Payment, Refund, Installment, DailySettlement 등)는 `academyId`로 격리됨
- 일계표/월계표는 지점별로 독립 조회
- SUPER_ADMIN은 전 지점 통합 조회 가능 (`/admin/super/dashboard`)

### 설정 독립화
- 환불 정책: 지점별 독립 (`/admin/settings/refund-policies`)
- 할인 정책: 지점별 독립 (`/admin/settings/discount-codes`)
- 결제 승인 임계값: 지점별 독립 (`/admin/settings/payment-policies`)
- 계좌 정보 (수납 안내용): 지점별 독립 (`/admin/settings/academy`)

### 개발 시 주의사항
- Payment 생성 API: `academyId` 반드시 포함
- 정산 API: `where: { academyId: ctx.academyId }` 필터 적용
