import type { BranchSeriesOption, Course, Enrollment, EnrollmentStudentType, Material } from '@/types/database'
import { normalizeGenderLabel } from '@/lib/gender'

export type StudentsPageData = {
  course: Course
  enrollments: Enrollment[]
  textbooks: Material[]
  seriesOptions: BranchSeriesOption[]
}

export type EnrollmentManageStatusFilter = 'all' | 'active' | 'refunded' | 'suspended' | 'cancelled'

export type TabMode = 'manage' | 'receipts' | 'textbook-assign' | 'textbook-receipts'
export type MatrixMode = Exclude<TabMode, 'manage'>
export type Panel = 'none' | 'create' | 'bulk' | 'edit'

export type ReceiptCell = {
  distributed_at: string
  logId: number
}

export type MatrixRow = {
  enrollment: Enrollment
  receipts: Record<number, ReceiptCell>
  assignments: Record<number, true>
  // 이 수강생이 좌석을 배정받은 과목 id 집합 (과목 지정 배부자료 게이팅용)
  seatSubjects: Record<number, true>
}

export type EnrollmentForm = {
  name: string
  phone: string
  exam_number: string
  cohort_number: string
  birth_date: string
  gender: string
  series_option_id: number | null
  student_type: EnrollmentStudentType
  custom_data: Record<string, string>
  textbookIds: number[]
}

export type PinRevealState = {
  title: string
  pins: Array<{ name: string; phone: string; pin: string }>
}

export type BulkProgressState = {
  done: number
  total: number
}

export type DistributionBatchItem = {
  enrollmentId: number
  materialIds: number[]
}

export const MATRIX_TAB_META: Record<MatrixMode, { materialType: 'handout' | 'textbook'; title: string }> = {
  receipts: { materialType: 'handout', title: '배부자료 수령현황' },
  'textbook-assign': { materialType: 'textbook', title: '교재 배정' },
  'textbook-receipts': { materialType: 'textbook', title: '교재 수령현황' },
}

export function emptyForm(seriesOptionId: number | null = null): EnrollmentForm {
  return {
    name: '',
    phone: '',
    exam_number: '',
    cohort_number: '',
    birth_date: '',
    gender: '',
    series_option_id: seriesOptionId,
    student_type: 'academy',
    custom_data: {},
    textbookIds: [],
  }
}

function cohortLabelToNumberString(label: string | null | undefined) {
  const match = label?.trim().match(/^(\d{1,3})\s*기?$/)
  return match ? match[1] : ''
}

export function toEditForm(enrollment: Enrollment): EnrollmentForm {
  return {
    name: enrollment.name,
    phone: enrollment.phone,
    exam_number: enrollment.exam_number ?? '',
    cohort_number: cohortLabelToNumberString(enrollment.cohort_label ?? enrollment.student_profile?.cohort_label),
    birth_date: enrollment.student_profile?.birth_date ?? '',
    gender: normalizeGenderLabel(enrollment.gender),
    series_option_id: enrollment.series_option_id ?? null,
    student_type: enrollment.student_type ?? 'general',
    custom_data: enrollment.custom_data ?? {},
    textbookIds: [],
  }
}

export function isMatrixTab(tab: TabMode): tab is MatrixMode {
  return tab !== 'manage'
}
