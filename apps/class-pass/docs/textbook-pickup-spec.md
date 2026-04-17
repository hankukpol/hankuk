# Textbook Pickup Feature - Development Spec

## Overview

기존 배부자료(handout) 시스템을 확장하여, **학생별로 구매한 교재만 수령 체크**할 수 있는 교재 수령 확인 기능을 추가한다.

### 핵심 차이점: 배부자료 vs 교재

| | 배부자료 (handout) | 교재 (textbook) |
|---|---|---|
| 대상 | 수강생 전원 | 구매한 학생만 |
| 자료 목록 | 과정별 동일 | 학생별 다름 |
| 배부 조건 | 등록만 되면 OK | `textbook_assignments` 존재 필요 |

---

## Phase 1: Database Migration

### File: `supabase/migrations/YYYYMMDD_textbook_pickup.sql`

새 마이그레이션 파일을 생성한다.

### 1-1. `materials` 테이블에 `material_type` 컬럼 추가

```sql
ALTER TABLE class_pass.materials
  ADD COLUMN material_type text NOT NULL DEFAULT 'handout';

-- 유효값 제약
ALTER TABLE class_pass.materials
  ADD CONSTRAINT materials_type_check
    CHECK (material_type IN ('handout', 'textbook'));

-- 기존 인덱스 보완: type별 조회 최적화
CREATE INDEX idx_materials_course_type
  ON class_pass.materials (course_id, material_type, is_active);
```

### 1-2. `textbook_assignments` 테이블 생성

```sql
CREATE TABLE class_pass.textbook_assignments (
  id bigserial PRIMARY KEY,
  enrollment_id bigint NOT NULL
    REFERENCES class_pass.enrollments(id) ON DELETE CASCADE,
  material_id integer NOT NULL
    REFERENCES class_pass.materials(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by text,
  UNIQUE (enrollment_id, material_id)
);

CREATE INDEX idx_textbook_assignments_enrollment
  ON class_pass.textbook_assignments (enrollment_id);

CREATE INDEX idx_textbook_assignments_material
  ON class_pass.textbook_assignments (material_id);
```

### 1-3. `distribute_material` RPC 수정

기존 RPC(`supabase/migrations/202604090001_init.sql` lines 127-187)에 textbook assignment 검증 로직 추가:

```sql
CREATE OR REPLACE FUNCTION class_pass.distribute_material(
  p_enrollment_id bigint,
  p_material_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_enrollment record;
  v_material record;
  v_existing record;
  v_assignment record;
  v_log_id bigint;
BEGIN
  -- (기존 검증 로직 동일: enrollment 존재, active, material 존재, course 일치, 중복 체크)

  SELECT e.id, e.name, e.status, e.course_id
  INTO v_enrollment
  FROM class_pass.enrollments e
  WHERE e.id = p_enrollment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'STUDENT_NOT_FOUND');
  END IF;

  IF v_enrollment.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'STUDENT_INACTIVE');
  END IF;

  SELECT m.id, m.name, m.is_active, m.course_id, m.material_type
  INTO v_material
  FROM class_pass.materials m
  WHERE m.id = p_material_id;

  IF NOT FOUND OR NOT v_material.is_active THEN
    RETURN jsonb_build_object('success', false, 'reason', 'MATERIAL_NOT_FOUND');
  END IF;

  IF v_enrollment.course_id <> v_material.course_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'COURSE_MISMATCH');
  END IF;

  -- *** NEW: textbook인 경우 assignment 확인 ***
  IF v_material.material_type = 'textbook' THEN
    SELECT ta.id INTO v_assignment
    FROM class_pass.textbook_assignments ta
    WHERE ta.enrollment_id = p_enrollment_id
      AND ta.material_id = p_material_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'reason', 'NOT_ASSIGNED');
    END IF;
  END IF;

  SELECT dl.id INTO v_existing
  FROM class_pass.distribution_logs dl
  WHERE dl.enrollment_id = p_enrollment_id
    AND dl.material_id = p_material_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'ALREADY_DISTRIBUTED');
  END IF;

  INSERT INTO class_pass.distribution_logs (enrollment_id, material_id)
  VALUES (p_enrollment_id, p_material_id)
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'material_name', v_material.name,
    'student_name', v_enrollment.name
  );
END;
$$;
```

**새로운 실패 사유:** `NOT_ASSIGNED` - textbook인데 해당 학생에게 assignment가 없는 경우

---

## Phase 2: TypeScript Types

### File: `src/types/database.ts`

### 2-1. Material 인터페이스 확장 (line 231)

```typescript
export interface Material {
  id: number
  course_id: number
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
  material_type: 'handout' | 'textbook'  // NEW
}
```

### 2-2. TextbookAssignment 인터페이스 추가

```typescript
export interface TextbookAssignment {
  id: number
  enrollment_id: number
  material_id: number
  assigned_at: string
  assigned_by: string | null
}
```

### 2-3. PassPayload 확장 (line 280)

```typescript
export interface PassPayload {
  // ... existing fields ...
  materials: Material[]           // handout만 (기존과 동일)
  receipts: Record<number, string>
  textbooks: Material[]           // NEW: 이 학생에게 assign된 textbook만
  textbookReceipts: Record<number, string>  // NEW: textbook 수령 기록
  qrToken: string
}
```

---

## Phase 3: Data Layer

### File: `src/lib/class-pass-data.ts`

### 3-1. 기존 `listMaterialsForCourse` 수정

`material_type` 필터 파라미터 추가:

```typescript
export async function listMaterialsForCourse(
  courseId: number,
  opts?: { activeOnly?: boolean; materialType?: 'handout' | 'textbook' }
): Promise<Material[]>
```

- `materialType` 미지정 시 전체 반환 (하위 호환)
- 캐시 태그에 `materialType` 포함

### 3-2. Textbook Assignment 함수 추가

```typescript
// 특정 enrollment에 assign된 textbook 목록
export async function getTextbookAssignments(
  enrollmentId: number
): Promise<TextbookAssignment[]>

// 특정 course의 전체 textbook assignment 목록 (매트릭스용)
export async function getTextbookAssignmentsByCourse(
  courseId: number
): Promise<TextbookAssignment[]>

// textbook assign/unassign
export async function assignTextbook(
  enrollmentId: number,
  materialId: number,
  assignedBy?: string
): Promise<TextbookAssignment>

export async function unassignTextbook(
  enrollmentId: number,
  materialId: number
): Promise<void>

// 일괄 assign (학생 등록 시)
export async function bulkAssignTextbooks(
  enrollmentId: number,
  materialIds: number[],
  assignedBy?: string
): Promise<TextbookAssignment[]>
```

### 3-3. 학생 패스 데이터 로딩 수정

기존 pass 데이터 로딩 로직(`src/app/api/enrollments/pass/route.ts`)에서:
- `materials`: `material_type = 'handout'`인 것만 반환 (기존 동작 유지)
- `textbooks`: `material_type = 'textbook'`이면서 `textbook_assignments`에 해당 enrollment이 있는 것만 반환
- `textbookReceipts`: textbook에 대한 distribution_logs

---

## Phase 4: API Routes

### 4-1. Materials API 확장

**File: `src/app/api/materials/route.ts`**

**POST** - 생성 시 `material_type` 필드 추가:
```typescript
const schema = z.object({
  courseId: z.number(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().optional(),
  material_type: z.enum(['handout', 'textbook']).default('handout'),  // NEW
})
```

**GET** - `materialType` query param 추가:
```
GET /api/materials?courseId=1&materialType=textbook
```

### 4-2. Textbook Assignment API 신규

**File: `src/app/api/textbook-assignments/route.ts`**

```
GET    /api/textbook-assignments?courseId={id}
       → { assignments: TextbookAssignment[] }
       → 과정 전체의 assignment 목록 (매트릭스 뷰용)

POST   /api/textbook-assignments
       → { enrollmentId, materialId }
       → { assignment: TextbookAssignment }
       → 단일 교재 assign

DELETE /api/textbook-assignments
       → { enrollmentId, materialId }
       → { success: true }
       → 단일 교재 unassign
```

**Feature guard:** `admin_material_management_enabled`

### 4-3. Bulk Textbook Assignment API

**File: `src/app/api/textbook-assignments/bulk/route.ts`**

```
POST   /api/textbook-assignments/bulk
       → { enrollmentId, materialIds: number[] }
       → { assignments: TextbookAssignment[] }
       → 학생 등록 시 구매 교재 일괄 assign

POST   /api/textbook-assignments/bulk-by-material
       → { materialId, enrollmentIds: number[] }
       → { assignments: TextbookAssignment[] }
       → 교재별로 구매 학생 일괄 assign
```

### 4-4. Enrollment API 확장

**File: `src/app/api/enrollments/route.ts` (line 101)**

POST(학생 등록) 요청 body에 optional `textbookIds` 필드 추가:

```typescript
const schema = z.object({
  // ... existing fields ...
  textbookIds: z.array(z.number()).optional(),  // NEW: 구매한 교재 ID 목록
})
```

등록 성공 후 `textbookIds`가 있으면 `bulkAssignTextbooks()` 호출.

### 4-5. Receipt Matrix API 확장

**File: `src/app/api/distribution/receipt-matrix/route.ts`**

`materialType` query param 추가:

```
GET /api/distribution/receipt-matrix?courseId=1&materialType=textbook
```

- `materialType=textbook` 시:
  - materials: textbook만 반환
  - logs: textbook에 대한 distribution_logs만 반환
  - **추가 반환:** `assignments: TextbookAssignment[]` (어떤 학생이 어떤 교재를 구매했는지)

### 4-6. Student Receipts API 확장

**File: `src/app/api/enrollments/[id]/receipts/route.ts`**

기존 응답에 textbook receipts 추가:

```typescript
// 기존
{ receipts: Record<number, string> }

// 변경
{ receipts: Record<number, string>, textbookReceipts: Record<number, string> }
```

### 4-7. Distribution 관련 API 에러 처리

**Files: `src/app/api/distribution/manual/route.ts`, `scan/route.ts`, `quick/route.ts`**

`distribute_material` RPC의 새 에러 사유 `NOT_ASSIGNED` 처리 추가:

```typescript
if (result.reason === 'NOT_ASSIGNED') {
  return NextResponse.json(
    { error: '해당 학생에게 배정되지 않은 교재입니다.' },
    { status: 400 }
  )
}
```

---

## Phase 5: Admin UI

### 5-1. Materials Management 페이지 확장

**File: `src/app/(admin)/dashboard/courses/[id]/materials/course-materials-page-client.tsx`**

현재 이 페이지는 교재/배부자료를 구분 없이 관리한다.

**변경사항:**

1. **탭 추가:** `배부자료` | `교재` 탭으로 분리
2. **생성 폼에 `material_type` 선택 제거** - 현재 활성 탭에 따라 자동 결정
3. **목록:** 각 탭에서 해당 타입만 표시

### 5-2. 학생 등록 폼에 교재 선택 추가

**File: `src/app/(admin)/dashboard/courses/[id]/students/course-students-page-client.tsx`**

**개별 등록 (line 524 부근):**

기존 등록 폼 아래에 교재 선택 체크박스 영역 추가:

```
학생 등록
──────────────
수험번호: [         ]
이름:     [         ]
연락처:   [         ]

구매 교재:              ← NEW 섹션
 ☑ 형법 기본서
 ☑ 형법 블록이(서브노트)
 ☐ 형소법 기본서
 ☐ 형소법 필기노트
──────────────
[등록]
```

- 페이지 로드 시 `GET /api/materials?courseId={id}&materialType=textbook` 로 textbook 목록 fetch
- textbook이 0개이면 섹션 미표시
- 등록 시 `textbookIds` 를 함께 POST

**대량 등록 (bulk import):**
- 대량 등록은 기존 형식 유지 (교재 지정은 별도 작업)
- bulk import 후 "교재 배정" 탭에서 일괄 지정 가능

### 5-3. 교재 배정 관리 탭 (신규)

**File: `src/app/(admin)/dashboard/courses/[id]/students/course-students-page-client.tsx`**

기존 TabMode에 `'textbook-assign'` 추가:

```typescript
type TabMode = 'manage' | 'receipts' | 'textbook-assign' | 'textbook-receipts'
```

**탭 구조:**
```
[관리] [배부자료 수령현황] [교재 배정] [교재 수령현황]
```

**"교재 배정" 탭 UI:**

매트릭스 형태 (기존 receipt-matrix와 유사):

```
                  | 형법 기본서 | 형법 블록이 | 형소법 기본서 |
─────────────────────────────────────────────────────────
홍길동 010-1234  |     ☑      |     ☑      |     ☐       |
김철수 010-5678  |     ☑      |     ☐      |     ☑       |
이영희 010-9012  |     ☐      |     ☐      |     ☐       |
```

- 체크박스 클릭 → POST/DELETE `/api/textbook-assignments`
- **일괄 배정:** 교재 선택 → 학생 다중 선택 → "일괄 배정" 버튼
- **검색/필터:** 학생명 검색, 교재별 필터

**"교재 수령현황" 탭:**
- 기존 receipt-matrix와 동일한 구조
- `materialType=textbook`으로 필터링
- assignment가 없는 셀은 회색 처리 (구매 안 함 표시)
- assignment가 있지만 미수령인 셀은 빈 원(·) 표시
- 수령 완료는 완(✓) 표시

```
                  | 형법 기본서 | 형법 블록이 | 형소법 기본서 |
─────────────────────────────────────────────────────────
홍길동 010-1234  |     완      |     ·      |     —       |  ← — = 미구매
김철수 010-5678  |     완      |     —      |     완      |
이영희 010-9012  |     —       |     —      |     —       |  ← 전부 미구매
```

---

## Phase 6: Student UI

### File: `src/app/(student)/courses/[courseSlug]/page.tsx`

### 6-1. 교재 수령 섹션 추가 (line 504 부근)

기존 배부자료 섹션 아래에 교재 수령 섹션을 별도 추가:

```tsx
{/* 기존 배부자료 섹션 - material_type='handout'인 것만 */}
{data.materials.length > 0 && (
  <Section title="배부 자료" badge={`${receiptCount} / ${data.materials.length} 수령`}>
    {/* 기존 코드 그대로 */}
  </Section>
)}

{/* NEW: 교재 수령 섹션 - 이 학생에게 assign된 textbook만 */}
{data.textbooks.length > 0 && (
  <Section title="교재 수령" badge={`${textbookReceiptCount} / ${data.textbooks.length} 수령`}>
    {data.textbooks.map(tb => (
      <MaterialRow
        key={tb.id}
        material={tb}
        received={!!data.textbookReceipts[tb.id]}
        receivedAt={data.textbookReceipts[tb.id]}
        isNext={/* first unreceived */}
      />
    ))}
  </Section>
)}
```

- 교재를 구매하지 않은 학생에게는 섹션 자체가 표시되지 않음
- 구매한 교재만 목록에 표시

### 6-2. Polling 확장

기존 receipt polling 로직(lines 141-161)에 textbook receipts도 포함:

```typescript
// 기존: receipts만 polling
// 변경: receipts + textbookReceipts 동시 polling
const res = await fetch(`/api/enrollments/${enrollmentId}/receipts?name=...&phone=...`)
const { receipts, textbookReceipts } = await res.json()
```

- 모든 handout + textbook이 수령 완료되면 polling 중지

---

## Phase 7: Staff Scan UI

### File: `src/app/(staff)/scan/page.tsx`

### 7-1. QR 스캔 시 교재 포함

기존 QR 스캔 로직에서 미수령 자료를 찾을 때 textbook도 포함하되, **assign된 것만** 표시:

**`src/app/api/distribution/scan/route.ts` 수정:**

```typescript
// 기존: 모든 active materials에서 미수령 찾기
// 변경: handout(전체) + textbook(assign된 것만) 합쳐서 미수령 찾기

const handouts = await listMaterialsForCourse(courseId, { activeOnly: true, materialType: 'handout' })
const assignedTextbooks = await getAssignedTextbooksForEnrollment(enrollmentId)
const allMaterials = [...handouts, ...assignedTextbooks]

// 이후 미수령 필터링 로직은 동일
```

### 7-2. 배부 시 타입 표시

스캔 결과에 material_type 표시하여 직원이 배부자료/교재를 구분할 수 있도록:

```
스캔 결과: 홍길동
미수령 자료: 형법 기본서 [교재]  ← 타입 배지 표시
```

---

## Phase 8: Feature Flags

### File: `src/lib/app-config.shared.ts`

새 feature flag 추가 불필요 - 기존 `admin_material_management_enabled`를 교재에도 공유.

단, 추후 분리가 필요하면:
```typescript
'admin_textbook_management_enabled'  // 교재 관리 (생성/수정/삭제)
'admin_textbook_assignment_enabled'  // 교재 배정 (학생별 구매 지정)
```

**초기 구현에서는 기존 flag 공유로 충분하다.**

---

## Implementation Order

1. **Phase 1** - DB migration (테이블, RPC 수정)
2. **Phase 2** - TypeScript types 업데이트
3. **Phase 3** - Data layer 함수 추가
4. **Phase 4** - API routes (textbook-assignments CRUD + 기존 API 확장)
5. **Phase 5** - Admin UI (교재 생성 + 배정 매트릭스 + 수령현황)
6. **Phase 6** - Student UI (교재 수령 섹션)
7. **Phase 7** - Staff scan UI (교재 포함)

각 Phase는 독립적으로 테스트 가능하며, Phase 1-4까지 완료하면 API 레벨에서 기능이 동작한다.

---

## Files to Create

| File | Description |
|---|---|
| `supabase/migrations/YYYYMMDD_textbook_pickup.sql` | DB migration |
| `src/app/api/textbook-assignments/route.ts` | Assignment CRUD API |
| `src/app/api/textbook-assignments/bulk/route.ts` | Bulk assignment API |

## Files to Modify

| File | Changes |
|---|---|
| `src/types/database.ts` | Material에 material_type 추가, TextbookAssignment 타입, PassPayload 확장 |
| `src/lib/class-pass-data.ts` | listMaterialsForCourse 필터 추가, textbook assignment 함수들 |
| `src/app/api/materials/route.ts` | POST에 material_type, GET에 필터 |
| `src/app/api/enrollments/route.ts` | POST에 textbookIds 처리 |
| `src/app/api/enrollments/pass/route.ts` | textbooks, textbookReceipts 추가 반환 |
| `src/app/api/enrollments/[id]/receipts/route.ts` | textbookReceipts 추가 반환 |
| `src/app/api/distribution/receipt-matrix/route.ts` | materialType 필터 + assignments 반환 |
| `src/app/api/distribution/manual/route.ts` | NOT_ASSIGNED 에러 처리 |
| `src/app/api/distribution/scan/route.ts` | assigned textbook 포함 + NOT_ASSIGNED 에러 |
| `src/app/api/distribution/quick/route.ts` | NOT_ASSIGNED 에러 처리 |
| `src/app/(admin)/dashboard/courses/[id]/materials/course-materials-page-client.tsx` | 탭 분리 (배부자료/교재) |
| `src/app/(admin)/dashboard/courses/[id]/students/course-students-page-client.tsx` | 등록폼 교재 선택 + 교재배정 탭 + 교재수령현황 탭 |
| `src/app/(student)/courses/[courseSlug]/page.tsx` | 교재 수령 섹션 + polling 확장 |
| `src/app/(staff)/scan/page.tsx` | 교재 포함 스캔 |
