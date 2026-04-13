import { getCourseById, listCourseEnrollments } from '@/lib/class-pass-data'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import BulkPhotoUploadPageClient, { type PhotosPageData } from './bulk-photo-upload-page-client'

type BulkPhotoUploadPageProps = {
  params: Promise<{ id: string }>
}

async function loadInitialData(courseId: number): Promise<PhotosPageData | null> {
  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)
  if (!course) {
    return null
  }

  const enrollments = await listCourseEnrollments(courseId)
  return { course, enrollments }
}

export default async function BulkPhotoUploadPage({ params }: BulkPhotoUploadPageProps) {
  const { id } = await params
  const courseId = parsePositiveInt(id)

  if (!courseId) {
    return <BulkPhotoUploadPageClient initialError="잘못된 강의 ID입니다." initialLoaded />
  }

  try {
    const data = await loadInitialData(courseId)
    if (!data) {
      return <BulkPhotoUploadPageClient initialError="강의를 찾을 수 없습니다." initialLoaded />
    }

    return <BulkPhotoUploadPageClient initialData={data} />
  } catch {
    return <BulkPhotoUploadPageClient initialError="사진 업로드 페이지를 불러오지 못했습니다." initialLoaded={false} />
  }
}
