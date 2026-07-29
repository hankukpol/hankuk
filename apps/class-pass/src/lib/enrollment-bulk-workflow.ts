import {
  normalizeBirthDate,
  normalizeExamNumber,
  normalizeName,
  normalizePhone,
} from '@/lib/utils'

export const BULK_IMPORT_IDENTITY_FIELDS = [
  'exam_number',
  'name',
  'phone',
  'birth_date',
] as const

export type BulkImportIdentityField = typeof BULK_IMPORT_IDENTITY_FIELDS[number]

export type BulkImportEditableRow = {
  sourceLineNumber: number
  sourceText: string
  name: string
  phone: string
  examNumber: string
  cohortLabel: string
  birthDate: string
  gender: string
  series: string
  memo: string
  photoUrl: string
  customData: Record<string, string>
}

export type BulkImportMasterSnapshot = {
  id: number
  name: string
  phone: string
  examNumber: string
  birthDate: string
  cohortOptionId: number | null
}

export type BulkImportRowIssue = {
  rowNumber: number
  lineNumber: number
  name: string
  phoneLast4: string | null
  examNumber: string | null
  field: string
  fields: string[]
  value: string | null
  message: string
  messages: string[]
  sourceText: string
  input: BulkImportEditableRow
  master: BulkImportMasterSnapshot | null
}

export type BulkImportProgress = {
  totalCount: number
  importedCount: number
  errorCount: number
}

export function mergeBulkImportProgress(
  previous: BulkImportProgress | null,
  current: BulkImportProgress,
  isRetry: boolean,
): BulkImportProgress {
  if (!isRetry || !previous) {
    return current
  }

  return {
    totalCount: previous.totalCount,
    importedCount: Math.min(
      previous.totalCount,
      previous.importedCount + current.importedCount,
    ),
    errorCount: current.errorCount,
  }
}

export function normalizeBulkImportEditableRow(
  row: BulkImportEditableRow,
): BulkImportEditableRow {
  return {
    ...row,
    name: normalizeName(row.name),
    phone: normalizePhone(row.phone),
    examNumber: normalizeExamNumber(row.examNumber),
    cohortLabel: row.cohortLabel.trim(),
    birthDate: normalizeBirthDate(row.birthDate) ?? '',
    gender: row.gender.trim(),
    series: normalizeName(row.series),
    memo: row.memo.trim(),
    photoUrl: row.photoUrl.trim(),
    customData: Object.fromEntries(
      Object.entries(row.customData)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => Boolean(value)),
    ),
  }
}

export function getBulkImportIdentityMismatches(
  row: Pick<BulkImportEditableRow, 'name' | 'phone' | 'examNumber' | 'birthDate'>,
  master: BulkImportMasterSnapshot,
): BulkImportIdentityField[] {
  const fields: BulkImportIdentityField[] = []
  const inputName = normalizeName(row.name)
  const inputPhone = normalizePhone(row.phone)
  const inputExamNumber = normalizeExamNumber(row.examNumber)
  const inputBirthDate = normalizeBirthDate(row.birthDate) ?? ''
  const masterName = normalizeName(master.name)
  const masterPhone = normalizePhone(master.phone)
  const masterExamNumber = normalizeExamNumber(master.examNumber)
  const masterBirthDate = normalizeBirthDate(master.birthDate) ?? ''

  if (inputExamNumber && masterExamNumber && inputExamNumber !== masterExamNumber) {
    fields.push('exam_number')
  }
  if (inputName !== masterName) {
    fields.push('name')
  }
  if (inputPhone !== masterPhone) {
    fields.push('phone')
  }
  if (inputBirthDate && masterBirthDate && inputBirthDate !== masterBirthDate) {
    fields.push('birth_date')
  }

  return fields
}

export function getBulkImportEnrollmentSnapshotMismatches(
  row: Pick<BulkImportEditableRow, 'name' | 'phone'>,
  snapshot: { name: string; phone: string },
): BulkImportIdentityField[] {
  const fields: BulkImportIdentityField[] = []
  if (normalizeName(row.name) !== normalizeName(snapshot.name)) {
    fields.push('name')
  }
  if (normalizePhone(row.phone) !== normalizePhone(snapshot.phone)) {
    fields.push('phone')
  }
  return fields
}

export function applyBulkImportMasterIdentity(
  row: BulkImportEditableRow,
  master: BulkImportMasterSnapshot,
): BulkImportEditableRow {
  return {
    ...row,
    name: master.name,
    phone: master.phone,
    examNumber: master.examNumber || row.examNumber,
    birthDate: master.birthDate || row.birthDate,
  }
}

export function getBulkImportFieldLabel(field: string) {
  switch (field) {
    case 'exam_number':
      return '학번'
    case 'name':
      return '이름'
    case 'phone':
      return '연락처'
    case 'birth_date':
      return '생년월일'
    case 'cohort_label':
      return '기수'
    case 'series':
      return '직렬'
    case 'duplicate_row':
      return '중복 행'
    default:
      return field || '입력값'
  }
}
