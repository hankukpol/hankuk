# 09 포인트 PRD
**한국경찰학원 통합 관리 시스템**
버전: 1.0 | 작성일: 2026-03-16 | 상태: 초안

---

## §0 개요

포인트는 관리자가 학생에게 직접 수동으로 지급하는 방식으로 운영된다.
자동 적립 이벤트는 없으며, 단과 수강료 및 시설 이용(사물함 대여 등)에 사용 가능하다.
학생은 모바일 수강증에서 포인트 잔액과 적립/사용 이력을 투명하게 확인한다.

---

## §1 포인트 제도 기본 규칙

| 항목 | 내용 |
|------|------|
| 적립 방식 | 관리자 수동 지급만 (자동 이벤트 없음) |
| 사용처 | 단과·특강 수강료, 사물함 대여료, 스터디룸 이용료 등 |
| 사용 단위 | 1포인트 = 1원 |
| 유효기간 | 관리자 설정 (만료일 없음 기본값) |
| 양도 | 불가 |
| 환불 | 미사용 포인트는 환불 시 소멸 (운영 정책에 따름) |
| 최솟값 이하 잔액 차감 | 불가 (잔액 초과 사용 방지) |

---

## §2 데이터 모델

```prisma
model PointBalance {
  id          Int           @id @default(autoincrement())
  studentId   Int           @unique
  student     Student       @relation(fields: [studentId], references: [id])
  balance     Int           @default(0)  // 현재 잔액
  updatedAt   DateTime      @updatedAt
}

model PointTransaction {
  id            Int               @id @default(autoincrement())
  studentId     Int
  student       Student           @relation(fields: [studentId], references: [id])
  type          PointTxType
  amount        Int               // 양수: 지급, 음수: 차감
  balanceAfter  Int               // 거래 후 잔액 (스냅샷)
  reason        String            // 지급/차감 사유 설명
  staffId       Int?              // 처리한 직원 (지급/수동 차감 시)
  staff         Staff?            @relation(fields: [staffId], references: [id])
  relatedPaymentId Int?           // 결제 연결 (단과 결제 시 차감)
  relatedRentalId  Int?           // 대여 연결 (시설 이용 시 차감)
  expiresAt     DateTime?         // 만료일 (null = 무기한)
  createdAt     DateTime          @default(now())
}

enum PointTxType {
  GRANT_MANUAL   // 관리자 수동 지급
  USE_PAYMENT    // 단과/수강료 결제 시 사용
  USE_RENTAL     // 시설 이용료 결제 시 사용
  ADJUST         // 관리자 조정 (오류 수정)
  EXPIRE         // 만료 소멸
  REFUND_CANCEL  // 환불/취소로 인한 소멸
}

// 포인트 제도 설정 (관리자 설정 가능)
model PointPolicy {
  id              Int       @id @default(autoincrement())
  name            String    // 제도명 (예: "출석 우수 포인트", "신규 등록 포인트")
  description     String?
  defaultAmount   Int       // 기본 지급량
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

---

## §3 관리자 기능

### 3-1 포인트 지급

- 학생 검색 (학번 또는 이름) → 지급 금액 + 사유 입력 → 지급
- 일괄 지급: CSV 업로드 또는 다중 선택 → 동일 금액·사유로 지급
- 포인트 정책(PointPolicy) 목록에서 선택하면 사유 자동 입력

```
[포인트 지급]
학생: 홍길동 (81697) ▼
금액: [ 5,000 ] 원
사유: [출석 우수 보상           ▼] 또는 직접 입력
만료일: [ ] 없음  또는 [      날짜 선택]
                              [지급]
```

### 3-2 포인트 차감 (수동 조정)

- 잘못 지급된 포인트 수정용
- 차감 사유 필수 입력
- 잔액 초과 차감 불가

### 3-3 포인트 정책 설정

- 자주 사용하는 지급 사유를 사전 등록
- 기본 금액 설정 (지급 시 자동 입력, 변경 가능)

```
[포인트 제도 관리]
+ 제도 추가
┌──────────────────┬───────┬──────────┐
│ 제도명           │ 기본량 │ 상태     │
├──────────────────┼───────┼──────────┤
│ 출석 우수 보상   │ 5,000 │ ✅ 활성  │
│ 모의고사 성적우수│ 3,000 │ ✅ 활성  │
│ 신규 등록 혜택   │10,000 │ ✅ 활성  │
└──────────────────┴───────┴──────────┘
```

### 3-4 이력 조회

- 학생별 포인트 내역 (적립/사용/소멸 전체)
- 기간별 전체 지급 내역
- 잔액 현황 통계 (전체 학생 보유 포인트 합계 등)

---

## §4 결제 연동 (포인트 사용)

### 4-1 단과 결제 시 포인트 사용

온라인 결제 링크에서 포인트 사용 옵션:
```
결제 금액: 50,000원
포인트 사용: [▶ 사용] 보유: 10,000P
  사용할 포인트: [ 10,000 ]P
  실결제 금액: 40,000원
```

- 포인트 단독 결제 가능 (전액 포인트 사용 시 PG 결제 불요)
- 포인트 일부 사용 + 카드 결제 혼합 가능

### 4-2 시설 이용료 포인트 결제

- 사물함 대여료를 포인트로 결제 가능
- 스터디룸 이용료 (이용료 있는 경우)

---

## §5 학생 포털 (모바일 수강증)

`/portal/card` 또는 `/portal/points`에서:

```
┌─────────────────────────────────┐
│ 포인트 현황                      │
│                                 │
│  현재 잔액: 12,500 P            │
│                                 │
│ [포인트 내역]                    │
│ 2026.03.10  출석 우수   +5,000P │
│ 2026.03.05  단과 결제   -8,000P │
│ 2026.02.20  신규 등록  +10,000P │
│ 2026.02.15  사물함 대여 -3,000P │
│              ···  [더보기]       │
└─────────────────────────────────┘
```

- 사유와 함께 모든 이력 투명 공개
- 잔액이 0이면 "포인트를 적립하면 단과 수강료, 사물함 대여 등에 사용할 수 있습니다." 안내

---

## §6 API

```
GET    /api/points/[studentId]          # 잔액 + 이력 조회
POST   /api/points/grant                # 지급 (관리자)
POST   /api/points/bulk-grant           # 일괄 지급 (관리자)
POST   /api/points/adjust               # 수동 조정 (관리자, SUPER_ADMIN+)
GET    /api/points/policies             # 포인트 정책 목록
POST   /api/points/policies             # 정책 등록
PATCH  /api/points/policies/[id]        # 정책 수정
GET    /api/points/stats                # 전체 통계 (관리자)
```

---

## §7 권한 매트릭스

| 기능 | SUPER_ADMIN | DIRECTOR | MANAGER | ACADEMIC_ADMIN | COUNSELOR | TEACHER |
|------|:-----------:|:--------:|:-------:|:--------------:|:---------:|:-------:|
| 포인트 지급 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 포인트 조정(차감) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 일괄 지급 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 정책 설정 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 전체 이력 조회 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 학생별 이력 조회 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## ⚠️ 멀티지점 고려사항 (2026-03-21 추가)

### 데이터 격리
- 포인트 이력 (PointLog, PointBalance)은 `academyId`로 격리됨
- 지점 관리자는 자신의 지점 포인트 데이터만 관리 가능

### 설정 독립화
- 포인트 활성화 여부: 지점별 독립 (`/admin/settings/point-policies`)
- 포인트 사용처 설정: 지점별 독립
- 포인트 지급 규칙: 지점별 독립

### 개발 시 주의사항
- 포인트 지급 API: `academyId` 포함
- 포인트 잔액 조회: `where: { academyId: ctx.academyId }` 필터 적용
