import { normalizeExamNumber, normalizeName, normalizePhone } from '@/lib/utils'
import { createServerClient } from '@/lib/supabase/server'
import type { Enrollment } from '@/types/database'
import {
  createEnrollmentForPayment,
  createPayment,
  getPaymentServiceMessage,
} from './service'
import type { PaymentCategory, PaymentMethod } from './types'

export type PaymentImportRowInput = {
  name?: string | null
  phone?: string | null
  examNumber?: string | null
  amount?: number | string | null
  paidAt?: string | null
  method?: string | null
  memo?: string | null
  category?: string | null
}

export type PaymentImportPreviewRow = {
  rowNumber: number
  name: string
  phone: string
  examNumber: string | null
  amount: number
  paidAt: string
  method: PaymentMethod
  category: PaymentCategory
  memo: string | null
  status: 'matched' | 'create' | 'duplicate' | 'error'
  enrollmentId: number | null
  message: string
}

export type PaymentImportResult = {
  dryRun: boolean
  rows: PaymentImportPreviewRow[]
  matchedCount: number
  createCount: number
  errorCount: number
  duplicateCount: number
  createdEnrollmentCount: number
  createdPaymentCount: number
}

const METHOD_MAP: Record<string, PaymentMethod> = {
  card: 'card',
  카드: 'card',
  신용카드: 'card',
  cash: 'cash',
  현금: 'cash',
  bank: 'bank_transfer',
  transfer: 'bank_transfer',
  bank_transfer: 'bank_transfer',
  계좌: 'bank_transfer',
  계좌이체: 'bank_transfer',
  이체: 'bank_transfer',
  point: 'point',
  포인트: 'point',
  free: 'free',
  무료: 'free',
  면제: 'free',
  other: 'other',
  기타: 'other',
}

const CATEGORY_MAP: Record<string, PaymentCategory> = {
  tuition: 'tuition',
  수강료: 'tuition',
  강좌료: 'tuition',
  textbook: 'textbook',
  교재: 'textbook',
  교재비: 'textbook',
  material: 'material',
  자료: 'material',
  자료비: 'material',
  exam_fee: 'exam_fee',
  응시료: 'exam_fee',
  extension: 'extension',
  연장: 'extension',
  etc: 'etc',
  기타: 'etc',
}

function parseAmount(value: number | string | null | undefined) {
  if (typeof value === 'number') {
    return value
  }

  return Number(String(value ?? '').replace(/[^0-9-]/g, ''))
}

function parseMethod(value: string | null | undefined): PaymentMethod {
  const key = String(value ?? '').trim().toLowerCase()
  return METHOD_MAP[key] ?? 'card'
}

function parseCategory(value: string | null | undefined): PaymentCategory {
  const key = String(value ?? '').trim().toLowerCase()
  return CATEGORY_MAP[key] ?? 'tuition'
}

function normalizePaidAt(value: string | null | undefined) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return new Date().toISOString()
  }

  if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(raw)) {
    const [year, month, day] = raw.split(/[./-]/).map(Number)
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return raw
}

function toPaidDateKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10)
  }

  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(parsed)
}

function getDuplicatePaymentKey(row: Pick<PaymentImportPreviewRow, 'enrollmentId' | 'paidAt' | 'amount'>) {
  return row.enrollmentId ? `${row.enrollmentId}:${toPaidDateKey(row.paidAt)}:${row.amount}` : null
}

async function loadExistingPaymentKeys(params: {
  courseId: number
  division: string
  rows: PaymentImportPreviewRow[]
}) {
  const enrollmentIds = Array.from(new Set(
    params.rows
      .map((row) => row.enrollmentId)
      .filter((id): id is number => typeof id === 'number'),
  ))

  if (enrollmentIds.length === 0) {
    return new Set<string>()
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('enrollment_payments')
    .select('enrollment_id,paid_date,amount,courses!inner(division)')
    .eq('course_id', params.courseId)
    .eq('courses.division', params.division)
    .in('enrollment_id', enrollmentIds)
    .neq('status', 'voided')

  if (error) {
    throw error
  }

  return new Set((data ?? []).map((payment) => (
    `${payment.enrollment_id}:${payment.paid_date}:${payment.amount}`
  )))
}

function buildEnrollmentMaps(enrollments: Enrollment[]) {
  const byExam = new Map<string, Enrollment[]>()
  const byNamePhoneLast4 = new Map<string, Enrollment[]>()

  for (const enrollment of enrollments) {
    const examNumber = normalizeExamNumber(enrollment.exam_number)
    if (examNumber) {
      byExam.set(examNumber, [...(byExam.get(examNumber) ?? []), enrollment])
    }

    const phoneLast4 = normalizePhone(enrollment.phone).slice(-4)
    if (phoneLast4) {
      const key = `${normalizeName(enrollment.name)}::${phoneLast4}`
      byNamePhoneLast4.set(key, [...(byNamePhoneLast4.get(key) ?? []), enrollment])
    }
  }

  return { byExam, byNamePhoneLast4 }
}

function resolveEnrollment(params: {
  row: Pick<PaymentImportPreviewRow, 'name' | 'phone' | 'examNumber'>
  byExam: Map<string, Enrollment[]>
  byNamePhoneLast4: Map<string, Enrollment[]>
}) {
  const examNumber = normalizeExamNumber(params.row.examNumber)
  const examMatches = examNumber ? params.byExam.get(examNumber) ?? [] : []
  if (examMatches.length === 1) {
    return { status: 'matched' as const, enrollment: examMatches[0], message: '응시번호로 매칭' }
  }

  if (examMatches.length > 1) {
    return { status: 'duplicate' as const, enrollment: null, message: '같은 응시번호 수강생이 2명 이상입니다.' }
  }

  const phoneLast4 = normalizePhone(params.row.phone).slice(-4)
  const namePhoneMatches = phoneLast4
    ? params.byNamePhoneLast4.get(`${normalizeName(params.row.name)}::${phoneLast4}`) ?? []
    : []

  if (namePhoneMatches.length === 1) {
    return { status: 'matched' as const, enrollment: namePhoneMatches[0], message: '이름과 연락처 뒤 4자리로 매칭' }
  }

  if (namePhoneMatches.length > 1) {
    return { status: 'duplicate' as const, enrollment: null, message: '동명이인 후보가 2명 이상입니다.' }
  }

  return { status: 'create' as const, enrollment: null, message: '신규 수강생 생성 예정' }
}

export function previewPaymentImportRows(params: {
  rows: PaymentImportRowInput[]
  enrollments: Enrollment[]
  createMissingEnrollment: boolean
}) {
  const maps = buildEnrollmentMaps(params.enrollments)
  const seenImportKeys = new Set<string>()

  return params.rows.map((row, index): PaymentImportPreviewRow => {
    const rowNumber = index + 1
    const name = normalizeName(String(row.name ?? ''))
    const phone = normalizePhone(String(row.phone ?? ''))
    const examNumber = normalizeExamNumber(row.examNumber) || null
    const amount = parseAmount(row.amount)
    const paidAt = normalizePaidAt(row.paidAt)
    const method = parseMethod(row.method)
    const category = parseCategory(row.category)
    const memo = String(row.memo ?? '').trim() || null

    if (!name) {
      return { rowNumber, name, phone, examNumber, amount: 0, paidAt, method, category, memo, status: 'error', enrollmentId: null, message: '이름이 없습니다.' }
    }

    if (String(row.method ?? '').trim().toLowerCase() === 'mixed' || String(row.method ?? '').trim() === '복합') {
      return { rowNumber, name, phone, examNumber, amount, paidAt, method, category, memo, status: 'error', enrollmentId: null, message: '복합 결제는 카드/현금처럼 실제 수단별 행으로 나누어 업로드해 주세요.' }
    }

    if (phone.length < 4) {
      return { rowNumber, name, phone, examNumber, amount: 0, paidAt, method, category, memo, status: 'error', enrollmentId: null, message: '연락처가 없거나 너무 짧습니다.' }
    }

    if (
      !Number.isInteger(amount)
      || amount < 0
      || (method !== 'free' && amount <= 0)
      || (method === 'free' && amount !== 0)
    ) {
      return { rowNumber, name, phone, examNumber, amount: 0, paidAt, method, category, memo, status: 'error', enrollmentId: null, message: '결제 금액이 올바르지 않습니다.' }
    }

    const importKey = examNumber ? `exam:${examNumber}` : `name-phone:${name}:${phone.slice(-4)}`
    if (seenImportKeys.has(importKey)) {
      return { rowNumber, name, phone, examNumber, amount, paidAt, method, category, memo, status: 'duplicate', enrollmentId: null, message: '업로드 파일 안에서 중복된 학생입니다.' }
    }
    seenImportKeys.add(importKey)

    const resolved = resolveEnrollment({
      row: { name, phone, examNumber },
      ...maps,
    })

    if (resolved.status === 'matched' && resolved.enrollment) {
      return { rowNumber, name, phone, examNumber, amount, paidAt, method, category, memo, status: 'matched', enrollmentId: resolved.enrollment.id, message: resolved.message }
    }

    if (resolved.status === 'duplicate') {
      return { rowNumber, name, phone, examNumber, amount, paidAt, method, category, memo, status: 'duplicate', enrollmentId: null, message: resolved.message }
    }

    if (!params.createMissingEnrollment) {
      return { rowNumber, name, phone, examNumber, amount, paidAt, method, category, memo, status: 'error', enrollmentId: null, message: '매칭 수강생이 없습니다.' }
    }

    return { rowNumber, name, phone, examNumber, amount, paidAt, method, category, memo, status: 'create', enrollmentId: null, message: resolved.message }
  })
}

export async function runPaymentImport(params: {
  courseId: number
  rows: PaymentImportRowInput[]
  enrollments: Enrollment[]
  createMissingEnrollment: boolean
  dryRun: boolean
  division: string
  actorStaffId?: number | null
}): Promise<PaymentImportResult> {
  const previewRows = previewPaymentImportRows({
    rows: params.rows,
    enrollments: params.enrollments,
    createMissingEnrollment: params.createMissingEnrollment,
  })

  const existingPaymentKeys = await loadExistingPaymentKeys({
    courseId: params.courseId,
    division: params.division,
    rows: previewRows,
  })

  for (const row of previewRows) {
    if (row.status === 'error' || row.status === 'duplicate') {
      continue
    }

    const duplicateKey = getDuplicatePaymentKey(row)
    if (duplicateKey && existingPaymentKeys.has(duplicateKey)) {
      row.status = 'duplicate'
      row.message = '같은 수강생·수납일·금액의 결제 기록이 이미 있습니다.'
    }
  }

  const result: PaymentImportResult = {
    dryRun: params.dryRun,
    rows: previewRows,
    matchedCount: previewRows.filter((row) => row.status === 'matched').length,
    createCount: previewRows.filter((row) => row.status === 'create').length,
    errorCount: previewRows.filter((row) => row.status === 'error').length,
    duplicateCount: previewRows.filter((row) => row.status === 'duplicate').length,
    createdEnrollmentCount: 0,
    createdPaymentCount: 0,
  }

  if (params.dryRun) {
    return result
  }

  for (const row of result.rows) {
    if (row.status === 'error' || row.status === 'duplicate') {
      continue
    }

    try {
      let enrollmentId = row.enrollmentId
      if (!enrollmentId) {
        const created = await createEnrollmentForPayment({
          courseId: params.courseId,
          name: row.name,
          phone: row.phone,
          examNumber: row.examNumber,
        }, params.division)
        enrollmentId = created.enrollment.id
        row.enrollmentId = enrollmentId
        row.message = '신규 수강생 생성 후 결제 등록'
        result.createdEnrollmentCount += 1
      }

      await createPayment({
        courseId: params.courseId,
        enrollmentId,
        amount: row.amount,
        method: row.method,
        category: row.category,
        paidAt: row.paidAt,
        memo: row.memo,
        items: [{ label: row.category === 'textbook' ? '교재비' : '수강료', amount: row.amount }],
      }, params.division, params.actorStaffId)
      result.createdPaymentCount += 1
    } catch (error) {
      row.status = 'error'
      row.message = getPaymentServiceMessage(error, '등록 실패')
      result.errorCount += 1
    }
  }

  result.matchedCount = result.rows.filter((row) => row.status === 'matched').length
  result.createCount = result.rows.filter((row) => row.status === 'create').length
  result.errorCount = result.rows.filter((row) => row.status === 'error').length
  result.duplicateCount = result.rows.filter((row) => row.status === 'duplicate').length

  return result
}
