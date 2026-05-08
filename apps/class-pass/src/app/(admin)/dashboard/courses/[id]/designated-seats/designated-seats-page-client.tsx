'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { FormEvent } from 'react'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ConfirmationModal } from '@/components/admin/confirmation-modal'
import { SeatEditModal } from '@/components/designated-seat/SeatEditModal'
import { SeatGrid } from '@/components/designated-seat/SeatGrid'
import { useTenantConfig } from '@/components/TenantProvider'
import { useDeferredInteractionWork } from '@/hooks/use-deferred-interaction-work'
import { defaultSeatLabel, sortSeats } from '@/lib/designated-seat/layout'
import { useMotionConfig } from '@/lib/motion'
import { withTenantPrefix } from '@/lib/tenant'
import type {
  Course,
  CourseRoom,
  DesignatedSeat,
  DesignatedSeatLayout,
  DesignatedSeatReservation,
  Enrollment,
} from '@/types/database'
import { DesignatedSeatAttendancePanel } from './designated-seat-attendance-panel'

type TabMode = 'editor' | 'status' | 'attendance' | 'rooms'
type ManualSeatConfirmation =
  | {
    type: 'clear'
    enrollmentId: number
    studentName: string
    seatLabel: string
  }
  | {
    type: 'assign'
    seatId: number
    enrollmentId: number
    studentName: string
    seatLabel: string
  }

type DisplayDeviceRow = {
  id: number
  course_id?: number
  slot_id?: number | null
  device_name: string
  registered_by: string | null
  last_seen_at: string | null
  created_at: string
}

type DisplayScheduleRow = {
  id?: number
  dayOfWeek: number
  startTime: string
  endTime: string
  label: string
  isActive: boolean
}

type DisplaySlotRow = {
  id: number
  division: string
  slot_key: string
  label: string
  course_id: number | null
  is_active: boolean
  displayUrl: string
  course: {
    id: number
    name: string
    status: string
    enrolled_from: string | null
    enrolled_until: string | null
    feature_designated_seat: boolean
  } | null
  created_at: string
  updated_at: string
}

type RegistrationCodeState = {
  code: string
  expiresAt: string
  deviceName: string
} | null

export type AdminPayload = {
  course: Course
  rooms: CourseRoom[]
  activeRoomId: number
  layout: DesignatedSeatLayout | null
  seats: DesignatedSeat[]
  reservations: DesignatedSeatReservation[]
  enrollments: Enrollment[]
  activeDisplaySession: {
    id: number
    expires_at: string
    last_seen_at: string | null
    source?: 'manual' | 'schedule'
    display_slot_id?: number | null
    room_id?: number | null
  } | null
}

type SeatDraft = DesignatedSeat & {
  persistedId: number | null
}

type InitialViewState = {
  course: Course
  rooms: CourseRoom[]
  activeRoomId: number
  columns: number
  rows: number
  aisleInput: string
  featureEnabled: boolean
  seatOpen: boolean
  seatDrafts: SeatDraft[]
  reservations: DesignatedSeatReservation[]
  enrollments: Enrollment[]
  activeDisplaySession: AdminPayload['activeDisplaySession']
}

type CourseDesignatedSeatsPageProps = {
  initialPayload?: AdminPayload | null
  initialError?: string
  initialLoaded?: boolean
}

const DEFAULT_COLUMNS = 8
const DEFAULT_ROWS = 5
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const DISPLAY_SCHEDULE_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function createDefaultDisplaySchedule(dayOfWeek: number): DisplayScheduleRow {
  return {
    dayOfWeek,
    startTime: '06:00',
    endTime: '22:00',
    label: '조기 입실 QR',
    isActive: false,
  }
}

function sortDisplaySchedules(schedules: DisplayScheduleRow[]) {
  return [...schedules].sort((left, right) => {
    const leftDayIndex = DISPLAY_SCHEDULE_DAY_ORDER.indexOf(left.dayOfWeek)
    const rightDayIndex = DISPLAY_SCHEDULE_DAY_ORDER.indexOf(right.dayOfWeek)
    if (leftDayIndex !== rightDayIndex) {
      return leftDayIndex - rightDayIndex
    }

    return left.startTime.localeCompare(right.startTime)
  })
}

function getDefaultDisplaySchedules(): DisplayScheduleRow[] {
  return DISPLAY_SCHEDULE_DAY_ORDER.map(createDefaultDisplaySchedule)
}

function ensureWeeklyDisplaySchedules(schedules: DisplayScheduleRow[]) {
  const existingDays = new Set(schedules.map((schedule) => schedule.dayOfWeek))
  const missingSchedules = DISPLAY_SCHEDULE_DAY_ORDER
    .filter((dayOfWeek) => !existingDays.has(dayOfWeek))
    .map(createDefaultDisplaySchedule)

  return sortDisplaySchedules([...schedules, ...missingSchedules])
}

function normalizeDisplayTime(value: string | null | undefined) {
  return (value ?? '06:00').slice(0, 5)
}

function normalizeDisplaySlotKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function getToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function buildSeatDrafts(columns: number, rows: number, seats: DesignatedSeat[]) {
  const seatMap = new Map(seats.map((seat) => [`${seat.position_x}:${seat.position_y}`, seat]))
  const next: SeatDraft[] = []

  for (let y = 1; y <= rows; y += 1) {
    for (let x = 1; x <= columns; x += 1) {
      const existing = seatMap.get(`${x}:${y}`)
      const existingDbId = existing?.id != null && existing.id > 0 ? existing.id : null
      const persistedId = (existing as SeatDraft | undefined)?.persistedId ?? existingDbId
      next.push({
        id: existingDbId ?? -(y * 100 + x),
        persistedId,
        course_id: existing?.course_id ?? 0,
        room_id: existing?.room_id ?? 0,
        label: existing?.label ?? defaultSeatLabel(x, y),
        position_x: x,
        position_y: y,
        is_active: existing?.is_active ?? true,
        created_at: existing?.created_at ?? '',
        updated_at: existing?.updated_at ?? '',
      })
    }
  }

  return sortSeats(next)
}

function getInitialViewState(payload: AdminPayload | null | undefined): InitialViewState | null {
  if (!payload) {
    return null
  }

  const columns = payload.layout?.columns ?? DEFAULT_COLUMNS
  const rows = payload.layout?.rows ?? DEFAULT_ROWS
  const aisleInput = (payload.layout?.aisle_columns ?? []).join(',')
  const featureEnabled = payload.course.feature_designated_seat
  const seatOpen = payload.course.designated_seat_open

  return {
    course: payload.course,
    rooms: payload.rooms,
    activeRoomId: payload.activeRoomId,
    columns,
    rows,
    aisleInput,
    featureEnabled,
    seatOpen,
    seatDrafts: buildSeatDrafts(columns, rows, payload.seats),
    reservations: payload.reservations,
    enrollments: payload.enrollments,
    activeDisplaySession: payload.activeDisplaySession,
  }
}

async function fetchAdminData(courseId: number, date?: string, roomId?: number | null) {
  const query = new URLSearchParams({ courseId: String(courseId) })
  if (roomId) {
    query.set('roomId', String(roomId))
  }
  if (date) {
    query.set('date', date)
  }
  const response = await fetch(`/api/designated-seats/admin?${query.toString()}`, { cache: 'no-store' })
  const payload = (await response.json().catch(() => null)) as AdminPayload | { error?: string } | null
  if (!response.ok) {
    throw new Error(payload && 'error' in payload ? payload.error ?? '지정좌석 정보를 불러오지 못했습니다.' : '지정좌석 정보를 불러오지 못했습니다.')
  }

  return payload as AdminPayload
}

const TAB_ITEMS: Array<{ key: TabMode; label: string }> = [
  { key: 'editor', label: '좌석 맵 편집' },
  { key: 'status', label: '배정 현황' },
  { key: 'attendance', label: '출석 현황' },
  { key: 'rooms', label: '강의실 관리' },
]

export default function CourseDesignatedSeatsPage({
  initialPayload = null,
  initialError = '',
  initialLoaded = Boolean(initialPayload),
}: CourseDesignatedSeatsPageProps) {
  const params = useParams<{ id: string }>()
  const tenant = useTenantConfig()
  const motionConfig = useMotionConfig()
  const deferInteractionWork = useDeferredInteractionWork()
  const courseId = Number(params.id)
  const initialState = getInitialViewState(initialPayload)
  const initialSnapshot = initialState
    ? JSON.stringify({
      drafts: initialState.seatDrafts,
      cols: initialState.columns,
      rws: initialState.rows,
      aisle: initialState.aisleInput,
      feat: initialState.featureEnabled,
      open: initialState.seatOpen,
    })
    : ''

  const [tab, setTab] = useState<TabMode>('editor')
  const [course, setCourse] = useState<Course | null>(initialState?.course ?? null)
  const [rooms, setRooms] = useState<CourseRoom[]>(initialState?.rooms ?? [])
  const [activeRoomId, setActiveRoomId] = useState<number | null>(initialState?.activeRoomId ?? null)
  const [roomNameInputs, setRoomNameInputs] = useState<Record<number, string>>(() => (
    Object.fromEntries((initialState?.rooms ?? []).map((room) => [room.id, room.name]))
  ))
  const [newRoomName, setNewRoomName] = useState('')
  const [roomWorking, setRoomWorking] = useState(false)
  const [roomDeleteTarget, setRoomDeleteTarget] = useState<CourseRoom | null>(null)
  const [columns, setColumns] = useState(initialState?.columns ?? DEFAULT_COLUMNS)
  const [rows, setRows] = useState(initialState?.rows ?? DEFAULT_ROWS)
  const [aisleInput, setAisleInput] = useState(initialState?.aisleInput ?? '')
  const [featureEnabled, setFeatureEnabled] = useState(initialState?.featureEnabled ?? false)
  const [seatOpen, setSeatOpen] = useState(initialState?.seatOpen ?? false)
  const [seatDrafts, setSeatDrafts] = useState<SeatDraft[]>(initialState?.seatDrafts ?? [])
  const [reservations, setReservations] = useState<DesignatedSeatReservation[]>(initialState?.reservations ?? [])
  const [enrollments, setEnrollments] = useState<Enrollment[]>(initialState?.enrollments ?? [])
  const [activeDisplaySession, setActiveDisplaySession] = useState<AdminPayload['activeDisplaySession']>(
    initialState?.activeDisplaySession ?? null,
  )
  const [displayUrl, setDisplayUrl] = useState('')
  const [displayDuration, setDisplayDuration] = useState(24)
  const [displaySlots, setDisplaySlots] = useState<DisplaySlotRow[]>([])
  const [selectedDisplaySlotKey, setSelectedDisplaySlotKey] = useState('')
  const [slotKeyInput, setSlotKeyInput] = useState('basic-theory')
  const [slotLabelInput, setSlotLabelInput] = useState('기본이론반 QR')
  const [multiDisplayUrl, setMultiDisplayUrl] = useState('')
  const [displayDevices, setDisplayDevices] = useState<DisplayDeviceRow[]>([])
  const [displaySchedules, setDisplaySchedules] = useState<DisplayScheduleRow[]>(getDefaultDisplaySchedules)
  const [displayDeviceName, setDisplayDeviceName] = useState('QR PC 1')
  const [registrationCode, setRegistrationCode] = useState<RegistrationCodeState>(null)
  const [displayConfigLoading, setDisplayConfigLoading] = useState(false)
  const [displayConfigSaving, setDisplayConfigSaving] = useState(false)
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null)
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<number>>(new Set())
  const [editorModalSeatId, setEditorModalSeatId] = useState<number | null>(null)
  const [manualEnrollmentId, setManualEnrollmentId] = useState<number | null>(null)
  const [modalSeatId, setModalSeatId] = useState<number | null>(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [loading, setLoading] = useState(!initialLoaded)
  const [saving, setSaving] = useState(false)
  const [working, setWorking] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [reservationDate, setReservationDate] = useState(getToday())
  const [message, setMessage] = useState('')
  const [error, setError] = useState(initialError)
  const [isDirty, setIsDirty] = useState(false)
  const [pendingTab, setPendingTab] = useState<TabMode | null>(null)
  const [confirmingPendingTab, setConfirmingPendingTab] = useState(false)
  const [manualSeatConfirmation, setManualSeatConfirmation] = useState<ManualSeatConfirmation | null>(null)
  const [displayStopConfirmOpen, setDisplayStopConfirmOpen] = useState(false)
  const savedSnapshotRef = useRef(initialSnapshot)
  const roomRequestRef = useRef(0)
  const displayConfigRequestRef = useRef(0)
  const activeRoomIdRef = useRef<number | null>(activeRoomId)
  activeRoomIdRef.current = activeRoomId
  const courseDisplayUrl = useMemo(() => {
    if (typeof window === 'undefined' || !Number.isInteger(courseId) || courseId <= 0) {
      return ''
    }

    return `${window.location.origin}${withTenantPrefix(`/designated-seat-display/${courseId}`, tenant.type)}`
  }, [courseId, tenant.type])

  useEffect(() => {
    if (courseDisplayUrl && !displayUrl) {
      setDisplayUrl(courseDisplayUrl)
    }
  }, [courseDisplayUrl, displayUrl])

  useEffect(() => {
    setDisplayUrl(courseDisplayUrl)
    setActiveDisplaySession(null)
    setRegistrationCode(null)
  }, [activeRoomId, courseDisplayUrl])

  const selectedDisplaySlot = useMemo(
    () => displaySlots.find((slot) => slot.slot_key === selectedDisplaySlotKey) ?? null,
    [displaySlots, selectedDisplaySlotKey],
  )

  const activeDisplayTargetBody = useMemo(() => (
    selectedDisplaySlotKey
      ? { slotKey: selectedDisplaySlotKey, roomId: activeRoomId ?? undefined }
      : { courseId, roomId: activeRoomId ?? undefined }
  ), [activeRoomId, courseId, selectedDisplaySlotKey])
  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) ?? rooms[0] ?? null,
    [activeRoomId, rooms],
  )
  const sortedRooms = useMemo(
    () => [...rooms].sort((left, right) => left.sort_order - right.sort_order || left.id - right.id),
    [rooms],
  )

  function markSnapshot(drafts: SeatDraft[], cols: number, rws: number, aisle: string, feat: boolean, open: boolean) {
    savedSnapshotRef.current = JSON.stringify({ drafts, cols, rws, aisle, feat, open })
  }

  function checkDirty(drafts: SeatDraft[], cols: number, rws: number, aisle: string, feat: boolean, open: boolean) {
    const current = JSON.stringify({ drafts, cols, rws, aisle, feat, open })
    setIsDirty(current !== savedSnapshotRef.current)
  }

  useEffect(() => {
    if (!isDirty) return

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const applyPayload = useCallback((payload: AdminPayload) => {
    const cols = payload.layout?.columns ?? DEFAULT_COLUMNS
    const rws = payload.layout?.rows ?? DEFAULT_ROWS
    const aisle = (payload.layout?.aisle_columns ?? []).join(',')
    const feat = payload.course.feature_designated_seat
    const open = payload.course.designated_seat_open
    const drafts = buildSeatDrafts(cols, rws, payload.seats)

    setCourse(payload.course)
    setRooms(payload.rooms)
    setActiveRoomId(payload.activeRoomId)
    setRoomNameInputs(Object.fromEntries(payload.rooms.map((room) => [room.id, room.name])))
    setColumns(cols)
    setRows(rws)
    setAisleInput(aisle)
    setFeatureEnabled(feat)
    setSeatOpen(open)
    setSeatDrafts(drafts)
    setReservations(payload.reservations)
    setEnrollments(payload.enrollments)
    setActiveDisplaySession(payload.activeDisplaySession)
    setSelectedSeatId(null)
    setSelectedSeatIds(new Set())
    setEditorModalSeatId(null)
    markSnapshot(drafts, cols, rws, aisle, feat, open)
    setIsDirty(false)
  }, [])

  async function refresh(date = reservationDate, roomId = activeRoomId) {
    const payload = await fetchAdminData(courseId, date, roomId)
    if (payload.activeRoomId !== activeRoomIdRef.current) {
      return
    }
    applyPayload(payload)
  }

  async function loadRoom(roomId: number, date = reservationDate) {
    const requestId = ++roomRequestRef.current
    setStatusLoading(true)
    setError('')
    setMessage('')
    try {
      const payload = await fetchAdminData(courseId, date, roomId)
      if (requestId !== roomRequestRef.current) {
        return
      }
      applyPayload(payload)
    } catch (reason) {
      if (requestId === roomRequestRef.current) {
        setError(reason instanceof Error ? reason.message : '강의실 정보를 불러오지 못했습니다.')
      }
    } finally {
      if (requestId === roomRequestRef.current) {
        setStatusLoading(false)
      }
    }
  }

  async function handleSelectRoom(roomId: number) {
    if (roomId === activeRoomId) {
      return
    }
    if (isDirty) {
      setError('좌석 맵 변경 사항을 저장하거나 탭을 이동해 되돌린 뒤 강의실을 변경해 주세요.')
      return
    }

    await loadRoom(roomId)
  }

  async function handleEditRoom(roomId: number) {
    if (roomId !== activeRoomId) {
      if (isDirty) {
        setError('좌석 맵 변경 사항을 저장하거나 탭을 이동해 되돌린 뒤 강의실을 변경해 주세요.')
        return
      }
      await loadRoom(roomId)
    }
    applyTabChange('editor')
  }

  async function handleCreateRoom(event: FormEvent) {
    event.preventDefault()
    const name = newRoomName.trim()
    if (!name) {
      setError('강의실 이름을 입력해 주세요.')
      return
    }

    setRoomWorking(true)
    setError('')
    setMessage('')
    const response = await fetch(`/api/courses/${courseId}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const result = await response.json().catch(() => null) as { room?: CourseRoom; rooms?: CourseRoom[]; error?: string } | null
    setRoomWorking(false)

    if (!response.ok) {
      setError(result?.error ?? '강의실을 생성하지 못했습니다.')
      return
    }

    setNewRoomName('')
    setMessage('강의실을 추가했습니다.')
    setRooms(result?.rooms ?? rooms)
    setRoomNameInputs(Object.fromEntries((result?.rooms ?? rooms).map((room) => [room.id, room.name])))
    const nextRoomId = result?.room?.id ?? activeRoomId ?? rooms[0]?.id
    if (nextRoomId) {
      await loadRoom(nextRoomId)
    }
  }

  async function handleSaveRoom(room: CourseRoom) {
    const name = (roomNameInputs[room.id] ?? room.name).trim()
    if (!name) {
      setError('강의실 이름을 입력해 주세요.')
      return
    }

    setRoomWorking(true)
    setError('')
    setMessage('')
    const response = await fetch(`/api/courses/${courseId}/rooms`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: room.id, name }),
    })
    const result = await response.json().catch(() => null) as { rooms?: CourseRoom[]; error?: string } | null
    setRoomWorking(false)

    if (!response.ok) {
      setError(result?.error ?? '강의실을 수정하지 못했습니다.')
      return
    }

    const nextRooms = result?.rooms ?? rooms.map((entry) => (entry.id === room.id ? { ...entry, name } : entry))
    setRooms(nextRooms)
    setRoomNameInputs(Object.fromEntries(nextRooms.map((entry) => [entry.id, entry.name])))
    setMessage('강의실 이름을 저장했습니다.')
    if (room.id === activeRoomId) {
      await refresh(reservationDate, room.id).catch(() => null)
    }
  }

  async function handleToggleRoomOpen(room: CourseRoom, isOpen: boolean) {
    setRoomWorking(true)
    setError('')
    setMessage('')
    const response = await fetch(`/api/courses/${courseId}/rooms`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: room.id, isOpen }),
    })
    const result = await response.json().catch(() => null) as { rooms?: CourseRoom[]; error?: string } | null
    setRoomWorking(false)

    if (!response.ok) {
      setError(result?.error ?? '강의실 신청 상태를 변경하지 못했습니다.')
      return
    }

    const nextRooms = result?.rooms ?? rooms.map((entry) => (
      entry.id === room.id ? { ...entry, is_open: isOpen } : entry
    ))
    setRooms(nextRooms)
    setMessage(isOpen ? '강의실 좌석 신청을 열었습니다.' : '강의실 좌석 신청을 마감했습니다.')
    if (room.id === activeRoomId) {
      await refresh(reservationDate, room.id).catch(() => null)
      await loadDisplayConfig(selectedDisplaySlotKey).catch(() => null)
    }
  }

  async function handleMoveRoom(room: CourseRoom, direction: -1 | 1) {
    const sortedRooms = [...rooms].sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
    const currentIndex = sortedRooms.findIndex((entry) => entry.id === room.id)
    const target = sortedRooms[currentIndex + direction]
    if (!target) {
      return
    }

    setRoomWorking(true)
    setError('')
    setMessage('')
    const currentResponse = await fetch(`/api/courses/${courseId}/rooms`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: room.id, sortOrder: target.sort_order }),
    })
    const currentResult = await currentResponse.json().catch(() => null) as { rooms?: CourseRoom[]; error?: string } | null
    if (!currentResponse.ok) {
      setRoomWorking(false)
      setError(currentResult?.error ?? '강의실 순서를 변경하지 못했습니다.')
      return
    }

    const targetResponse = await fetch(`/api/courses/${courseId}/rooms`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: target.id, sortOrder: room.sort_order }),
    })
    const targetResult = await targetResponse.json().catch(() => null) as { rooms?: CourseRoom[]; error?: string } | null
    if (!targetResponse.ok) {
      await fetch(`/api/courses/${courseId}/rooms`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: room.id, sortOrder: room.sort_order }),
      }).catch(() => null)
      setRoomWorking(false)
      setError(targetResult?.error ?? '강의실 순서를 변경하지 못했습니다.')
      return
    }
    setRoomWorking(false)

    const nextRooms = targetResult?.rooms ?? currentResult?.rooms ?? sortedRooms
    setRooms(nextRooms)
    setRoomNameInputs(Object.fromEntries(nextRooms.map((entry) => [entry.id, entry.name])))
    setMessage('강의실 순서를 변경했습니다.')
  }

  async function handleDeleteRoomConfirmed() {
    const room = roomDeleteTarget
    if (!room) {
      return
    }

    setRoomWorking(true)
    setError('')
    setMessage('')
    const response = await fetch(`/api/courses/${courseId}/rooms`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: room.id }),
    })
    const result = await response.json().catch(() => null) as { rooms?: CourseRoom[]; error?: string } | null
    setRoomWorking(false)
    setRoomDeleteTarget(null)

    if (!response.ok) {
      setError(result?.error ?? '강의실을 삭제하지 못했습니다.')
      return
    }

    const nextRooms = result?.rooms ?? rooms.filter((entry) => entry.id !== room.id)
    setRooms(nextRooms)
    setRoomNameInputs(Object.fromEntries(nextRooms.map((entry) => [entry.id, entry.name])))
    setMessage('강의실을 삭제했습니다.')
    if (room.id === activeRoomId) {
      const nextRoomId = nextRooms[0]?.id
      if (nextRoomId) {
        await loadRoom(nextRoomId)
      }
    }
  }

  const loadDisplayConfig = useCallback(async (preferredSlotKey?: string) => {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return
    }

    const requestId = ++displayConfigRequestRef.current
    const requestRoomId = activeRoomId
    const isStale = () => requestId !== displayConfigRequestRef.current || activeRoomIdRef.current !== requestRoomId

    setDisplayConfigLoading(true)
    try {
      const slotsQuery = `courseId=${courseId}`
      const slotsResponse = await fetch(`/api/designated-seats/admin/display-slots?${slotsQuery}`, { cache: 'no-store' })
      const slotsPayload = await slotsResponse.json().catch(() => null) as {
        slots?: DisplaySlotRow[]
        currentCourseSlotKey?: string | null
        multiDisplayUrl?: string
        error?: string
      } | null

      if (!slotsResponse.ok) {
        throw new Error(slotsPayload?.error ?? '표시 슬롯 목록을 불러오지 못했습니다.')
      }

      const slots = slotsPayload?.slots ?? []
      const nextSlotKey = preferredSlotKey !== undefined
        ? preferredSlotKey && slots.some((slot) => slot.slot_key === preferredSlotKey)
          ? preferredSlotKey
          : ''
        : selectedDisplaySlotKey && slots.some((slot) => slot.slot_key === selectedDisplaySlotKey)
          ? selectedDisplaySlotKey
          : slotsPayload?.currentCourseSlotKey ?? ''
      setSelectedDisplaySlotKey(nextSlotKey)

      const selectedSlot = nextSlotKey
        ? slots.find((slot) => slot.slot_key === nextSlotKey) ?? null
        : null

      const targetQuery = nextSlotKey
        ? `slotKey=${encodeURIComponent(nextSlotKey)}`
        : `courseId=${courseId}`
      const roomScopedTargetQuery = activeRoomId
        ? `${targetQuery}&roomId=${encodeURIComponent(String(activeRoomId))}`
        : targetQuery
      const [devicesResponse, schedulesResponse, displayResponse] = await Promise.all([
        fetch(`/api/designated-seats/admin/display-devices?${targetQuery}`, { cache: 'no-store' }),
        fetch(`/api/designated-seats/admin/display-schedules?${targetQuery}`, { cache: 'no-store' }),
        fetch(`/api/designated-seats/admin/display?${roomScopedTargetQuery}`, { cache: 'no-store' }),
      ])
      const devicesPayload = await devicesResponse.json().catch(() => null) as { devices?: DisplayDeviceRow[]; error?: string } | null
      const schedulesPayload = await schedulesResponse.json().catch(() => null) as {
        schedules?: Array<{
          id: number
          day_of_week: number
          start_time: string
          end_time: string
          label: string | null
          is_active: boolean
        }>
        error?: string
      } | null
      const displayPayload = await displayResponse.json().catch(() => null) as {
        session?: AdminPayload['activeDisplaySession']
        displayUrl?: string
        error?: string
      } | null

      if (!devicesResponse.ok) {
        throw new Error(devicesPayload?.error ?? '표시 기기 목록을 불러오지 못했습니다.')
      }
      if (!schedulesResponse.ok) {
        throw new Error(schedulesPayload?.error ?? '표시 스케줄을 불러오지 못했습니다.')
      }
      if (!displayResponse.ok) {
        throw new Error(displayPayload?.error ?? '표시 세션 상태를 불러오지 못했습니다.')
      }

      if (isStale()) {
        return
      }
      setDisplaySlots(slots)
      setMultiDisplayUrl(slotsPayload?.multiDisplayUrl ?? '')
      setSelectedDisplaySlotKey(nextSlotKey)
      if (selectedSlot) {
        setSlotKeyInput(selectedSlot.slot_key)
        setSlotLabelInput(selectedSlot.label)
      }
      setDisplayDevices(devicesPayload?.devices ?? [])
      setActiveDisplaySession(displayPayload?.session ?? null)
      setDisplayUrl(displayPayload?.displayUrl ?? selectedSlot?.displayUrl ?? courseDisplayUrl)
      const schedules = (schedulesPayload?.schedules ?? []).map((schedule) => ({
        id: schedule.id,
        dayOfWeek: schedule.day_of_week,
        startTime: normalizeDisplayTime(schedule.start_time),
        endTime: normalizeDisplayTime(schedule.end_time),
        label: schedule.label ?? '',
        isActive: schedule.is_active,
      }))
      setDisplaySchedules(ensureWeeklyDisplaySchedules(schedules))
    } catch (reason) {
      if (!isStale()) {
        setError(reason instanceof Error ? reason.message : '표시 설정을 불러오지 못했습니다.')
      }
    } finally {
      if (!isStale()) {
        setDisplayConfigLoading(false)
      }
    }
  }, [activeRoomId, courseDisplayUrl, courseId, selectedDisplaySlotKey])

  async function loadReservationDate(nextDate: string) {
    setReservationDate(nextDate)
    setStatusLoading(true)
    setError('')
    setMessage('')
    try {
      await refresh(nextDate)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '좌석 배정 현황을 불러오지 못했습니다.')
    } finally {
      setStatusLoading(false)
    }
  }

  useEffect(() => {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      setError('잘못된 강좌 ID입니다.')
      setLoading(false)
      return
    }
    if (initialLoaded) {
      return
    }
    fetchAdminData(courseId, reservationDate)
      .then(applyPayload)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '지정좌석 정보를 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [courseId, applyPayload, initialLoaded, reservationDate])

  useEffect(() => {
    if (tab === 'status') {
      void loadDisplayConfig()
    }
  }, [activeRoomId, loadDisplayConfig, tab])

  const aisleColumnsParsed = useMemo(
    () => aisleInput.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0),
    [aisleInput],
  )
  const occupiedSeatIds = useMemo(() => reservations.map((reservation) => reservation.seat_id), [reservations])
  const seatReservationMap = useMemo(
    () => new Map(reservations.map((reservation) => [reservation.seat_id, reservation])),
    [reservations],
  )
  const enrollmentMap = useMemo(
    () => new Map(enrollments.map((enrollment) => [enrollment.id, enrollment])),
    [enrollments],
  )
  const seatStudentMap = useMemo(() => {
    const map = new Map<number, { name: string; exam_number?: string | null; reserved_at?: string | null }>()
    for (const reservation of reservations) {
      const enrollment = enrollmentMap.get(reservation.enrollment_id)
      if (enrollment) {
        map.set(reservation.seat_id, {
          name: enrollment.name,
          exam_number: enrollment.exam_number,
          reserved_at: reservation.updated_at,
        })
      }
    }
    return map
  }, [reservations, enrollmentMap])

  const editorSeat = useMemo(
    () => seatDrafts.find((seat) => seat.id === editorModalSeatId) ?? null,
    [seatDrafts, editorModalSeatId],
  )
  const editorSeatReservation = useMemo(
    () => (editorSeat ? seatReservationMap.get(editorSeat.persistedId ?? editorSeat.id) ?? null : null),
    [editorSeat, seatReservationMap],
  )

  const allSelectedIds = useMemo(() => {
    const ids = new Set(selectedSeatIds)
    if (selectedSeatId) ids.add(selectedSeatId)
    return ids
  }, [selectedSeatId, selectedSeatIds])

  const filteredEnrollments = useMemo(() => {
    const query = studentSearch.trim().toLowerCase().replace(/\s+/g, '')
    const source = [...enrollments].sort((left, right) => left.name.localeCompare(right.name, 'ko-KR'))
    if (!query) return source
    return source.filter((enrollment) => {
      const candidates = [enrollment.name, enrollment.exam_number ?? '', enrollment.phone]
      return candidates.some((value) => value.toLowerCase().replace(/\s+/g, '').includes(query))
    })
  }, [enrollments, studentSearch])

  const summary = useMemo(() => {
    const activeSeatCount = seatDrafts.filter((seat) => seat.is_active).length
    return {
      activeSeatCount,
      reservedCount: reservations.length,
      availableCount: Math.max(activeSeatCount - reservations.length, 0),
    }
  }, [reservations.length, seatDrafts])
  const todayKey = getToday()
  const isHistoricalReservationDate = reservationDate !== todayKey

  useEffect(() => {
    if (editorModalSeatId !== null && !editorSeat) {
      setEditorModalSeatId(null)
    }
  }, [editorModalSeatId, editorSeat])

  function reshapeSeatDrafts(nextColumns: number, nextRows: number) {
    setSeatDrafts((current) => {
      const next = buildSeatDrafts(nextColumns, nextRows, current)
      checkDirty(next, nextColumns, nextRows, aisleInput, featureEnabled, seatOpen)
      return next
    })
  }

  function updateSelectedSeats(patch: Partial<SeatDraft>) {
    const ids = allSelectedIds
    if (ids.size === 0) return
    setSeatDrafts((current) => {
      const next = current.map((seat) => (ids.has(seat.id) ? { ...seat, ...patch } : seat))
      checkDirty(next, columns, rows, aisleInput, featureEnabled, seatOpen)
      return next
    })
  }

  function handleSeatClick(seat: DesignatedSeat, shiftKey: boolean) {
    if (shiftKey) {
      setEditorModalSeatId(null)
      setSelectedSeatIds((current) => {
        const next = new Set(current)
        if (next.has(seat.id)) next.delete(seat.id)
        else next.add(seat.id)
        return next
      })
    } else {
      setSelectedSeatId(seat.id)
      setSelectedSeatIds(new Set())
      setEditorModalSeatId(seat.id)
    }
  }

  function clearSelection() {
    setSelectedSeatId(null)
    setSelectedSeatIds(new Set())
    setEditorModalSeatId(null)
  }

  function closeEditorSeatModal() {
    setEditorModalSeatId(null)
  }

  function applyTabChange(nextTab: TabMode) {
    startTransition(() => {
      setTab(nextTab)
      setError('')
      setMessage('')
      setEditorModalSeatId(null)
      setModalSeatId(null)
      setManualEnrollmentId(null)
      setStudentSearch('')
    })
  }

  function handleTabChange(nextTab: TabMode) {
    if (nextTab === tab) return

    if (isDirty && tab === 'editor' && nextTab !== 'editor') {
      deferInteractionWork(() => setPendingTab(nextTab))
      return
    }

    deferInteractionWork(() => applyTabChange(nextTab))
  }

  async function confirmPendingTabChange() {
    const nextTab = pendingTab
    if (!nextTab) {
      return
    }

    const roomId = activeRoomId
    setConfirmingPendingTab(true)
    try {
      if (isDirty) {
        await refresh(reservationDate, roomId)
      }
      setPendingTab(null)
      applyTabChange(nextTab)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '좌석 정보를 다시 불러오지 못했습니다.')
    } finally {
      setConfirmingPendingTab(false)
    }
  }

  async function handleSaveLayout(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    if (!activeRoomId) {
      setSaving(false)
      setError('강의실을 먼저 선택해 주세요.')
      return
    }

    const payload = {
      courseId,
      roomId: activeRoomId,
      columns,
      rows,
      aisleColumns: aisleColumnsParsed,
      seats: seatDrafts.map((seat) => ({
        id: seat.persistedId ?? undefined,
        label: seat.label,
        position_x: seat.position_x,
        position_y: seat.position_y,
        is_active: seat.is_active,
      })),
      featureDesignatedSeat: featureEnabled,
      designatedSeatOpen: featureEnabled ? seatOpen : false,
    }

    const response = await fetch('/api/designated-seats/admin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json().catch(() => null)
    setSaving(false)

    if (!response.ok) {
      setError((result as { error?: string } | null)?.error ?? '지정좌석 저장에 실패했습니다.')
      return
    }

    setMessage('지정좌석 레이아웃을 저장했습니다.')
    clearSelection()
    await refresh().catch(() => null)
  }

  async function handleSelectDisplaySlot(slotKey: string) {
    setSelectedDisplaySlotKey(slotKey)
    setRegistrationCode(null)
    const slot = displaySlots.find((item) => item.slot_key === slotKey)
    if (slot) {
      setSlotKeyInput(slot.slot_key)
      setSlotLabelInput(slot.label)
      setDisplayUrl(slot.displayUrl)
    } else {
      setDisplayUrl(courseDisplayUrl)
    }
    await loadDisplayConfig(slotKey)
  }

  async function handleSaveDisplaySlot() {
    const slotKey = normalizeDisplaySlotKey(slotKeyInput)
    if (!slotKey) {
      setError('슬롯 키는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.')
      return
    }

    setDisplayConfigSaving(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/designated-seats/admin/display-slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        slotKey,
        label: slotLabelInput.trim() || slotKey,
        isActive: true,
      }),
    })
    const result = await response.json().catch(() => null) as { displayUrl?: string; error?: string } | null
    setDisplayConfigSaving(false)

    if (!response.ok) {
      setError(result?.error ?? '표시 슬롯을 저장하지 못했습니다.')
      return
    }

    setSelectedDisplaySlotKey(slotKey)
    setDisplayUrl(result?.displayUrl ?? displayUrl)
    setMessage('고정 표시 슬롯을 현재 강좌에 연결했습니다. 강의실 PC는 이 슬롯 URL을 계속 사용하면 됩니다.')
    await loadDisplayConfig(slotKey)
  }

  async function handleStartDisplay() {
    setWorking(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/designated-seats/admin/display', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...activeDisplayTargetBody, durationHours: displayDuration }),
    })
    const result = await response.json().catch(() => null)
    setWorking(false)

    if (!response.ok) {
      setError((result as { error?: string } | null)?.error ?? '현장 QR 표시를 시작하지 못했습니다.')
      return
    }

    setDisplayUrl((result as { displayUrl?: string } | null)?.displayUrl ?? selectedDisplaySlot?.displayUrl ?? courseDisplayUrl)
    setMessage('현장 QR 표시 세션을 시작했습니다.')
    await refresh().catch(() => null)
    await loadDisplayConfig(selectedDisplaySlotKey)
  }

  async function handleStopDisplay() {
    setWorking(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/designated-seats/admin/display', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(activeDisplayTargetBody),
    })
    const result = await response.json().catch(() => null)
    setWorking(false)

    if (!response.ok) {
      setError((result as { error?: string } | null)?.error ?? '현장 QR 표시를 종료하지 못했습니다.')
      return
    }

    setDisplayUrl(selectedDisplaySlot?.displayUrl ?? courseDisplayUrl)
    setMessage('현장 QR 표시 세션을 종료했습니다.')
    await refresh().catch(() => null)
    await loadDisplayConfig(selectedDisplaySlotKey)
  }

  async function handleStopDisplayConfirmed() {
    await handleStopDisplay()
    setDisplayStopConfirmOpen(false)
  }

  async function handleCreateRegistrationCode() {
    setDisplayConfigSaving(true)
    setError('')
    setMessage('')
    setRegistrationCode(null)

    const response = await fetch('/api/designated-seats/admin/display-devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...activeDisplayTargetBody,
        deviceName: displayDeviceName.trim() || `QR PC ${displayDevices.length + 1}`,
      }),
    })
    const result = await response.json().catch(() => null) as ({
      code: string
      expiresAt: string
      deviceName: string
      error?: string
    } | null)
    setDisplayConfigSaving(false)

    if (!response.ok) {
      setError(result?.error ?? '표시 기기 등록 코드를 만들지 못했습니다.')
      return
    }

    setRegistrationCode(result)
    setMessage('등록 코드를 생성했습니다. 강의실 PC 화면에 입력해 주세요.')
  }

  async function handleRevokeDisplayDevice(deviceId: number) {
    setDisplayConfigSaving(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/designated-seats/admin/display-devices', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...activeDisplayTargetBody, deviceId }),
    })
    const result = await response.json().catch(() => null) as { error?: string } | null
    setDisplayConfigSaving(false)

    if (!response.ok) {
      setError(result?.error ?? '표시 기기 해제에 실패했습니다.')
      return
    }

    setMessage('표시 기기 등록을 해제했습니다.')
    await loadDisplayConfig()
  }

  function updateDisplaySchedule(index: number, patch: Partial<DisplayScheduleRow>) {
    setDisplaySchedules((current) => current.map((schedule, currentIndex) => (
      currentIndex === index ? { ...schedule, ...patch } : schedule
    )))
  }

  function addDisplaySchedule() {
    setDisplaySchedules((current) => [
      ...current,
      {
        dayOfWeek: 1,
        startTime: '06:00',
        endTime: '22:00',
        label: '조기 입실 QR',
        isActive: true,
      },
    ])
  }

  function removeDisplaySchedule(index: number) {
    setDisplaySchedules((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  async function handleSaveDisplaySchedules() {
    setDisplayConfigSaving(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/designated-seats/admin/display-schedules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...activeDisplayTargetBody,
        schedules: displaySchedules.map((schedule) => ({
          dayOfWeek: schedule.dayOfWeek,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          label: schedule.label,
          isActive: schedule.isActive,
        })),
      }),
    })
    const result = await response.json().catch(() => null) as { error?: string } | null
    setDisplayConfigSaving(false)

    if (!response.ok) {
      setError(result?.error ?? '표시 스케줄 저장에 실패했습니다.')
      return
    }

    setMessage('표시 스케줄을 저장했습니다.')
    await loadDisplayConfig()
    await refresh().catch(() => null)
  }

  async function handleManualAssign(seatId: number, enrollmentId: number) {
    setWorking(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/designated-seats/admin/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, enrollmentId, seatId }),
    })
    const result = await response.json().catch(() => null)
    setWorking(false)

    if (!response.ok) {
      setError((result as { error?: string } | null)?.error ?? '수동 좌석 배정에 실패했습니다.')
      return
    }

    setModalSeatId(null)
    setManualEnrollmentId(null)
    setStudentSearch('')
    setMessage('수동 좌석 배정을 완료했습니다.')
    await refresh().catch(() => null)
  }

  async function handleManualClear(enrollmentId: number) {
    setWorking(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/designated-seats/admin/manual', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, enrollmentId }),
    })
    const result = await response.json().catch(() => null)
    setWorking(false)

    if (!response.ok) {
      setError((result as { error?: string } | null)?.error ?? '좌석 해제에 실패했습니다.')
      return
    }

    setModalSeatId(null)
    setManualEnrollmentId(null)
    setStudentSearch('')
    setMessage('수동 좌석 해제를 완료했습니다.')
    await refresh().catch(() => null)
  }

  function requestManualClear(params: {
    enrollmentId: number
    studentName: string
    seatLabel: string
  }) {
    setManualSeatConfirmation({
      type: 'clear',
      enrollmentId: params.enrollmentId,
      studentName: params.studentName,
      seatLabel: params.seatLabel,
    })
  }

  function requestManualAssign(params: {
    seatId: number
    enrollmentId: number
    studentName: string
    seatLabel: string
  }) {
    setManualSeatConfirmation({
      type: 'assign',
      seatId: params.seatId,
      enrollmentId: params.enrollmentId,
      studentName: params.studentName,
      seatLabel: params.seatLabel,
    })
  }

  function confirmManualSeatAction() {
    const confirmation = manualSeatConfirmation
    if (!confirmation) {
      return
    }

    setManualSeatConfirmation(null)
    if (confirmation.type === 'clear') {
      void handleManualClear(confirmation.enrollmentId)
      return
    }

    void handleManualAssign(confirmation.seatId, confirmation.enrollmentId)
  }

  if (loading) {
    return <p className="py-12 text-center text-sm text-[#86868b]">지정좌석 정보를 불러오는 중입니다...</p>
  }

  if (!course) {
    return <p className="py-12 text-center text-sm text-red-500">{error || '강좌를 찾을 수 없습니다.'}</p>
  }

  const bulkCount = allSelectedIds.size

  return (
    <>
      <ConfirmationModal
        open={Boolean(pendingTab)}
        title="저장하지 않은 변경 사항이 있습니다"
        description="탭을 전환하면 좌석 편집 내용이 사라집니다. 계속할까요?"
        confirmLabel="계속"
        pendingLabel="전환 중..."
        tone="danger"
        submitting={confirmingPendingTab}
        onClose={() => setPendingTab(null)}
        onConfirm={() => void confirmPendingTabChange()}
      />
      <ConfirmationModal
        open={Boolean(manualSeatConfirmation)}
        title={manualSeatConfirmation?.type === 'clear' ? '좌석 배정을 해제할까요?' : '좌석을 배정할까요?'}
        description={manualSeatConfirmation ? (
          manualSeatConfirmation.type === 'clear'
            ? `${manualSeatConfirmation.studentName} 학생의 ${manualSeatConfirmation.seatLabel} 좌석 배정을 해제합니다.`
            : `${manualSeatConfirmation.studentName} 학생을 ${manualSeatConfirmation.seatLabel} 좌석에 배정합니다. 이미 다른 좌석이 있으면 배정이 변경될 수 있습니다.`
        ) : undefined}
        confirmLabel={manualSeatConfirmation?.type === 'clear' ? '배정 해제' : '배정'}
        pendingLabel="처리 중..."
        tone={manualSeatConfirmation?.type === 'clear' ? 'danger' : 'default'}
        submitting={working}
        onClose={() => {
          if (!working) {
            setManualSeatConfirmation(null)
          }
        }}
        onConfirm={confirmManualSeatAction}
      />
      <ConfirmationModal
        open={displayStopConfirmOpen}
        title="현장 QR 표시를 중지할까요?"
        description={activeDisplaySession
          ? `현재 활성화된 현장 QR 표시 세션을 중지합니다. 학생들은 새 QR 인증을 받을 수 없습니다.\n\n만료 예정: ${new Date(activeDisplaySession.expires_at).toLocaleString('ko-KR')}`
          : '현재 활성화된 현장 QR 표시 세션을 중지합니다.'}
        confirmLabel="표시 중지"
        pendingLabel="중지 중..."
        tone="danger"
        submitting={working}
        onClose={() => {
          if (!working) {
            setDisplayStopConfirmOpen(false)
          }
        }}
        onConfirm={() => {
          void handleStopDisplayConfirmed()
        }}
      />
      <ConfirmationModal
        open={Boolean(roomDeleteTarget)}
        title="강의실을 삭제할까요?"
        description={roomDeleteTarget ? `${roomDeleteTarget.name} 강의실과 좌석 배치를 삭제합니다. 좌석 배정 이력이 있으면 삭제할 수 없습니다.` : undefined}
        confirmLabel="삭제"
        pendingLabel="삭제 중..."
        tone="danger"
        submitting={roomWorking}
        onClose={() => {
          if (!roomWorking) {
            setRoomDeleteTarget(null)
          }
        }}
        onConfirm={() => {
          void handleDeleteRoomConfirmed()
        }}
      />
      <div className="flex flex-col gap-6">
      {/* Header */}
      {false ? (
        <section className="rounded-[8px] bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href={withTenantPrefix(`/dashboard/courses/${course!.id}`, tenant.type)}
              className="text-xs font-medium text-[#86868b] hover:underline"
            >
              &larr; {course!.name}
            </Link>
            <h2 className="mt-2 text-2xl font-semibold text-[#1d1d1f]">지정좌석</h2>
            <p className="mt-2 text-sm leading-6 text-[#86868b]">
              학생이 직접 좌석을 선착순으로 선택할 수 있는 기능입니다. 기존 과목별 좌석 배정과는 독립적으로 운영됩니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={withTenantPrefix(`/dashboard/courses/${course!.id}`, tenant.type)}
              className="rounded-[8px] bg-[#f5f5f7] px-4 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97]"
            >
              강좌 설정
            </Link>
            <Link
              href={withTenantPrefix(`/dashboard/courses/${course!.id}/seats`, tenant.type)}
              className="rounded-[8px] bg-[#f5f5f7] px-4 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97]"
            >
              기존 좌석 배정
            </Link>
          </div>
        </div>

        </section>
      ) : null}

      {/* Tab switcher */}
      <div className="flex gap-4 overflow-x-auto border-b border-slate-200 sm:gap-6">
        {TAB_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => handleTabChange(item.key)}
            className={`relative -mb-px whitespace-nowrap border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-semibold transition-colors ${
              tab === item.key
                ? 'text-[#1d1d1f]'
                : 'text-slate-500 hover:text-[#1d1d1f]'
            }`}
          >
            {item.label}
            {item.key === 'editor' && isDirty ? (
              <span className="ml-2 inline-block h-2 w-2 rounded-full bg-amber-400" />
            ) : null}
            {tab === item.key ? (
              <motion.div
                layoutId="designated-seats-tabs"
                className="absolute inset-x-0 bottom-0 h-0.5 bg-[#1d1d1f]"
                transition={motionConfig.tab}
              />
            ) : null}
          </button>
        ))}
      </div>

      {tab !== 'attendance' && sortedRooms.length > 0 ? (
        <section className="rounded-[8px] bg-white px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold text-[#86868b]">현재 강의실</p>
              <p className="mt-1 text-base font-semibold text-[#1d1d1f]">{activeRoom?.name ?? '-'}</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sortedRooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => void handleSelectRoom(room.id)}
                  disabled={statusLoading || room.id === activeRoomId}
                  className={`shrink-0 rounded-[8px] px-3 py-2 text-sm font-semibold transition-all duration-200 ease-ios active:scale-[0.97] disabled:active:scale-100 ${
                    room.id === activeRoomId
                      ? 'bg-[#1d1d1f] text-white disabled:opacity-100'
                      : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed] disabled:opacity-60'
                  }`}
                >
                  {room.name}
                  {!room.is_open ? <span className="ml-1 text-xs opacity-70">마감</span> : null}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Summary stats */}
      {tab !== 'attendance' && tab !== 'rooms' ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: '활성 좌석', value: summary.activeSeatCount },
            { label: '배정 완료', value: summary.reservedCount },
            { label: '잔여 좌석', value: summary.availableCount },
            { label: '신청 상태', value: seatOpen && activeRoom?.is_open ? 'OPEN' : 'CLOSED' },
          ].map((item) => (
            <article key={item.label} className="rounded-[8px] bg-white px-4 py-3 sm:p-5">
              <p className="text-xs font-semibold text-[#86868b] sm:text-sm">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold text-[#1d1d1f] sm:mt-3 sm:text-3xl">{item.value}</p>
            </article>
          ))}
        </div>
      ) : null}

      {/* Feedback */}
      {(error || message) ? (
        <div className="flex flex-col gap-2">
          {error ? <p className="text-sm text-[#ff3b30]">{error}</p> : null}
          {message ? <p className="text-sm text-[#1b7a1b]">{message}</p> : null}
        </div>
      ) : null}

      {/* ───── Tab 1: Editor ───── */}
      {tab === 'editor' && (
        <>
          {isDirty ? (
            <div className="rounded-[8px] border border-[#d2d2d7] bg-[#f5f5f7] px-5 py-3 text-sm font-semibold text-[#1d1d1f]">
              저장하지 않은 변경 사항이 있습니다.
            </div>
          ) : null}

          <form onSubmit={handleSaveLayout} className="rounded-[8px] bg-white p-4 sm:p-6">
            <div className="flex flex-col gap-5">
              {/* Feature toggles */}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-[#1d1d1f]">
                  <input
                    type="checkbox"
                    checked={featureEnabled}
                    onChange={(event) => {
                      setFeatureEnabled(event.target.checked)
                      checkDirty(seatDrafts, columns, rows, aisleInput, event.target.checked, seatOpen)
                    }}
                    className="rounded"
                  />
                  지정좌석 기능 사용
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-[#1d1d1f]">
                  <input
                    type="checkbox"
                    checked={seatOpen}
                    onChange={(event) => {
                      setSeatOpen(event.target.checked)
                      checkDirty(seatDrafts, columns, rows, aisleInput, featureEnabled, event.target.checked)
                    }}
                    className="rounded"
                    disabled={!featureEnabled}
                  />
                  학생 신청 열기
                </label>
              </div>

              {activeRoom ? (
                <div className="flex flex-col gap-3 rounded-[8px] border border-[#d2d2d7] bg-[#f5f5f7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#1d1d1f]">{activeRoom.name}</p>
                    <p className="mt-1 text-xs text-[#86868b]">
                      {seatOpen
                        ? activeRoom.is_open
                          ? '학생에게 이 강의실 좌석 선택이 노출됩니다.'
                          : '현재 이 강의실은 학생 탭에서 숨김 처리됩니다.'
                        : '강좌 전체 신청이 닫혀 있어 강의실을 열어도 학생에게는 노출되지 않습니다.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleRoomOpen(activeRoom, !activeRoom.is_open)}
                    disabled={roomWorking || !featureEnabled}
                    className={`shrink-0 rounded-[8px] px-4 py-2.5 text-sm font-semibold transition-all duration-200 ease-ios active:scale-[0.97] disabled:opacity-50 ${
                      activeRoom.is_open
                        ? 'bg-white text-[#1d1d1f] hover:bg-[#e8e8ed]'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {activeRoom.is_open ? '현재 강의실 마감' : '현재 강의실 열기'}
                  </button>
                </div>
              ) : null}

              {/* Grid config */}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#86868b]">행</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={rows}
                    onChange={(event) => {
                      const nextRows = Number(event.target.value || DEFAULT_ROWS)
                      setRows(nextRows)
                      reshapeSeatDrafts(columns, nextRows)
                    }}
                    className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#86868b]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#86868b]">열</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={columns}
                    onChange={(event) => {
                      const nextColumns = Number(event.target.value || DEFAULT_COLUMNS)
                      setColumns(nextColumns)
                      reshapeSeatDrafts(nextColumns, rows)
                    }}
                    className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#86868b]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#86868b]">통로 열</label>
                  <input
                    value={aisleInput}
                    onChange={(event) => {
                      setAisleInput(event.target.value)
                      checkDirty(seatDrafts, columns, rows, event.target.value, featureEnabled, seatOpen)
                    }}
                    placeholder="예: 4,8"
                    className="rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-[#86868b]"
                  />
                </div>
              </div>

              {/* Seat map */}
              <div className="rounded-[8px] border border-[#d2d2d7] p-3 sm:p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#1d1d1f]">좌석 맵</h3>
                    <p className="text-xs text-[#86868b]">
                      클릭으로 좌석 편집, <kbd className="rounded border border-[#d2d2d7] bg-[#f5f5f7] px-1 py-0.5 text-[10px] font-semibold">Shift</kbd>+클릭으로 다중 선택
                    </p>
                    <p className="mt-1 text-xs text-[#86868b]">새 좌석 번호는 가로 A, B, C / 세로 1, 2, 3 순서로 자동 생성됩니다.</p>
                  </div>
                  {bulkCount > 1 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[#1d1d1f]">{bulkCount}개 선택</span>
                      <button type="button" onClick={() => updateSelectedSeats({ is_active: true })} className="rounded-[8px] bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-[#1b7a1b] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97]">일괄 활성화</button>
                      <button type="button" onClick={() => updateSelectedSeats({ is_active: false })} className="rounded-[8px] bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97]">일괄 비활성화</button>
                      <button type="button" onClick={clearSelection} className="rounded-[8px] px-2 py-1.5 text-xs font-semibold text-[#86868b] transition-all duration-200 ease-ios hover:text-[#1d1d1f] active:scale-[0.97]">선택 해제</button>
                    </div>
                  ) : null}
                </div>
                <SeatGrid
                  columns={columns}
                  rows={rows}
                  aisleColumns={aisleColumnsParsed}
                  seats={seatDrafts}
                  occupiedSeatIds={occupiedSeatIds}
                  selectedSeatId={selectedSeatId}
                  selectedSeatIds={selectedSeatIds}
                  seatStudentMap={seatStudentMap}
                  onSeatClick={handleSeatClick}
                  mode="admin"
                />
              </div>

              {bulkCount <= 1 ? (
                <p className="text-sm text-[#86868b]">좌석을 클릭하면 좌석 번호와 운영 좌석 상태를 모달에서 바로 수정할 수 있습니다.</p>
              ) : null}

              <button
                type="submit"
                disabled={saving}
                className="rounded-[8px] bg-[#0071e3] px-5 py-3 text-sm font-bold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-60 disabled:active:scale-100"
              >
                {saving ? '저장 중...' : '레이아웃 저장'}
              </button>
            </div>
          </form>

          <SeatEditModal
            open={tab === 'editor' && editorSeat !== null}
            onClose={closeEditorSeatModal}
            title="좌석 편집"
            badge={editorSeat ? `${editorSeat.position_x}열 ${editorSeat.position_y}행` : undefined}
            description="좌석 번호와 운영 좌석 여부를 바로 수정할 수 있습니다."
          >
            {editorSeat ? (
              <div className="space-y-5">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[#1d1d1f]">좌석 번호</span>
                  <input
                    value={editorSeat.label}
                    onChange={(event) => updateSelectedSeats({ label: event.target.value })}
                    className="w-full rounded-[10px] border border-[#d2d2d7] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#0071e3]"
                    placeholder="예: A-1"
                    autoFocus
                  />
                </label>

                <label className="flex items-center gap-3 rounded-[10px] border border-[#d2d2d7] bg-[#f5f5f7] px-4 py-3">
                  <input
                    type="checkbox"
                    checked={editorSeat.is_active}
                    onChange={(event) => updateSelectedSeats({ is_active: event.target.checked })}
                    disabled={Boolean(editorSeatReservation)}
                    className="h-5 w-5 rounded border-[#d2d2d7]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#1d1d1f]">운영 좌석</span>
                    <span className="block text-xs text-[#86868b]">
                      {editorSeatReservation
                        ? '현재 학생이 배정된 좌석은 비활성화할 수 없습니다.'
                        : '비활성 시 학생 배정 대상에서 제외됩니다.'}
                    </span>
                  </span>
                </label>

                <div className="rounded-[10px] bg-[#f5f5f7] px-4 py-3">
                  <p className="text-xs font-semibold text-[#86868b]">현재 좌표</p>
                  <p className="mt-1 text-base font-semibold text-[#1d1d1f]">
                    {editorSeat.position_y}행 {editorSeat.position_x}열
                  </p>
                </div>

                <div className="flex items-center justify-end border-t border-[#f5f5f7] pt-4">
                  <button
                    type="button"
                    onClick={closeEditorSeatModal}
                    className="rounded-full bg-[#1d1d1f] px-5 py-2 text-sm font-medium text-white transition-all duration-200 ease-ios hover:bg-black hover:shadow-md active:scale-[0.97]"
                  >
                    닫기
                  </button>
                </div>
              </div>
            ) : null}
          </SeatEditModal>
        </>
      )}

      {/* ───── Tab 2: Status ───── */}
      {tab === 'status' && (
        <div className="flex flex-col gap-6">
          {/* QR Display — top */}
          <section className="rounded-[8px] bg-white p-4 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[#1d1d1f]">현장 QR 표시</h3>
                <p className="mt-1 text-sm text-[#86868b]">
                  강의실 PC는 고정 URL을 북마크하고, 등록된 표시 기기만 QR을 볼 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadDisplayConfig()}
                disabled={displayConfigLoading}
                className="rounded-[8px] bg-[#f5f5f7] px-4 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97] disabled:opacity-60"
              >
                {displayConfigLoading ? '불러오는 중...' : '표시 설정 새로고침'}
              </button>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1.25fr]">
              <div className="flex flex-col gap-4">
                <div className="rounded-[8px] bg-[#f5f5f7] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="flex-1">
                      <span className="text-xs font-semibold text-[#86868b]">고정 표시 슬롯</span>
                      <select
                        value={selectedDisplaySlotKey}
                        onChange={(event) => void handleSelectDisplaySlot(event.target.value)}
                        className="mt-1.5 w-full rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0071e3]"
                      >
                        <option value="">강좌 직접 URL 사용</option>
                        {displaySlots.map((slot) => (
                          <option key={slot.id} value={slot.slot_key}>
                            {slot.label} · {slot.course?.name ?? '연결된 강좌 없음'}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <label>
                      <span className="text-xs font-semibold text-[#86868b]">슬롯 키</span>
                      <input
                        value={slotKeyInput}
                        onChange={(event) => setSlotKeyInput(normalizeDisplaySlotKey(event.target.value))}
                        className="mt-1.5 w-full rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0071e3]"
                        placeholder="basic-theory"
                      />
                    </label>
                    <label>
                      <span className="text-xs font-semibold text-[#86868b]">슬롯 이름</span>
                      <input
                        value={slotLabelInput}
                        onChange={(event) => setSlotLabelInput(event.target.value)}
                        className="mt-1.5 w-full rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0071e3]"
                        placeholder="기본이론반 QR"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleSaveDisplaySlot()}
                      disabled={displayConfigSaving}
                      className="rounded-[8px] bg-[#1d1d1f] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-black active:scale-[0.97] disabled:opacity-60"
                    >
                      현재 강좌 연결
                    </button>
                  </div>

                  <p className="mt-3 text-xs leading-5 text-[#86868b]">
                    강의실 PC는 슬롯 URL을 즐겨찾기합니다. 다음 기수 강좌를 새로 만들면 이 슬롯을 새 강좌에 다시 연결하기만 하면 됩니다.
                  </p>

                  {selectedDisplaySlot ? (
                    <div className="mt-3 rounded-[8px] bg-white px-3 py-3 text-xs text-[#86868b]">
                      <p className="font-semibold text-[#1d1d1f]">{selectedDisplaySlot.label}</p>
                      <p className="mt-1">현재 연결: {selectedDisplaySlot.course?.name ?? '연결된 강좌 없음'}</p>
                      <p className="mt-1">슬롯 키: {selectedDisplaySlot.slot_key}</p>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[8px] bg-[#f5f5f7] p-4">
                  <p className="text-xs font-semibold text-[#86868b]">강의실 PC 북마크 URL</p>
                  <input
                    value={displayUrl}
                    readOnly
                    className="mt-2 w-full rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-xs text-[#1d1d1f] outline-none"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(displayUrl)
                        setMessage('표시 URL을 복사했습니다.')
                      }}
                      disabled={displayConfigLoading || !displayUrl}
                      className="rounded-[8px] bg-white px-4 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97] disabled:opacity-60"
                    >
                      URL 복사
                    </button>
                    <a
                      href={!displayConfigLoading && displayUrl ? displayUrl : '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-[8px] bg-[#0071e3] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97]"
                    >
                      새 창 열기
                    </a>
                  </div>
                </div>

                <div className="rounded-[8px] bg-[#f5f5f7] p-4">
                  <p className="text-xs font-semibold text-[#86868b]">2개 이상 QR 멀티 표시 URL</p>
                  <input
                    value={multiDisplayUrl}
                    readOnly
                    className="mt-2 w-full rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-xs text-[#1d1d1f] outline-none"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(multiDisplayUrl)
                        setMessage('멀티 표시 URL을 복사했습니다.')
                      }}
                      disabled={!multiDisplayUrl}
                      className="rounded-[8px] bg-white px-4 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97] disabled:opacity-60"
                    >
                      멀티 URL 복사
                    </button>
                    <a
                      href={multiDisplayUrl || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-[8px] bg-[#0071e3] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97]"
                    >
                      멀티 화면 열기
                    </a>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[#86868b]">
                    연결된 슬롯이 2개 이상이면 한 화면에서 각 강좌 QR을 나눠 표시할 수 있습니다.
                  </p>
                </div>

                <div className="rounded-[8px] bg-[#f5f5f7] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="flex-1">
                      <span className="text-xs font-semibold text-[#86868b]">표시 기기 이름</span>
                      <input
                        value={displayDeviceName}
                        onChange={(event) => setDisplayDeviceName(event.target.value)}
                        className="mt-1.5 w-full rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0071e3]"
                        placeholder="301호 QR PC 1"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleCreateRegistrationCode()}
                      disabled={displayConfigSaving}
                      className="rounded-[8px] bg-[#1d1d1f] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-black active:scale-[0.97] disabled:opacity-60"
                    >
                      등록 코드 생성
                    </button>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[#86868b]">
                    표시기기 권한은 자동 만료하지 않습니다. 다만 브라우저 쿠키가 삭제되거나 브라우저 정책으로 만료되면 같은 PC라도 재등록이 필요합니다.
                  </p>

                  {registrationCode ? (
                    <div className="mt-4 rounded-[8px] bg-white px-4 py-3">
                      <p className="text-xs font-semibold text-[#86868b]">{registrationCode.deviceName}</p>
                      <p className="mt-1 text-4xl font-black tracking-[0.18em] text-[#1d1d1f]">{registrationCode.code}</p>
                      <p className="mt-2 text-xs text-[#86868b]">
                        만료: {new Date(registrationCode.expiresAt).toLocaleTimeString('ko-KR')}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[8px] bg-[#f5f5f7] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#1d1d1f]">등록된 표시 기기</p>
                    <span className="text-xs font-semibold text-[#86868b]">{displayDevices.length}대</span>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    {displayDevices.length === 0 ? (
                      <p className="rounded-[8px] bg-white px-3 py-3 text-sm text-[#86868b]">등록된 표시 기기가 없습니다.</p>
                    ) : displayDevices.map((device) => (
                      <div key={device.id} className="flex items-center justify-between gap-3 rounded-[8px] bg-white px-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#1d1d1f]">{device.device_name}</p>
                          <p className="mt-1 text-xs text-[#86868b]">
                            마지막 접속: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString('ko-KR') : '-'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRevokeDisplayDevice(device.id)}
                          disabled={displayConfigSaving}
                          className="shrink-0 rounded-[8px] bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-all duration-200 ease-ios hover:bg-red-100 active:scale-[0.97] disabled:opacity-60"
                        >
                          해제
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="rounded-[8px] bg-[#f5f5f7] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#1d1d1f]">주간 자동 표시 스케줄</p>
                      <p className="mt-1 text-xs text-[#86868b]">KST 기준이며 자정을 넘기는 시간대는 나누어 등록합니다.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={addDisplaySchedule}
                        className="rounded-[8px] bg-white px-3 py-2 text-sm font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97]"
                      >
                        행 추가
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveDisplaySchedules()}
                        disabled={displayConfigSaving}
                        className="rounded-[8px] bg-[#0071e3] px-3 py-2 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-blue-700 active:scale-[0.97] disabled:opacity-60"
                      >
                        스케줄 저장
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    {displaySchedules.map((schedule, index) => (
                      <div key={`${schedule.dayOfWeek}-${index}`} className="grid gap-2 rounded-[8px] bg-white p-3 sm:grid-cols-[70px_1fr_1fr_1.5fr_80px_60px] sm:items-center">
                        <select
                          value={schedule.dayOfWeek}
                          onChange={(event) => updateDisplaySchedule(index, { dayOfWeek: Number(event.target.value) })}
                          className="rounded-[8px] border border-[#d2d2d7] px-2 py-2 text-sm outline-none"
                        >
                          {DAY_LABELS.map((label, dayIndex) => (
                            <option key={label} value={dayIndex}>{label}</option>
                          ))}
                        </select>
                        <input
                          type="time"
                          value={schedule.startTime}
                          onChange={(event) => updateDisplaySchedule(index, { startTime: event.target.value })}
                          className="rounded-[8px] border border-[#d2d2d7] px-2 py-2 text-sm outline-none"
                        />
                        <input
                          type="time"
                          value={schedule.endTime}
                          onChange={(event) => updateDisplaySchedule(index, { endTime: event.target.value })}
                          className="rounded-[8px] border border-[#d2d2d7] px-2 py-2 text-sm outline-none"
                        />
                        <input
                          value={schedule.label}
                          onChange={(event) => updateDisplaySchedule(index, { label: event.target.value })}
                          placeholder="스케줄 이름"
                          className="rounded-[8px] border border-[#d2d2d7] px-2 py-2 text-sm outline-none"
                        />
                        <label className="flex items-center gap-2 text-sm font-semibold text-[#1d1d1f]">
                          <input
                            type="checkbox"
                            checked={schedule.isActive}
                            onChange={(event) => updateDisplaySchedule(index, { isActive: event.target.checked })}
                            className="h-4 w-4"
                          />
                          사용
                        </label>
                        <button
                          type="button"
                          onClick={() => removeDisplaySchedule(index)}
                          className="rounded-[8px] bg-[#f5f5f7] px-2 py-2 text-sm font-semibold text-[#86868b] transition-all duration-200 ease-ios hover:text-red-700 active:scale-[0.97]"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[8px] bg-[#f5f5f7] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#1d1d1f]">수동 표시 세션</p>
                      <p className="mt-1 text-xs text-[#86868b]">스케줄과 별도로 즉시 켜야 할 때만 사용합니다.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={displayDuration}
                        onChange={(event) => setDisplayDuration(Number(event.target.value))}
                        className="rounded-[8px] border border-[#d2d2d7] bg-white px-2 py-2.5 text-sm outline-none"
                      >
                        <option value={6}>6시간</option>
                        <option value={12}>12시간</option>
                        <option value={24}>24시간</option>
                        <option value={48}>48시간</option>
                        <option value={72}>72시간</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleStartDisplay()}
                        disabled={working}
                        className="rounded-[8px] bg-[#1d1d1f] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-black active:scale-[0.97] disabled:opacity-60"
                      >
                        수동 시작
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisplayStopConfirmOpen(true)}
                        disabled={working || !activeDisplaySession}
                        className="rounded-[8px] bg-white px-4 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97] disabled:opacity-60"
                      >
                        중지
                      </button>
                    </div>
                  </div>

                  {activeDisplaySession ? (
                    <div className="mt-4 rounded-[8px] bg-white px-4 py-3 text-sm text-[#1b7a1b]">
                      활성 세션 · {activeDisplaySession.source === 'schedule' ? '스케줄' : '수동'} · 만료: {new Date(activeDisplaySession.expires_at).toLocaleString('ko-KR')}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[8px] bg-white px-4 py-3 text-sm text-[#1d1d1f]">
                      활성화된 세션 없음
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Seat map */}
          <section className="rounded-[8px] bg-white p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[#1d1d1f]">좌석 배정 현황</h3>
                <p className="mt-1 text-sm text-[#86868b]">
                  {reservationDate} 기준
                  {isHistoricalReservationDate ? ' 최종 배정' : ' 현재 배정'}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#86868b]">조회 날짜</span>
                  <input
                    type="date"
                    value={reservationDate}
                    max={todayKey}
                    onChange={(event) => void loadReservationDate(event.target.value || todayKey)}
                    className="rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm text-[#1d1d1f] outline-none transition focus:border-[#0071e3]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void loadReservationDate(todayKey)}
                  disabled={statusLoading || reservationDate === todayKey}
                  className="rounded-[8px] bg-[#f5f5f7] px-3 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
                >
                  오늘
                </button>
                <button
                  type="button"
                  onClick={() => void loadReservationDate(reservationDate)}
                  disabled={statusLoading}
                  className="rounded-[8px] bg-[#f5f5f7] px-3 py-2.5 text-sm font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
                >
                  {statusLoading ? '불러오는 중...' : '새로고침'}
                </button>
              </div>
            </div>
            {isHistoricalReservationDate ? (
              <div className="mb-4 rounded-[8px] border border-[#d2d2d7] bg-[#f5f5f7] px-4 py-3 text-sm font-medium text-[#1d1d1f]">
                과거 좌석표는 조회 전용입니다.
              </div>
            ) : null}
            <SeatGrid
              columns={columns}
              rows={rows}
              aisleColumns={aisleColumnsParsed}
              seats={seatDrafts}
              occupiedSeatIds={occupiedSeatIds}
              selectedSeatId={modalSeatId}
              seatStudentMap={seatStudentMap}
              onSeatClick={(seat) => {
                if (isHistoricalReservationDate) return
                const seatDbId = (seat as SeatDraft).persistedId ?? seat.id
                if (seatDbId <= 0 || !seat.is_active) return
                setModalSeatId(seatDbId)
                setManualEnrollmentId(null)
                setStudentSearch('')
              }}
              mode="admin"
            />
          </section>
        </div>
      )}

      {tab === 'attendance' && course ? (
        <DesignatedSeatAttendancePanel courseId={course.id} />
      ) : null}

      {tab === 'rooms' ? (
        <section className="rounded-[8px] bg-white p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[#1d1d1f]">강의실 관리</h3>
              <p className="mt-1 text-sm text-[#86868b]">
                강의실별로 좌석 배치와 배정 현황이 분리됩니다.
              </p>
            </div>
            <span className="text-xs font-semibold text-[#86868b]">{sortedRooms.length}개</span>
          </div>

          {!seatOpen ? (
            <div className="mt-4 rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              강좌 전체 신청이 닫혀 있습니다. 강의실을 열어도 강좌 신청을 열기 전까지 학생은 좌석을 선택할 수 없습니다.
            </div>
          ) : null}

          <form onSubmit={handleCreateRoom} className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="text-xs font-semibold text-[#86868b]">새 강의실</span>
              <input
                value={newRoomName}
                onChange={(event) => setNewRoomName(event.target.value)}
                maxLength={60}
                placeholder="예: 301호"
                className="mt-1.5 w-full rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0071e3]"
              />
            </label>
            <button
              type="submit"
              disabled={roomWorking}
              className="rounded-[8px] bg-[#1d1d1f] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-ios hover:bg-black active:scale-[0.97] disabled:opacity-60"
            >
              추가
            </button>
          </form>

          <div className="mt-5 flex flex-col gap-3">
            {sortedRooms.map((room, index) => (
              <div key={room.id} className="grid gap-3 rounded-[8px] border border-[#d2d2d7] bg-[#f5f5f7] p-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
                <label>
                  <span className="text-xs font-semibold text-[#86868b]">강의실 이름</span>
                  <input
                    value={roomNameInputs[room.id] ?? room.name}
                    onChange={(event) => {
                      const value = event.target.value
                      setRoomNameInputs((current) => ({ ...current, [room.id]: value }))
                    }}
                    maxLength={60}
                    className="mt-1.5 w-full rounded-[8px] border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0071e3]"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className={`rounded-full px-3 py-1 ${
                    room.is_open
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {room.is_open ? '신청 열림' : '신청 마감'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleToggleRoomOpen(room, !room.is_open)}
                    disabled={roomWorking || !featureEnabled || !seatOpen}
                    className={`rounded-[8px] px-3 py-2 transition-all duration-200 ease-ios active:scale-[0.97] disabled:opacity-50 ${
                      room.is_open
                        ? 'bg-white text-[#1d1d1f] hover:bg-[#e8e8ed]'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {room.is_open ? '마감' : '열기'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleMoveRoom(room, -1)}
                    disabled={roomWorking || index === 0}
                    className="rounded-[8px] bg-white px-3 py-2 text-xs font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97] disabled:opacity-50"
                  >
                    위로
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleMoveRoom(room, 1)}
                    disabled={roomWorking || index === sortedRooms.length - 1}
                    className="rounded-[8px] bg-white px-3 py-2 text-xs font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97] disabled:opacity-50"
                  >
                    아래로
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => void handleSaveRoom(room)}
                    disabled={roomWorking || (roomNameInputs[room.id] ?? room.name).trim() === room.name}
                    className="rounded-[8px] bg-[#0071e3] px-3 py-2 text-xs font-semibold text-white transition-all duration-200 ease-ios hover:bg-blue-700 active:scale-[0.97] disabled:opacity-50"
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoomDeleteTarget(room)}
                    disabled={roomWorking || sortedRooms.length <= 1}
                    className="rounded-[8px] bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-all duration-200 ease-ios hover:bg-red-100 active:scale-[0.97] disabled:opacity-50"
                  >
                    삭제
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleEditRoom(room.id)}
                    disabled={roomWorking}
                    className="rounded-[8px] bg-white px-3 py-2 text-xs font-semibold text-[#1d1d1f] transition-all duration-200 ease-ios hover:bg-[#e8e8ed] active:scale-[0.97] disabled:opacity-50"
                  >
                    좌석 편집
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ───── Seat Assignment Modal ───── */}
      {modalSeatId !== null && tab === 'status' && (() => {
        const modalSeat = seatDrafts.find((s) => (s.persistedId ?? s.id) === modalSeatId)
        const currentReservation = seatReservationMap.get(modalSeatId)
        const currentEnrollment = currentReservation ? enrollmentMap.get(currentReservation.enrollment_id) : null

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={() => { setModalSeatId(null); setStudentSearch(''); setManualEnrollmentId(null) }}
          >
            <div
              className="w-full max-w-md rounded-[10px] bg-white p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#1d1d1f]">
                  {modalSeat?.label ?? `좌석 #${modalSeatId}`} 좌석 관리
                </h3>
                <button
                  type="button"
                  onClick={() => { setModalSeatId(null); setStudentSearch(''); setManualEnrollmentId(null) }}
                  className="text-sm font-semibold text-[#86868b] transition-all duration-200 ease-ios hover:text-[#1d1d1f] active:scale-[0.97]"
                >
                  닫기
                </button>
              </div>

              {currentEnrollment ? (
                <div className="mt-4">
                  <div className="rounded-[8px] border border-blue-200 bg-blue-50 px-4 py-3">
                    <p className="text-xs font-semibold text-[#0066cc]">현재 배정 학생</p>
                    <p className="mt-1 text-base font-bold text-[#1d1d1f]">
                      {currentEnrollment.exam_number ? `[${currentEnrollment.exam_number}] ` : ''}
                      {currentEnrollment.name}
                    </p>
                    {currentReservation ? (
                      <p className="mt-1 text-xs text-[#86868b]">
                        배정 시간: {new Date(currentReservation.updated_at).toLocaleString('ko-KR')}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => requestManualClear({
                      enrollmentId: currentReservation!.enrollment_id,
                      studentName: currentEnrollment.name,
                      seatLabel: modalSeat?.label ?? `#${modalSeatId}`,
                    })}
                    disabled={working}
                    className="mt-3 w-full rounded-[8px] bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition-all duration-200 ease-ios hover:bg-rose-50 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
                  >
                    배정 해제
                  </button>
                  <div className="mt-4 border-t border-[#f5f5f7] pt-4">
                    <p className="text-xs font-semibold text-[#86868b]">다른 학생으로 변경</p>
                  </div>
                </div>
              ) : null}

              <div className={currentEnrollment ? 'mt-2' : 'mt-4'}>
                <input
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="이름, 수험번호, 연락처로 검색"
                  className="w-full rounded-[8px] border border-[#d2d2d7] px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                  autoFocus
                />
                <div className="mt-2 max-h-60 overflow-y-auto rounded-[8px] border border-[#d2d2d7]">
                  {filteredEnrollments.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-[#86868b]">검색 결과 없음</p>
                  ) : (
                    filteredEnrollments.map((enrollment) => {
                      const isSelected = manualEnrollmentId === enrollment.id
                      const isAlreadyAssigned = reservations.some((r) => r.enrollment_id === enrollment.id)
                      return (
                        <button
                          key={enrollment.id}
                          type="button"
                          onClick={() => setManualEnrollmentId(isSelected ? null : enrollment.id)}
                          className={`flex w-full items-center justify-between gap-2 border-b border-[#f5f5f7] px-4 py-2.5 text-left text-sm transition-all duration-200 ease-ios active:scale-[0.99] last:border-b-0 ${
                            isSelected
                              ? 'bg-blue-50 font-bold text-blue-800'
                              : isAlreadyAssigned
                                ? 'bg-[#f5f5f7] text-[#86868b]'
                                : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
                          }`}
                        >
                          <span className="truncate">
                            {enrollment.exam_number ? `[${enrollment.exam_number}] ` : ''}
                            {enrollment.name}
                          </span>
                          {isAlreadyAssigned ? (
                            <span className="shrink-0 text-xs text-[#86868b]">배정됨</span>
                          ) : isSelected ? (
                            <span className="shrink-0 text-xs text-[#0066cc]">선택됨</span>
                          ) : null}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!manualEnrollmentId) return
                  const target = enrollments.find((e) => e.id === manualEnrollmentId)
                  const label = modalSeat?.label ?? `#${modalSeatId}`
                  requestManualAssign({
                    seatId: modalSeatId,
                    enrollmentId: manualEnrollmentId,
                    studentName: target?.name ?? '학생',
                    seatLabel: label,
                  })
                }}
                disabled={working || !manualEnrollmentId}
                className="mt-3 w-full rounded-[8px] bg-[#0071e3] px-4 py-3 text-sm font-bold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-60 disabled:active:scale-100"
              >
                {currentEnrollment ? '학생 변경' : '배정하기'}
              </button>
            </div>
          </div>
        )
      })()}
      </div>
    </>
  )
}
