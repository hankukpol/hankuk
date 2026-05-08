import { isAppFeatureEnabled } from '@/lib/app-config'
import { getCourseById } from '@/lib/class-pass-data'
import {
  ensureCourseRooms,
  getActiveDisplaySessionForDisplayTarget,
  getDesignatedSeatAdminData,
  resolveActiveRoomId,
} from '@/lib/designated-seat/service'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import CourseDesignatedSeatsPageClient, {
  type AdminPayload,
} from './designated-seats-page-client'

type CourseDesignatedSeatsPageProps = {
  params: Promise<{ id: string }>
}

async function loadInitialPayload(courseId: number): Promise<AdminPayload | null> {
  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)
  if (!course) {
    return null
  }

  const rooms = await ensureCourseRooms(course.id)
  const activeRoomId = resolveActiveRoomId(rooms)
  if (!activeRoomId) {
    return null
  }

  const [data, activeDisplaySession] = await Promise.all([
    getDesignatedSeatAdminData(course.id, activeRoomId),
    getActiveDisplaySessionForDisplayTarget(course.id, null, activeRoomId),
  ])

  return {
    course,
    rooms,
    activeRoomId,
    ...data,
    activeDisplaySession: activeDisplaySession
      ? {
        id: activeDisplaySession.id,
        expires_at: activeDisplaySession.expires_at,
        last_seen_at: activeDisplaySession.last_seen_at,
        source: activeDisplaySession.source ?? 'manual',
        display_slot_id: activeDisplaySession.display_slot_id ?? null,
        room_id: activeDisplaySession.room_id,
      }
      : null,
  }
}

export default async function CourseDesignatedSeatsPage({
  params,
}: CourseDesignatedSeatsPageProps) {
  const { id } = await params
  const courseId = parsePositiveInt(id)

  if (!courseId) {
    return (
      <CourseDesignatedSeatsPageClient
        initialError="잘못된 강의 ID입니다."
        initialLoaded
      />
    )
  }

  const featureEnabled = await isAppFeatureEnabled('admin_seat_management_enabled')
  if (!featureEnabled) {
    return (
      <CourseDesignatedSeatsPageClient
        initialError="지정좌석 기능이 현재 사용 설정되어 있지 않습니다."
        initialLoaded
      />
    )
  }

  try {
    const payload = await loadInitialPayload(courseId)
    if (!payload) {
      return (
        <CourseDesignatedSeatsPageClient
          initialError="강의를 찾을 수 없습니다."
          initialLoaded
        />
      )
    }

    return <CourseDesignatedSeatsPageClient initialPayload={payload} />
  } catch {
    return (
      <CourseDesignatedSeatsPageClient
        initialError="지정좌석 정보를 불러오지 못했습니다."
        initialLoaded={false}
      />
    )
  }
}
