'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useParams } from 'next/navigation'
import { Download, Search, UserCheck, X } from 'lucide-react'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'
import { EnrollmentPaymentDrawer } from '@/components/payments/EnrollmentPaymentDrawer'
import { SeriesSelector } from '@/components/series/SeriesSelector'
import { useDeferredInteractionWork } from '@/hooks/use-deferred-interaction-work'
import {
  PaymentSection,
  createEmptyPaymentSectionValue,
  createPaymentSectionValueForAmount,
  normalizePaymentSectionPayload,
  type PaymentSectionValue,
} from '@/components/payments/PaymentSection'
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

type StudentSearchResult = {
  id: number
  name: string
  phone: string
  exam_number: string | null
  birth_date: string | null
  photo_url: string | null
  alreadyEnrolled: boolean
  latestEnrollment: {
    id: number
    courseId: number
    courseName: string
    status: Enrollment['status']
    createdAt: string
  } | null
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
      className="grid grid-cols-2 gap-1 rounded-[10px] bg-[#f5f5f7] p-1"
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-[8px] px-3 py-2 text-sm font-semibold transition-all duration-200 ease-ios active:scale-[0.97] ${
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

async function fetchStudentsPageData(courseId: number) {
  const [courseRes, enrollRes, textbookRes, seriesRes] = await Promise.all([
    fetch(`/api/courses/${courseId}`, { cache: 'no-store' }),
    fetch(`/api/enrollments?courseId=${courseId}`, { cache: 'no-store' }),
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
    textbooks: (textbookPay.materials ?? []) as Material[],
    seriesOptions: (seriesPay.options ?? []) as BranchSeriesOption[],
  }
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
  const [bulkText, setBulkText] = useState('')
  const [pinReveal, setPinReveal] = useState<PinRevealState | null>(null)
  const [suspensionTarget, setSuspensionTarget] = useState<Enrollment | null>(null)
  const [suspensionSubmitting, setSuspensionSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null)
  const [notice, setNotice] = useState<NoticeRequest | null>(null)
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
  const activeEnrollments = useMemo(
    () => enrollments.filter((enrollment) => enrollment.status === 'active'),
    [enrollments],
  )
  const activeEnrollmentsRef = useRef(activeEnrollments)
  activeEnrollmentsRef.current = activeEnrollments
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
      birth_date: student.birth_date ?? '',
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
      birth_date: '',
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

    const response = await fetch('/api/distribution/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logId }),
    })
    const payload = await response.json().catch(() => null)

    setBulkProcessing(false)
    if (!response.ok) {
      setError(payload?.error ?? '수령 기록 취소에 실패했습니다.')
      return
    }

    setMessage(`${studentName} - ${materialName} 수령 기록을 취소했습니다.`)
    await reloadCurrentMatrix()
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

    const response = await fetch('/api/students/reset-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: enrollment.student_id }),
    })
    const payload = await response.json().catch(() => null)

    setSubmitting(false)
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

  const refresh = useCallback(async () => {
    const data = await fetchStudentsPageData(courseId)
    setCourse(data.course)
    setEnrollments(data.enrollments)
    setTextbooks(data.textbooks)
    setSeriesOptions(data.seriesOptions)
  }, [courseId])

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

  // Filter + search
  const filtered = useMemo(() => {
    let list = enrollments
    if (statusFilter === 'active') {
      list = list.filter((e) => e.status === 'active' && !e.suspended_at)
    } else if (statusFilter === 'refunded') {
      list = list.filter((e) => e.status === 'refunded')
    } else if (statusFilter === 'suspended') {
      list = list.filter((e) => e.status === 'active' && Boolean(e.suspended_at))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.phone.includes(q) ||
          (e.exam_number ?? '').toLowerCase().includes(q) ||
          ENROLLMENT_STUDENT_TYPE_LABEL[e.student_type ?? 'general'].includes(search.trim()),
      )
    }
    return list
  }, [enrollments, statusFilter, search])

  const summary = useMemo(() => {
    const active = enrollments.filter((e) => e.status === 'active' && !e.suspended_at).length
    const refunded = enrollments.filter((e) => e.status === 'refunded').length
    const suspended = enrollments.filter((e) => e.status === 'active' && Boolean(e.suspended_at)).length
    return { total: enrollments.length, active, refunded, suspended }
  }, [enrollments])

  const handleDownloadStudentList = useCallback(() => {
    if (!course) {
      return
    }

    if (enrollments.length === 0) {
      setError('다운로드할 수강생이 없습니다.')
      return
    }

    const header = [
      '번호',
      '응시번호',
      '이름',
      '연락처',
      '직렬',
      '학원구분',
      ...customFields.map((field) => field.label),
      '상태',
      '등록일',
    ]
    const rows = enrollments.map((enrollment, index) => [
      index + 1,
      enrollment.exam_number ?? '',
      enrollment.name,
      formatExcelTextCell(enrollment.phone),
      enrollment.series?.trim() || (enrollment.series_group === 'career' ? '경채' : '공채'),
      ENROLLMENT_STUDENT_TYPE_LABEL[enrollment.student_type ?? 'general'],
      ...customFields.map((field) => (enrollment.custom_data ?? {})[field.key] ?? ''),
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
  }, [course, customFields, enrollments])

  const loadMatrixData = useCallback(async (mode: MatrixMode) => {
    setMatrixLoading(true)
    setError('')

    try {
      const meta = MATRIX_TAB_META[mode]
      const response = await fetch(
        `/api/distribution/receipt-matrix?courseId=${courseId}&materialType=${meta.materialType}`,
        { cache: 'no-store' },
      )
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? '매트릭스 데이터를 불러오지 못했습니다.')
      }

      const materials = (payload?.materials ?? []) as Material[]
      const logs = (payload?.logs ?? []) as Array<{
        id: number
        enrollment_id: number
        material_id: number
        distributed_at: string
      }>
      const assignments = (payload?.assignments ?? []) as TextbookAssignment[]

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
        activeEnrollmentsRef.current.map((enrollment) => ({
          enrollment,
          receipts: receiptMap.get(enrollment.id) ?? {},
          assignments: assignmentMap.get(enrollment.id) ?? {},
        })),
      )
      setFilterMatId(null)
      setSelectedIds(new Set())
      setMatrixSearch('')
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

  async function handleDistribute(enrollmentId: number, materialId: number) {
    setBulkProcessing(true)
    setError('')
    setMessage('')
    const r = await fetch('/api/distribution/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId, materialId }),
    })
    const p = await r.json().catch(() => null)
    setBulkProcessing(false)
    if (!r.ok) { setError(p?.error ?? '배부 처리에 실패했습니다.'); return }
    setMessage(`${p?.student_name ?? '수강생'} - ${p?.material_name ?? '자료'} 배부 완료`)
    await reloadCurrentMatrix()
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
          setBulkProgress((p) => ({ ...p, done: p.done + 1 }))
          if (r.ok) successCount++
          return r
        }),
      )
      if (chunk.length > 1 && results.every((r) => r.status === 'rejected')) break
    }

    setBulkProcessing(false)
    setSelectedIds(new Set())
    const failCount = ids.length - successCount
    setMessage(`일괄 배부 완료: ${successCount}건 성공${failCount > 0 ? `, ${failCount}건 실패` : ''}`)
    await reloadCurrentMatrix()
  }

  async function handleAssignTextbook(enrollmentId: number, materialId: number, checked: boolean) {
    setBulkProcessing(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/textbook-assignments', {
      method: checked ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId, materialId }),
    })
    const payload = await response.json().catch(() => null)
    setBulkProcessing(false)

    if (!response.ok) {
      setError(payload?.error ?? '교재 배정 처리에 실패했습니다.')
      return
    }

    setMessage(checked ? '교재를 배정했습니다.' : '교재 배정을 해제했습니다.')
    await reloadCurrentMatrix()
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

    setMessage('전체 교재를 배정했습니다.')
    await reloadCurrentMatrix()
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
    setMessage(`${payload?.assignments?.length ?? enrollmentIds.length}명에게 교재를 배정했습니다.`)
    await reloadCurrentMatrix()
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

    const paymentPayload = normalizePaymentSectionPayload(createPaymentForm)
    const isZeroAmountBilling = !paymentPayload.tuitionExempt
      && paymentPayload.expectedAmount === 0
      && paymentPayload.discountAmount === 0
      && paymentPayload.payableAmount === 0
    const shouldRecordPayments = shouldSavePayment && !isZeroAmountBilling
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
    const paymentsToSave = shouldRecordPayments ? paymentPayload.payments : []
    const r = await fetch('/api/enrollments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        studentId: selectedStudent?.id ?? null,
        updateSelectedStudent: Boolean(selectedStudent && selectedStudentEditable),
        name: createForm.name,
        phone: createForm.phone,
        exam_number: createForm.exam_number || null,
        birth_date: createForm.birth_date || null,
        series_option_id: createForm.series_option_id,
        student_type: createForm.student_type,
        custom_data: createForm.custom_data,
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
      }),
    })
    const p = await r.json().catch(() => null)
    if (!r.ok) {
      setSubmitting(false)
      setError(p?.error ?? '수강생 등록에 실패했습니다.')
      return
    }

    setSubmitting(false)
    setCreateForm(emptyForm(defaultSeriesOptionId))
    setCreatePaymentForm(createPaymentSectionValueForAmount(course?.tuition_amount ?? 0))
    setSelectedStudent(null)
    setSelectedStudentEditable(false)
    if (studentLookupInputTimerRef.current !== null) {
      window.clearTimeout(studentLookupInputTimerRef.current)
      studentLookupInputTimerRef.current = null
    }
    setStudentLookupQuery('')
    setStudentLookupResults([])
    if (p?.generated_pin) {
      setPinReveal({
        title: '신규 학생 PIN',
        pins: [{
          name: (p.enrollment as Enrollment).name,
          phone: (p.enrollment as Enrollment).phone,
          pin: p.generated_pin as string,
        }],
      })
    }
    const wasReactivated = Boolean(p?.reactivated)
    const noChargeMessage = paymentPayload.tuitionExempt
      ? '수강생을 등록하고 수납 면제로 기록했습니다.'
      : '0원 강좌 수강생을 등록했습니다.'
    const reactivatedNoChargeMessage = paymentPayload.tuitionExempt
      ? '환불 완료 수강생을 다시 활성 등록으로 전환하고 수납 면제로 기록했습니다.'
      : '환불 완료 수강생을 다시 활성 등록으로 전환하고 납부할 금액 없음으로 기록했습니다.'
    setMessage(
      wasReactivated
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
  }

  async function handleBulkImport(ev: FormEvent) {
    ev.preventDefault()
    if (!bulkText.trim()) { setError('명단을 입력해 주세요.'); return }
    setSubmitting(true)
    setError('')
    setMessage('')
    const r = await fetch('/api/enrollments/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, text: bulkText }),
    })
    const p = await r.json().catch(() => null)
    setSubmitting(false)
    if (!r.ok) { setError(p?.error ?? '대량 등록에 실패했습니다.'); return }
    setBulkText('')
    if (Array.isArray(p?.generated_pins) && p.generated_pins.length > 0) {
      setPinReveal({
        title: '일괄 생성 학생 PIN',
        pins: p.generated_pins as Array<{ name: string; phone: string; pin: string }>,
      })
    }
    setMessage(`${p?.count ?? 0}건 반영했습니다.`)
    setPanel('none')
    await refresh().catch(() => null)
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

  async function handlePhotoUpload(file: File) {
    if (!editingId) return
    setPhotoUploading(true)
    setError('')
    const formData = new FormData()
    formData.append('photo', file)
    const r = await fetch(`/api/enrollments/${editingId}/photo`, { method: 'POST', body: formData })
    const p = await r.json().catch(() => null)
    setPhotoUploading(false)
    if (!r.ok) { setError(p?.error ?? '사진 업로드 실패'); return }
    setEditPhotoUrl(p.photo_url)
    setEnrollments((c) => c.map((x) => x.id === editingId ? { ...x, photo_url: p.photo_url } : x))
    setMessage('사진을 업로드했습니다.')
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
    const r = await fetch(`/api/enrollments/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        phone: editForm.phone,
        exam_number: editForm.exam_number || null,
        birth_date: editForm.birth_date || null,
        series_option_id: editForm.series_option_id,
        student_type: editForm.student_type,
        custom_data: editForm.custom_data,
      }),
    })
    const p = await r.json().catch(() => null)
    setSubmitting(false)
    if (!r.ok) { setError(p?.error ?? '수정에 실패했습니다.'); return }
    const next = p.enrollment as Enrollment
    setEnrollments((c) => c.map((x) => (x.id === next.id ? next : x)))
    setPanel('none'); setEditingId(null)
    setMessage('수강생 정보를 수정했습니다.')
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
              }
              setPanel(opening ? 'create' : 'none')
            }}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97] active:duration-100"
          >
            + 수강생 등록
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === 'bulk' ? 'none' : 'bulk')}
            className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97]"
          >
            명단 붙여넣기
          </button>
          <button
            type="button"
            onClick={handleDownloadStudentList}
            disabled={enrollments.length === 0}
            title={enrollments.length === 0 ? '다운로드할 수강생이 없습니다.' : '현재 강좌의 전체 수강생 명단을 CSV로 다운로드'}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-50 disabled:active:scale-100"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            명단 다운로드
          </button>
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
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">New Student</p>
                <h3 className="mt-1.5 text-[28px] font-semibold text-[#1d1d1f]">수강생 등록</h3>
                <p className="mt-2 truncate text-sm text-slate-500">{course.name}</p>
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
            <form id="create-student-form" onSubmit={handleCreate} className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-6 sm:px-6">
          <section>
            <div className="flex items-end justify-between gap-3">
              <label className="min-w-0 flex-1">
                <span className="text-[11px] font-medium text-slate-500">기존 수강생 검색</span>
                <div className="mt-2 flex items-center gap-2 rounded-[8px] bg-white px-3 py-2.5 border border-slate-200 transition focus-within:border-slate-400">
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
                          <span className="ml-2 text-xs font-medium text-slate-500">{student.exam_number || '-'}</span>
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

          <section className="mt-8">
            <h4 className="text-sm font-semibold text-[#1d1d1f]">인적 사항</h4>
            <p className="mt-0.5 text-xs text-slate-500">학번·이름·연락처는 필수입니다.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">학번</span>
                <input value={createForm.exam_number} onChange={(e) => setCreateForm((c) => ({ ...c, exam_number: e.target.value }))} disabled={selectedStudentLocked} placeholder="예: A-001" className="rounded-[8px] bg-white px-3 py-2.5 text-sm border border-slate-200 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">이름</span>
                <input value={createForm.name} onChange={(e) => setCreateForm((c) => ({ ...c, name: e.target.value }))} disabled={selectedStudentLocked} placeholder="홍길동" className="rounded-[8px] bg-white px-3 py-2.5 text-sm border border-slate-200 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">연락처</span>
                <input value={createForm.phone} onChange={(e) => setCreateForm((c) => ({ ...c, phone: e.target.value }))} disabled={selectedStudentLocked} placeholder="010-0000-0000" className="rounded-[8px] bg-white px-3 py-2.5 text-sm border border-slate-200 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">생년월일</span>
                <input value={createForm.birth_date} onChange={(e) => setCreateForm((c) => ({ ...c, birth_date: e.target.value.replace(/\D/g, '').slice(0, 6) }))} disabled={selectedStudentLocked} placeholder="YYMMDD" className="rounded-[8px] bg-white px-3 py-2.5 text-sm border border-slate-200 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500" />
              </label>
              <div className="grid gap-3 sm:col-span-3 sm:grid-cols-[max-content_220px] sm:justify-start">
                <div>
                  <span className="mb-2 block text-[11px] font-medium text-slate-500">직렬</span>
                  <SeriesSelector
                    options={seriesOptions}
                    valueId={createForm.series_option_id}
                    onChange={(seriesOptionId) => setCreateForm((current) => ({ ...current, series_option_id: seriesOptionId }))}
                  />
                </div>
                <div>
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

          {visibleTextbooks.length > 0 ? (
            <section className="mt-8">
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

          <div className="mt-8">
            <PaymentSection value={createPaymentForm} onChange={setCreatePaymentForm} />
          </div>
            </form>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3.5 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] sm:px-6">
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
                {submitting ? '등록 중...' : '결제 없이 등록'}
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
          <h3 className="text-sm font-bold text-gray-700">명단 붙여넣기</h3>
          <p className="mt-1 text-xs text-slate-500">
            탭 구분 · 순서: <span className="font-semibold text-slate-700">학번, 이름, 연락처, 생년월일{customFields.map((f) => `, ${f.label}`).join('')}</span>
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={`A-001\t홍길동\t01012345678\t990315\nA-002\t김소방\t01087654321`}
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-slate-400"
          />
          <p className="mt-3 text-xs text-slate-500">교재 배정은 등록 후 `교재 배정` 탭에서 교재별로 일괄 처리할 수 있습니다.</p>
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" disabled={submitting} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-50 disabled:active:scale-100">{submitting ? '반영 중...' : '일괄 반영'}</button>
            <button type="button" onClick={() => setPanel('none')} className="text-xs text-slate-500 transition-all duration-200 ease-ios hover:underline active:scale-[0.97]">취소</button>
          </div>
        </form>
      )}

      {panel === 'edit' && editingId && (
        <form onSubmit={handleSaveEdit} className="rounded-2xl bg-slate-50 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700">수강생 편집</h3>
            <button type="button" onClick={() => { setPanel('none'); setEditingId(null) }} className="text-xs text-slate-500 transition-all duration-200 ease-ios hover:underline active:scale-[0.97]">닫기</button>
          </div>

          {course.feature_photo && (
            <div className="mt-3 flex items-center gap-4">
              <div className="h-[80px] w-[60px] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                {editPhotoUrl ? (
                  <Image src={editPhotoUrl} alt="증명사진" width={60} height={80} unoptimized className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-gray-300">사진 없음</div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="cursor-pointer rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-200 active:scale-[0.97]">
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

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <input value={editForm.exam_number} onChange={(e) => setEditForm((c) => ({ ...c, exam_number: e.target.value }))} placeholder="학번" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={editForm.name} onChange={(e) => setEditForm((c) => ({ ...c, name: e.target.value }))} placeholder="이름" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={editForm.phone} onChange={(e) => setEditForm((c) => ({ ...c, phone: e.target.value }))} placeholder="연락처" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <input value={editForm.birth_date} onChange={(e) => setEditForm((c) => ({ ...c, birth_date: e.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="생년월일(YYMMDD)" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400" />
            <div className="grid gap-3 sm:col-span-3 sm:grid-cols-[max-content_220px] sm:justify-start">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">직렬</label>
                <SeriesSelector
                  options={seriesOptions}
                  valueId={editForm.series_option_id}
                  onChange={(seriesOptionId) => setEditForm((current) => ({ ...current, series_option_id: seriesOptionId }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">학원구분</label>
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
          <div className="mt-3">
            <button type="submit" disabled={submitting} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-50 disabled:active:scale-100">{submitting ? '저장 중...' : '저장'}</button>
          </div>
        </form>
      )}

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
          filtered={filtered}
          summary={summary}
          search={search}
          statusFilter={statusFilter}
          customFields={customFields}
          attendanceEnabled={course.feature_attendance}
          onSearchChange={setSearch}
          onStatusFilterChange={setStatusFilter}
          onOpenDetail={openPaymentDetail}
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
              description: `${enrollment.name} 학생을 이 강의 목록에서 제거합니다.\n\n결제 기록, 정산 이력, 출결/좌석 기록처럼 보존해야 하는 이력이 있으면 삭제할 수 없습니다.`,
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
    </div>
  )
}
