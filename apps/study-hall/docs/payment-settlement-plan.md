# 수납 통합 & 일일정산 시스템 개발 계획서

> **대상 앱:** study-hall (`apps/study-hall`)
> **작성일:** 2026-04-01
> **목적:** 학생 등록과 수납을 하나의 워크플로우로 통합하고, 일일정산 기능을 추가한다.

---

## 1. 현재 상태 분석

### 현재 워크플로우 (문제점)

```
[학생 명단 페이지]              [수납 관리 페이지]
     ↓                              ↓
학생 추가 폼 → Student 생성     수납 추가 → Payment 생성
(수납 없음)                    (학생 선택 필요)
```

- 학생 등록과 수납이 완전히 분리된 2단계 프로세스
- 신규 등록 시 수납 기록을 별도로 해야 함
- 연장 시 수강 종료일 수정 + 수납 기록을 각각 별도 페이지에서 처리
- 결제수단별 일일정산 기능 없음

### 현재 DB 모델 (변경 없이 활용)

```
Student: tuitionPlanId, tuitionAmount, courseStartDate, courseEndDate
Payment: studentId, paymentTypeId, amount, paymentDate, method, notes, recordedById
PaymentCategory: divisionId, name, isActive, displayOrder
TuitionPlan: divisionId, name, durationDays, amount, isActive
```

### 현재 결제수단 처리 방식

`Payment.method` 필드가 자유 텍스트(String?, max 50자)로 되어 있음.
`lib/payment-meta.ts`의 `formatPaymentMethod()`에서 다음을 매핑:
- `"card"` → "카드"
- `"cash"` → "현금"
- `"bank-transfer"` → "계좌이체"
- 그 외 → 원본 텍스트 그대로

---

## 2. 목표 워크플로우

### 2-1. 신규 등록 + 수납 (통합 플로우)

```
수납 관리 페이지 → "신규 수납" 버튼
  ├─ 학생 검색 (이름/수험번호)
  │   └─ 검색 결과 없음 → "신규 학생 등록" 인라인 폼 표시
  │       ├─ 이름 (필수)
  │       ├─ 수험번호 (필수)
  │       ├─ 연락처 (선택)
  │       └─ 메모 (선택)
  ├─ 수강 플랜 선택 → 금액/기간 자동 입력
  ├─ 수강 시작일 (기본: 오늘)
  ├─ 결제수단 선택 (카드/현금/계좌이체/포인트/기타)
  ├─ 결제 금액 (플랜 금액에서 자동 입력, 수정 가능)
  └─ "등록 + 수납 완료" 버튼
→ 하나의 API 호출로 Student + Payment 동시 생성
→ courseStartDate/courseEndDate 자동 설정
```

### 2-2. 기존 학생 연장 수납

```
수납 관리 페이지 → "연장 수납" 버튼 또는 학생 검색
  ├─ 학생 검색 → 기존 학생 선택
  ├─ 현재 수강 정보 표시
  │   ├─ 현재 플랜: 3개월반
  │   ├─ 수강 시작일: 2026-01-15
  │   ├─ 수강 종료일: 2026-04-14
  │   └─ 남은 일수: 13일
  ├─ 연장 플랜 선택 → 새 종료일 자동 계산
  │   └─ 기존 종료일 + durationDays = 새 종료일
  │   └─ 종료일이 이미 지난 경우: 오늘 + durationDays
  ├─ 결제수단 선택
  ├─ 결제 금액
  └─ "연장 수납 완료" 버튼
→ Payment 생성 + Student.courseEndDate 업데이트 (단일 트랜잭션)
```

### 2-3. 일반 수납 (기존 방식 유지)

기존 수납 추가 기능은 그대로 유지한다. 등록비/월납부/교재비 등 단순 수납 기록용.

---

## 3. 일일정산 시스템

### 3-1. 개요

관리자가 특정 날짜의 수납 내역을 결제수단별로 집계하여 확인하는 기능.

### 3-2. 정산 화면 구성

```
수납 관리 페이지 내 탭 또는 별도 페이지: /[division]/admin/payments/settlement

┌─────────────────────────────────────────────────┐
│  일일정산                          [날짜 선택]   │
│  2026년 4월 1일 (화)                             │
├─────────────────────────────────────────────────┤
│                                                  │
│  결제수단별 집계                                  │
│  ┌──────────┬────────┬──────────────┐            │
│  │ 결제수단  │ 건수   │ 합계 금액     │            │
│  ├──────────┼────────┼──────────────┤            │
│  │ 카드     │ 5건    │ 1,600,000원  │            │
│  │ 현금     │ 2건    │   640,000원  │            │
│  │ 계좌이체  │ 3건    │   960,000원  │            │
│  │ 포인트   │ 1건    │   320,000원  │            │
│  ├──────────┼────────┼──────────────┤            │
│  │ 합계     │ 11건   │ 3,520,000원  │            │
│  └──────────┴────────┴──────────────┘            │
│                                                  │
│  수납 유형별 집계                                  │
│  ┌──────────┬────────┬──────────────┐            │
│  │ 수납 유형 │ 건수   │ 합계 금액     │            │
│  ├──────────┼────────┼──────────────┤            │
│  │ 등록비   │ 4건    │ 1,280,000원  │            │
│  │ 월납부   │ 6건    │ 1,920,000원  │            │
│  │ 교재비   │ 1건    │   320,000원  │            │
│  ├──────────┼────────┼──────────────┤            │
│  │ 합계     │ 11건   │ 3,520,000원  │            │
│  └──────────┴────────┴──────────────┘            │
│                                                  │
│  상세 내역                                       │
│  ┌────┬──────┬──────┬────────┬──────┬─────┐     │
│  │시간│학생   │유형   │금액     │결제수단│담당자│     │
│  ├────┼──────┼──────┼────────┼──────┼─────┤     │
│  │09:30│김소방│등록비 │320,000│카드   │관리자│     │
│  │10:15│이경찰│월납부 │320,000│현금   │관리자│     │
│  │...  │...  │...   │...    │...   │...  │     │
│  └────┴──────┴──────┴────────┴──────┴─────┘     │
│                                                  │
│  [엑셀 다운로드]  [인쇄]                          │
└─────────────────────────────────────────────────┘
```

### 3-3. 기간별 정산 (추가 옵션)

- 날짜 범위 선택 가능 (기본: 오늘 하루)
- 주간/월간 단위로도 조회 가능
- 동일한 결제수단별 + 수납유형별 집계 표시

---

## 4. 구현 상세

### Phase A: 결제수단 표준화

#### A-1. PaymentMethod enum 추가 (Prisma 마이그레이션 불필요)

현재 `Payment.method`가 자유 텍스트이므로 DB 스키마 변경 없이 코드 레벨에서 표준화한다.

**파일: `lib/payment-meta.ts` 수정**

```typescript
// 표준 결제수단 목록
export const PAYMENT_METHODS = [
  { value: "card", label: "카드" },
  { value: "cash", label: "현금" },
  { value: "bank-transfer", label: "계좌이체" },
  { value: "point", label: "포인트" },
  { value: "other", label: "기타" },
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]["value"];
```

#### A-2. 결제수단 UI 변경

현재 결제수단이 자유 텍스트 입력이므로, **드롭다운 선택** 방식으로 변경한다.
- `PaymentManager.tsx`의 수납 추가/수정 모달에서 method 필드를 `<select>`로 변경
- 카드 결제를 기본 결제 값으로 둔다.
- "기타" 선택 시 자유 텍스트 입력 필드 추가 표시

---

### Phase B: 신규 등록 + 수납 통합 API

#### B-1. 새 API 라우트

**파일: `app/api/[division]/payments/enroll/route.ts`**

```
POST /api/[division]/payments/enroll
```

**요청 Body:**

```typescript
{
  // 학생 정보 (신규 생성용)
  student: {
    name: string;           // 필수
    studentNumber: string;  // 필수
    phone?: string | null;
    memo?: string | null;
  };
  // 수강 정보
  tuitionPlanId: string;      // 필수
  tuitionAmount?: number;     // 선택 (플랜 금액 오버라이드)
  courseStartDate?: string;   // 선택 (기본: 오늘, YYYY-MM-DD)
  // 수납 정보
  payment: {
    paymentTypeId: string;    // 필수 (수납 유형)
    amount: number;           // 필수 (실제 결제 금액)
    paymentDate: string;      // 필수 (YYYY-MM-DD)
    method: string;           // 필수 (card/cash/bank-transfer/point/other)
    notes?: string | null;
  };
}
```

**처리 로직:**
1. 학생 정보 유효성 검사 (수험번호 중복 체크)
2. 수강 플랜 조회 → courseEndDate 계산
3. Prisma `$transaction`으로 Student + Payment 동시 생성
4. 응답: `{ student: StudentDetail, payment: PaymentItem }`

**유효성 검사 스키마:**

```typescript
// lib/payment-schemas.ts에 추가
export const enrollPaymentSchema = z.object({
  student: z.object({
    name: z.string().trim().min(1, "학생 이름을 입력해 주세요."),
    studentNumber: z.string().trim().min(1, "수험번호를 입력해 주세요."),
    phone: z.string().trim().max(20).nullable().optional(),
    memo: z.string().trim().max(2000).nullable().optional(),
  }),
  tuitionPlanId: z.string().min(1, "수강 플랜을 선택해 주세요."),
  tuitionAmount: z.number().int().min(0).nullable().optional(),
  courseStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payment: z.object({
    paymentTypeId: z.string().min(1, "수납 유형을 선택해 주세요."),
    amount: z.number().int().positive("금액은 1원 이상이어야 합니다."),
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    method: z.string().min(1, "결제수단을 선택해 주세요."),
    notes: z.string().trim().max(500).nullable().optional(),
  }),
});
```

#### B-2. 서비스 함수

**파일: `lib/services/payment.service.ts`에 추가**

```typescript
export async function enrollAndPay(
  divisionSlug: string,
  actor: PaymentActor,
  input: EnrollPaymentInput
): Promise<{ student: StudentDetail; payment: PaymentItem }>
```

- Mock 모드와 DB 모드 모두 지원
- DB 모드: `prisma.$transaction()` 사용
- Mock 모드: `updateMockState()` 한 번에 처리

---

### Phase C: 연장 수납 API

#### C-1. 새 API 라우트

**파일: `app/api/[division]/payments/renew/route.ts`**

```
POST /api/[division]/payments/renew
```

**요청 Body:**

```typescript
{
  studentId: string;          // 필수 (기존 학생 ID)
  tuitionPlanId: string;      // 필수 (연장 플랜)
  tuitionAmount?: number;     // 선택 (금액 오버라이드)
  // 수납 정보
  payment: {
    paymentTypeId: string;
    amount: number;
    paymentDate: string;
    method: string;
    notes?: string | null;
  };
}
```

**처리 로직:**
1. 학생 조회 → 현재 courseEndDate 확인
2. 연장 플랜 조회 → 새 courseEndDate 계산
   - 현재 종료일이 미래: `courseEndDate + durationDays`
   - 현재 종료일이 과거 또는 null: `오늘 + durationDays`
3. `$transaction`으로 Student.courseEndDate 업데이트 + Payment 생성
4. 응답: `{ student: StudentDetail, payment: PaymentItem }`

#### C-2. 서비스 함수

**파일: `lib/services/payment.service.ts`에 추가**

```typescript
export async function renewAndPay(
  divisionSlug: string,
  actor: PaymentActor,
  input: RenewPaymentInput
): Promise<{ student: StudentDetail; payment: PaymentItem }>
```

---

### Phase D: 수납 관리 UI 통합

#### D-1. PaymentManager 컴포넌트 개편

**파일: `components/payments/PaymentManager.tsx` 수정**

현재 구조:
```
탭 없음, 단일 페이지
├─ 월별 완납/미납 현황 (상단)
└─ 수납 이력 (하단)
```

변경 구조:
```
상단 액션 버튼 영역
├─ [신규 등록 수납] [연장 수납] [일반 수납]
│
탭 구조
├─ 탭 1: 수납 현황 (기존 월별 완납/미납 + 수납 이력)
└─ 탭 2: 일일정산
```

#### D-2. 신규 등록 수납 모달

**새 컴포넌트: `components/payments/EnrollPaymentModal.tsx`**

```
┌─────────────────────────────────────────┐
│  신규 등록 수납                     [X]  │
├─────────────────────────────────────────┤
│                                         │
│  ── 학생 정보 ──                         │
│  학생 검색: [_____________] [검색]       │
│  (검색 결과 없음 시 아래 폼 표시)         │
│  이름:     [_____________]              │
│  수험번호:  [_____________]              │
│  연락처:   [_____________]              │
│                                         │
│  ── 수강 정보 ──                         │
│  수강 플랜: [▼ 3개월반 - 320,000원    ]  │
│  수강 시작일: [2026-04-01]              │
│  수강 종료일: 2026-06-30 (자동 계산)     │
│                                         │
│  ── 결제 정보 ──                         │
│  수납 유형: [▼ 등록비              ]     │
│  결제 금액: [320000]                    │
│  결제수단:  [▼ 카드               ]     │
│  결제일:    [2026-04-01]                │
│  메모:      [_____________]             │
│                                         │
│        [등록 + 수납 완료]                │
└─────────────────────────────────────────┘
```

**동작:**
- 학생 검색: 이름 또는 수험번호로 기존 학생 검색
- 기존 학생 선택 시 → 학생 정보 필드 비활성화, 연장 수납 모달로 전환 제안
- 검색 결과 없음 → 학생 정보 인라인 폼 활성화
- 수강 플랜 선택 시 → 금액, 종료일 자동 계산
- API: `POST /api/[division]/payments/enroll`

#### D-3. 연장 수납 모달

**새 컴포넌트: `components/payments/RenewPaymentModal.tsx`**

```
┌─────────────────────────────────────────┐
│  연장 수납                         [X]  │
├─────────────────────────────────────────┤
│                                         │
│  ── 학생 검색 ──                         │
│  [____________] [검색]                  │
│  선택된 학생: 김소방 (F-001)             │
│                                         │
│  ── 현재 수강 정보 ──                    │
│  현재 플랜: 3개월반                      │
│  수강 기간: 2026-01-15 ~ 2026-04-14    │
│  남은 일수: 13일                        │
│                                         │
│  ── 연장 정보 ──                         │
│  연장 플랜: [▼ 1개월 연장 - 120,000원]  │
│  새 종료일: 2026-05-14 (자동 계산)      │
│                                         │
│  ── 결제 정보 ──                         │
│  수납 유형: [▼ 월납부              ]    │
│  결제 금액: [120000]                    │
│  결제수단:  [▼ 카드               ]     │
│  결제일:    [2026-04-01]                │
│  메모:      [_____________]             │
│                                         │
│        [연장 수납 완료]                  │
└─────────────────────────────────────────┘
```

**동작:**
- 학생 검색 → 기존 학생만 대상
- 현재 수강 정보 자동 표시
- 연장 플랜 선택 시 → 새 종료일 자동 계산
- API: `POST /api/[division]/payments/renew`

#### D-4. 결제수단 선택 공통 컴포넌트

**새 컴포넌트: `components/payments/PaymentMethodSelect.tsx`**

```typescript
type Props = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};
```

- `PAYMENT_METHODS` 배열 기반 `<select>` 렌더링
- "기타" 선택 시 자유 텍스트 입력 필드 표시

---

### Phase E: 일일정산 기능

#### E-1. 정산 API

**파일: `app/api/[division]/payments/settlement/route.ts`**

```
GET /api/[division]/payments/settlement?date=2026-04-01
GET /api/[division]/payments/settlement?dateFrom=2026-04-01&dateTo=2026-04-07
```

**응답:**

```typescript
{
  dateFrom: string;       // YYYY-MM-DD
  dateTo: string;         // YYYY-MM-DD
  totalCount: number;
  totalAmount: number;
  byMethod: Array<{
    method: string;       // 표준화된 결제수단 코드
    methodLabel: string;  // 한글 라벨
    count: number;
    amount: number;
  }>;
  byCategory: Array<{
    categoryId: string;
    categoryName: string;
    count: number;
    amount: number;
  }>;
  payments: PaymentItem[];  // 상세 내역 (createdAt 순)
}
```

**처리 로직:**
- 기존 `listPayments()`를 활용하여 날짜 범위 내 수납 내역 조회
- method 필드를 `formatPaymentMethod()`로 표준화하여 그룹핑
- paymentTypeId별 그룹핑으로 수납유형별 집계

#### E-2. 서비스 함수

**파일: `lib/services/payment.service.ts`에 추가**

```typescript
export type SettlementSummary = {
  dateFrom: string;
  dateTo: string;
  totalCount: number;
  totalAmount: number;
  byMethod: MethodSummary[];
  byCategory: CategorySummary[];
  payments: PaymentItem[];
};

export async function getSettlementSummary(
  divisionSlug: string,
  dateFrom: string,
  dateTo: string
): Promise<SettlementSummary>
```

#### E-3. 정산 UI

**새 컴포넌트: `components/payments/SettlementView.tsx`**

**Props:**
```typescript
type SettlementViewProps = {
  divisionSlug: string;
};
```

**기능:**
- 날짜 선택 (기본: 오늘)
- 기간 선택 모드: 일간 / 주간 / 월간 / 사용자 지정
- 결제수단별 집계 테이블
- 수납유형별 집계 테이블
- 상세 내역 테이블 (시간, 학생, 유형, 금액, 결제수단, 담당자)
- 엑셀 다운로드 버튼 (기존 export 패턴 활용)
- 인쇄 버튼 (`window.print()` + 인쇄 전용 CSS)

---

## 5. 파일 변경 목록

### 새로 생성할 파일

| 파일 경로 | 설명 |
|-----------|------|
| `app/api/[division]/payments/enroll/route.ts` | 신규 등록+수납 API |
| `app/api/[division]/payments/renew/route.ts` | 연장 수납 API |
| `app/api/[division]/payments/settlement/route.ts` | 일일정산 API |
| `components/payments/EnrollPaymentModal.tsx` | 신규 등록+수납 모달 |
| `components/payments/RenewPaymentModal.tsx` | 연장 수납 모달 |
| `components/payments/PaymentMethodSelect.tsx` | 결제수단 선택 공통 컴포넌트 |
| `components/payments/SettlementView.tsx` | 일일정산 화면 |

### 수정할 파일

| 파일 경로 | 변경 내용 |
|-----------|----------|
| `lib/payment-meta.ts` | `PAYMENT_METHODS` 상수 배열 추가 |
| `lib/payment-schemas.ts` | `enrollPaymentSchema`, `renewPaymentSchema` 추가 |
| `lib/services/payment.service.ts` | `enrollAndPay()`, `renewAndPay()`, `getSettlementSummary()` 함수 추가 |
| `components/payments/PaymentManager.tsx` | 상단 액션 버튼 추가, 탭 구조 변경 (수납현황/일일정산), 결제수단 드롭다운 전환 |
| `app/[division]/admin/payments/page.tsx` | 필요 시 추가 데이터 fetch (TuitionPlan 등 이미 있음) |
| `lib/mock-store.ts` | 새 API 함수들의 Mock 모드 지원 |

### 변경하지 않는 파일

| 파일 경로 | 이유 |
|-----------|------|
| `prisma/schema.prisma` | DB 스키마 변경 불필요 (method는 기존 String? 활용) |
| `components/students/StudentForm.tsx` | 학생 명단 페이지의 기존 등록 기능은 유지 |
| `app/[division]/admin/students/` | 기존 학생 관리 페이지는 그대로 유지 |

---

## 6. 구현 순서

```
Phase A: 결제수단 표준화 (30분)
  ├─ payment-meta.ts에 PAYMENT_METHODS 추가
  └─ PaymentManager에서 method 입력을 드롭다운으로 변경

Phase B: 신규 등록+수납 API + UI (핵심)
  ├─ payment-schemas.ts에 enrollPaymentSchema 추가
  ├─ payment.service.ts에 enrollAndPay() 구현
  ├─ enroll API 라우트 생성
  ├─ EnrollPaymentModal 컴포넌트 작성
  └─ PaymentManager에 "신규 등록 수납" 버튼 연결

Phase C: 연장 수납 API + UI
  ├─ payment-schemas.ts에 renewPaymentSchema 추가
  ├─ payment.service.ts에 renewAndPay() 구현
  ├─ renew API 라우트 생성
  ├─ RenewPaymentModal 컴포넌트 작성
  └─ PaymentManager에 "연장 수납" 버튼 연결

Phase D: 일일정산
  ├─ payment.service.ts에 getSettlementSummary() 구현
  ├─ settlement API 라우트 생성
  ├─ SettlementView 컴포넌트 작성
  ├─ PaymentManager에 탭 추가 (수납현황 | 일일정산)
  └─ 엑셀 다운로드 + 인쇄 기능

Phase E: Mock 모드 지원
  └─ 새 함수들의 Mock 모드 분기 구현
```

---

## 7. 기술 규칙 (반드시 준수)

### 기존 프로젝트 규칙 계승

1. **직렬 분리 필수**: 모든 DB 쿼리에 `division` 필터 포함
2. **하드코딩 금지**: 금액, 기준값은 DB 또는 설정에서 읽기
3. **API 인증 필수**: `requireApiAuth(division, ["ADMIN", "SUPER_ADMIN"])` 사용
4. **피처 플래그**: `paymentManagement` 피처 플래그 체크 유지
5. **Zod 유효성 검사**: 모든 API 입력을 Zod 스키마로 검증
6. **Mock 모드 지원**: `isMockMode()` 분기 처리 필수
7. **트랜잭션**: Student + Payment 동시 생성은 반드시 `prisma.$transaction()` 사용
8. **날짜 처리**: `paymentDate`는 `@db.Date` (시간 없는 날짜), KST 기준 변환
9. **에러 메시지**: 한국어로 작성, 기존 패턴과 일관되게
10. **컴포넌트 패턴**: 서버 컴포넌트에서 데이터 fetch, 클라이언트 컴포넌트에서 인터랙션

### 스타일 가이드

- TailwindCSS 사용 (기존 스타일과 통일)
- 모달: 기존 PaymentManager의 에디터 모달 패턴 참고
- 테이블: 기존 수납 이력 테이블 패턴 참고
- 버튼: `bg-slate-950 text-white` (기본), `bg-white border` (보조)
- 금액 표시: `formatCurrency()` 사용 (lib/payment-meta.ts)
- 날짜 표시: `ko-KR` 로케일 사용

---

## 8. 참고: 현재 코드 위치

| 항목 | 파일 경로 |
|------|----------|
| 수납 서비스 | `lib/services/payment.service.ts` |
| 학생 서비스 | `lib/services/student.service.ts` |
| 수납 스키마 | `lib/payment-schemas.ts` |
| 학생 스키마 | `lib/student-schemas.ts` |
| 수납 메타 | `lib/payment-meta.ts` |
| 수납 UI | `components/payments/PaymentManager.tsx` |
| 학생 폼 | `components/students/StudentForm.tsx` |
| 수납 페이지 | `app/[division]/admin/payments/page.tsx` |
| 수납 API | `app/api/[division]/payments/route.ts` |
| DB 스키마 | `prisma/schema.prisma` |
| Mock 스토어 | `lib/mock-store.ts` |
| 인증 헬퍼 | `lib/api-auth.ts` |
