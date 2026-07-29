'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useParams } from 'next/navigation'
import { Download, Plus, Search, Trash2, Upload, UserCheck, X } from 'lucide-react'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'
import { StudentHistoryPanel } from '@/components/admin/student-history-panel'
import { EnrollmentPaymentDrawer } from '@/components/payments/EnrollmentPaymentDrawer'
import { ReceiptNoticeModal } from '@/components/payments/ReceiptNoticeModal'
import { SeriesSelector } from '@/components/series/SeriesSelector'
import { useDeferredInteractionWork } from '@/hooks/use-deferred-interaction-work'
import { normalizeGenderLabel } from '@/lib/gender'
import {
  PaymentSection,
  createEmptyPaymentSectionValue,
  createPaymentSectionValueForAmount,
  normalizePaymentSectionPayload,
  type PaymentSectionValue,
} from '@/components/payments/PaymentSection'
import { formatWon } from '@/lib/payments/format'
import { downloadEnrollmentTemplate, parseEnrollmentXlsxToText } from '@/lib/enrollment-template'
import {
  applyBulkImportMasterIdentity,
  getBulkImportFieldLabel,
  mergeBulkImportProgress,
  type BulkImportEditableRow,
  type BulkImportMasterSnapshot,
  type BulkImportProgress,
  type BulkImportRowIssue,
} from '@/lib/enrollment-bulk-workflow'
import { downloadCourseSettlementXlsx } from '@/lib/payments/xlsx-export'
import { buildSettlementReport } from '@/lib/payments/settlement-report'
import type { EnrollmentPayment } from '@/lib/payments/types'
import { formatPhoneNumber } from '@/lib/utils'
import { getTuitionExemptBillingRuleError } from '@/lib/payments/billing-rules'
import { useTenantConfig } from '@/components/TenantProvider'
import { useMotionConfig, useReducedMotionDuration } from '@/lib/motion'
import {
  ENROLLMENT_STUDENT_TYPE_LABEL,
  type AttendanceDeviceState,
  type BranchSeriesOption,
  type Course,
  type Enrollment,
  type EnrollmentFieldDef,
  type EnrollmentStudentType,
  type Material,
  type TextbookAssignment,
} from '@/types/database'
import { withTenantPrefix } from '@/lib/tenant'
import { PinRevealModal } from './pin-reveal-modal'
import { SuspensionModal } from './suspension-modal'
import { StudentsManageTable } from './students-manage-table'
import { StudentsMatrixPanel } from './students-matrix-panel'
import {
  type EnrollmentManageStatusFilter,
  MATRIX_TAB_META,
  emptyForm,
  isMatrixTab,
  toEditForm,
  type EnrollmentForm,
  type DistributionBatchItem,
  type MatrixMode,
  type MatrixRow,
  type Panel,
  type PinRevealState,
  type ReceiptCell,
  type StudentsPageData,
  type TabMode,
} from './students-page-types'

type CourseStudentsPageProps = {
  initialData?: StudentsPageData | null
  initialError?: string
  initialLoaded?: boolean
}

type ConfirmationRequest = {
  title: string
  description?: string
  confirmLabel: string
  pendingLabel?: string
  cancelLabel?: string | null
  tone?: 'default' | 'danger' | 'success'
  onConfirm: () => Promise<void> | void
}

type NoticeRequest = {
  title: string
  description: string
  tone?: 'default' | 'danger' | 'success'
}

const BULK_IMPORT_COMPARISON_FIELDS = [
  { inputKey: 'examNumber', issueKey: 'exam_number' },
  { inputKey: 'name', issueKey: 'name' },
  { inputKey: 'phone', issueKey: 'phone' },
  { inputKey: 'birthDate', issueKey: 'birth_date' },
] as const

function getBulkImportMasterValue(
  master: BulkImportMasterSnapshot,
  field: typeof BULK_IMPORT_COMPARISON_FIELDS[number]['inputKey'],
) {
  return master[field]
}

type StudentSearchResult = {
  id: number
  name: string
  phone: string
  exam_number: string | null
  cohort_option_id: number | null
  cohort_label: string | null
  birth_date: string | null
  photo_url: string | null
  gender: string | null
  series_option_id: number | null
  series_group: Enrollment['series_group'] | null
  series: string | null
  student_type: EnrollmentStudentType | null
  alreadyEnrolled: boolean
  latestEnrollment: {
    id: number
    courseId: number
    courseName: string
    gender: string | null
    series_option_id: number | null
    series_group: Enrollment['series_group'] | null
    series: string | null
    student_type: EnrollmentStudentType | null
    status: Enrollment['status']
    createdAt: string
  } | null
}

type DistributionLogPayload = {
  logId: number
  materialId: number
  distributedAt: string
}

function parseBulkImportEditableRow(
  value: unknown,
  fallback: { lineNumber: number; sourceText: string; name: string },
): BulkImportEditableRow {
  const source = typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {}
  const customDataSource = typeof source.customData === 'object' && source.customData !== null
    ? source.customData as Record<string, unknown>
    : {}

  return {
    sourceLineNumber: Number.isInteger(Number(source.sourceLineNumber))
      && Number(source.sourceLineNumber) > 0
      ? Number(source.sourceLineNumber)
      : fallback.lineNumber,
    sourceText: typeof source.sourceText === 'string' ? source.sourceText : fallback.sourceText,
    name: typeof source.name === 'string' ? source.name : fallback.name,
    phone: typeof source.phone === 'string' ? source.phone : '',
    examNumber: typeof source.examNumber === 'string' ? source.examNumber : '',
    cohortLabel: typeof source.cohortLabel === 'string' ? source.cohortLabel : '',
    birthDate: typeof source.birthDate === 'string' ? source.birthDate : '',
    gender: typeof source.gender === 'string' ? source.gender : '',
    series: typeof source.series === 'string' ? source.series : '',
    memo: typeof source.memo === 'string' ? source.memo : '',
    photoUrl: typeof source.photoUrl === 'string' ? source.photoUrl : '',
    customData: Object.fromEntries(
      Object.entries(customDataSource)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    ),
  }
}

function parseBulkImportMasterSnapshot(value: unknown): BulkImportMasterSnapshot | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const source = value as Record<string, unknown>
  const id = Number(source.id)
  if (!Number.isInteger(id) || id <= 0) {
    return null
  }

  return {
    id,
    name: typeof source.name === 'string' ? source.name : '',
    phone: typeof source.phone === 'string' ? source.phone : '',
    examNumber: typeof source.examNumber === 'string' ? source.examNumber : '',
    birthDate: typeof source.birthDate === 'string' ? source.birthDate : '',
    cohortOptionId: typeof source.cohortOptionId === 'number'
      && Number.isInteger(source.cohortOptionId)
      && source.cohortOptionId > 0
      ? source.cohortOptionId
      : null,
  }
}

function parseBulkImportRowErrors(payload: unknown): BulkImportRowIssue[] {
  if (typeof payload !== 'object' || payload === null || !('rowErrors' in payload)) {
    return []
  }

  const rowErrors = (payload as { rowErrors?: unknown }).rowErrors
  if (!Array.isArray(rowErrors)) {
    return []
  }

  return rowErrors
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return null
      }

      const source = entry as Record<string, unknown>
      const lineNumber = Number(source.lineNumber ?? source.rowNumber)
      const rowNumber = Number(source.rowNumber ?? source.lineNumber)
      if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
        return null
      }

      const name = typeof source.name === 'string' ? source.name : ''
      const sourceText = typeof source.sourceText === 'string' ? source.sourceText : ''
      const field = typeof source.field === 'string' ? source.field : ''
      const message = typeof source.message === 'string' ? source.message : '이 행을 확인해 주세요.'
      const fields = Array.isArray(source.fields)
        ? source.fields.filter((value): value is string => typeof value === 'string')
        : [field].filter(Boolean)
      const messages = Array.isArray(source.messages)
        ? source.messages.filter((value): value is string => typeof value === 'string')
        : [message]

      return {
        rowNumber: Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber : lineNumber,
        lineNumber,
        name,
        phoneLast4: typeof source.phoneLast4 === 'string' ? source.phoneLast4 : null,
        examNumber: typeof source.examNumber === 'string' ? source.examNumber : null,
        field,
        fields,
        value: typeof source.value === 'string' ? source.value : null,
        message,
        messages,
        sourceText,
        input: parseBulkImportEditableRow(source.input, { lineNumber, sourceText, name }),
        master: parseBulkImportMasterSnapshot(source.master),
      }
    })
    .filter((entry): entry is BulkImportRowIssue => Boolean(entry))
}

function getBulkImportRowErrorCount(payload: unknown, fallbackCount: number) {
  if (typeof payload !== 'object' || payload === null || !('rowErrorCount' in payload)) {
    return fallbackCount
  }

  const count = Number((payload as { rowErrorCount?: unknown }).rowErrorCount)
  return Number.isInteger(count) && count >= fallbackCount ? count : fallbackCount
}

function parseDistributionLogsFromPayload(payload: unknown): DistributionLogPayload[] {
  if (typeof payload !== 'object' || payload === null || !('logs' in payload)) {
    return []
  }

  const logs = (payload as { logs?: unknown }).logs
  if (!Array.isArray(logs)) {
    return []
  }

  return logs
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return null
      }

      const source = entry as {
        log_id?: unknown
        material_id?: unknown
        distributed_at?: unknown
      }
      const logId = Number(source.log_id)
      const materialId = Number(source.material_id)
      const distributedAt = typeof source.distributed_at === 'string'
        ? source.distributed_at
        : new Date().toISOString()

      if (!Number.isInteger(logId) || logId <= 0 || !Number.isInteger(materialId) || materialId <= 0) {
        return null
      }

      return { logId, materialId, distributedAt }
    })
    .filter((entry): entry is DistributionLogPayload => Boolean(entry))
}

function getReceiptNoticeFromPayload(payload: unknown) {
  if (typeof payload !== 'object' || payload === null || !('payments' in payload)) {
    return ''
  }

  const payments = (payload as { payments?: unknown }).payments
  if (!Array.isArray(payments)) {
    return ''
  }

  return payments
    .map((payment) => {
      if (typeof payment !== 'object' || payment === null || !('display_receipt_no' in payment)) {
        return null
      }

      const receiptNo = (payment as { display_receipt_no?: unknown }).display_receipt_no
      return typeof receiptNo === 'string' && receiptNo.trim() ? receiptNo.trim() : null
    })
    .filter((receiptNo): receiptNo is string => Boolean(receiptNo))
    .join(', ')
}

type BundleBillingDraft = {
  discountAmount: string
  discountReason: string
}

function getDefaultSeriesOptionId(options: BranchSeriesOption[]) {
  const activeOptions = options.filter((option) => option.is_active)
  return (
    activeOptions.find((option) => option.is_default)?.id
    ?? activeOptions.find((option) => option.group_key === 'public')?.id
    ?? activeOptions[0]?.id
    ?? null
  )
}

function escapeCsvCell(value: unknown) {
  const raw = String(value ?? '')
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
}

function getKoreanDateKey(value = new Date()) {
  return value.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

function formatCsvDate(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : getKoreanDateKey(date)
}

function formatExcelTextCell(value: string | null | undefined) {
  const raw = String(value ?? '')
  return raw ? `="${raw.replace(/"/g, '""')}"` : ''
}

function sanitizeDownloadFilename(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'course'
}

function numberInputValue(value: string) {
  return value.replace(/[^\d]/g, '')
}

function toNumber(value: string) {
  return Number(value.replace(/,/g, '') || 0)
}

function rebalancePaymentEntriesForTotal(
  entries: PaymentSectionValue['entries'],
  totalAmount: number,
) {
  if (entries.length <= 1) {
    return entries.map((entry) => ({
      ...entry,
      amount: totalAmount > 0 ? String(totalAmount) : '',
    }))
  }

  let remainingAmount = Math.max(0, totalAmount)

  return entries.map((entry, index) => {
    const entryAmount = toNumber(entry.amount)
    const nextAmount = index === entries.length - 1
      ? remainingAmount
      : Math.min(entryAmount, remainingAmount)

    remainingAmount = Math.max(remainingAmount - nextAmount, 0)

    return {
      ...entry,
      amount: nextAmount > 0 ? String(nextAmount) : '',
    }
  })
}

function getEnrollmentStatusLabel(enrollment: Pick<Enrollment, 'status' | 'suspended_at'>) {
  if (enrollment.status === 'active' && enrollment.suspended_at) {
    return '정지'
  }

  return enrollment.status === 'active' ? '수강중' : '환불완료'
}

function DynamicFieldInput({
  field, value, onChange,
}: {
  field: EnrollmentFieldDef; value: string; onChange: (val: string) => void
}) {
  if (field.type === 'select' && field.options?.length) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
      >
        <option value="">{field.label} 선택</option>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    )
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.label}
      className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
    />
  )
}

function StudentTypeSelector({
  value,
  onChange,
}: {
  value: EnrollmentStudentType
  onChange: (value: EnrollmentStudentType) => void
}) {
  const options: EnrollmentStudentType[] = ['academy', 'general']

  return (
    <div
      aria-label="학원구분"
      className="grid min-w-[136px] grid-cols-2 gap-1 rounded-[10px] bg-[#f5f5f7] p-1"
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`whitespace-nowrap rounded-[8px] px-3 py-2 text-center text-sm font-semibold leading-none transition-all duration-200 ease-ios active:scale-[0.97] ${
            value === option
              ? 'bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
              : 'text-slate-500 hover:text-[#1d1d1f]'
          }`}
        >
          {ENROLLMENT_STUDENT_TYPE_LABEL[option]}
        </button>
      ))}
    </div>
  )
}

function GenderSelect({
  value,
  onChange,
  disabled = false,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={`rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${className}`}
    >
      <option value="">미입력</option>
      <option value="남">남</option>
      <option value="여">여</option>
    </select>
  )
}

const editModalInputClass = 'h-11 rounded-[10px] border border-slate-200 bg-[#fafafc] px-3 text-sm text-[#1d1d1f] outline-none transition focus:border-[#0071e3] focus:bg-white focus:ring-4 focus:ring-[#0071e3]/10'
const editModalLabelClass = 'text-[11px] font-semibold text-slate-500'

async function fetchStudentsPageData(
  courseId: number,
  opts: { page: number; pageSize: number; search: string; status: string; noLimit?: boolean },
) {
  const offset = (opts.page - 1) * opts.pageSize
  const params = new URLSearchParams({ courseId: String(courseId) })
  if (opts.noLimit) {
    params.set('noLimit', '1')
  } else {
    params.set('limit', String(opts.pageSize))
    params.set('offset', String(offset))
  }
  if (opts.search) {
    params.set('search', opts.search)
  }
  if (opts.status && opts.status !== 'all') {
    params.set('status', opts.status)
  }

  const [courseRes, enrollRes, textbookRes, seriesRes] = await Promise.all([
    fetch(`/api/courses/${courseId}`, { cache: 'no-store' }),
    fetch(`/api/enrollments?${params}`, { cache: 'no-store' }),
    fetch(`/api/materials?courseId=${courseId}&materialType=textbook`, { cache: 'no-store' }),
    fetch('/api/config/series-options', { cache: 'no-store' }),
  ])
  const coursePay = await courseRes.json().catch(() => null)
  const enrollPay = await enrollRes.json().catch(() => null)
  const textbookPay = await textbookRes.json().catch(() => null)
  const seriesPay = await seriesRes.json().catch(() => null)
  if (!courseRes.ok) throw new Error(coursePay?.error ?? '강좌 정보를 불러오지 못했습니다.')
  if (!enrollRes.ok) throw new Error(enrollPay?.error ?? '수강생 목록을 불러오지 못했습니다.')
  if (!textbookRes.ok) throw new Error(textbookPay?.error ?? '교재 목록을 불러오지 못했습니다.')
  if (!seriesRes.ok) throw new Error(seriesPay?.error ?? '직렬 설정을 불러오지 못했습니다.')
  return {
    course: coursePay.course as Course,
    enrollments: (enrollPay.enrollments ?? []) as Enrollment[],
    total: (enrollPay.total ?? 0) as number,
    summary: (enrollPay.summary ?? { active: 0, refunded: 0, suspended: 0 }) as {
      active: number; refunded: number; suspended: number
    },
    textbooks: (textbookPay.materials ?? []) as Material[],
    seriesOptions: (seriesPay.options ?? []) as BranchSeriesOption[],
  }
}

function cohortLabelToNumberString(label: string | null | undefined) {
  const match = label?.trim().match(/^(\d{1,3})\s*기?$/)
  return match ? match[1] : ''
}

function normalizeCohortNumberInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 3)
}

export default function CourseStudentsPage({
  initialData = null,
  initialError = '',
  initialLoaded = Boolean(initialData),
}: CourseStudentsPageProps) {
  const params = useParams<{ id: string }>()
  const tenant = useTenantConfig()
  const motionConfig = useMotionConfig()
  const panelBackdropDuration = useReducedMotionDuration(0.2)
  const deferInteractionWork = useDeferredInteractionWork()
  const courseId = Number(params.id)

  const [tab, setTab] = useState<TabMode>('manage')
  const [panel, setPanel] = useState<Panel>('none')
  const [course, setCourse] = useState<Course | null>(initialData?.course ?? null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>(initialData?.enrollments ?? [])
  const [textbooks, setTextbooks] = useState<Material[]>(initialData?.textbooks ?? [])
  const [seriesOptions, setSeriesOptions] = useState<BranchSeriesOption[]>(initialData?.seriesOptions ?? [])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<EnrollmentManageStatusFilter>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSummary, setPageSummary] = useState({ active: 0, refunded: 0, suspended: 0 })
  const excelUploadInputRef = useRef<HTMLInputElement | null>(null)
  const searchTimerRef = useRef<number | null>(null)
  const paginationRef = useRef({ currentPage: 1, pageSize: 50, search: '', statusFilter: 'all' as EnrollmentManageStatusFilter })
  const fetchSeqRef = useRef(0)

  const [matrixMaterials, setMatrixMaterials] = useState<Material[]>([])
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>([])
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [matrixSearch, setMatrixSearch] = useState('')
  const [filterMatId, setFilterMatId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 })
  const [bulkProcessing, setBulkProcessing] = useState(false)

  // Forms
  const [createForm, setCreateForm] = useState<EnrollmentForm>(() => (
    emptyForm(getDefaultSeriesOptionId(initialData?.seriesOptions ?? []))
  ))
  const [createPaymentForm, setCreatePaymentForm] = useState<PaymentSectionValue>(createEmptyPaymentSectionValue)
  const [availableCourses, setAvailableCourses] = useState<Course[]>(initialData?.course ? [initialData.course] : [])
  const [bundleCourseIds, setBundleCourseIds] = useState<number[]>(() => (
    initialData?.course ? [initialData.course.id] : []
  ))
  const [bundleBillingDrafts, setBundleBillingDrafts] = useState<Record<number, BundleBillingDraft>>({})
  const [bundleCourseToAdd, setBundleCourseToAdd] = useState('')
  const studentLookupInputTimerRef = useRef<number | null>(null)
  const [studentLookupQuery, setStudentLookupQuery] = useState('')
  const [studentLookupResults, setStudentLookupResults] = useState<StudentSearchResult[]>([])
  const [studentLookupLoading, setStudentLookupLoading] = useState(false)
  const [studentLookupError, setStudentLookupError] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null)
  const [selectedStudentEditable, setSelectedStudentEditable] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EnrollmentForm>(emptyForm())
  const [paymentDetailEnrollmentId, setPaymentDetailEnrollmentId] = useState<number | null>(null)
  const [historyEnrollmentId, setHistoryEnrollmentId] = useState<number | null>(null)
  const [bulkText, setBulkText] = useState('')
  const [bulkRowErrors, setBulkRowErrors] = useState<BulkImportRowIssue[]>([])
  const [bulkRowErrorCount, setBulkRowErrorCount] = useState(0)
  const [bulkImportResult, setBulkImportResult] = useState<BulkImportProgress | null>(null)
  const [pinReveal, setPinReveal] = useState<PinRevealState | null>(null)
  const [suspensionTarget, setSuspensionTarget] = useState<Enrollment | null>(null)
  const [suspensionSubmitting, setSuspensionSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null)
  const [notice, setNotice] = useState<NoticeRequest | null>(null)
  const [receiptNotice, setReceiptNotice] = useState('')
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)
  const lastErrorNoticeRef = useRef('')
  const lastLookupNoticeRef = useRef('')

  const [editPhotoUrl, setEditPhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [loading, setLoading] = useState(!initialLoaded)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(initialError)

  const customFields = useMemo(() => course?.enrollment_fields ?? [], [course?.enrollment_fields])
  const visibleTextbooks = useMemo(
    () => textbooks.filter((textbook) => textbook.is_active),
    [textbooks],
  )
  const defaultSeriesOptionId = useMemo(
    () => getDefaultSeriesOptionId(seriesOptions),
    [seriesOptions],
  )
  const paymentDetailEnrollment = useMemo(
    () => enrollments.find((enrollment) => enrollment.id === paymentDetailEnrollmentId) ?? null,
    [enrollments, paymentDetailEnrollmentId],
  )
  const bundleSelectableCourses = useMemo(() => {
    const byId = new Map<number, Course>()
    if (course) {
      byId.set(course.id, course)
    }
    for (const entry of availableCourses) {
      byId.set(entry.id, entry)
    }
    return Array.from(byId.values())
      .filter((entry) => entry.status === 'active' || entry.id === course?.id)
      .sort((left, right) => left.sort_order - right.sort_order || right.created_at.localeCompare(left.created_at))
  }, [availableCourses, course])
  const selectedBundleCourses = useMemo(() => (
    bundleCourseIds
      .map((id) => bundleSelectableCourses.find((entry) => entry.id === id))
      .filter((entry): entry is Course => Boolean(entry))
  ), [bundleCourseIds, bundleSelectableCourses])
  const isBundleRegistration = selectedBundleCourses.length > 1
  const bundleBillingRows = useMemo(() => (
    selectedBundleCourses.map((entry) => {
      const draft = bundleBillingDrafts[entry.id]
      const expectedAmount = Math.max(0, Number(entry.tuition_amount ?? 0))
      const discountAmount = Math.min(toNumber(draft?.discountAmount ?? ''), expectedAmount)
      return {
        course: entry,
        expectedAmount,
        discountAmount,
        discountReason: draft?.discountReason?.trim() ?? '',
        payableAmount: Math.max(expectedAmount - discountAmount, 0),
      }
    })
  ), [bundleBillingDrafts, selectedBundleCourses])
  const bundleTotals = useMemo(() => (
    bundleBillingRows.reduce((sum, row) => ({
      expectedAmount: sum.expectedAmount + row.expectedAmount,
      discountAmount: sum.discountAmount + row.discountAmount,
      payableAmount: sum.payableAmount + row.payableAmount,
    }), { expectedAmount: 0, discountAmount: 0, payableAmount: 0 })
  ), [bundleBillingRows])
  const bundleAddableCourses = useMemo(() => (
    bundleSelectableCourses.filter((entry) => !bundleCourseIds.includes(entry.id))
  ), [bundleCourseIds, bundleSelectableCourses])

  useEffect(() => {
    if (panel !== 'create' || !isBundleRegistration) {
      return
    }

    const discountReason = bundleBillingRows
      .filter((row) => row.discountAmount > 0)
      .map((row) => `${row.course.name}: ${row.discountReason || '할인'}`)
      .join('\n')

    setCreatePaymentForm((current) => {
      const previousPayableAmount = Math.max(
        toNumber(current.expectedAmount) - toNumber(current.discountAmount),
        0,
      )
      const currentPaymentTotal = current.entries.reduce((sum, entry) => sum + toNumber(entry.amount), 0)
      const shouldRebalanceEntries = current.entries.length <= 1 || currentPaymentTotal === previousPayableAmount

      return {
        ...current,
        expectedAmount: String(bundleTotals.expectedAmount),
        discountAmount: bundleTotals.discountAmount > 0 ? String(bundleTotals.discountAmount) : '',
        discountReason,
        paidAmount: '',
        tuitionExempt: false,
        tuitionExemptReason: '',
        entries: shouldRebalanceEntries
          ? rebalancePaymentEntriesForTotal(current.entries, bundleTotals.payableAmount)
          : current.entries,
      }
    })
  }, [bundleBillingRows, bundleTotals, isBundleRegistration, panel])

  useEffect(() => {
    if (!error) {
      lastErrorNoticeRef.current = ''
      return
    }

    if (lastErrorNoticeRef.current === error) {
      return
    }

    lastErrorNoticeRef.current = error
    setNotice({
      title: '확인이 필요합니다',
      description: error,
      tone: 'danger',
    })
  }, [error])

  useEffect(() => {
    if (panel !== 'create' || !studentLookupError) {
      lastLookupNoticeRef.current = ''
      return
    }

    if (lastLookupNoticeRef.current === studentLookupError) {
      return
    }

    lastLookupNoticeRef.current = studentLookupError
    setNotice({
      title: '수강생 선택을 확인해 주세요',
      description: studentLookupError,
      tone: 'danger',
    })
  }, [panel, studentLookupError])

  useEffect(() => {
    if (panel !== 'create') {
      return
    }

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        setPanel('none')
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [panel, submitting])

  useEffect(() => {
    return () => {
      if (studentLookupInputTimerRef.current !== null) {
        window.clearTimeout(studentLookupInputTimerRef.current)
      }
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (panel === 'create') {
      return
    }

    if (studentLookupInputTimerRef.current !== null) {
      window.clearTimeout(studentLookupInputTimerRef.current)
      studentLookupInputTimerRef.current = null
    }
    setStudentLookupQuery('')
    setStudentLookupResults([])
    setStudentLookupError('')
    setStudentLookupLoading(false)
    setSelectedStudent(null)
    setSelectedStudentEditable(false)
  }, [panel])

  useEffect(() => {
    if (!course) {
      return
    }

    setAvailableCourses((current) => {
      if (current.some((entry) => entry.id === course.id)) {
        return current
      }

      return [course, ...current]
    })
    setBundleCourseIds((current) => (current.length > 0 ? current : [course.id]))
  }, [course])

  useEffect(() => {
    if (panel !== 'create') {
      return
    }

    let ignore = false
    fetch('/api/courses?activeOnly=1', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error ?? '강좌 목록을 불러오지 못했습니다.')
        }

        if (!ignore) {
          const courses = (payload?.courses ?? []) as Course[]
          setAvailableCourses(course && !courses.some((entry) => entry.id === course.id)
            ? [course, ...courses]
            : courses)
        }
      })
      .catch((reason: unknown) => {
        if (!ignore) {
          setError(reason instanceof Error ? reason.message : '강좌 목록을 불러오지 못했습니다.')
        }
      })

    return () => {
      ignore = true
    }
  }, [course, panel])

  useEffect(() => {
    if (panel !== 'create') {
      return
    }

    const query = studentLookupQuery.trim()
    if (query.length < 2) {
      setStudentLookupResults([])
      setStudentLookupError('')
      setStudentLookupLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setStudentLookupLoading(true)
      setStudentLookupError('')
      try {
        const response = await fetch(
          `/api/students/search?courseId=${courseId}&query=${encodeURIComponent(query)}`,
          { cache: 'no-store', signal: controller.signal },
        )
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error ?? '수강생 검색에 실패했습니다.')
        }

        setStudentLookupResults((payload?.students ?? []) as StudentSearchResult[])
      } catch (reason) {
        if (!controller.signal.aborted) {
          setStudentLookupError(reason instanceof Error ? reason.message : '수강생 검색에 실패했습니다.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setStudentLookupLoading(false)
        }
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [courseId, panel, studentLookupQuery])

  const selectedStudentLocked = Boolean(selectedStudent) && !selectedStudentEditable

  function scheduleStudentLookupQuery(value: string) {
    if (studentLookupInputTimerRef.current !== null) {
      window.clearTimeout(studentLookupInputTimerRef.current)
    }

    studentLookupInputTimerRef.current = window.setTimeout(() => {
      setStudentLookupQuery(value)
      studentLookupInputTimerRef.current = null
    }, 150)
  }

  function handleStudentLookupKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    if (studentLookupInputTimerRef.current !== null) {
      window.clearTimeout(studentLookupInputTimerRef.current)
      studentLookupInputTimerRef.current = null
    }
    setStudentLookupQuery(event.currentTarget.value)
  }

  function selectStudentForCreate(student: StudentSearchResult) {
    if (student.alreadyEnrolled) {
      setStudentLookupError('이미 현재 강좌에 등록된 수강생입니다.')
      return
    }

    setSelectedStudent(student)
    setSelectedStudentEditable(false)
    setCreateForm((current) => ({
      ...current,
      name: student.name,
      phone: student.phone,
      exam_number: student.exam_number ?? '',
      cohort_number: cohortLabelToNumberString(student.cohort_label),
      birth_date: student.birth_date ?? '',
      gender: normalizeGenderLabel(student.gender ?? student.latestEnrollment?.gender),
      series_option_id: student.series_option_id
        ?? student.latestEnrollment?.series_option_id
        ?? current.series_option_id,
      student_type: student.student_type
        ?? student.latestEnrollment?.student_type
        ?? current.student_type,
    }))
    setStudentLookupError('')
  }

  function clearSelectedStudentForCreate() {
    setSelectedStudent(null)
    setSelectedStudentEditable(false)
    setCreateForm((current) => ({
      ...current,
      name: '',
      phone: '',
      exam_number: '',
      cohort_number: '',
      birth_date: '',
      gender: '',
    }))
  }

  async function copyPin(pin: string) {
    try {
      await navigator.clipboard.writeText(pin)
      setMessage(`PIN ${pin}을 복사했습니다.`)
    } catch {
      setError('PIN을 복사하지 못했습니다.')
    }
  }

  function toggleCreateTextbook(materialId: number) {
    setCreateForm((current) => ({
      ...current,
      textbookIds: current.textbookIds.includes(materialId)
        ? current.textbookIds.filter((id) => id !== materialId)
        : [...current.textbookIds, materialId],
    }))
  }

  function resetCreateBundleState(nextCourse: Course) {
    setBundleCourseIds([nextCourse.id])
    setBundleBillingDrafts({})
    setBundleCourseToAdd('')
  }

  function addBundleCourse() {
    const nextCourseId = Number(bundleCourseToAdd)
    if (!Number.isInteger(nextCourseId) || nextCourseId <= 0 || bundleCourseIds.includes(nextCourseId)) {
      return
    }

    setBundleCourseIds((current) => [...current, nextCourseId])
    setBundleCourseToAdd('')
  }

  function removeBundleCourse(nextCourseId: number) {
    if (nextCourseId === course?.id) {
      return
    }

    setBundleCourseIds((current) => {
      const next = current.filter((id) => id !== nextCourseId)
      if (next.length <= 1 && course) {
        setCreatePaymentForm(createPaymentSectionValueForAmount(course.tuition_amount ?? 0))
      }
      return next
    })
    setBundleBillingDrafts((current) => {
      const next = { ...current }
      delete next[nextCourseId]
      return next
    })
  }

  function updateBundleBilling(courseIdToUpdate: number, patch: Partial<BundleBillingDraft>) {
    setBundleBillingDrafts((current) => ({
      ...current,
      [courseIdToUpdate]: {
        discountAmount: current[courseIdToUpdate]?.discountAmount ?? '',
        discountReason: current[courseIdToUpdate]?.discountReason ?? '',
        ...patch,
      },
    }))
  }

  function openConfirmation(request: ConfirmationRequest) {
    setError('')
    setMessage('')
    setConfirmation(request)
  }

  function openNotice(request: NoticeRequest) {
    setError(request.description)
    setMessage('')
    setNotice(request)
    lastErrorNoticeRef.current = request.description
  }

  async function runConfirmedAction() {
    if (!confirmation) {
      return
    }

    const currentConfirmation = confirmation
    setConfirmSubmitting(true)

    try {
      await currentConfirmation.onConfirm()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '작업을 처리하지 못했습니다.')
    } finally {
      setConfirmSubmitting(false)
      setConfirmation(null)
    }
  }

  async function handleUndoConfirmed(logId: number, studentName: string, materialName: string) {
    setBulkProcessing(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/distribution/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setError(payload?.error ?? '수령 기록 취소에 실패했습니다.')
        return
      }

      removeMatrixReceiptByLogId(logId)
      setMessage(`${studentName} - ${materialName} 수령 기록을 취소했습니다.`)
    } catch {
      setError('수령 기록 취소에 실패했습니다.')
    } finally {
      setBulkProcessing(false)
    }
  }

  async function handleDeleteConfirmed(enrollment: Enrollment) {
    setError('')
    setMessage('')

    const response = await fetch(`/api/enrollments/${enrollment.id}`, { method: 'DELETE' })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      openNotice({
        title: '수강생을 삭제할 수 없습니다',
        description: payload?.reason
          ? `${payload.error ?? '삭제하지 못했습니다.'}\n\n이유: ${payload.reason}`
          : payload?.error ?? '삭제하지 못했습니다.',
        tone: 'danger',
      })
      return
    }

    setEnrollments((current) => current.filter((entry) => entry.id !== enrollment.id))
    if (editingId === enrollment.id) {
      setPanel('none')
      setEditingId(null)
    }
    setMessage('수강생을 삭제했습니다.')
    void refresh().catch(() => null)
  }

  async function handleUnsuspendConfirmed(enrollment: Enrollment) {
    setError('')
    setMessage('')

    const response = await fetch(`/api/enrollments/${enrollment.id}/suspension`, {
      method: 'DELETE',
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      setError(payload?.error ?? '응시 정지 해제에 실패했습니다.')
      return
    }

    const nextEnrollment = payload.enrollment as Enrollment
    await refresh().catch(() => null)
    setEnrollments((current) => current.map((entry) => (
      entry.id === nextEnrollment.id
        ? { ...entry, ...nextEnrollment }
        : entry
    )))
    setMessage('응시 정지를 해제했습니다.')
  }

  async function handleResetPinConfirmed(enrollment: Enrollment) {
    if (!enrollment.student_id) {
      setError('학생 프로필을 찾을 수 없습니다.')
      return
    }

    setSubmitting(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/students/reset-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: enrollment.student_id }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setError(payload?.error ?? 'PIN 재발급에 실패했습니다.')
        return
      }

      setPinReveal({
        title: '재발급된 학생 PIN',
        pins: [{
          name: enrollment.name,
          phone: enrollment.phone,
          pin: payload.pin as string,
        }],
      })
      setMessage('학생 PIN을 재발급했습니다.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'PIN 재발급에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  function applyAttendanceDeviceState(enrollmentId: number, device: AttendanceDeviceState | null) {
    setEnrollments((current) => current.map((entry) => (
      entry.id === enrollmentId
        ? { ...entry, attendance_device: device }
        : entry
    )))
  }

  async function handleAttendanceDeviceActionConfirmed(
    enrollment: Enrollment,
    action: 'approve_pending' | 'reset',
  ) {
    setError('')
    setMessage('')

    const response = await fetch('/api/attendance/admin/device-bindings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        enrollmentId: enrollment.id,
        action,
        reason: action === 'reset' ? '관리자 기기 초기화' : undefined,
      }),
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      setError(payload?.error ?? '출석 기기 요청을 처리하지 못했습니다.')
      return
    }

    applyAttendanceDeviceState(enrollment.id, (payload?.device ?? null) as AttendanceDeviceState | null)
    setMessage(
      action === 'approve_pending'
        ? `${enrollment.name} 학생의 추가 출석 기기를 승인했습니다.`
        : `${enrollment.name} 학생의 출석 기기 등록을 초기화했습니다.`,
    )
  }

  async function handleResetAllAttendanceDevicesConfirmed() {
    setError('')
    setMessage('')

    const response = await fetch('/api/attendance/admin/device-bindings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        action: 'reset_course',
        reason: '관리자 강좌 전체 기기 초기화',
      }),
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      setError(payload?.error ?? '출석 기기 전체 초기화에 실패했습니다.')
      return
    }

    setEnrollments((current) => current.map((entry) => ({
      ...entry,
      attendance_device: null,
    })))
    setMessage(`출석 기기 전체 초기화 완료: ${payload?.resetCount ?? 0}건 초기화`)
  }

  paginationRef.current = { currentPage, pageSize, search, statusFilter }

  const applyStudentsPageData = useCallback((data: Awaited<ReturnType<typeof fetchStudentsPageData>>, resolvedPage?: number) => {
    if (resolvedPage !== undefined) {
      setCurrentPage(resolvedPage)
      paginationRef.current = { ...paginationRef.current, currentPage: resolvedPage }
    }
    setCourse(data.course)
    setEnrollments(data.enrollments)
    setTotalCount(data.total)
    setPageSummary(data.summary)
    setTextbooks(data.textbooks)
    setSeriesOptions(data.seriesOptions)
  }, [])

  const loadStudentsPageData = useCallback(async (
    params: Parameters<typeof fetchStudentsPageData>[1],
  ) => {
    let resolvedPage = params.page
    let data = await fetchStudentsPageData(courseId, params)

    if (!params.noLimit) {
      const pageCount = Math.max(1, Math.ceil(data.total / params.pageSize))
      if (params.page > pageCount) {
        resolvedPage = pageCount
        data = await fetchStudentsPageData(courseId, { ...params, page: resolvedPage })
      }
    }

    return { data, resolvedPage }
  }, [courseId])

  const refresh = useCallback(async (opts?: { noLimit?: boolean }) => {
    const { currentPage: page, pageSize: size, search: q, statusFilter: st } = paginationRef.current
    const { data, resolvedPage } = await loadStudentsPageData({
      page,
      pageSize: size,
      search: q,
      status: st,
      noLimit: opts?.noLimit,
    })
    applyStudentsPageData(data, resolvedPage !== page ? resolvedPage : undefined)
  }, [applyStudentsPageData, loadStudentsPageData])

  useEffect(() => {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      setError('잘못된 강좌 ID')
      setLoading(false)
      return
    }
    refresh()
      .catch((r: unknown) => setError(r instanceof Error ? r.message : '불러오기 실패'))
      .finally(() => {
        if (!initialLoaded) {
          setLoading(false)
        }
      })
  }, [courseId, refresh, initialLoaded])

  const summary = {
    total: totalCount,
    active: pageSummary.active,
    refunded: pageSummary.refunded,
    suspended: pageSummary.suspended,
  }

  const applyEnrollmentFetch = useCallback((
    params: Parameters<typeof fetchStudentsPageData>[1],
  ) => {
    fetchSeqRef.current += 1
    const seq = fetchSeqRef.current
    loadStudentsPageData(params)
      .then(({ data, resolvedPage }) => {
        if (seq !== fetchSeqRef.current) return
        applyStudentsPageData(data, resolvedPage !== params.page ? resolvedPage : undefined)
      })
      .catch((reason: unknown) => {
        if (seq !== fetchSeqRef.current) return
        setError(reason instanceof Error ? reason.message : '불러오기 실패')
      })
  }, [applyStudentsPageData, loadStudentsPageData])

  const handlePageChange = useCallback((page: number) => {
    const pageCount = Math.max(1, Math.ceil(totalCount / paginationRef.current.pageSize))
    const nextPage = Math.min(Math.max(1, page), pageCount)
    setCurrentPage(nextPage)
    paginationRef.current = { ...paginationRef.current, currentPage: nextPage }
    applyEnrollmentFetch({
      page: nextPage,
      pageSize: paginationRef.current.pageSize,
      search: paginationRef.current.search,
      status: paginationRef.current.statusFilter,
    })
  }, [applyEnrollmentFetch, totalCount])

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size)
    setCurrentPage(1)
    paginationRef.current = { ...paginationRef.current, pageSize: size, currentPage: 1 }
    applyEnrollmentFetch({
      page: 1,
      pageSize: size,
      search: paginationRef.current.search,
      status: paginationRef.current.statusFilter,
    })
  }, [applyEnrollmentFetch])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current)
    }
    searchTimerRef.current = window.setTimeout(() => {
      searchTimerRef.current = null
      setCurrentPage(1)
      paginationRef.current = { ...paginationRef.current, search: value, currentPage: 1 }
      applyEnrollmentFetch({
        page: 1,
        pageSize: paginationRef.current.pageSize,
        search: value,
        status: paginationRef.current.statusFilter,
      })
    }, 500)
  }, [applyEnrollmentFetch])

  const handleStatusFilterChange = useCallback((value: EnrollmentManageStatusFilter) => {
    setStatusFilter(value)
    setCurrentPage(1)
    paginationRef.current = { ...paginationRef.current, statusFilter: value, currentPage: 1 }
    applyEnrollmentFetch({
      page: 1,
      pageSize: paginationRef.current.pageSize,
      search: paginationRef.current.search,
      status: value,
    })
  }, [applyEnrollmentFetch])

  const handleDownloadStudentList = useCallback(async () => {
    if (!course) {
      return
    }

    if (totalCount === 0) {
      setError('다운로드할 수강생이 없습니다.')
      return
    }

    let allEnrollments: Enrollment[]
    try {
      const data = await fetchStudentsPageData(courseId, {
        page: 1,
        pageSize: 50,
        search: paginationRef.current.search,
        status: paginationRef.current.statusFilter,
        noLimit: true,
      })
      allEnrollments = data.enrollments
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '전체 수강생 목록을 불러오지 못했습니다.')
      return
    }

    if (allEnrollments.length === 0) {
      setError('다운로드할 수강생이 없습니다.')
      return
    }

    const header = [
      '번호',
      '기수',
      '응시번호',
      '이름',
      '성별',
      '연락처',
      '직렬',
      '학원구분',
      ...customFields.map((field) => field.label),
      '비고',
      '상태',
      '등록일',
    ]
    const rows = allEnrollments.map((enrollment, index) => [
      index + 1,
      enrollment.cohort_label ?? '',
      enrollment.exam_number ?? '',
      enrollment.name,
      normalizeGenderLabel(enrollment.gender),
      formatExcelTextCell(formatPhoneNumber(enrollment.phone)),
      enrollment.series?.trim() || (enrollment.series_group === 'career' ? '경채' : '공채'),
      ENROLLMENT_STUDENT_TYPE_LABEL[enrollment.student_type ?? 'general'],
      ...customFields.map((field) => (enrollment.custom_data ?? {})[field.key] ?? ''),
      enrollment.memo ?? '',
      getEnrollmentStatusLabel(enrollment),
      formatCsvDate(enrollment.created_at),
    ])
    const csv = [header, ...rows]
      .map((line) => line.map(escapeCsvCell).join(','))
      .join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${sanitizeDownloadFilename(course.slug || course.name)}-students-${getKoreanDateKey().replace(/-/g, '')}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setError('')
    setMessage(`${course.name} 수강생 명단 CSV를 다운로드했습니다.`)
  }, [course, courseId, customFields, totalCount])

  const handleDownloadExcelTemplate = useCallback(async () => {
    if (!course) {
      return
    }

    let allEnrollments: Enrollment[]
    try {
      const data = await fetchStudentsPageData(courseId, {
        page: 1,
        pageSize: 50,
        search: paginationRef.current.search,
        status: paginationRef.current.statusFilter,
        noLimit: true,
      })
      allEnrollments = data.enrollments
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '전체 수강생 목록을 불러오지 못했습니다.')
      return
    }

    try {
      downloadEnrollmentTemplate(course, allEnrollments)
      setError('')
      setMessage(
        allEnrollments.length === 0
          ? '빈 템플릿을 다운로드했습니다. 작성 후 템플릿 업로드로 등록하세요.'
          : `${course.name} 명단 ${allEnrollments.length}건이 포함된 템플릿을 다운로드했습니다.`,
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '템플릿을 생성하지 못했습니다.')
    }
  }, [course, courseId])

  const handleExcelUploadFile = useCallback(async (file: File) => {
    setError('')
    setMessage('')
    try {
      const text = await parseEnrollmentXlsxToText(file)
      setBulkText(text)
      setBulkRowErrors([])
      setBulkRowErrorCount(0)
      setBulkImportResult(null)
      setPanel('bulk')
      setMessage('템플릿 내용을 미리보기에 채웠습니다. 확인 후 "일괄 반영"을 눌러주세요.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '템플릿 파일을 읽지 못했습니다.')
    }
  }, [])

  const handleDownloadCourseSettlement = useCallback(async () => {
    if (!course) return

    setError('')
    setMessage('')

    // 정산 기간: 강좌 등록 시작일(enrolled_from) 또는 강좌 생성일 ~ 오늘
    const fromCandidate = course.enrolled_from || course.created_at || ''
    const fromDate = fromCandidate.slice(0, 10) || '2020-01-01'
    const toDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

    try {
      // 1. 결제·환불 상세 데이터 + 전체 수강생 명단 병렬 조회
      const settlementParams = new URLSearchParams({
        from: fromDate,
        to: toDate,
        courseId: String(courseId),
        limit: '10000',
      })

      const [settlementResponse, enrollmentsData] = await Promise.all([
        fetch(`/api/payments/settlement/details?${settlementParams.toString()}`, { cache: 'no-store' }),
        fetchStudentsPageData(courseId, {
          page: 1,
          pageSize: 50,
          search: '',
          status: 'all',
          noLimit: true,
        }),
      ])

      const settlementResult = await settlementResponse.json().catch(() => null)
      if (!settlementResponse.ok) {
        throw new Error(settlementResult?.error ?? '정산 데이터를 불러오지 못했습니다.')
      }

      const payments = (settlementResult?.payments ?? []) as EnrollmentPayment[]
      const report = buildSettlementReport(payments, fromDate, toDate)

      downloadCourseSettlementXlsx(
        report,
        payments,
        { id: course.id, name: course.name, slug: course.slug },
        enrollmentsData.enrollments,
        { from: fromDate, to: toDate },
      )

      setMessage(
        `${course.name} 정산 다운로드 완료 (결제 ${payments.length}건, 수강생 ${enrollmentsData.enrollments.length}명, 기간 ${fromDate} ~ ${toDate})`,
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '정산 다운로드에 실패했습니다.')
    }
  }, [course, courseId])

  const loadMatrixData = useCallback(async (mode: MatrixMode) => {
    setMatrixLoading(true)
    setError('')

    try {
      const meta = MATRIX_TAB_META[mode]
      const enrollmentParams = new URLSearchParams({ courseId: String(courseId), noLimit: '1' })
      const [response, enrollmentResponse] = await Promise.all([
        fetch(
          `/api/distribution/receipt-matrix?courseId=${courseId}&materialType=${meta.materialType}`,
          { cache: 'no-store' },
        ),
        fetch(`/api/enrollments?${enrollmentParams}`, { cache: 'no-store' }),
      ])
      const payload = await response.json().catch(() => null)
      const enrollmentPayload = await enrollmentResponse.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? '매트릭스 데이터를 불러오지 못했습니다.')
      }

      if (!enrollmentResponse.ok) {
        throw new Error(enrollmentPayload?.error ?? '?섍컯??紐⑸줉??遺덈윭?ㅼ? 紐삵뻽?듬땲??')
      }

      const materials = (payload?.materials ?? []) as Material[]
      const matrixEnrollments = ((enrollmentPayload?.enrollments ?? []) as Enrollment[])
        .filter((enrollment) => enrollment.status === 'active')
      const logs = (payload?.logs ?? []) as Array<{
        id: number
        enrollment_id: number
        material_id: number
        distributed_at: string
      }>
      const assignments = (payload?.assignments ?? []) as TextbookAssignment[]
      const seatAssignments = (payload?.seatAssignments ?? []) as Array<{
        enrollment_id: number
        subject_id: number
      }>

      const seatSubjectMap = new Map<number, Record<number, true>>()
      for (const seat of seatAssignments) {
        if (!seatSubjectMap.has(seat.enrollment_id)) {
          seatSubjectMap.set(seat.enrollment_id, {})
        }
        seatSubjectMap.get(seat.enrollment_id)![seat.subject_id] = true
      }

      const receiptMap = new Map<number, Record<number, ReceiptCell>>()
      for (const log of logs) {
        if (!receiptMap.has(log.enrollment_id)) {
          receiptMap.set(log.enrollment_id, {})
        }

        receiptMap.get(log.enrollment_id)![log.material_id] = {
          distributed_at: log.distributed_at,
          logId: log.id,
        }
      }

      const assignmentMap = new Map<number, Record<number, true>>()
      for (const assignment of assignments) {
        if (!assignmentMap.has(assignment.enrollment_id)) {
          assignmentMap.set(assignment.enrollment_id, {})
        }

        assignmentMap.get(assignment.enrollment_id)![assignment.material_id] = true
      }

      setMatrixMaterials(materials)
      setMatrixRows(
        matrixEnrollments.map((enrollment) => ({
          enrollment,
          receipts: receiptMap.get(enrollment.id) ?? {},
          assignments: assignmentMap.get(enrollment.id) ?? {},
          seatSubjects: seatSubjectMap.get(enrollment.id) ?? {},
        })),
      )
      setFilterMatId((current) => (
        current !== null && materials.some((material) => material.id === current) ? current : null
      ))
      setSelectedIds(new Set())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '매트릭스 데이터를 불러오지 못했습니다.')
    } finally {
      setMatrixLoading(false)
    }
  }, [courseId])

  const reloadCurrentMatrix = useCallback(async () => {
    if (isMatrixTab(tab)) {
      await loadMatrixData(tab)
    }
  }, [loadMatrixData, tab])

  useEffect(() => {
    if (!isMatrixTab(tab)) {
      return
    }

    void loadMatrixData(tab)
  }, [loadMatrixData, tab])

  const filteredMatrixRows = useMemo(() => {
    let rows = matrixRows

    if (matrixSearch.trim()) {
      const query = matrixSearch.trim().toLowerCase()
      rows = rows.filter((row) =>
        row.enrollment.name.toLowerCase().includes(query)
        || row.enrollment.phone.includes(query)
        || (row.enrollment.exam_number ?? '').toLowerCase().includes(query))
    }

    if (filterMatId === null) {
      return rows
    }

    if (tab === 'receipts') {
      return rows.filter((row) => !row.receipts[filterMatId])
    }

    if (tab === 'textbook-assign') {
      return rows.filter((row) => !row.assignments[filterMatId])
    }

    return rows.filter((row) => row.assignments[filterMatId] && !row.receipts[filterMatId])
  }, [filterMatId, matrixRows, matrixSearch, tab])

  const bulkActionEnabled = filterMatId !== null && (tab === 'receipts' || tab === 'textbook-assign')

  function applyMatrixReceipts(enrollmentId: number, logs: DistributionLogPayload[]) {
    if (logs.length === 0) {
      return
    }

    setMatrixRows((current) => current.map((row) => {
      if (row.enrollment.id !== enrollmentId) {
        return row
      }

      const receipts = { ...row.receipts }
      for (const log of logs) {
        receipts[log.materialId] = {
          logId: log.logId,
          distributed_at: log.distributedAt,
        }
      }

      return { ...row, receipts }
    }))
  }

  function removeMatrixReceiptByLogId(logId: number) {
    setMatrixRows((current) => current.map((row) => {
      const receipts = { ...row.receipts }
      let changed = false

      for (const [materialId, receipt] of Object.entries(receipts)) {
        if (receipt.logId === logId) {
          delete receipts[Number(materialId)]
          changed = true
        }
      }

      return changed ? { ...row, receipts } : row
    }))
  }

  function applyMatrixAssignments(enrollmentId: number, materialIds: number[], assigned: boolean) {
    if (materialIds.length === 0) {
      return
    }

    const uniqueMaterialIds = Array.from(new Set(materialIds))
    setMatrixRows((current) => current.map((row) => {
      if (row.enrollment.id !== enrollmentId) {
        return row
      }

      const assignments = { ...row.assignments }
      for (const materialId of uniqueMaterialIds) {
        if (assigned) {
          assignments[materialId] = true
        } else {
          delete assignments[materialId]
        }
      }

      return { ...row, assignments }
    }))
  }

  function applyMatrixAssignmentsByMaterial(materialId: number, enrollmentIds: number[], assigned: boolean) {
    if (enrollmentIds.length === 0) {
      return
    }

    const enrollmentIdSet = new Set(enrollmentIds)
    setMatrixRows((current) => current.map((row) => {
      if (!enrollmentIdSet.has(row.enrollment.id)) {
        return row
      }

      const assignments = { ...row.assignments }
      if (assigned) {
        assignments[materialId] = true
      } else {
        delete assignments[materialId]
      }

      return { ...row, assignments }
    }))
  }

  async function handleDistribute(enrollmentId: number, materialId: number) {
    setBulkProcessing(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/distribution/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId, materialId }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setError(payload?.error ?? '배부 처리에 실패했습니다.')
        return
      }

      const logs = parseDistributionLogsFromPayload(payload)
      applyMatrixReceipts(enrollmentId, logs)
      setMessage(`${payload?.student_name ?? '수강생'} - ${payload?.material_name ?? '자료'} 배부 완료`)
    } catch {
      setError('배부 처리에 실패했습니다.')
    } finally {
      setBulkProcessing(false)
    }
  }

  async function handleDistributeAllForEnrollment(enrollmentId: number, materialIds: number[]) {
    if (materialIds.length === 0) return

    setBulkProcessing(true)
    setBulkProgress({ done: 0, total: materialIds.length })
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/distribution/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId, materialIds }),
      })
      const payload = await response.json().catch(() => null)

      setBulkProgress({ done: materialIds.length, total: materialIds.length })

      if (!response.ok) {
        setError(payload?.error ?? '자료 일괄 배부에 실패했습니다.')
        return
      }

      const successCount = Number(payload?.success_count ?? materialIds.length)
      const failCount = Number(payload?.failed_count ?? Math.max(0, materialIds.length - successCount))
      const logs = parseDistributionLogsFromPayload(payload)
      applyMatrixReceipts(enrollmentId, logs)
      setMessage(`자료 일괄 배부 완료: ${successCount}건 성공${failCount > 0 ? `, ${failCount}건 실패` : ''}`)
    } finally {
      setBulkProcessing(false)
    }
  }

  async function runDistributionBatch(items: DistributionBatchItem[]) {
    const targets = items.filter((item) => item.materialIds.length > 0)
    const totalCount = targets.reduce((sum, item) => sum + item.materialIds.length, 0)
    if (targets.length === 0 || totalCount === 0) return

    setBulkProcessing(true)
    setBulkProgress({ done: 0, total: totalCount })
    setError('')
    setMessage('')

    let successCount = 0
    let failCount = 0
    let processedCount = 0
    const CHUNK_SIZE = 5

    try {
      for (let index = 0; index < targets.length; index += CHUNK_SIZE) {
        const chunk = targets.slice(index, index + CHUNK_SIZE)
        await Promise.all(
          chunk.map(async (item) => {
            try {
              const response = await fetch('/api/distribution/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  enrollmentId: item.enrollmentId,
                  materialIds: item.materialIds,
                }),
              })
              const payload = await response.json().catch(() => null)

              if (response.ok) {
                const logs = parseDistributionLogsFromPayload(payload)
                applyMatrixReceipts(item.enrollmentId, logs)
                const itemSuccessCount = Number(payload?.success_count ?? item.materialIds.length)
                successCount += itemSuccessCount
                failCount += Number(payload?.failed_count ?? Math.max(0, item.materialIds.length - itemSuccessCount))
              } else {
                failCount += item.materialIds.length
              }
            } catch {
              failCount += item.materialIds.length
            } finally {
              processedCount += item.materialIds.length
              setBulkProgress({ done: processedCount, total: totalCount })
            }
          }),
        )
      }

      setSelectedIds(new Set())
      setMessage(`일괄 배부 완료: ${successCount}건 성공${failCount > 0 ? `, ${failCount}건 실패` : ''}`)
    } finally {
      setBulkProcessing(false)
    }
  }

  function confirmDistributionBatch(items: DistributionBatchItem[]) {
    const targets = items.filter((item) => item.materialIds.length > 0)
    const materialCount = targets.reduce((sum, item) => sum + item.materialIds.length, 0)
    if (targets.length === 0 || materialCount === 0) return

    openConfirmation({
      title: '자료를 일괄 배부할까요?',
      description: `현재 검색/필터 결과 중 ${targets.length.toLocaleString('ko-KR')}명에게 미수령 자료 ${materialCount.toLocaleString('ko-KR')}건을 배부합니다. 이미 수령한 자료와 대상이 아닌 자료는 제외됩니다.`,
      confirmLabel: '일괄 배부',
      pendingLabel: '배부 중...',
      tone: 'success',
      onConfirm: () => runDistributionBatch(targets),
    })
  }

  async function handleBulkDistributeSelected() {
    if (filterMatId === null || selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    setBulkProcessing(true)
    setBulkProgress({ done: 0, total: ids.length })
    setError('')
    setMessage('')
    let successCount = 0

    const CHUNK_SIZE = 5
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE)
      const results = await Promise.allSettled(
        chunk.map(async (enrollmentId) => {
          const r = await fetch('/api/distribution/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enrollmentId, materialId: filterMatId }),
          })
          const payload = await r.json().catch(() => null)
          setBulkProgress((p) => ({ ...p, done: p.done + 1 }))
          if (r.ok) {
            const logs = parseDistributionLogsFromPayload(payload)
            applyMatrixReceipts(enrollmentId, logs)
            successCount++
          }
          return r
        }),
      )
      if (chunk.length > 1 && results.every((r) => r.status === 'rejected')) break
    }

    setBulkProcessing(false)
    setSelectedIds(new Set())
    const failCount = ids.length - successCount
    setMessage(`일괄 배부 완료: ${successCount}건 성공${failCount > 0 ? `, ${failCount}건 실패` : ''}`)
  }

  async function handleAssignTextbook(enrollmentId: number, materialId: number, checked: boolean) {
    setBulkProcessing(true)
    setError('')
    setMessage('')
    applyMatrixAssignments(enrollmentId, [materialId], checked)

    try {
      const response = await fetch('/api/textbook-assignments', {
        method: checked ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId, materialId }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        applyMatrixAssignments(enrollmentId, [materialId], !checked)
        setError(payload?.error ?? '교재 배정 처리에 실패했습니다.')
        return
      }

      setMessage(checked ? '교재를 배정했습니다.' : '교재 배정을 해제했습니다.')
    } catch {
      applyMatrixAssignments(enrollmentId, [materialId], !checked)
      setError('교재 배정 처리에 실패했습니다.')
    } finally {
      setBulkProcessing(false)
    }
  }

  async function handleAssignAllTextbooks(enrollmentId: number) {
    if (matrixMaterials.length === 0) return

    setBulkProcessing(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/textbook-assignments/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrollmentId,
        materialIds: matrixMaterials.map((material) => material.id),
      }),
    })
    const payload = await response.json().catch(() => null)
    setBulkProcessing(false)

    if (!response.ok) {
      setError(payload?.error ?? '교재 전체 배정에 실패했습니다.')
      return
    }

    const assignedMaterialIds = Array.isArray(payload?.assignments)
      ? (payload.assignments as TextbookAssignment[]).map((assignment) => assignment.material_id)
      : matrixMaterials.map((material) => material.id)
    applyMatrixAssignments(enrollmentId, assignedMaterialIds, true)
    setMessage('전체 교재를 배정했습니다.')
  }

  async function handleBulkAssignSelected() {
    if (filterMatId === null || selectedIds.size === 0) return

    setBulkProcessing(true)
    setBulkProgress({ done: 0, total: selectedIds.size })
    setError('')
    setMessage('')

    const enrollmentIds = Array.from(selectedIds)
    const response = await fetch('/api/textbook-assignments/bulk-by-material', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialId: filterMatId, enrollmentIds }),
    })
    const payload = await response.json().catch(() => null)

    setBulkProgress({ done: enrollmentIds.length, total: enrollmentIds.length })
    setBulkProcessing(false)

    if (!response.ok) {
      setError(payload?.error ?? '교재 일괄 배정에 실패했습니다.')
      return
    }

    setSelectedIds(new Set())
    const assignedEnrollmentIds = Array.isArray(payload?.assignments)
      ? (payload.assignments as TextbookAssignment[]).map((assignment) => assignment.enrollment_id)
      : enrollmentIds
    applyMatrixAssignmentsByMaterial(filterMatId, assignedEnrollmentIds, true)
    setMessage(`${payload?.assignments?.length ?? enrollmentIds.length}명에게 교재를 배정했습니다.`)
  }

  // CRUD
  async function handleCreate(ev: FormEvent) {
    ev.preventDefault()
    const submitter = (ev.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const shouldSavePayment = submitter?.dataset.paymentMode === 'with-payment'
    setError('')
    setMessage('')

    if (selectedStudent?.alreadyEnrolled) {
      setError('이미 현재 강좌에 등록된 수강생입니다.')
      return
    }

    if (!/^\d{6}$/.test(createForm.birth_date)) {
      setError('생년월일 6자리를 입력해 주세요.')
      return
    }

    const paymentPayload = normalizePaymentSectionPayload(createPaymentForm)
    const isZeroAmountBilling = !paymentPayload.tuitionExempt
      && paymentPayload.expectedAmount === 0
      && paymentPayload.discountAmount === 0
      && paymentPayload.payableAmount === 0
    const shouldRecordPayments = shouldSavePayment && !isZeroAmountBilling
    const shouldUseBatchRegistration = isBundleRegistration
    if (!Number.isInteger(paymentPayload.expectedAmount) || paymentPayload.expectedAmount < 0) {
      setError('강좌 정가를 확인해 주세요.')
      return
    }

    if (!Number.isInteger(paymentPayload.discountAmount) || paymentPayload.discountAmount < 0) {
      setError('할인 금액을 확인해 주세요.')
      return
    }

    if (paymentPayload.discountAmount > paymentPayload.expectedAmount) {
      setError('할인 금액은 강좌 정가보다 클 수 없습니다.')
      return
    }

    if (!paymentPayload.tuitionExempt && paymentPayload.discountAmount > 0 && !createPaymentForm.discountReason.trim()) {
      setError('할인 금액을 입력한 경우 할인 사유가 필요합니다.')
      return
    }

    if (paymentPayload.tuitionExempt && !createPaymentForm.tuitionExemptReason.trim()) {
      setError('무료 수강 또는 수납 면제 사유를 입력해 주세요.')
      return
    }

    if (paymentPayload.tuitionExempt) {
      const exemptRuleError = getTuitionExemptBillingRuleError({
        tuitionExempt: paymentPayload.tuitionExempt,
        discountAmount: paymentPayload.discountAmount,
        tuitionExemptReason: createPaymentForm.tuitionExemptReason,
      })
      if (exemptRuleError) {
        setError(exemptRuleError)
        return
      }
    }

    if (shouldUseBatchRegistration) {
      if (bundleBillingRows.length !== bundleCourseIds.length) {
        setError('묶음 등록할 강좌 정보를 다시 확인해 주세요.')
        return
      }

      const discountWithoutReason = bundleBillingRows.find((row) => (
        row.discountAmount > 0 && !row.discountReason
      ))
      if (discountWithoutReason) {
        setError(`${discountWithoutReason.course.name} 할인 사유를 입력해 주세요.`)
        return
      }

      if (paymentPayload.tuitionExempt) {
        setError('묶음 등록에서는 무료/면제를 결제 섹션에서 처리하지 않습니다.')
        return
      }

      if (shouldRecordPayments && paymentPayload.payments.length > 20) {
        setError('결제 수단은 최대 20개까지 입력할 수 있습니다.')
        return
      }
    }

    if (!paymentPayload.tuitionExempt && paymentPayload.payableAmount <= 0 && !isZeroAmountBilling) {
      setError('적용 금액이 0원이면 무료 수강으로 기록해 주세요.')
      return
    }

    if (shouldRecordPayments && !paymentPayload.tuitionExempt) {
      if (paymentPayload.expectedAmount <= 0) {
        setError('유료 수강은 강좌 정가를 1원 이상 입력해야 합니다.')
        return
      }

      if (paymentPayload.payableAmount <= 0) {
        setError('적용 금액이 0원이면 무료 수강으로 기록해 주세요.')
        return
      }

      if (paymentPayload.payments.length === 0 || paymentPayload.paymentTotal <= 0) {
        setError('결제 수단별 수납 금액을 입력해 주세요.')
        return
      }

      if (paymentPayload.paymentTotal !== paymentPayload.payableAmount) {
        setError('수납 합계가 적용 금액과 일치해야 합니다.')
        return
      }
    }

    setSubmitting(true)
    try {
      const paymentsToSave = shouldRecordPayments ? paymentPayload.payments : []
      const commonPayload = {
        studentId: selectedStudent?.id ?? null,
        updateSelectedStudent: Boolean(selectedStudent && selectedStudentEditable),
        name: createForm.name,
        phone: createForm.phone,
        exam_number: createForm.exam_number || null,
        cohort_number: createForm.cohort_number ? Number(createForm.cohort_number) : null,
        birth_date: createForm.birth_date || null,
        gender: createForm.gender || null,
        series_option_id: createForm.series_option_id,
        student_type: createForm.student_type,
        custom_data: createForm.custom_data,
      }
      const requestBody = shouldUseBatchRegistration
        ? {
          ...commonPayload,
          registrations: bundleBillingRows.map((row) => ({
            courseId: row.course.id,
            textbookIds: row.course.id === courseId ? createForm.textbookIds : [],
            billing: {
              expectedAmount: row.expectedAmount,
              discountAmount: row.discountAmount,
              discountReason: row.discountReason || null,
              payableAmount: row.payableAmount,
              tuitionExempt: false,
              tuitionExemptReason: null,
            },
          })),
          payments: paymentsToSave,
        }
        : {
          ...commonPayload,
          courseId,
          textbookIds: createForm.textbookIds,
          billing: {
            expectedAmount: paymentPayload.expectedAmount,
            discountAmount: paymentPayload.discountAmount,
            discountReason: createPaymentForm.discountReason.trim() || null,
            payableAmount: paymentPayload.payableAmount,
            tuitionExempt: paymentPayload.tuitionExempt,
            tuitionExemptReason: createPaymentForm.tuitionExemptReason.trim() || null,
          },
          payments: paymentsToSave,
        }
      const r = await fetch(shouldUseBatchRegistration ? '/api/enrollments/batch' : '/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const p = await r.json().catch(() => null)
      if (!r.ok) {
        setError(p?.error ?? '수강생 등록에 실패했습니다.')
        return
      }

      setCreateForm(emptyForm(defaultSeriesOptionId))
      setCreatePaymentForm(createPaymentSectionValueForAmount(course?.tuition_amount ?? 0))
      if (course) {
        resetCreateBundleState(course)
      }
      setSelectedStudent(null)
      setSelectedStudentEditable(false)
      if (studentLookupInputTimerRef.current !== null) {
        window.clearTimeout(studentLookupInputTimerRef.current)
        studentLookupInputTimerRef.current = null
      }
      setStudentLookupQuery('')
      setStudentLookupResults([])
      if (p?.generated_pin) {
        const pinEnrollment = shouldUseBatchRegistration
          ? (p.enrollments?.[0] as Enrollment | undefined)
          : (p.enrollment as Enrollment | undefined)
        setPinReveal({
          title: '신규 학생 PIN',
          pins: [{
            name: pinEnrollment?.name ?? createForm.name,
            phone: pinEnrollment?.phone ?? createForm.phone,
            pin: p.generated_pin as string,
          }],
        })
      }
      const receiptNos = getReceiptNoticeFromPayload(p)
      if (shouldRecordPayments && !paymentPayload.tuitionExempt && receiptNos) {
        setReceiptNotice(receiptNos)
      }
      const wasReactivated = shouldUseBatchRegistration
        ? Number(p?.reactivatedCount ?? 0) > 0
        : Boolean(p?.reactivated)
      const noChargeMessage = paymentPayload.tuitionExempt
        ? '수강생을 등록하고 수납 면제로 기록했습니다.'
        : '0원 강좌 수강생을 등록했습니다.'
      const reactivatedNoChargeMessage = paymentPayload.tuitionExempt
        ? '환불 완료 수강생을 다시 활성 등록으로 전환하고 수납 면제로 기록했습니다.'
        : '환불 완료 수강생을 다시 활성 등록으로 전환하고 납부할 금액 없음으로 기록했습니다.'
      const batchSuccessMessage = shouldRecordPayments
        ? `${bundleBillingRows.length}개 강좌를 묶음 등록하고 결제를 강좌별로 저장했습니다.`
        : `${bundleBillingRows.length}개 강좌를 묶음 미수납 등록했습니다.`
      setMessage(
        shouldUseBatchRegistration
          ? batchSuccessMessage
          : wasReactivated
          ? shouldRecordPayments
            ? '환불 완료 수강생을 재등록하고 수납 정보를 저장했습니다.'
            : paymentPayload.payableAmount <= 0
              ? reactivatedNoChargeMessage
              : '환불 완료 수강생을 다시 활성 등록으로 전환했습니다.'
          : shouldRecordPayments
            ? '수강생과 수납 정보를 함께 등록했습니다.'
            : paymentPayload.payableAmount <= 0
              ? noChargeMessage
              : '수강생을 등록하고 미납 청구를 남겼습니다.',
      )
      setPanel('none')
      await refresh().catch(() => null)
      if (isMatrixTab(tab)) {
        await reloadCurrentMatrix().catch(() => null)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '수강생을 등록하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitBulkImport(
    payload: { text: string } | { rows: BulkImportEditableRow[] },
  ) {
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const r = await fetch('/api/enrollments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, ...payload }),
      })
      const p = await r.json().catch(() => null)
      if (!r.ok) {
        const rowErrors = parseBulkImportRowErrors(p)
        if (rowErrors.length > 0) {
          setBulkRowErrors(rowErrors)
          setBulkRowErrorCount(getBulkImportRowErrorCount(p, rowErrors.length))
        } else if ('text' in payload) {
          setBulkRowErrors([])
          setBulkRowErrorCount(0)
          setBulkImportResult(null)
        }
        setError(p?.error ?? '대량 등록에 실패했습니다.')
        return
      }

      const rowErrors = parseBulkImportRowErrors(p)
      const importedCount = Number.isInteger(Number(p?.count)) ? Number(p.count) : 0
      const totalCount = Number.isInteger(Number(p?.totalCount))
        ? Number(p.totalCount)
        : importedCount + rowErrors.length
      const errorCount = getBulkImportRowErrorCount(p, rowErrors.length)
      const isRetry = 'rows' in payload
      const nextProgress = mergeBulkImportProgress(
        bulkImportResult,
        { totalCount, importedCount, errorCount },
        isRetry,
      )
      if (Array.isArray(p?.generated_pins) && p.generated_pins.length > 0) {
        setPinReveal({
          title: '일괄 생성 학생 PIN',
          pins: p.generated_pins as Array<{ name: string; phone: string; pin: string }>,
        })
      }

      setBulkText('')
      setBulkRowErrors(rowErrors)
      setBulkRowErrorCount(errorCount)
      setBulkImportResult(nextProgress)
      setMessage(
        isRetry
          ? rowErrors.length > 0
            ? `전체 ${nextProgress.totalCount}명 중 ${nextProgress.importedCount}명 반영 완료, 오류 ${nextProgress.errorCount}명은 추가 확인이 필요합니다.`
            : `전체 ${nextProgress.totalCount}명 등록을 완료했습니다.`
          : typeof p?.message === 'string'
            ? p.message
            : rowErrors.length > 0
              ? `정상 ${importedCount}명은 반영했고, 오류 ${errorCount}명은 확인이 필요합니다.`
              : `${importedCount}건 반영했습니다.`,
      )
      await refresh().catch(() => null)

      if (rowErrors.length === 0) {
        setBulkImportResult(null)
        setPanel('none')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '대량 등록에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleBulkImport(ev: FormEvent) {
    ev.preventDefault()
    if (!bulkText.trim()) {
      setBulkRowErrors([])
      setBulkRowErrorCount(0)
      setBulkImportResult(null)
      setError('명단을 입력해 주세요.')
      return
    }

    setBulkRowErrors([])
    setBulkRowErrorCount(0)
    setBulkImportResult(null)
    await submitBulkImport({ text: bulkText })
  }

  function updateBulkImportRow(
    index: number,
    field: keyof Pick<
      BulkImportEditableRow,
      'examNumber' | 'name' | 'phone' | 'birthDate' | 'cohortLabel' | 'series'
    >,
    value: string,
  ) {
    setBulkRowErrors((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) {
        return item
      }
      const input = { ...item.input, [field]: value }
      return {
        ...item,
        input,
        name: input.name,
        examNumber: input.examNumber || null,
        phoneLast4: input.phone.replace(/\D/g, '').slice(-4) || null,
      }
    }))
  }

  function applyMasterToBulkImportRow(index: number) {
    setBulkRowErrors((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index || !item.master) {
        return item
      }
      const input = applyBulkImportMasterIdentity(item.input, item.master)
      return {
        ...item,
        input,
        name: input.name,
        examNumber: input.examNumber || null,
        phoneLast4: input.phone.replace(/\D/g, '').slice(-4) || null,
      }
    }))
  }

  function applyAllMasterValues() {
    setBulkRowErrors((current) => current.map((item) => {
      if (!item.master) {
        return item
      }
      const input = applyBulkImportMasterIdentity(item.input, item.master)
      return {
        ...item,
        input,
        name: input.name,
        examNumber: input.examNumber || null,
        phoneLast4: input.phone.replace(/\D/g, '').slice(-4) || null,
      }
    }))
  }

  async function retryBulkImportErrors() {
    if (bulkRowErrors.length === 0) {
      return
    }
    await submitBulkImport({ rows: bulkRowErrors.map((item) => item.input) })
  }

  function startEdit(e: Enrollment) {
    setEditingId(e.id)
    setEditForm(toEditForm(e))
    setEditPhotoUrl(e.photo_url ?? null)
    setPanel('edit')
    setError(''); setMessage('')
  }

  function openPaymentDetail(enrollment: Enrollment) {
    setPaymentDetailEnrollmentId(enrollment.id)
    setPanel('none')
    setError('')
    setMessage('')
  }

  function openStudentHistory(enrollment: Enrollment) {
    setHistoryEnrollmentId(enrollment.id)
    setPanel('none')
    setError('')
    setMessage('')
  }

  async function handlePhotoUpload(file: File) {
    if (!editingId) return
    setPhotoUploading(true)
    setError('')
    const formData = new FormData()
    formData.append('photo', file)
    try {
      const r = await fetch(`/api/enrollments/${editingId}/photo`, { method: 'POST', body: formData })
      const p = await r.json().catch(() => null)
      if (!r.ok) { setError(p?.error ?? '사진 업로드 실패'); return }
      setEditPhotoUrl(p.photo_url)
      setEnrollments((c) => c.map((x) => x.id === editingId ? { ...x, photo_url: p.photo_url } : x))
      setMessage('사진을 업로드했습니다.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '사진 업로드 실패')
    } finally {
      setPhotoUploading(false)
    }
  }

  async function handlePhotoDelete() {
    if (!editingId) return
    setPhotoUploading(true)
    setError('')
    try {
      const response = await fetch(`/api/enrollments/${editingId}/photo`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(payload?.error ?? '사진 삭제 실패')
        return
      }
      setEditPhotoUrl(null)
      setEnrollments((c) => c.map((x) => x.id === editingId ? { ...x, photo_url: null } : x))
      setMessage('사진을 삭제했습니다.')
    } catch {
      setError('사진 삭제 실패')
    } finally {
      setPhotoUploading(false)
    }
  }

  async function handleSaveEdit(ev: FormEvent) {
    ev.preventDefault()
    if (!editingId) return
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const r = await fetch(`/api/enrollments/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          phone: editForm.phone,
          exam_number: editForm.exam_number || null,
          cohort_number: editForm.cohort_number ? Number(editForm.cohort_number) : null,
          birth_date: editForm.birth_date || null,
          gender: editForm.gender || null,
          series_option_id: editForm.series_option_id,
          student_type: editForm.student_type,
          custom_data: editForm.custom_data,
        }),
      })
      const p = await r.json().catch(() => null)
      if (!r.ok) { setError(p?.error ?? '수정에 실패했습니다.'); return }
      const next = p.enrollment as Enrollment
      await refresh().catch(() => null)
      setEnrollments((c) => c.map((x) => (x.id === next.id ? next : x)))
      setPanel('none'); setEditingId(null)
      setMessage('수강생 정보를 수정했습니다.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '수정에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSuspend(reason: string) {
    if (!suspensionTarget) {
      return
    }

    setSuspensionSubmitting(true)
    setError('')
    setMessage('')

    const response = await fetch(`/api/enrollments/${suspensionTarget.id}/suspension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    const payload = await response.json().catch(() => null)

    setSuspensionSubmitting(false)
    if (!response.ok) {
      setError(payload?.error ?? '응시 정지 처리에 실패했습니다.')
      return
    }

    const nextEnrollment = payload.enrollment as Enrollment
    await refresh().catch(() => null)
    setEnrollments((current) => current.map((entry) => (
      entry.id === nextEnrollment.id
        ? { ...entry, ...nextEnrollment }
        : entry
    )))
    setSuspensionTarget(null)
    setMessage('응시 정지를 적용했습니다.')
  }

  const noticeModal = (
    <ConfirmationModal
      open={Boolean(notice)}
      title={notice?.title ?? ''}
      description={notice?.description}
      confirmLabel="확인"
      cancelLabel={null}
      tone={notice?.tone}
      onClose={() => setNotice(null)}
      onConfirm={() => setNotice(null)}
    />
  )

  if (loading) {
    return (
      <>
        <p className="py-12 text-center text-sm text-slate-500">불러오는 중...</p>
        {noticeModal}
      </>
    )
  }

  if (!course) {
    return (
      <>
        <p className="py-12 text-center text-sm text-red-500">{error || '강좌를 찾을 수 없습니다.'}</p>
        {noticeModal}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap justify-end gap-2">
        {false ? (
          <div>
          <Link
            href={withTenantPrefix(`/dashboard/courses/${courseId}`, tenant.type)}
            className="text-xs font-medium text-slate-500 hover:underline"
          >
            ← {course!.name}
          </Link>
          <h2 className="mt-1 text-xl font-extrabold text-gray-900">수강생 관리</h2>
          <p className="mt-1 text-sm text-slate-500">
            전체 등록 {summary.total} · 수강중 {summary.active}
            {summary.suspended > 0 ? ` · 정지 ${summary.suspended}` : ''}
            {' · '}
            환불 {summary.refunded}
          </p>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {course.feature_attendance ? (
            <button
              type="button"
              onClick={() => {
                openConfirmation({
                  title: '출석 기기를 전체 초기화할까요?',
                  description: '이 강좌의 모든 출석 기기 등록을 초기화합니다. 학생들은 다음 출석 시 현장에서 사용하는 기기로 다시 등록됩니다.',
                  confirmLabel: '전체 초기화',
                  pendingLabel: '초기화 중...',
                  tone: 'danger',
                  onConfirm: handleResetAllAttendanceDevicesConfirmed,
                })
              }}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-rose-600 shadow-[inset_0_0_0_1px_rgba(180,35,24,0.3)] transition-all duration-200 ease-ios hover:bg-rose-50 active:scale-[0.97]"
            >
              출석 기기 전체 초기화
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const opening = panel !== 'create'
              if (opening) {
                setCreatePaymentForm(createPaymentSectionValueForAmount(course.tuition_amount ?? 0))
                setCreateForm(emptyForm(defaultSeriesOptionId))
                resetCreateBundleState(course)
              }
              setPanel(opening ? 'create' : 'none')
            }}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97] active:duration-100"
          >
            + 수강생 등록
          </button>
          <button
            type="button"
            onClick={() => {
              const opening = panel !== 'bulk'
              if (opening) {
                setBulkRowErrors([])
                setBulkRowErrorCount(0)
                setBulkImportResult(null)
              }
              setPanel(opening ? 'bulk' : 'none')
            }}
            className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97]"
          >
            명단 붙여넣기
          </button>
          <button
            type="button"
            onClick={handleDownloadStudentList}
            disabled={totalCount === 0}
            title={totalCount === 0 ? '다운로드할 수강생이 없습니다.' : '현재 강좌의 전체 수강생 명단을 CSV로 다운로드'}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-50 disabled:active:scale-100"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            명단 다운로드
          </button>
          <button
            type="button"
            onClick={handleDownloadCourseSettlement}
            title="이 강좌 전체 기간의 결제·환불 내역을 정산용 엑셀로 다운로드 (요약·수강생별·결제명세·환불내역 시트 포함)"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-all duration-200 ease-ios hover:bg-emerald-100 active:scale-[0.97]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            정산 다운로드
          </button>
          <button
            type="button"
            onClick={handleDownloadExcelTemplate}
            title="현재 명단을 비고 포함 엑셀 템플릿으로 다운로드 (편집 후 업로드 가능). 수강생이 없으면 빈 양식이 다운로드됩니다."
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            템플릿 다운로드
          </button>
          <button
            type="button"
            onClick={() => excelUploadInputRef.current?.click()}
            title="엑셀(.xlsx) 템플릿 파일 업로드. 다운로드한 템플릿을 수정해서 그대로 올리시면 됩니다."
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97]"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            템플릿 업로드
          </button>
          <input
            ref={excelUploadInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = '' // allow re-uploading the same file
              if (file) {
                void handleExcelUploadFile(file)
              }
            }}
          />
          {course.feature_photo && (
            <Link
              href={withTenantPrefix(`/dashboard/courses/${courseId}/students/photos`, tenant.type)}
              className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97]"
            >
              사진 일괄 업로드
            </Link>
          )}
        </div>
      </div>

      {/* ── Collapsible panels ── */}
      <AnimatePresence>
      {panel === 'create' ? (
        <>
          <motion.div
            className="fixed inset-0 z-[100] bg-black/40 sm:backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: panelBackdropDuration }}
            onClick={() => {
              if (!submitting) {
                setPanel('none')
              }
            }}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            className="fixed inset-y-0 right-0 z-[101] flex h-dvh w-full flex-col bg-white shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px] sm:max-w-[760px]"
            initial={{ x: 'calc(100% + 24px)', opacity: 0.96 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 'calc(100% + 24px)', opacity: 0.96 }}
            transition={motionConfig.drawer}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            whileDrag={{ scale: 0.995 }}
            onDragEnd={(_event, info) => {
              if (!submitting && info.offset.x > 100 && info.velocity.x > 200) {
                setPanel('none')
              }
            }}
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-3 sm:px-6">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">New Student</p>
                <h3 className="mt-1 text-[25px] font-semibold leading-[1.05] text-[#1d1d1f]">수강생 등록</h3>
                <p className="mt-1 truncate text-sm text-slate-500">{course.name}</p>
              </div>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => {
                  if (!submitting) {
                    setPanel('none')
                  }
                }}
                disabled={submitting}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-slate-50 text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <form id="create-student-form" onSubmit={handleCreate} className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-3 sm:px-6">
          <section>
            <div className="flex items-end justify-between gap-3">
              <label className="min-w-0 flex-1">
                <span className="text-[11px] font-medium text-slate-500">기존 수강생 검색</span>
                  <div className="mt-1.5 flex items-center gap-2 rounded-[8px] bg-white px-3 py-2 border border-slate-200 transition focus-within:border-slate-400">
                  <Search className="h-4 w-4 text-slate-500" />
                  <input
                    defaultValue=""
                    onChange={(event) => scheduleStudentLookupQuery(event.target.value)}
                    onKeyDown={handleStudentLookupKeyDown}
                    placeholder="학번, 이름, 연락처"
                    className="min-w-0 flex-1 text-sm outline-none"
                  />
                </div>
              </label>
              <span className="hidden shrink-0 pb-2 text-xs text-slate-500 sm:inline">
                {studentLookupLoading ? '검색 중...' : '선택하면 기존 수강생 정보가 자동 채워집니다.'}
              </span>
            </div>

            {studentLookupError ? (
              <p className="mt-2 text-xs font-medium text-rose-600">{studentLookupError}</p>
            ) : null}

            {studentLookupResults.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {studentLookupResults.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => selectStudentForCreate(student)}
                    disabled={student.alreadyEnrolled}
                    className={`rounded-[8px] border bg-white px-3 py-3 text-left transition ${
                      student.alreadyEnrolled
                        ? 'cursor-not-allowed border-amber-200 opacity-70'
                        : selectedStudent?.id === student.id
                          ? 'border-blue-300 shadow-[0_0_0_1px_rgba(37,99,235,0.18)]'
                          : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#1d1d1f]">
                          {student.name}
                          <span className="ml-2 text-xs font-medium text-slate-500">
                            {[student.cohort_label, student.exam_number].filter(Boolean).join(' · ') || '-'}
                          </span>
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">{student.phone}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          최근 수강: {student.latestEnrollment?.courseName ?? '-'}
                        </p>
                      </div>
                      <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        student.alreadyEnrolled ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-700'
                      }`}>
                        {student.alreadyEnrolled ? '이미 등록됨' : '선택 가능'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : studentLookupQuery.trim().length >= 2 && !studentLookupLoading ? (
              <p className="mt-3 rounded-[8px] bg-white px-3 py-3 text-center text-xs text-slate-500">
                검색 결과가 없습니다. 아래 입력값으로 새 수강생을 등록할 수 있습니다.
              </p>
            ) : null}

            {selectedStudent ? (
              <div className="mt-3 flex flex-col gap-3 rounded-[8px] shadow-[inset_0_0_0_1px_rgba(0,113,227,0.18)] bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#eff6ff] text-blue-600">
                    <UserCheck className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#1d1d1f]">{selectedStudent.name} 수강생 선택됨</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedStudentEditable ? '이번 등록 전에 수강생 인적사항도 함께 수정합니다.' : '기본 인적사항은 기존 수강생 정보를 그대로 사용합니다.'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStudentEditable((value) => !value)}
                    className="rounded-[8px] bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97]"
                  >
                    {selectedStudentEditable ? '수정 잠금' : '정보 수정'}
                  </button>
                  <button
                    type="button"
                    onClick={clearSelectedStudentForCreate}
                    className="rounded-[8px] bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97]"
                  >
                    선택 해제
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="mt-4">
            <h4 className="text-sm font-semibold text-[#1d1d1f]">인적 사항</h4>
            <p className="mt-0.5 text-xs text-slate-500">학번·이름·연락처는 필수입니다.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-6">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">학번</span>
                <input value={createForm.exam_number} onChange={(e) => setCreateForm((c) => ({ ...c, exam_number: e.target.value }))} disabled={selectedStudentLocked} placeholder="예: A-001" className="rounded-[8px] bg-white px-3 py-2 text-sm border border-slate-200 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">기수</span>
                <input
                  value={createForm.cohort_number}
                  onChange={(event) => setCreateForm((current) => ({
                    ...current,
                    cohort_number: normalizeCohortNumberInput(event.target.value),
                  }))}
                  disabled={selectedStudentLocked}
                  inputMode="numeric"
                  placeholder="예: 50"
                  className="rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">이름</span>
                <input value={createForm.name} onChange={(e) => setCreateForm((c) => ({ ...c, name: e.target.value }))} disabled={selectedStudentLocked} placeholder="홍길동" className="rounded-[8px] bg-white px-3 py-2 text-sm border border-slate-200 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">연락처</span>
                <input value={createForm.phone} onChange={(e) => setCreateForm((c) => ({ ...c, phone: e.target.value }))} disabled={selectedStudentLocked} placeholder="010-0000-0000" className="rounded-[8px] bg-white px-3 py-2 text-sm border border-slate-200 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">생년월일</span>
                <input value={createForm.birth_date} onChange={(e) => setCreateForm((c) => ({ ...c, birth_date: e.target.value.replace(/\D/g, '').slice(0, 6) }))} disabled={selectedStudentLocked} placeholder="YYMMDD" className="rounded-[8px] bg-white px-3 py-2 text-sm border border-slate-200 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">성별</span>
                <GenderSelect
                  value={createForm.gender}
                  onChange={(gender) => setCreateForm((current) => ({ ...current, gender }))}
                />
              </label>
              <div className="grid gap-3 sm:col-span-6 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <span className="mb-2 block text-[11px] font-medium text-slate-500">직렬</span>
                  <SeriesSelector
                    options={seriesOptions}
                    valueId={createForm.series_option_id}
                    onChange={(seriesOptionId) => setCreateForm((current) => ({ ...current, series_option_id: seriesOptionId }))}
                  />
                </div>
                <div className="sm:col-span-2 sm:col-start-5">
                  <span className="mb-2 block text-[11px] font-medium text-slate-500">학원구분</span>
                  <StudentTypeSelector
                    value={createForm.student_type}
                    onChange={(studentType) => setCreateForm((current) => ({ ...current, student_type: studentType }))}
                  />
                </div>
              </div>
              {customFields.map((f) => (
                <DynamicFieldInput key={f.key} field={f} value={createForm.custom_data[f.key] ?? ''} onChange={(v) => setCreateForm((c) => ({ ...c, custom_data: { ...c.custom_data, [f.key]: v } }))} />
              ))}
            </div>
          </section>

          <section className={`${isBundleRegistration ? 'mt-3 rounded-[10px] bg-slate-50 p-2' : 'mt-4 rounded-[10px] bg-slate-50 p-3'}`}>
            <div className={`flex flex-col sm:flex-row sm:items-end sm:justify-between ${isBundleRegistration ? 'gap-2' : 'gap-3'}`}>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-[#1d1d1f]">등록 강좌</h4>
                <p className={`${isBundleRegistration ? 'hidden' : 'mt-0.5'} text-xs text-slate-500`}>
                  여러 강좌를 동시에 등록하면 결제는 한 번 받고 정산은 강좌별로 나뉘어 저장됩니다.
                </p>
              </div>
              <div className={`flex min-w-0 gap-2 ${isBundleRegistration ? 'sm:min-w-[280px]' : 'sm:min-w-[320px]'}`}>
                <select
                  value={bundleCourseToAdd}
                  onChange={(event) => setBundleCourseToAdd(event.target.value)}
                  className="min-w-0 flex-1 rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                >
                  <option value="">추가 강좌 선택</option>
                  {bundleAddableCourses.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addBundleCourse}
                  disabled={!bundleCourseToAdd}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[8px] bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)] transition-all duration-200 ease-ios hover:bg-slate-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  추가
                </button>
              </div>
            </div>

            <div className={`${isBundleRegistration ? 'mt-2 gap-1.5' : 'mt-3 gap-2'} grid`}>
              {bundleBillingRows.map((row) => {
                const removable = row.course.id !== courseId
                const draft = bundleBillingDrafts[row.course.id]

                return (
                  <div
                    key={row.course.id}
                    className={`grid gap-2 rounded-[8px] bg-white shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)] sm:grid-cols-[minmax(0,1.4fr)_96px_104px_minmax(0,1fr)_96px_32px] ${isBundleRegistration ? 'p-1.5 sm:items-center sm:[&>div>span]:hidden sm:[&>label>span]:hidden' : 'p-2 sm:items-end'}`}
                  >
                    <div className="min-w-0">
                      <span className="block text-[11px] font-medium text-slate-500">강좌</span>
                      <p className={`${isBundleRegistration ? 'mt-0' : 'mt-1'} truncate text-sm font-semibold text-[#1d1d1f]`}>{row.course.name}</p>
                      <p className={`${isBundleRegistration ? 'mt-0 text-[10px]' : 'mt-0.5 text-[11px]'} text-slate-400`}>Code {row.course.settlement_report_code?.trim() || '-'}</p>
                    </div>
                    <div>
                      <span className="block text-[11px] font-medium text-slate-500">정가</span>
                      <p className={`${isBundleRegistration ? 'mt-0 py-1.5' : 'mt-1 py-2'} rounded-[8px] bg-slate-50 px-2 text-right text-sm font-semibold text-slate-700`}>
                        {formatWon(row.expectedAmount)}
                      </p>
                    </div>
                    <label className={`flex flex-col ${isBundleRegistration ? 'gap-0' : 'gap-1'}`}>
                      <span className="text-[11px] font-medium text-slate-500">할인</span>
                      <input
                        inputMode="numeric"
                        value={draft?.discountAmount ?? ''}
                        onChange={(event) => updateBundleBilling(row.course.id, {
                          discountAmount: numberInputValue(event.target.value),
                        })}
                        placeholder="0"
                        className={`${isBundleRegistration ? 'py-1.5' : 'py-2'} rounded-[8px] border border-slate-200 px-2 text-right text-sm outline-none focus:border-slate-400`}
                      />
                    </label>
                    <label className={`flex flex-col ${isBundleRegistration ? 'gap-0' : 'gap-1'}`}>
                      <span className="text-[11px] font-medium text-slate-500">할인 사유</span>
                      <input
                        value={draft?.discountReason ?? ''}
                        onChange={(event) => updateBundleBilling(row.course.id, {
                          discountReason: event.target.value,
                        })}
                        placeholder="형제 할인, 이벤트 등"
                        className={`${isBundleRegistration ? 'py-1.5' : 'py-2'} rounded-[8px] border border-slate-200 px-2 text-sm outline-none focus:border-slate-400`}
                      />
                    </label>
                    <div>
                      <span className="block text-[11px] font-medium text-slate-500">적용</span>
                      <p className={`${isBundleRegistration ? 'mt-0 py-1.5' : 'mt-1 py-2'} rounded-[8px] bg-blue-50 px-2 text-right text-sm font-bold text-blue-700`}>
                        {formatWon(row.payableAmount)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBundleCourse(row.course.id)}
                      disabled={!removable}
                      aria-label="강좌 제거"
                      className={`${isBundleRegistration ? 'h-7 w-7' : 'h-8 w-8'} inline-flex items-center justify-center rounded-[8px] text-slate-400 transition-all duration-200 ease-ios hover:bg-rose-50 hover:text-rose-600 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 disabled:active:scale-100`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>

            {isBundleRegistration ? (
              <div className="mt-1.5 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                <span>정가 <span className="text-[#1d1d1f]">{formatWon(bundleTotals.expectedAmount)}</span></span>
                <span>할인 <span className="text-rose-600">{formatWon(bundleTotals.discountAmount)}</span></span>
                <span>결제 <span className="text-blue-700">{formatWon(bundleTotals.payableAmount)}</span></span>
              </div>
            ) : null}
          </section>

          {visibleTextbooks.length > 0 ? (
            <section className="mt-4">
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-sm font-semibold text-[#1d1d1f]">구매 교재</h4>
                <span className="text-xs text-slate-500">등록과 동시에 교재를 배정합니다.</span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {visibleTextbooks.map((textbook) => {
                  const checked = createForm.textbookIds.includes(textbook.id)
                  return (
                    <label key={textbook.id} className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-sm transition-colors ${checked ? 'border-[#1d1d1f] bg-slate-50 text-[#1d1d1f]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCreateTextbook(textbook.id)}
                        className="h-4 w-4 rounded border-slate-300 text-[#1d1d1f] focus:ring-[#0071e3]"
                      />
                      <span className="font-medium">{textbook.name}</span>
                    </label>
                  )
                })}
              </div>
            </section>
          ) : null}

          <div className={isBundleRegistration ? 'mt-2' : 'mt-4'}>
            <PaymentSection
              value={createPaymentForm}
              onChange={setCreatePaymentForm}
              compact
              lockedBilling={isBundleRegistration}
              hideBillingControls={isBundleRegistration}
              hidePaymentMeta={isBundleRegistration}
              hideSummaryHeader={isBundleRegistration}
            />
          </div>
            </form>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] sm:px-6">
              <button
                type="button"
                onClick={() => setPanel('none')}
                disabled={submitting}
                className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="submit"
                form="create-student-form"
                data-payment-mode="without-payment"
                disabled={submitting || Boolean(selectedStudent?.alreadyEnrolled)}
                className="rounded-[8px] bg-slate-50 px-4 py-2.5 text-[14px] font-medium text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
              >
                {submitting ? '등록 중...' : '미수납 등록'}
              </button>
              <button
                type="submit"
                form="create-student-form"
                data-payment-mode="with-payment"
                disabled={submitting || Boolean(selectedStudent?.alreadyEnrolled)}
                className="rounded-[8px] bg-blue-600 px-5 py-2.5 text-[14px] font-medium text-white transition-all duration-200 ease-ios hover:bg-blue-700 active:scale-[0.97] active:duration-100 disabled:opacity-50 disabled:active:scale-100"
              >
                {submitting ? '저장 중...' : '등록 + 결제 저장'}
              </button>
            </div>
          </motion.aside>
        </>
      ) : null}
      </AnimatePresence>

      {panel === 'bulk' && (
        <form onSubmit={handleBulkImport} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-700">명단 붙여넣기</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                전체 명단을 먼저 검사한 뒤 정상 학생은 바로 등록하고, 오류 학생만 아래에 남겨 다시 처리합니다.
              </p>
            </div>
            {bulkImportResult ? (
              <button
                type="button"
                onClick={() => {
                  setBulkText('')
                  setBulkRowErrors([])
                  setBulkRowErrorCount(0)
                  setBulkImportResult(null)
                  setError('')
                  setMessage('')
                }}
                disabled={submitting}
                className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-50"
              >
                새 명단 입력
              </button>
            ) : null}
          </div>

          {!bulkImportResult ? (
            <>
              <p className="mt-3 text-xs text-slate-500">
                탭 구분 · 순서: <span className="font-semibold text-slate-700">기수, 학번, 이름, 연락처, 생년월일, 성별, 직렬</span>
                <span className="text-slate-400"> (1행에 헤더를 넣으면 순서 무관, 빈 칸은 기존 값 보존)</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                마지막 컬럼에 <span className="font-semibold text-slate-700">비고</span>를 추가하면 이 강좌에만 적용되는 메모를 입력할 수 있습니다.
              </p>
              <textarea
                value={bulkText}
                onChange={(e) => {
                  setBulkText(e.target.value)
                  setBulkRowErrors([])
                  setBulkRowErrorCount(0)
                  setBulkImportResult(null)
                }}
                rows={6}
                placeholder={`50\tA-001\t홍길동\t01012345678\t990315\t남\t공채\t교재 미수령\n51\tA-002\t김소방\t01087654321\t990704\t여\t경채\t`}
                className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs outline-none transition-colors focus:border-slate-400"
              />
            </>
          ) : (
            <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <div className="border-r border-slate-200 px-3 py-3 text-center">
                <p className="text-[11px] font-medium text-slate-500">전체 검사</p>
                <p className="mt-0.5 text-lg font-bold text-slate-900">{bulkImportResult.totalCount.toLocaleString()}명</p>
              </div>
              <div className="border-r border-slate-200 px-3 py-3 text-center">
                <p className="text-[11px] font-medium text-emerald-600">등록 완료</p>
                <p className="mt-0.5 text-lg font-bold text-emerald-700">{bulkImportResult.importedCount.toLocaleString()}명</p>
              </div>
              <div className="px-3 py-3 text-center">
                <p className="text-[11px] font-medium text-amber-600">확인 필요</p>
                <p className="mt-0.5 text-lg font-bold text-amber-700">{bulkImportResult.errorCount.toLocaleString()}명</p>
              </div>
            </div>
          )}

          {bulkRowErrors.length > 0 ? (
            <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3 sm:p-4" aria-label="오류 명단 검토">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-amber-900">
                    확인이 필요한 명단 {bulkRowErrorCount.toLocaleString()}명
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    노란색 항목이 마스터와 다른 값입니다. 마스터 값을 적용하거나 입력값을 직접 고친 뒤 오류 명단만 다시 등록하세요.
                  </p>
                </div>
                {bulkRowErrors.some((item) => item.master) ? (
                  <button
                    type="button"
                    onClick={applyAllMasterValues}
                    disabled={submitting}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
                  >
                    전체 마스터 값 적용
                  </button>
                ) : null}
              </div>

              <div className="mt-3 max-h-[34rem] space-y-3 overflow-y-auto pr-1">
                {bulkRowErrors.map((item, index) => (
                  <article
                    key={`${item.lineNumber}-${item.field}-${index}`}
                    className="rounded-xl border border-amber-200 bg-white p-3 shadow-sm sm:p-4"
                  >
                    <header className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-md bg-amber-100 px-2 py-1 font-bold text-amber-800">{item.lineNumber}행</span>
                          <span className="font-semibold text-slate-900">{item.input.name || '이름 미입력'}</span>
                          {item.input.examNumber ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                              {item.input.examNumber}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs font-medium leading-5 text-rose-700">{item.message}</p>
                      </div>
                      {item.master ? (
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                            학생 마스터 #{item.master.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => applyMasterToBulkImportRow(index)}
                            disabled={submitting}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
                          >
                            이 학생 마스터 값 적용
                          </button>
                        </div>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
                          일치하는 마스터 없음
                        </span>
                      )}
                    </header>

                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                      <div className="hidden grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] bg-slate-50 text-[11px] font-semibold text-slate-500 sm:grid">
                        <span className="px-3 py-2">항목</span>
                        <span className="border-l border-slate-200 px-3 py-2">붙여넣은 값 · 직접 수정</span>
                        <span className="border-l border-slate-200 px-3 py-2">학생 마스터 값</span>
                      </div>
                      {BULK_IMPORT_COMPARISON_FIELDS.map(({ inputKey, issueKey }) => {
                        const mismatched = item.fields.includes(issueKey)
                        const masterValue = item.master
                          ? getBulkImportMasterValue(item.master, inputKey)
                          : ''
                        return (
                          <div
                            key={inputKey}
                            className={`grid grid-cols-1 gap-2 border-t border-slate-200 px-3 py-2 first:border-t-0 sm:grid-cols-[76px_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3 sm:px-0 sm:py-0 ${
                              mismatched ? 'bg-amber-50/70' : 'bg-white'
                            }`}
                          >
                            <span className={`text-xs font-semibold sm:px-3 ${mismatched ? 'text-amber-800' : 'text-slate-600'}`}>
                              {getBulkImportFieldLabel(issueKey)}
                            </span>
                            <label className="min-w-0 sm:border-l sm:border-slate-200 sm:px-3 sm:py-2">
                              <span className="mb-1 block text-[10px] font-medium text-slate-400 sm:hidden">붙여넣은 값 · 직접 수정</span>
                              <input
                                value={item.input[inputKey]}
                                onChange={(event) => updateBulkImportRow(index, inputKey, event.target.value)}
                                disabled={submitting}
                                aria-label={`${item.lineNumber}행 ${getBulkImportFieldLabel(issueKey)} 입력값`}
                                className={`w-full rounded-md border bg-white px-2.5 py-1.5 text-xs outline-none transition-colors disabled:opacity-60 ${
                                  mismatched
                                    ? 'border-amber-300 focus:border-amber-500'
                                    : 'border-slate-200 focus:border-slate-400'
                                }`}
                              />
                            </label>
                            <div className="min-w-0 sm:border-l sm:border-slate-200 sm:px-3 sm:py-2">
                              <span className="mb-1 block text-[10px] font-medium text-slate-400 sm:hidden">학생 마스터 값</span>
                              <p className={`truncate text-xs ${item.master ? 'font-medium text-slate-800' : 'text-slate-400'}`}>
                                {item.master ? masterValue || '미등록' : '일치하는 마스터 없음'}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {item.fields.includes('cohort_label') || item.fields.includes('series') ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {item.fields.includes('cohort_label') ? (
                          <label className="text-[11px] font-semibold text-slate-600">
                            기수 직접 수정
                            <input
                              value={item.input.cohortLabel}
                              onChange={(event) => updateBulkImportRow(index, 'cohortLabel', event.target.value)}
                              disabled={submitting}
                              className="mt-1 w-full rounded-md border border-amber-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-amber-500"
                            />
                          </label>
                        ) : null}
                        {item.fields.includes('series') ? (
                          <label className="text-[11px] font-semibold text-slate-600">
                            직렬 직접 수정
                            <input
                              value={item.input.series}
                              onChange={(event) => updateBulkImportRow(index, 'series', event.target.value)}
                              disabled={submitting}
                              className="mt-1 w-full rounded-md border border-amber-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-amber-500"
                            />
                          </label>
                        ) : null}
                      </div>
                    ) : null}

                    {item.sourceText ? (
                      <details className="mt-3 text-[11px] text-slate-400">
                        <summary className="cursor-pointer font-medium hover:text-slate-600">원본 붙여넣기 행 보기</summary>
                        <p className="mt-1 overflow-x-auto whitespace-pre font-mono">{item.sourceText}</p>
                      </details>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <p className="mt-3 text-xs text-slate-500">교재 배정은 등록 후 `교재 배정` 탭에서 교재별로 일괄 처리할 수 있습니다.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {bulkRowErrors.length > 0 ? (
              <button
                type="button"
                onClick={() => void retryBulkImportErrors()}
                disabled={submitting}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-50 disabled:active:scale-100"
              >
                {submitting ? '오류 명단 반영 중...' : `오류 ${bulkRowErrors.length.toLocaleString()}명 다시 등록`}
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-50 disabled:active:scale-100"
              >
                {submitting ? '전체 검사 및 반영 중...' : '전체 검사 후 정상 명단 반영'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setBulkRowErrors([])
                setBulkRowErrorCount(0)
                setBulkImportResult(null)
                setPanel('none')
              }}
              disabled={submitting}
              className="text-xs text-slate-500 transition-all duration-200 ease-ios hover:underline active:scale-[0.97]"
            >
              취소
            </button>
          </div>
        </form>
      )}

      <AnimatePresence>
      {panel === 'edit' && editingId ? (
        <>
          <motion.div
            className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: panelBackdropDuration }}
            onClick={() => {
              if (!submitting && !photoUploading) {
                setPanel('none')
                setEditingId(null)
              }
            }}
          />
          <motion.form
            onSubmit={handleSaveEdit}
            role="dialog"
            aria-modal="true"
            className="fixed inset-x-4 top-8 z-[101] mx-auto max-h-[calc(100dvh-64px)] max-w-3xl overflow-hidden rounded-[18px] bg-white shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px] ring-1 ring-black/5 sm:top-16"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={motionConfig.modal}
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Edit Student</p>
                <h3 className="mt-1 truncate text-xl font-semibold leading-tight text-[#1d1d1f]">수강생 편집</h3>
                <p className="mt-1 truncate text-sm text-slate-500">{editForm.name || course.name}</p>
              </div>
              <button
                type="button"
                onClick={() => { setPanel('none'); setEditingId(null) }}
                disabled={submitting || photoUploading}
                aria-label="닫기"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7] text-slate-500 transition-all duration-200 ease-ios hover:bg-slate-200 hover:text-[#1d1d1f] active:scale-[0.94] disabled:opacity-50 disabled:active:scale-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            <div className="max-h-[calc(100dvh-220px)] overflow-y-auto px-6 py-5">
          {course.feature_photo && (
            <div className="mb-5 flex items-center gap-4 border-b border-slate-100 pb-5">
              <div className="h-[80px] w-[60px] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                {editPhotoUrl ? (
                  <Image src={editPhotoUrl} alt="증명사진" width={60} height={80} unoptimized className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-gray-300">사진 없음</div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="w-fit cursor-pointer rounded-[8px] bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97]">
                  {photoUploading ? '업로드 중...' : '사진 업로드'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={photoUploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePhotoUpload(f); e.target.value = '' }}
                  />
                </label>
                {editPhotoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      openConfirmation({
                        title: '사진을 삭제할까요?',
                        description: `${editForm.name || '선택한 수강생'} 학생의 증명사진을 삭제합니다. 삭제한 사진은 다시 복구할 수 없습니다.`,
                        confirmLabel: '사진 삭제',
                        pendingLabel: '삭제 중...',
                        tone: 'danger',
                        onConfirm: handlePhotoDelete,
                      })
                    }}
                    disabled={photoUploading}
                    className="text-left text-[10px] text-red-400 transition-all duration-200 ease-ios hover:underline active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
                  >
                    사진 삭제
                  </button>
                )}
                <p className="text-[10px] text-slate-500">JPEG/PNG/WebP · 2MB 이하</p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className={editModalLabelClass}>학번</span>
              <input value={editForm.exam_number} onChange={(e) => setEditForm((c) => ({ ...c, exam_number: e.target.value }))} placeholder="학번" className={editModalInputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={editModalLabelClass}>기수</span>
              <input
                value={editForm.cohort_number}
                onChange={(event) => setEditForm((current) => ({
                  ...current,
                  cohort_number: normalizeCohortNumberInput(event.target.value),
                }))}
                inputMode="numeric"
                placeholder="예: 50"
                className={editModalInputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={editModalLabelClass}>이름</span>
              <input value={editForm.name} onChange={(e) => setEditForm((c) => ({ ...c, name: e.target.value }))} placeholder="이름" className={editModalInputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={editModalLabelClass}>연락처</span>
              <input value={editForm.phone} onChange={(e) => setEditForm((c) => ({ ...c, phone: e.target.value }))} placeholder="연락처" className={editModalInputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={editModalLabelClass}>생년월일</span>
              <input value={editForm.birth_date} onChange={(e) => setEditForm((c) => ({ ...c, birth_date: e.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="YYMMDD" className={editModalInputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={editModalLabelClass}>성별</span>
              <GenderSelect
                value={editForm.gender}
                onChange={(gender) => setEditForm((current) => ({ ...current, gender }))}
                className={editModalInputClass}
              />
            </label>
            <div className="grid gap-4 border-t border-slate-100 pt-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-3">
              <div>
                <label className={`mb-1.5 block ${editModalLabelClass}`}>직렬</label>
                <SeriesSelector
                  options={seriesOptions}
                  valueId={editForm.series_option_id}
                  onChange={(seriesOptionId) => setEditForm((current) => ({ ...current, series_option_id: seriesOptionId }))}
                />
              </div>
              <div>
                <label className={`mb-1.5 block ${editModalLabelClass}`}>학원구분</label>
                <StudentTypeSelector
                  value={editForm.student_type}
                  onChange={(studentType) => setEditForm((current) => ({ ...current, student_type: studentType }))}
                />
              </div>
            </div>
            {customFields.map((f) => (
              <DynamicFieldInput key={f.key} field={f} value={editForm.custom_data[f.key] ?? ''} onChange={(v) => setEditForm((c) => ({ ...c, custom_data: { ...c.custom_data, [f.key]: v } }))} />
            ))}
          </div>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-[#fafafc] px-6 py-4">
              <button
                type="button"
                onClick={() => { setPanel('none'); setEditingId(null) }}
                disabled={submitting || photoUploading}
                className="rounded-[8px] px-4 py-2 text-sm font-semibold text-slate-600 transition-all duration-200 ease-ios hover:bg-slate-200 hover:text-[#1d1d1f] active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-[8px] bg-[#0071e3] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-[#0066cc] active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
              >
                {submitting ? '저장 중...' : '저장'}
              </button>
            </footer>
          </motion.form>
        </>
      ) : null}
      </AnimatePresence>

      {/* Messages */}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {message && <p className="text-xs text-emerald-600">{message}</p>}
      <ConfirmationModal
        open={Boolean(confirmation)}
        title={confirmation?.title ?? ''}
        description={confirmation?.description}
        confirmLabel={confirmation?.confirmLabel ?? '확인'}
        pendingLabel={confirmation?.pendingLabel}
        cancelLabel={confirmation?.cancelLabel}
        tone={confirmation?.tone}
        submitting={confirmSubmitting}
        onClose={() => {
          if (!confirmSubmitting) {
            setConfirmation(null)
          }
        }}
        onConfirm={() => {
          void runConfirmedAction()
        }}
      />
      {noticeModal}
      <ReceiptNoticeModal receiptNo={receiptNotice} onClose={() => setReceiptNotice('')} />
      <PinRevealModal reveal={pinReveal} onClose={() => setPinReveal(null)} onCopyPin={copyPin} />
      <SuspensionModal
        courseName={course.name}
        enrollment={suspensionTarget}
        submitting={suspensionSubmitting}
        onClose={() => {
          if (!suspensionSubmitting) {
            setSuspensionTarget(null)
          }
        }}
        onConfirm={(reason) => {
          void handleSuspend(reason)
        }}
      />

      {/* ── Tab toggle ── */}
      <div className="flex gap-6 overflow-x-auto border-b border-slate-200">
        {([
          ['manage', '관리'],
          ['receipts', '배부자료 수령현황'],
          ['textbook-assign', '교재 배정'],
          ['textbook-receipts', '교재 수령현황'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (tab === key) {
                return
              }

              deferInteractionWork(() => {
                startTransition(() => setTab(key))
              })
            }}
            className={`relative -mb-px whitespace-nowrap border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-semibold transition-colors ${
              tab === key
                ? 'text-[#1d1d1f]'
                : 'text-slate-500 hover:text-[#1d1d1f]'
            }`}
          >
            {label}
            {tab === key ? (
              <motion.div
                layoutId="students-tabs"
                className="absolute inset-x-0 bottom-0 h-0.5 bg-[#1d1d1f]"
                transition={motionConfig.tab}
              />
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Manage tab ── */}
      {tab === 'manage' && (
        <StudentsManageTable
          filtered={enrollments}
          summary={summary}
          search={search}
          statusFilter={statusFilter}
          customFields={customFields}
          attendanceEnabled={course.feature_attendance}
          currentPage={currentPage}
          pageCount={Math.max(1, Math.ceil(totalCount / pageSize))}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onSearchChange={handleSearchChange}
          onStatusFilterChange={handleStatusFilterChange}
          onOpenDetail={openPaymentDetail}
          onOpenStudentHistory={openStudentHistory}
          onEdit={startEdit}
          onResetPin={(enrollment) => {
            openConfirmation({
              title: '로그인 PIN을 다시 발급할까요?',
              description: `${enrollment.name} 학생의 기존 PIN은 더 이상 사용할 수 없고, 새 PIN으로 즉시 교체됩니다.`,
              confirmLabel: 'PIN 재발급',
              pendingLabel: 'PIN 재발급 중...',
              onConfirm: () => handleResetPinConfirmed(enrollment),
            })
          }}
          onApproveDeviceReRegistration={(enrollment) => {
            openConfirmation({
              title: '출석 기기 재등록을 승인할까요?',
              description: `${enrollment.name} 학생이 새 브라우저로 출석할 수 있게 됩니다. 이미 3개가 등록된 경우 가장 오래된 슬롯 하나를 대체합니다.`,
              confirmLabel: '기기 승인',
              pendingLabel: '승인 중...',
              onConfirm: () => handleAttendanceDeviceActionConfirmed(enrollment, 'approve_pending'),
            })
          }}
          onResetAttendanceDevice={(enrollment) => {
            openConfirmation({
              title: '출석 기기를 초기화할까요?',
              description: `${enrollment.name} 학생은 다음 출석 시 사용하는 기기로 다시 등록됩니다. 현장에서 본인 확인 후 사용해 주세요.`,
              confirmLabel: '기기 초기화',
              pendingLabel: '초기화 중...',
              tone: 'danger',
              onConfirm: () => handleAttendanceDeviceActionConfirmed(enrollment, 'reset'),
            })
          }}
          onSuspend={(enrollment) => {
            setSuspensionTarget(enrollment)
            setError('')
            setMessage('')
          }}
          onUnsuspend={(enrollment) => {
            openConfirmation({
              title: '응시 정지를 해제할까요?',
              description: `${enrollment.name} 학생이 다시 수강증과 관련 기능을 이용할 수 있게 됩니다.`,
              confirmLabel: '정지 해제',
              pendingLabel: '정지 해제 중...',
              tone: 'success',
              onConfirm: () => handleUnsuspendConfirmed(enrollment),
            })
          }}
          onDelete={(enrollment) => {
            openConfirmation({
              title: '수강생을 삭제할까요?',
              description: `${enrollment.name} 학생을 이 강의 목록에서 제거합니다.\n\n유료 결제 이력이 있으면 삭제할 수 없고, 결제 취소 또는 환불 처리로 정리해야 합니다. 0원 결제 기록도 보존 이력으로 남기며, 결제 기록이 없는 무료 등록만 삭제됩니다.`,
              confirmLabel: '삭제',
              pendingLabel: '삭제 중...',
              tone: 'danger',
              onConfirm: () => handleDeleteConfirmed(enrollment),
            })
          }}
        />
      )}

      {isMatrixTab(tab) && (
        <StudentsMatrixPanel
          tab={tab}
          matrixLoading={matrixLoading}
          matrixMaterials={matrixMaterials}
          filteredMatrixRows={filteredMatrixRows}
          matrixSearch={matrixSearch}
          filterMatId={filterMatId}
          selectedIds={selectedIds}
          bulkActionEnabled={bulkActionEnabled}
          bulkProcessing={bulkProcessing}
          bulkProgress={bulkProgress}
          onMatrixSearchChange={setMatrixSearch}
          onToggleFilterMaterial={(materialId) => {
            setFilterMatId((prev) => (prev === materialId ? null : materialId))
            setSelectedIds(new Set())
          }}
          onClearFilter={() => {
            setFilterMatId(null)
            setSelectedIds(new Set())
          }}
          onReplaceSelectedIds={setSelectedIds}
          onToggleRowSelection={(enrollmentId, checked) => {
            setSelectedIds((current) => {
              const next = new Set(current)
              if (checked) next.add(enrollmentId)
              else next.delete(enrollmentId)
              return next
            })
          }}
          onDistribute={(enrollmentId, materialId) => {
            void handleDistribute(enrollmentId, materialId)
          }}
          onDistributeAll={(enrollmentId, materialIds) => {
            void handleDistributeAllForEnrollment(enrollmentId, materialIds)
          }}
          onDistributeBatch={(items) => {
            confirmDistributionBatch(items)
          }}
          onUndo={(logId, studentName, materialName) => {
            openConfirmation({
              title: '수령 기록을 취소할까요?',
              description: `${studentName} 학생의 "${materialName}" 수령 기록을 되돌립니다.`,
              confirmLabel: '기록 취소',
              pendingLabel: '기록 취소 중...',
              tone: 'danger',
              onConfirm: () => handleUndoConfirmed(logId, studentName, materialName),
            })
          }}
          onAssignTextbook={(enrollmentId, materialId, checked) => {
            void handleAssignTextbook(enrollmentId, materialId, checked)
          }}
          onAssignAllTextbooks={(enrollmentId) => {
            void handleAssignAllTextbooks(enrollmentId)
          }}
          onRunBulkAction={() => {
            void (tab === 'receipts' ? handleBulkDistributeSelected() : handleBulkAssignSelected())
          }}
        />
      )}

      <EnrollmentPaymentDrawer
        open={Boolean(paymentDetailEnrollmentId)}
        course={course}
        enrollment={paymentDetailEnrollment}
        onClose={() => setPaymentDetailEnrollmentId(null)}
        onDataChanged={refresh}
      />
      <StudentHistoryPanel
        enrollmentId={historyEnrollmentId}
        onClose={() => setHistoryEnrollmentId(null)}
      />
    </div>
  )
}
