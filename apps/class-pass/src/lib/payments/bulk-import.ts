import { randomUUID } from 'node:crypto'
import { normalizeExamNumber, normalizeName, normalizePhone } from '@/lib/utils'
import { normalizeBirthDate } from '@/lib/auth/student-auth'
import { createServerClient } from '@/lib/supabase/server'
import type { Enrollment, Student } from '@/types/database'
import {
  createPaymentBundle,
  getPaymentServiceMessage,
} from './service'
import { normalizeCardCompanyName } from './card-companies'
import { resolveDepositorName } from './request-normalizers'
import { createPaymentImportRegistration, getImportRegistrationBilling } from './import-registration'
import { PAYMENT_CATEGORY_LABEL, type PaymentCategory, type PaymentMethod } from './types'

export type PaymentImportRowInput = {
  name?: string | null
  phone?: string | null
  examNumber?: string | null
  birthDate?: string | null
  amount?: number | string | null
  paidAt?: string | null
  method?: string | null
  cardCompany?: string | null
  bankAccountLast4?: string | null
  depositorName?: string | null
  memo?: string | null
  category?: string | null
}

export type PaymentImportPreviewRow = {
  rowNumber: number
  name: string
  phone: string
  examNumber: string | null
  birthDate: string | null
  amount: number
  paidAt: string
  method: PaymentMethod
  cardCompany: string | null
  bankAccountLast4: string | null
  depositorName: string | null
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
  homepage: 'homepage',
  homepage_payment: 'homepage',
  홈페이지: 'homepage',
  홈페이지결제: 'homepage',
  '홈페이지 결제': 'homepage',
  온라인: 'homepage',
  온라인결제: 'homepage',
  '온라인 결제': 'homepage',
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
  return METHOD_MAP[key] ?? 'other'
}

function parseCategory(value: string | null | undefined): PaymentCategory {
  const key = String(value ?? '').trim().toLowerCase()
  return CATEGORY_MAP[key] ?? 'tuition'
}

function normalizeCardCompany(value: string | null | undefined) {
  return normalizeCardCompanyName(value)
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

function getTransactionSignature(row: Pick<PaymentImportPreviewRow,
  'paidAt' | 'amount' | 'method' | 'category' | 'cardCompany' | 'depositorName' | 'memo'>) {
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(row.paidAt)
    ? new Date(`${row.paidAt}T00:00:00+09:00`)
    : new Date(row.paidAt)
  return JSON.stringify([
    Number.isNaN(timestamp.getTime()) ? row.paidAt : timestamp.toISOString(),
    row.amount, row.method, row.category,
    row.method === 'card' ? normalizeCardCompany(row.cardCompany) : null,
    row.method === 'bank_transfer' ? row.depositorName?.trim() || null : null,
    row.memo?.trim() || null,
  ])
}

function getDuplicatePaymentKey(row: PaymentImportPreviewRow) {
  return row.enrollmentId ? `${row.enrollmentId}:${getTransactionSignature(row)}` : null
}

function groupImportRows(rows: PaymentImportPreviewRow[]) {
  const parents = rows.map((_, index) => index)
  const aliases = new Map<string, number>()
  function root(index: number): number {
    if (parents[index] !== index) parents[index] = root(parents[index])
    return parents[index]
  }
  rows.forEach((row, index) => {
    const keys = [
      row.enrollmentId ? `enrollment:${row.enrollmentId}` : null,
      row.examNumber ? `exam:${row.examNumber}` : null,
      row.name && row.phone ? `identity:${row.name}:${row.phone}` : null,
    ]
    for (const key of keys) {
      if (!key) continue
      const previous = aliases.get(key)
      if (previous !== undefined) parents[root(index)] = root(previous)
      aliases.set(key, index)
    }
  })
  const groups = new Map<number, PaymentImportPreviewRow[]>()
  rows.forEach((row, index) => {
    const key = root(index)
    groups.set(key, [...(groups.get(key) ?? []), row])
  })
  return [...groups.values()]
}

function blockInvalidStudentGroups(rows: PaymentImportPreviewRow[]) {
  for (const group of groupImportRows(rows)) {
    const invalid = group.find((row) => row.status === 'error' || row.status === 'duplicate')
    if (!invalid) continue
    for (const row of group) {
      if (row.status === 'matched' || row.status === 'create') {
        row.status = 'error'
        row.message = `같은 학생의 ${invalid.rowNumber}행을 먼저 확인해 주세요. 이 학생의 수납은 함께 보류됩니다.`
      }
    }
  }
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
  const keys = new Set<string>()
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db
      .from('enrollment_payments')
      .select('id,enrollment_id,paid_at,amount,method,category,card_company,depositor_name,memo,courses!inner(division)')
      .eq('course_id', params.courseId)
      .eq('courses.division', params.division)
      .in('enrollment_id', enrollmentIds)
      .neq('status', 'voided')
      .order('id')
      .range(offset, offset + pageSize - 1)

    if (error) throw error

    for (const payment of data ?? []) {
      keys.add(`${payment.enrollment_id}:${getTransactionSignature({
        paidAt: payment.paid_at,
        amount: payment.amount,
        method: payment.method,
        category: payment.category,
        cardCompany: payment.card_company,
        depositorName: payment.depositor_name,
        memo: payment.memo,
      })}`)
    }
    if ((data?.length ?? 0) < pageSize) return keys
  }
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

function getEnrollmentStudentBirthDate(enrollment: Enrollment) {
  const student = (enrollment as Enrollment & { students?: Student | null }).students ?? null
  return normalizeBirthDate(student?.birth_date) || null
}

function isEnrollmentCompatibleWithImportRow(
  row: Pick<PaymentImportPreviewRow, 'name' | 'phone' | 'birthDate'>,
  enrollment: Enrollment,
) {
  if (normalizeName(enrollment.name) !== normalizeName(row.name)) {
    return false
  }

  const rowPhone = normalizePhone(row.phone)
  const enrollmentPhone = normalizePhone(enrollment.phone)
  if (rowPhone.length >= 8 && rowPhone !== enrollmentPhone) {
    return false
  }

  if (rowPhone.length > 0 && rowPhone.length < 8 && !enrollmentPhone.endsWith(rowPhone)) {
    return false
  }

  const enrollmentBirthDate = getEnrollmentStudentBirthDate(enrollment)
  if (row.birthDate && enrollmentBirthDate && row.birthDate !== enrollmentBirthDate) {
    return false
  }

  return true
}

function resolveEnrollment(params: {
  row: Pick<PaymentImportPreviewRow, 'name' | 'phone' | 'examNumber' | 'birthDate'>
  byExam: Map<string, Enrollment[]>
  byNamePhoneLast4: Map<string, Enrollment[]>
}) {
  const examNumber = normalizeExamNumber(params.row.examNumber)
  const examMatches = examNumber ? params.byExam.get(examNumber) ?? [] : []
  if (examMatches.length === 1) {
    const enrollment = examMatches[0]
    if (!enrollment || !isEnrollmentCompatibleWithImportRow(params.row, enrollment)) {
      return { status: 'error' as const, enrollment: null, message: 'Exam number matches an existing student, but name, phone, or birth date does not match.' }
    }

    return { status: 'matched' as const, enrollment: examMatches[0], message: '응시번호로 매칭' }
  }

  if (examMatches.length > 1) {
    return { status: 'duplicate' as const, enrollment: null, message: '같은 응시번호 수강생이 2명 이상입니다.' }
  }

  const phoneLast4 = normalizePhone(params.row.phone).slice(-4)
  const namePhoneMatches = phoneLast4
    ? params.byNamePhoneLast4.get(`${normalizeName(params.row.name)}::${phoneLast4}`) ?? []
    : []
  const compatibleNamePhoneMatches = namePhoneMatches.filter((enrollment) => (
    isEnrollmentCompatibleWithImportRow(params.row, enrollment)
  ))

  if (compatibleNamePhoneMatches.length === 1 && namePhoneMatches.length === 1) {
    return { status: 'matched' as const, enrollment: namePhoneMatches[0], message: '이름과 연락처 뒤 4자리로 매칭' }
  }

  if (compatibleNamePhoneMatches.length > 1 || namePhoneMatches.length > 1) {
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
  const defaultPaidAt = new Date().toISOString()
  const previewRows = params.rows.map((row, index): PaymentImportPreviewRow => {
    const rowNumber = index + 1
    const name = normalizeName(String(row.name ?? ''))
    const phone = normalizePhone(String(row.phone ?? ''))
    const examNumber = normalizeExamNumber(row.examNumber) || null
    const birthDate = normalizeBirthDate(row.birthDate) || null
    const amount = parseAmount(row.amount)
    const paidAt = normalizePaidAt(row.paidAt || defaultPaidAt)
    const method = parseMethod(row.method)
    const cardCompany = normalizeCardCompany(row.cardCompany)
    const bankAccountLast4 = String(row.bankAccountLast4 ?? '').replace(/\D/g, '').slice(-4) || null
    const depositorName = resolveDepositorName(row.depositorName, row.bankAccountLast4)
    const category = parseCategory(row.category)
    const memo = String(row.memo ?? '').trim() || null

    const paidDate = new Date(/^\d{4}-\d{2}-\d{2}$/.test(paidAt) ? `${paidAt}T00:00:00+09:00` : paidAt)
    if (Number.isNaN(paidDate.getTime()) || (
      /^\d{4}-\d{2}-\d{2}$/.test(paidAt)
      && new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(paidDate) !== paidAt
    )) {
      return { rowNumber, name, phone, examNumber, birthDate, amount, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'error', enrollmentId: null, message: '수납 날짜를 정확히 입력해 주세요.' }
    }

    if (!name) {
      return { rowNumber, name, phone, examNumber, birthDate, amount: 0, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'error', enrollmentId: null, message: '이름이 없습니다.' }
    }

    if (String(row.method ?? '').trim().toLowerCase() === 'mixed' || String(row.method ?? '').trim() === '복합') {
      return { rowNumber, name, phone, examNumber, birthDate, amount, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'error', enrollmentId: null, message: '복합 결제는 카드/현금처럼 실제 수단별 행으로 나누어 업로드해 주세요.' }
    }

    if (phone.length < 4) {
      return { rowNumber, name, phone, examNumber, birthDate, amount: 0, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'error', enrollmentId: null, message: '연락처가 없거나 너무 짧습니다.' }
    }

    if (
      !Number.isInteger(amount)
      || amount < 0
      || (method !== 'free' && amount <= 0)
      || (method === 'free' && amount !== 0)
    ) {
      return { rowNumber, name, phone, examNumber, birthDate, amount: 0, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'error', enrollmentId: null, message: '결제 금액이 올바르지 않습니다.' }
    }

    if (method === 'card' && !cardCompany) {
      return { rowNumber, name, phone, examNumber, birthDate, amount, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'error', enrollmentId: null, message: '카드 결제는 카드사를 입력해 주세요.' }
    }

    if (method === 'bank_transfer' && !depositorName) {
      return { rowNumber, name, phone, examNumber, birthDate, amount, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'error', enrollmentId: null, message: '계좌 결제는 입금자명을 입력해 주세요.' }
    }

    const resolved = resolveEnrollment({
      row: { name, phone, examNumber, birthDate },
      ...maps,
    })

    if (resolved.status === 'matched' && resolved.enrollment) {
      if (String(resolved.enrollment.status) === 'cancelled') {
        return { rowNumber, name, phone, examNumber, birthDate, amount, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'error', enrollmentId: resolved.enrollment.id, message: '취소된 수강등록에는 수납을 추가할 수 없습니다. 수강등록 상태를 확인해 주세요.' }
      }
      return { rowNumber, name, phone, examNumber, birthDate, amount, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'matched', enrollmentId: resolved.enrollment.id, message: resolved.message }
    }

    if (resolved.status === 'duplicate') {
      return { rowNumber, name, phone, examNumber, birthDate, amount, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'duplicate', enrollmentId: null, message: resolved.message }
    }

    if (resolved.status === 'error') {
      return { rowNumber, name, phone, examNumber, birthDate, amount, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'error', enrollmentId: null, message: resolved.message }
    }

    if (!params.createMissingEnrollment) {
      return { rowNumber, name, phone, examNumber, birthDate, amount, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'error', enrollmentId: null, message: '매칭 수강생이 없습니다.' }
    }

    if (!birthDate) {
      return { rowNumber, name, phone, examNumber, birthDate, amount, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'error', enrollmentId: null, message: 'birthDate is required to create a missing enrollment.' }
    }

    return { rowNumber, name, phone, examNumber, birthDate, amount, paidAt, method, cardCompany, bankAccountLast4, depositorName, category, memo, status: 'create', enrollmentId: null, message: resolved.message }
  })

  // Resolve invalid rows too, so one invalid instrument cannot leave a student's other rows saved.
  for (const row of previewRows) {
    if (!row.enrollmentId) {
      row.enrollmentId = resolveEnrollment({ row, ...maps }).enrollment?.id ?? null
    }
  }
  for (const group of groupImportRows(previewRows)) {
    const hasIdentityConflict = new Set(group.map((row) => row.name)).size > 1
      || new Set(group.map((row) => row.birthDate).filter(Boolean)).size > 1
      || new Set(group.map((row) => row.examNumber).filter(Boolean)).size > 1
      || (group.every((row) => !row.enrollmentId) && new Set(group.map((row) => row.phone)).size > 1)
    if (hasIdentityConflict) {
      for (const row of group) {
        row.status = 'error'
        row.message = '같은 학생으로 묶인 행의 이름·연락처·생년월일·응시번호가 서로 다릅니다. 원본을 확인해 주세요.'
      }
      continue
    }
    const seenTransactions = new Map<string, number>()
    for (const row of group) {
      if (row.status === 'error' || row.status === 'duplicate') continue
      const signature = getTransactionSignature(row)
      const previousRow = seenTransactions.get(signature)
      if (previousRow !== undefined) {
        row.status = 'duplicate'
        row.message = `${previousRow}행과 동일한 거래가 파일에 중복 입력되었습니다. 별도 거래인지 원본을 확인해 주세요.`
      } else {
        seenTransactions.set(signature, row.rowNumber)
      }
    }
    if (group.every((row) => row.status === 'create')) {
      try {
        getImportRegistrationBilling(group)
      } catch (error) {
        for (const row of group) {
          row.status = 'error'
          row.message = getPaymentServiceMessage(error, '신규 수강생 수납 정보를 확인해 주세요.')
        }
      }
    }
  }
  blockInvalidStudentGroups(previewRows)
  return previewRows
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
      row.message = '수납시각·수단·금액·분류·결제정보·메모가 같은 기존 기록이 있습니다. 중복 가능성이 있으므로 원본 거래를 확인해 주세요.'
    }
  }
  blockInvalidStudentGroups(previewRows)

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

  for (const group of groupImportRows(result.rows)) {
    if (group.some((row) => row.status === 'error' || row.status === 'duplicate')) {
      continue
    }

    try {
      const row = group[0]
      let enrollmentId = row.enrollmentId
      const payments = group.map((entry) => ({
        amount: entry.amount,
        method: entry.method,
        cardCompany: entry.cardCompany,
        depositorName: entry.depositorName,
        category: entry.category,
        paidAt: new Date(/^\d{4}-\d{2}-\d{2}$/.test(entry.paidAt) ? `${entry.paidAt}T00:00:00+09:00` : entry.paidAt).toISOString(),
        memo: entry.memo,
        items: [{ label: PAYMENT_CATEGORY_LABEL[entry.category], amount: entry.amount }],
      }))
      if (!enrollmentId) {
        const created = await createPaymentImportRegistration({
          courseId: params.courseId,
          name: row.name,
          phone: row.phone,
          examNumber: row.examNumber,
          birthDate: row.birthDate,
          payments,
        }, params.division, params.actorStaffId)
        enrollmentId = created.enrollmentId
        if (!created.reactivated) result.createdEnrollmentCount += 1
        for (const entry of group) entry.message = '수강생과 수납 정보·결제를 함께 등록했습니다.'
      } else {
        await createPaymentBundle({
          courseId: params.courseId,
          enrollmentId,
          checkoutGroupId: randomUUID(),
          payments,
        }, params.division, params.actorStaffId)
      }
      result.createdPaymentCount += group.length
      for (const entry of group) entry.enrollmentId = enrollmentId
    } catch (error) {
      for (const row of group) {
        row.status = 'error'
        row.message = getPaymentServiceMessage(error, '등록 실패')
      }
    }
  }

  result.matchedCount = result.rows.filter((row) => row.status === 'matched').length
  result.createCount = result.rows.filter((row) => row.status === 'create').length
  result.errorCount = result.rows.filter((row) => row.status === 'error').length
  result.duplicateCount = result.rows.filter((row) => row.status === 'duplicate').length

  return result
}
