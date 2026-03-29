# 07 시설관리 PRD
**한국경찰학원 통합 관리 시스템**
버전: 1.0 | 작성일: 2026-03-16 | 상태: 초안

---

## §0 개요

시설 자원(사물함·스터디룸·교재)을 관리하고 학생이 모바일 수강증에서 직접 확인·결제할 수 있는 기능을 제공한다.

| 자원 | 수량 | 특이사항 |
|------|------|----------|
| 사물함 | 208개 | 두 구역, 혼합 번호 체계 |
| 스터디룸 | 3개 이상 | 직원 배정 방식 |
| 교재 | 다수 | 별도 판매, 줄범대 비치 |

---

## §1 사물함 관리

### 1-1 사물함 현황 (6층)

**현재 배치도 기준 총 208개, 두 구역:**

| 구역 | 번호 체계 | 개수 | 비고 |
|------|-----------|------|------|
| 1강의실 방향 | 1 ~ 120 | 120개 | 숫자 번호, 지그재그 배열 |
| 지덕 강의실 방향 (좌) | A-1 ~ A-40 | 40개 | 알파 접두어, 8열×5행 |
| 지덕 강의실 방향 (우) | 121 ~ 168 | 48개 | 숫자 번호, 4행×12열 |
| **합계** | | **208개** | |

**1강의실 방향 번호 순서 (지그재그):**
```
← 24  23  22 ... 2   1   (1행, 우→좌)
   25  26  27 ... 47  48  (2행, 좌→우)
← 72  71  70 ... 50  49  (3행, 우→좌)
   73  74  75 ... 95  96  (4행, 좌→우)
← 120 119 118... 98  97  (5행, 우→좌)
```

**지덕 강의실 방향 번호 순서:**
```
좌측 블록:                우측 블록:
A-1  A-2 ... A-8          121  125  129 ... 165
A-9  A-10... A-16         122  126  130 ... 166
A-17 A-18... A-24         123  127  131 ... 167
A-25 A-26... A-32         124  128  132 ... 168
A-33 A-34... A-40
```

### 1-2 사물함 상태 관리

```typescript
enum LockerStatus {
  AVAILABLE  = 'AVAILABLE',   // 사용 가능
  IN_USE     = 'IN_USE',      // 사용 중
  RESERVED   = 'RESERVED',    // 예약됨
  BROKEN     = 'BROKEN',      // 고장/점검 중
  BLOCKED    = 'BLOCKED',     // 관리자 차단
}
```

### 1-3 데이터 모델

```prisma
model Locker {
  id            Int           @id @default(autoincrement())
  lockerNumber  String        @unique   // "1", "A-1", "121" 등
  zone          LockerZone                // 구역
  row           Int                      // 행 인덱스 (배치도 표시용)
  col           Int                      // 열 인덱스 (배치도 표시용)
  status        LockerStatus  @default(AVAILABLE)
  width         Int           @default(1)  // 그리드 칸 수 (넓은 사물함 지원)
  height        Int           @default(1)
  rentals       LockerRental[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
}

enum LockerZone {
  LECTURE_ROOM_1   // 1강의실 방향 (1~120)
  JIDEOK_LEFT      // 지덕 좌측 (A-1~A-40)
  JIDEOK_RIGHT     // 지덕 우측 (121~168)
}

model LockerRental {
  id            Int           @id @default(autoincrement())
  lockerId      Int
  locker        Locker        @relation(fields: [lockerId], references: [id])
  studentId     Int
  student       Student       @relation(fields: [studentId], references: [id])
  startDate     DateTime
  endDate       DateTime
  rentalFee     Int           // 대여료 (원)
  feeUnit       RentalFeeUnit // 월별 or 기수당
  paidAt        DateTime?
  paymentId     Int?          // 결제 연결
  status        RentalStatus  @default(ACTIVE)
  notes         String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
}

enum RentalFeeUnit {
  MONTHLY    // 월별 청구
  PER_COHORT // 기수당 청구
}

enum RentalStatus {
  ACTIVE     // 사용 중
  EXPIRED    // 만료
  CANCELLED  // 취소/환불
}
```

### 1-4 관리자 그리드 에디터

사물함 배치도를 관리자가 직접 편집할 수 있는 시각적 에디터를 제공한다.

**에디터 기능:**
- 구역(Zone)별 탭 전환 (1강의실/지덕 좌/지덕 우)
- 그리드 셀 클릭 → 사물함 추가/삭제
- 사물함 번호 직접 입력 (숫자 or A-숫자 형식)
- 셀 병합 (넓은 사물함)
- 드래그로 위치 이동
- 변경 미리보기 → 저장

**API:**
```
GET    /api/lockers/layout          # 전체 배치도 조회
PUT    /api/lockers/layout          # 배치도 저장 (관리자)
GET    /api/lockers                 # 사물함 목록 + 상태
PATCH  /api/lockers/[id]            # 상태 변경
POST   /api/lockers/[id]/rent       # 대여 등록
DELETE /api/lockers/rentals/[rentalId] # 대여 취소
```

### 1-5 모바일 수강증 연동

학생은 모바일 수강증(`/portal/card`)에서:
- 본인 사물함 번호 + 위치 표시
- 대여 기간 / 만료일 확인
- 대여료 결제 (온라인 결제 링크와 동일한 포트원 PG 활용)
- 사물함 현황(빈 칸) 조회 후 신청 요청

**표시 예시:**
```
┌─────────────────────────────┐
│ 내 사물함                    │
│  번호: A-15                  │
│  위치: 6층 지덕 강의실 방향  │
│  기간: 2026.03.01 ~ 03.31   │
│  [연장 결제]                 │
└─────────────────────────────┘
```

### 1-6 대여료 정책

- 대여료는 사물함별·기간별로 관리자가 직접 설정
- 청구 단위: 월별 또는 기수당 (관리자 선택)
- 결제 수단: 현장 결제 또는 온라인 결제 링크

---

## §2 스터디룸 관리

### 2-1 현황

- 총 3개 이상 (관리자 시스템에서 개수 설정 가능)
- 예약 방식: 학생이 직원에게 요청 → 직원이 배정

### 2-2 데이터 모델

```prisma
model StudyRoom {
  id          Int               @id @default(autoincrement())
  name        String            // "스터디룸 A", "스터디룸 1" 등
  capacity    Int               // 수용 인원
  description String?
  isActive    Boolean           @default(true)
  bookings    StudyRoomBooking[]
  createdAt   DateTime          @default(now())
}

model StudyRoomBooking {
  id           Int              @id @default(autoincrement())
  roomId       Int
  room         StudyRoom        @relation(fields: [roomId], references: [id])
  studentId    Int
  student      Student          @relation(fields: [studentId], references: [id])
  staffId      Int?             // 배정한 직원
  staff        Staff?           @relation(fields: [staffId], references: [id])
  date         DateTime         // 사용 날짜
  startTime    String           // "09:00"
  endTime      String           // "12:00"
  purpose      String?
  status       BookingStatus    @default(CONFIRMED)
  createdAt    DateTime         @default(now())
}

enum BookingStatus {
  CONFIRMED   // 배정 완료
  CANCELLED   // 취소
  NOSHOW      // 노쇼
}
```

### 2-3 관리자 기능

- 스터디룸 추가/수정/삭제
- 일별/주별 예약 현황 캘린더 뷰
- 학생 배정 (이름/학번 검색 후 선택)
- 예약 취소 및 노쇼 처리

### 2-4 API

```
GET    /api/study-rooms             # 스터디룸 목록
GET    /api/study-rooms/bookings    # 예약 현황 (날짜 범위)
POST   /api/study-rooms/bookings    # 예약 등록 (직원 배정)
PATCH  /api/study-rooms/bookings/[id] # 상태 변경
```

---

## §3 교재 관리

### 3-1 현황

- 교재는 별도 판매 (수강료 포함 아님)
- 줄범대(진열대)에 비치 후 현장 구매
- 결제는 현장(현금/카드) 처리

### 3-2 데이터 모델

```prisma
model Textbook {
  id          Int               @id @default(autoincrement())
  title       String            // 교재명
  author      String?
  publisher   String?
  price       Int               // 판매가
  stock       Int               @default(0)
  subject     String?           // 관련 과목
  isActive    Boolean           @default(true)
  sales       TextbookSale[]
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
}

model TextbookSale {
  id          Int               @id @default(autoincrement())
  textbookId  Int
  textbook    Textbook          @relation(fields: [textbookId], references: [id])
  studentId   Int?
  student     Student?          @relation(fields: [studentId], references: [id])
  staffId     Int               // 판매 처리 직원
  quantity    Int               @default(1)
  unitPrice   Int
  totalPrice  Int
  paymentId   Int?              // 결제 연결 (선택)
  soldAt      DateTime          @default(now())
}
```

### 3-3 관리자 기능

- 교재 등록/수정/삭제
- 재고 관리 (입고/판매 이력)
- 학생별 구매 이력 조회
- 교재 판매 통계

### 3-4 API

```
GET    /api/textbooks               # 교재 목록
POST   /api/textbooks               # 교재 등록
PATCH  /api/textbooks/[id]          # 수정
POST   /api/textbooks/[id]/sell     # 판매 등록
GET    /api/textbooks/stats         # 판매 통계
```

---

## §4 관리자 UI 설계

### 4-1 시설관리 메뉴 구조

```
/admin/facilities
├── lockers          # 사물함 관리 (배치도 + 대여 현황)
│   ├── layout       # 그리드 에디터
│   └── rentals      # 대여 목록
├── study-rooms      # 스터디룸 예약 관리
└── textbooks        # 교재 판매 관리
```

### 4-2 사물함 배치도 뷰 (읽기 전용)

대시보드에서 사물함 사용 현황을 한눈에 볼 수 있는 뷰:

```
[구역 탭: 1강의실 방향 | 지덕 좌 | 지덕 우]

 1  2  3  4 ...
[빈][점][빈][점]...    ■ 사용중 (초록)
[점][빈][빈][점]...    □ 빈 칸 (회색)
                       ▣ 고장  (빨강)

총 208개 | 사용중 185개 | 빈 칸 20개 | 고장 3개
```

클릭 시: 해당 사물함 상세 (사용자 정보, 대여 기간, 결제 내역)

---

## §5 권한 매트릭스

| 기능 | SUPER_ADMIN | DIRECTOR | MANAGER | ACADEMIC_ADMIN | COUNSELOR | TEACHER |
|------|:-----------:|:--------:|:-------:|:--------------:|:---------:|:-------:|
| 배치도 편집 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 대여 등록/취소 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 대여 현황 조회 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 스터디룸 배정 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 교재 등록/수정 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 교재 판매 등록 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## §6 미결 사항

| 항목 | 내용 | 우선순위 |
|------|------|----------|
| 스터디룸 개수 | 3개 이상이라고 확인, 정확한 개수·이름 필요 | 보통 |
| 사물함 대여료 금액 | 월/기수당 금액은 운영 시작 시 관리자가 직접 설정 | 낮음 |
| 사물함 다층 여부 | 6층 외 다른 층에 사물함 있는지 확인 필요 | 낮음 |

---

## ⚠️ 멀티지점 고려사항 (2026-03-21 추가)

### 데이터 격리
- 모든 시설 데이터 (Locker, LockerRental, StudyRoom, StudyRoomBooking, Textbook)는 `academyId`로 격리됨
- 지점 관리자는 자신의 지점 시설 데이터만 접근 가능

### 사물함 배치 설정 변경 (중요)
- 기존 하드코딩된 `LockerZone` enum (CLASS_ROOM, JIDEOK_LEFT, JIDEOK_RIGHT) 사용 금지
- 사물함 구역 정보는 `academy_settings.lockerLayoutConfig` JSON에서 관리:
  ```json
  {
    "zones": [
      { "zoneId": "classroom", "name": "1강의실", "start": 1, "end": 120 },
      { "zoneId": "jideok_left", "name": "지덕 좌(A)", "prefix": "A-", "start": 1, "end": 40 },
      { "zoneId": "jideok_right", "name": "지덕 우", "start": 121, "end": 168 }
    ]
  }
  ```
- 각 지점이 `/admin/settings/lockers`에서 구역 배치 직접 설정

### 설정 독립화
- 사물함 구역·번호 범위: 지점별 독립 (`/admin/settings/lockers`)
- 스터디룸 목록·요금: 지점별 독립 (`/admin/settings/study-rooms`)
- 교재 마스터: 지점별 독립 관리

### 개발 시 주의사항
- Locker 배정: `academyId` 포함
- StudyRoom 예약: `where: { academyId: ctx.academyId }` 필터 적용
