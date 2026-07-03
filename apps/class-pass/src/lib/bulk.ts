import { normalizeBirthDate } from '@/lib/auth/student-auth'
import { normalizeGenderLabel } from '@/lib/gender'
import { normalizeExamNumber, normalizeName, normalizePhone } from '@/lib/utils'

export type ParsedEnrollmentRow = {
  sourceLineNumber: number
  sourceText: string
  name: string
  phone: string
  exam_number?: string
  cohort_label?: string
  birth_date?: string
  gender?: string
  region?: string
  series?: string
  memo?: string
  photo_url?: string
  custom_data?: Record<string, string>
}

export type EnrollmentBulkCustomField = {
  key: string
  label?: string | null
}

export type ParsedSeatRow = {
  lineNumber: number
  examNumber: string
  studentName: string
  subjectName: string
  seatNumber: string
}

export type ParsedSeatBulkResult = {
  rows: ParsedSeatRow[]
  sourceRowCount: number
  subjectOrder: string[]
}

export type ParsedSeatBulkOptions = {
  fallbackSubjectOrder?: string[]
}

function normalizeHeaderLabel(value: string) {
  return normalizeName(value).replace(/\s+/g, '').toLowerCase()
}

function isEnrollmentExamHeader(value: string) {
  const normalized = normalizeHeaderLabel(value)
  return (
    normalized === '번호'
    || normalized === '수험번호'
    || normalized === '응시번호'
    || normalized === '학번'
  )
}

function isEnrollmentCohortHeader(value: string) {
  const normalized = normalizeHeaderLabel(value)
  return normalized === '기수' || normalized === '期수' || normalized === 'cohort'
}

function isEnrollmentNameHeader(value: string) {
  const normalized = normalizeHeaderLabel(value)
  return normalized === '이름' || normalized === '성명'
}

function isEnrollmentPhoneHeader(value: string) {
  const normalized = normalizeHeaderLabel(value)
  return (
    normalized === '연락처'
    || normalized === '휴대폰번호'
    || normalized === '전화번호'
    || normalized === '휴대폰'
    || normalized === '전화'
  )
}

function isEnrollmentBirthDateHeader(value: string) {
  const normalized = normalizeHeaderLabel(value)
  return (
    normalized === '생년월일'
    || normalized === '생일'
    || normalized === 'birthdate'
    || normalized === 'birthday'
    || normalized === 'yymmdd'
  )
}

function isEnrollmentGenderHeader(value: string) {
  const normalized = normalizeHeaderLabel(value)
  return normalized === '성별' || normalized === '남녀' || normalized === '남여' || normalized === 'gender'
}

function isEnrollmentSeriesHeader(value: string) {
  const normalized = normalizeHeaderLabel(value)
  return normalized === '직렬' || normalized === 'series'
}

function isEnrollmentMemoHeader(value: string) {
  const normalized = normalizeHeaderLabel(value)
  return (
    normalized === '비고'
    || normalized === '메모'
    || normalized === 'memo'
    || normalized === 'note'
    || normalized === 'remark'
  )
}

function normalizeKnownGender(value: string) {
  const gender = normalizeGenderLabel(value)
  return gender === '남' || gender === '여' ? gender : undefined
}

function normalizeGender(value: string) {
  return normalizeGenderLabel(value) || undefined
}

function splitEnrollmentLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed) {
    return []
  }

  if (trimmed.includes('\t')) {
    return trimmed.split('\t').map((cell) => cell.trim())
  }

  if (trimmed.includes(',')) {
    return trimmed.split(',').map((cell) => cell.trim())
  }

  return trimmed.split(/\s+/).map((cell) => cell.trim())
}

function findBirthDateCellIndex(cells: string[]) {
  return cells.findIndex((cell) => normalizeBirthDate(cell) !== null)
}

function isEnrollmentHeaderRow(cells: string[]) {
  if (cells.length >= 3) {
    return (
      (
        isEnrollmentExamHeader(cells[0] ?? '')
        && isEnrollmentNameHeader(cells[1] ?? '')
        && isEnrollmentPhoneHeader(cells[2] ?? '')
      )
      || (
        isEnrollmentNameHeader(cells[0] ?? '')
        && isEnrollmentPhoneHeader(cells[1] ?? '')
        && (
          isEnrollmentExamHeader(cells[2] ?? '')
          || isEnrollmentBirthDateHeader(cells[2] ?? '')
        )
      )
    )
  }

  if (cells.length === 2) {
    return isEnrollmentNameHeader(cells[0] ?? '') && isEnrollmentPhoneHeader(cells[1] ?? '')
  }

  return false
}

type EnrollmentHeaderMap = {
  cohort?: number
  exam?: number
  name?: number
  phone?: number
  birthDate?: number
  gender?: number
  series?: number
  memo?: number
}

function normalizeCustomFields(customFields?: Array<string | EnrollmentBulkCustomField>): EnrollmentBulkCustomField[] {
  return (customFields ?? [])
    .map((field) => (typeof field === 'string' ? { key: field, label: field } : field))
    .filter((field) => Boolean(field.key))
}

function getEnrollmentCustomHeaderMap(
  headers: string[],
  customFields: EnrollmentBulkCustomField[],
  usedIndexes: Set<number>,
) {
  const keyByLabel = new Map<string, string>()

  customFields.forEach((field) => {
    for (const label of [field.label, field.key]) {
      const normalized = normalizeHeaderLabel(label ?? '')
      if (normalized && !keyByLabel.has(normalized)) {
        keyByLabel.set(normalized, field.key)
      }
    }
  })

  const customIndexes = new Map<string, number>()
  headers.forEach((header, index) => {
    if (usedIndexes.has(index)) {
      return
    }

    const key = keyByLabel.get(normalizeHeaderLabel(header))
    if (key && !customIndexes.has(key)) {
      customIndexes.set(key, index)
    }
  })

  return customIndexes
}

function getEnrollmentHeaderMap(cells: string[]): EnrollmentHeaderMap | null {
  const map: EnrollmentHeaderMap = {}
  cells.forEach((cell, index) => {
    if (isEnrollmentCohortHeader(cell)) map.cohort = index
    else if (isEnrollmentExamHeader(cell)) map.exam = index
    else if (isEnrollmentNameHeader(cell)) map.name = index
    else if (isEnrollmentPhoneHeader(cell)) map.phone = index
    else if (isEnrollmentBirthDateHeader(cell)) map.birthDate = index
    else if (isEnrollmentGenderHeader(cell)) map.gender = index
    else if (isEnrollmentSeriesHeader(cell)) map.series = index
    else if (isEnrollmentMemoHeader(cell)) map.memo = index
  })

  return map.name !== undefined && map.phone !== undefined ? map : null
}

/**
 * Parse bulk enrollment text.
 * Column order: 기수, 수험번호, 이름, 연락처, 생년월일, 성별, 직렬, ...customFields
 */
export function parseEnrollmentBulkText(
  input: string,
  customFieldsInput?: Array<string | EnrollmentBulkCustomField>,
): ParsedEnrollmentRow[] {
  const customFields = normalizeCustomFields(customFieldsInput)
  const lines = input
    .split(/\r?\n/)
    .map((line, index) => ({
      cells: splitEnrollmentLine(line),
      lineNumber: index + 1,
      sourceText: line,
    }))
    .filter((line) => line.cells.some(Boolean))

  const headerMap = lines.length > 0 ? getEnrollmentHeaderMap(lines[0]?.cells ?? []) : null
  const headerCells = headerMap ? lines[0]?.cells ?? [] : []
  const headerUsedIndexes = new Set(
    headerMap
      ? Object.values(headerMap).filter((value): value is number => value !== undefined)
      : [],
  )
  const customHeaderMap = headerMap
    ? getEnrollmentCustomHeaderMap(headerCells, customFields, headerUsedIndexes)
    : new Map<string, number>()
  const bodyLines = headerMap ? lines.slice(1) : lines.filter((line) => !isEnrollmentHeaderRow(line.cells))

  return bodyLines
    .map(({ cells, lineNumber, sourceText }) => {
      if (headerMap) {
        const row: ParsedEnrollmentRow = {
          sourceLineNumber: lineNumber,
          sourceText,
          cohort_label: headerMap.cohort !== undefined ? ((cells[headerMap.cohort] ?? '').trim() || undefined) : undefined,
          exam_number: headerMap.exam !== undefined ? normalizeExamNumber(cells[headerMap.exam] ?? '') || undefined : undefined,
          birth_date: headerMap.birthDate !== undefined ? normalizeBirthDate(cells[headerMap.birthDate] ?? '') ?? undefined : undefined,
          gender: headerMap.gender !== undefined ? normalizeGender(cells[headerMap.gender] ?? '') : undefined,
          series: headerMap.series !== undefined ? normalizeName(cells[headerMap.series] ?? '') || undefined : undefined,
          memo: headerMap.memo !== undefined ? ((cells[headerMap.memo] ?? '').trim() || undefined) : undefined,
          name: normalizeName(cells[headerMap.name ?? -1] ?? ''),
          phone: normalizePhone(cells[headerMap.phone ?? -1] ?? ''),
        }

        if (customFields.length) {
          const usedIndexes = new Set([
            ...headerUsedIndexes,
            ...customHeaderMap.values(),
          ])
          const fallbackValues = cells.filter((_, index) => !usedIndexes.has(index))
          let fallbackIndex = 0
          const customData: Record<string, string> = {}
          customFields.forEach((field) => {
            const directIndex = customHeaderMap.get(field.key)
            const value = directIndex !== undefined
              ? (cells[directIndex] ?? '').trim()
              : fallbackValues[fallbackIndex++]
            if (value) {
              customData[field.key] = value
            }
          })
          if (Object.keys(customData).length > 0) {
            row.custom_data = customData
          }
        }

        return row
      }

      const looksLikePhone = (value: string) => normalizePhone(value).length >= 8
      const hasLeadingCohortAndExamNumber = cells.length >= 4 && looksLikePhone(cells[3] ?? '')
      const hasLeadingExamNumber = !hasLeadingCohortAndExamNumber && cells.length >= 3 && looksLikePhone(cells[2] ?? '')
      const nameIndex = hasLeadingCohortAndExamNumber ? 2 : hasLeadingExamNumber ? 1 : 0
      const phoneIndex = hasLeadingCohortAndExamNumber ? 3 : hasLeadingExamNumber ? 2 : 1
      const customStartIndex = hasLeadingCohortAndExamNumber ? 4 : hasLeadingExamNumber ? 3 : 2
      const trailingValues = cells.slice(customStartIndex)
      let examNumber = hasLeadingExamNumber
        ? normalizeExamNumber(cells[0] ?? '') || undefined
        : undefined
      const cohortLabel = hasLeadingCohortAndExamNumber ? (cells[0] ?? '').trim() || undefined : undefined
      if (hasLeadingCohortAndExamNumber) {
        examNumber = normalizeExamNumber(cells[1] ?? '') || undefined
      }
      let birthDate: string | undefined
      const customValues = [...trailingValues]

      if (!hasLeadingExamNumber && looksLikePhone(cells[1] ?? '')) {
        const firstExtraBirthDate = normalizeBirthDate(customValues[0])
        if (firstExtraBirthDate) {
          birthDate = firstExtraBirthDate
          customValues.shift()
        } else if (customValues[0]) {
          examNumber = normalizeExamNumber(customValues[0]) || undefined
          customValues.shift()
        }
      }

      if (!birthDate) {
        const birthDateIndex = findBirthDateCellIndex(customValues)
        if (birthDateIndex >= 0) {
          birthDate = normalizeBirthDate(customValues[birthDateIndex]) ?? undefined
          customValues.splice(birthDateIndex, 1)
        }
      }

      let gender: string | undefined
      const firstExtraGender = normalizeKnownGender(customValues[0] ?? '')
      if (firstExtraGender) {
        gender = firstExtraGender
        customValues.shift()
      }

      const series = customValues[0]?.trim() || undefined
      if (series) {
        customValues.shift()
      }

      // In positional mode the memo column comes after gender, series, and any
      // course-defined custom fields. Anything still left becomes the memo so
      // users can paste `... 직렬 비고` without supplying a header.
      const customFieldCount = customFields.length
      const memoIndex = customFieldCount
      const memo = (customValues[memoIndex] ?? '').trim() || undefined

      const row: ParsedEnrollmentRow = {
        sourceLineNumber: lineNumber,
        sourceText,
        cohort_label: cohortLabel,
        exam_number: examNumber,
        birth_date: birthDate,
        gender,
        series,
        memo,
        name: normalizeName(cells[nameIndex] ?? ''),
        phone: normalizePhone(cells[phoneIndex] ?? ''),
      }

      if (customFields.length) {
        const customData: Record<string, string> = {}
        customFields.forEach((field, index) => {
          const value = customValues[index]
          if (value) {
            customData[field.key] = value
          }
        })
        if (Object.keys(customData).length > 0) {
          row.custom_data = customData
        }
      }

      return row
    })
}

type TabularSeatLine = {
  cells: string[]
  lineNumber: number
}

function parseSeatLines(input: string): TabularSeatLine[] {
  return input
    .split(/\r?\n/)
    .map((line, index) => ({
      cells: line.split('\t').map((cell) => cell.trim()),
      lineNumber: index + 1,
    }))
    .filter(({ cells }) => cells.some((cell) => cell.length > 0))
}

function isExamNumberHeader(value: string) {
  const normalized = normalizeHeaderLabel(value)
  return normalized === '번호' || normalized === '수험번호' || normalized === '응시번호'
}

function isNameHeader(value: string) {
  return normalizeHeaderLabel(value) === '이름'
}

function isPhoneHeader(value: string) {
  const normalized = normalizeHeaderLabel(value)
  return (
    normalized === '연락처'
    || normalized === '전화번호'
    || normalized === '휴대폰'
    || normalized === '휴대폰번호'
    || normalized === '전화'
  )
}

function isSeatNumberHeader(value: string) {
  const normalized = normalizeHeaderLabel(value)
  return normalized === '좌석번호' || normalized === 'seat'
}

function isLikelyPhoneCell(value: string) {
  const digits = normalizePhone(value)
  return digits.length >= 8
}

function isSeatMatrixFormat(lines: TabularSeatLine[]) {
  if (lines.length < 2) {
    return false
  }

  const header = lines[0]?.cells ?? []
  const subjectHeaders = header.slice(3).map((cell) => normalizeName(cell)).filter(Boolean)

  return (
    header.length >= 4
    && isExamNumberHeader(header[0] ?? '')
    && isNameHeader(header[1] ?? '')
    && isPhoneHeader(header[2] ?? '')
    && subjectHeaders.length > 0
  )
}

function parseSeatMatrix(lines: TabularSeatLine[]): ParsedSeatBulkResult {
  const header = lines[0]?.cells ?? []
  const subjectOrder = header
    .slice(3)
    .map((cell) => normalizeName(cell))
    .filter(Boolean)
  const secondLine = lines[1]?.cells ?? []
  const hasSeatNumberHeader =
    secondLine.length >= 4
    && secondLine.slice(0, 3).every((cell) => normalizeName(cell) === '')
    && secondLine.slice(3).some((cell) => isSeatNumberHeader(cell))
    && secondLine.slice(3).every((cell) => normalizeName(cell) === '' || isSeatNumberHeader(cell))
  const dataLines = lines.slice(hasSeatNumberHeader ? 2 : 1)
  const rows = dataLines.flatMap(({ cells, lineNumber }) => {
    const examNumber = normalizeExamNumber(cells[0] ?? '')
    const studentName = normalizeName(cells[1] ?? '')

    return subjectOrder.flatMap((subjectName, index) => {
      const seatNumber = (cells[index + 3] ?? '').trim()
      if (!subjectName || !seatNumber) {
        return []
      }

      return [{
        lineNumber,
        examNumber,
        studentName,
        subjectName,
        seatNumber,
      }]
    })
  })

  return {
    rows,
    sourceRowCount: dataLines.length,
    subjectOrder,
  }
}

function isImplicitSeatMatrix(
  lines: TabularSeatLine[],
  fallbackSubjectOrder: string[],
) {
  if (fallbackSubjectOrder.length === 0 || lines.length === 0) {
    return false
  }

  return lines.every(({ cells }) => (
    cells.length >= 4
    && normalizeExamNumber(cells[0] ?? '').length > 0
    && normalizeName(cells[1] ?? '').length > 0
    && isLikelyPhoneCell(cells[2] ?? '')
    && cells.length >= 3 + fallbackSubjectOrder.length
  ))
}

function parseImplicitSeatMatrix(
  lines: TabularSeatLine[],
  fallbackSubjectOrder: string[],
): ParsedSeatBulkResult {
  const subjectOrder = fallbackSubjectOrder
    .map((subjectName) => normalizeName(subjectName))
    .filter(Boolean)
  const rows = lines.flatMap(({ cells, lineNumber }) => {
    const examNumber = normalizeExamNumber(cells[0] ?? '')
    const studentName = normalizeName(cells[1] ?? '')

    return subjectOrder.flatMap((subjectName, index) => {
      const seatNumber = (cells[index + 3] ?? '').trim()
      if (!subjectName || !seatNumber) {
        return []
      }

      return [{
        lineNumber,
        examNumber,
        studentName,
        subjectName,
        seatNumber,
      }]
    })
  })

  return {
    rows,
    sourceRowCount: lines.length,
    subjectOrder,
  }
}

function parseSeatRowList(lines: TabularSeatLine[]): ParsedSeatBulkResult {
  const rows = lines.map(({ cells, lineNumber }) => ({
    lineNumber,
    examNumber: normalizeExamNumber(cells[0] ?? ''),
    studentName: normalizeName(cells[1] ?? ''),
    subjectName: normalizeName(cells[2] ?? ''),
    seatNumber: (cells[3] ?? '').trim(),
  }))

  return {
    rows,
    sourceRowCount: rows.length,
    subjectOrder: [],
  }
}

export function parseSeatBulkText(
  input: string,
  options?: ParsedSeatBulkOptions,
): ParsedSeatBulkResult {
  const lines = parseSeatLines(input)
  const fallbackSubjectOrder = options?.fallbackSubjectOrder ?? []

  if (lines.length === 0) {
    return { rows: [], sourceRowCount: 0, subjectOrder: [] }
  }

  if (isSeatMatrixFormat(lines)) {
    return parseSeatMatrix(lines)
  }

  if (isImplicitSeatMatrix(lines, fallbackSubjectOrder)) {
    return parseImplicitSeatMatrix(lines, fallbackSubjectOrder)
  }

  return parseSeatRowList(lines)
}

export function toReceiptMap(
  rows: Array<{ material_id: number; distributed_at: string }> | null | undefined,
) {
  return (rows ?? []).reduce<Record<number, string>>((accumulator, row) => {
    accumulator[row.material_id] = row.distributed_at
    return accumulator
  }, {})
}
