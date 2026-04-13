import { getCourseById, listMaterialsForCourse } from '@/lib/class-pass-data'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import CourseMaterialsPageClient, { type MaterialsPageData } from './course-materials-page-client'

type CourseMaterialsPageProps = {
  params: Promise<{ id: string }>
}

async function loadInitialData(courseId: number): Promise<MaterialsPageData | null> {
  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)
  if (!course) {
    return null
  }

  const materials = await listMaterialsForCourse(courseId)
  return { course, materials }
}

export default async function CourseMaterialsPage({ params }: CourseMaterialsPageProps) {
  const { id } = await params
  const courseId = parsePositiveInt(id)

  if (!courseId) {
    return <CourseMaterialsPageClient initialError="잘못된 강의 ID입니다." initialLoaded />
  }

  try {
    const data = await loadInitialData(courseId)
    if (!data) {
      return <CourseMaterialsPageClient initialError="강의를 찾을 수 없습니다." initialLoaded />
    }

    return <CourseMaterialsPageClient initialData={data} />
  } catch {
    return <CourseMaterialsPageClient initialError="자료 페이지를 불러오지 못했습니다." initialLoaded={false} />
  }
}
