import type { Course, Enrollment, Material } from '@/types/database'

export type StudentsPageData = {
  course: Course
  enrollments: Enrollment[]
  textbooks: Material[]
}

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
}

export type EnrollmentForm = {
  name: string
  phone: string
  exam_number: string
  birth_date: string
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

export const MATRIX_TAB_META: Record<MatrixMode, { materialType: 'handout' | 'textbook'; title: string }> = {
  receipts: { materialType: 'handout', title: '배부자료 수령현황' },
  'textbook-assign': { materialType: 'textbook', title: '교재 배정' },
  'textbook-receipts': { materialType: 'textbook', title: '교재 수령현황' },
}

export function emptyForm(): EnrollmentForm {
  return { name: '', phone: '', exam_number: '', birth_date: '', custom_data: {}, textbookIds: [] }
}

export function toEditForm(enrollment: Enrollment): EnrollmentForm {
  return {
    name: enrollment.name,
    phone: enrollment.phone,
    exam_number: enrollment.exam_number ?? '',
    birth_date: enrollment.student_profile?.birth_date ?? '',
    custom_data: enrollment.custom_data ?? {},
    textbookIds: [],
  }
}

export function isMatrixTab(tab: TabMode): tab is MatrixMode {
  return tab !== 'manage'
}
