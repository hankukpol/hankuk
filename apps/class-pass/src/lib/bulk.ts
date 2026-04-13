import { normalizeExamNumber, normalizeName, normalizePhone } from '@/lib/utils'

export type ParsedEnrollmentRow = {
  name: string
  phone: string
  exam_number?: string
  birth_date?: string
  gender?: string
  region?: string
  series?: string
  photo_url?: string
  custom_data?: Record<string, string>
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
  return normalized === '?숇쾲' || normalized === '?섑뿕踰덊샇' || normalized === '?묒떆踰덊샇' || normalized === '?쒕쾲'
}

function isEnrollmentNameHeader(value: string) {
  const normalized = normalizeHeaderLabel(value)
  return normalized === '?대쫫' || normalized === '?깅챸'
}

function isEnrollmentPhoneHeader(value: string) {
  const normalized = normalizeHeaderLabel(value)
  return (
    normalized === '?곕씫泥?'
    || normalized === '?꾪솕踰덊샇'
    || normalized === '?대???'
    || normalized === '?대??곕쾲??'
    || normalized === '?꾪솕'
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

/**
 * Parse bulk enrollment text.
 * Column order: 학번, 이름, 연락처, ...customFieldKeys
 */
export function parseEnrollmentBulkText(
  input: string,
  customFieldKeys?: string[],
): ParsedEnrollmentRow[] {
  return input
    .split(/\r?\n/)
    .map((line) => splitEnrollmentLine(line))
    .filter((cells) => cells.some(Boolean))
    .filter((cells) => !isEnrollmentHeaderRow(cells))
    .filter((cells) => cells.length >= 2)
    .map((cells) => {
      const looksLikePhone = (value: string) => normalizePhone(value).length >= 8
      const hasLeadingExamNumber = cells.length >= 3 && looksLikePhone(cells[2] ?? '')
      const nameIndex = hasLeadingExamNumber ? 1 : 0
      const phoneIndex = hasLeadingExamNumber ? 2 : 1
      const customStartIndex = hasLeadingExamNumber ? 3 : 2
      const remainder = cells.slice(customStartIndex)
      let examNumber = hasLeadingExamNumber
        ? normalizeExamNumber(cells[0] ?? '') || undefined
        : undefined
      let birthDate: string | undefined
      let customValueStartIndex = customStartIndex

      if (!hasLeadingExamNumber && looksLikePhone(cells[1] ?? '')) {
        const firstExtra = remainder[0]?.replace(/\D/g, '') ?? ''
        const secondExtra = remainder[1]?.replace(/\D/g, '') ?? ''

        if (/^\d{6}$/.test(firstExtra)) {
          birthDate = firstExtra
          customValueStartIndex += 1
        } else {
          examNumber = normalizeExamNumber(remainder[0] ?? '') || undefined
          if (remainder[0]) {
            customValueStartIndex += 1
          }

          if (/^\d{6}$/.test(secondExtra)) {
            birthDate = secondExtra
            customValueStartIndex += 1
          }
        }
      }

      if (hasLeadingExamNumber) {
        const extraBirthDate = remainder[0]?.replace(/\D/g, '') ?? ''
        if (/^\d{6}$/.test(extraBirthDate)) {
          birthDate = extraBirthDate
          customValueStartIndex += 1
        }
      }

      const row: ParsedEnrollmentRow = {
        exam_number: examNumber,
        birth_date: birthDate,
        name: normalizeName(cells[nameIndex] ?? ''),
        phone: normalizePhone(cells[phoneIndex] ?? ''),
      }

      if (customFieldKeys?.length) {
        const customData: Record<string, string> = {}
        customFieldKeys.forEach((key, index) => {
          const value = cells[customValueStartIndex + index]
          if (value) customData[key] = value
        })
        if (Object.keys(customData).length > 0) {
          row.custom_data = customData
        }
      }

      return row
    })
    .filter((row) => row.name && row.phone)
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
  return normalized === '학번' || normalized === '수험번호' || normalized === '응시번호'
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
  return normalized === '좌석번호' || normalized.toLowerCase() === 'seat'
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
