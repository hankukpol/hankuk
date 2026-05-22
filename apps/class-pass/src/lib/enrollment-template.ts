import * as XLSX from 'xlsx'
import * as XLSX_STYLE from 'xlsx-js-style'
import type { Course, Enrollment, EnrollmentFieldDef } from '@/types/database'

// Fixed-order built-in columns. Custom enrollment_fields then 비고 are appended.
const BUILTIN_HEADERS = [
  '이름',
  '연락처',
  '생년월일',
  '학번',
  '기수',
  '성별',
  '직렬',
] as const

const MEMO_HEADER = '비고'
const TEXT_FORMAT_HEADERS = new Set(['연락처', '생년월일', '학번'])
const TEXT_CELL_STYLE: XLSX_STYLE.CellStyle = { numFmt: '@' }

const HEADER_STYLE: XLSX_STYLE.CellStyle = {
  font: { bold: true, color: { rgb: '1A237E' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'E8EAF6' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: {
    top: { style: 'thin', color: { rgb: 'C5CAE9' } },
    bottom: { style: 'thin', color: { rgb: 'C5CAE9' } },
    left: { style: 'thin', color: { rgb: 'C5CAE9' } },
    right: { style: 'thin', color: { rgb: 'C5CAE9' } },
  },
}

function buildHeaders(customFields: EnrollmentFieldDef[]): string[] {
  return [...BUILTIN_HEADERS, ...customFields.map((field) => field.label), MEMO_HEADER]
}

function buildDataRow(enrollment: Enrollment, customFields: EnrollmentFieldDef[]): string[] {
  return [
    enrollment.name,
    // Phones export as plain text to preserve leading zeros.
    enrollment.phone,
    // Birth dates are stored as YYMMDD; keep as-is so the upload round-trips cleanly.
    enrollment.student_profile?.birth_date ?? '',
    enrollment.exam_number ?? '',
    enrollment.cohort_label ?? enrollment.student_profile?.cohort_label ?? '',
    enrollment.gender ?? '',
    enrollment.series ?? '',
    ...customFields.map((field) => (enrollment.custom_data ?? {})[field.key] ?? ''),
    enrollment.memo ?? '',
  ]
}

function columnLetterFor(zeroBasedIndex: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA. Sufficient for any realistic enrollment_fields count.
  let n = zeroBasedIndex
  let result = ''
  do {
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return result
}

function todayKey(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'roster'
}

/**
 * Build and trigger download of an Excel template for the given course.
 * If `enrollments` is non-empty, the file contains those rows (round-trip mode).
 * If empty, only the header row is included (blank template mode).
 */
export function downloadEnrollmentTemplate(
  course: Pick<Course, 'name' | 'slug'> & { enrollment_fields?: EnrollmentFieldDef[] },
  enrollments: Enrollment[],
): void {
  const customFields = course.enrollment_fields ?? []
  const headers = buildHeaders(customFields)
  const rows = enrollments.map((enrollment) => buildDataRow(enrollment, customFields))

  const aoa: (string | number)[][] = [headers, ...rows]
  const worksheet = XLSX_STYLE.utils.aoa_to_sheet(aoa)

  // Force every cell to string-type so Excel doesn't auto-convert phone/birth/번호 to numbers.
  const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1')
  for (let rowIdx = range.s.r; rowIdx <= range.e.r; rowIdx += 1) {
    for (let colIdx = range.s.c; colIdx <= range.e.c; colIdx += 1) {
      const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
      const cell = worksheet[addr]
      if (cell && cell.v !== undefined && cell.v !== null) {
        cell.t = 's'
        cell.v = String(cell.v)
        if (TEXT_FORMAT_HEADERS.has(headers[colIdx] ?? '')) {
          cell.z = '@'
          cell.s = { ...(cell.s ?? {}), ...TEXT_CELL_STYLE }
        }
      }
    }
  }

  // Style the header row.
  headers.forEach((_, colIdx) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c: colIdx })
    const cell = worksheet[addr]
    if (cell) {
      cell.s = HEADER_STYLE
    }
  })

  // Column widths.
  worksheet['!cols'] = headers.map((header) => ({
    wch: Math.max(header.length * 2 + 2, header === MEMO_HEADER ? 24 : 14),
    ...(TEXT_FORMAT_HEADERS.has(header) ? { s: TEXT_CELL_STYLE } : {}),
  }))

  // Freeze header row.
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 }

  const workbook = XLSX_STYLE.utils.book_new()
  XLSX_STYLE.utils.book_append_sheet(workbook, worksheet, '수강생 명단')

  const filename = `${sanitizeFilename(course.slug || course.name)}-roster-${todayKey()}.xlsx`
  XLSX_STYLE.writeFile(workbook, filename, { compression: true })

  // Keep column-letter helper exposed for future extensions (e.g. data validation).
  void columnLetterFor
}

/**
 * Read an uploaded xlsx file and convert its first sheet to a tab-separated
 * string compatible with the existing `/api/enrollments/bulk` endpoint.
 *
 * Throws if the file can't be parsed or the first sheet has fewer than 2 rows
 * (header + at least one data row).
 */
export async function parseEnrollmentXlsxToText(file: File | Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('엑셀 파일에 시트가 없습니다.')
  }
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error('엑셀 파일에 시트가 없습니다.')
  }

  // raw:false → dates become formatted strings; defval:'' → empty cells stay empty strings.
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
    defval: '',
  }) as unknown as (string | number | null | undefined)[][]

  if (matrix.length < 2) {
    throw new Error('헤더 행과 최소 1개의 데이터 행이 필요합니다.')
  }

  return matrix
    .map((row) =>
      row
        .map((cell) => (cell === null || cell === undefined ? '' : String(cell).replace(/\t/g, ' ')))
        .join('\t'),
    )
    .join('\n')
}
