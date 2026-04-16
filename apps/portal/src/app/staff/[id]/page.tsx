import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PortalNav } from '@/components/PortalNav'
import { StaffDetailForm } from '@/components/StaffDetailForm'
import { isSuperAdmin } from '@/lib/portal-access'
import { getPortalSession } from '@/lib/portal-session'
import { getStaffDetail, listStaffAppOptions } from '@/lib/staff-management'

type StaffDetailPageProps = {
  params: Promise<{ id: string }>
}

export default async function StaffDetailPage({ params }: StaffDetailPageProps) {
  const session = await getPortalSession()
  if (!session) {
    redirect('/login')
  }

  const superAdmin = await isSuperAdmin(session.userId)
  if (!superAdmin) {
    redirect('/')
  }

  const { id } = await params
  const [staff, appOptions] = await Promise.all([
    getStaffDetail(id),
    listStaffAppOptions({ includeElevatedRoles: true }),
  ])

  if (!staff) {
    notFound()
  }

  return (
    <>
      <PortalNav session={session} isSuperAdmin current="staff" />

      <section className="portal-content">
        <div className="portal-content-inner portal-stack">
          <Link href="/staff" className="portal-back-link">
            ← 직원 목록으로
          </Link>

          <div>
            <h1 className="portal-page-title">{staff.fullName || staff.email}</h1>
            <p className="portal-section-sub">직원별 앱 권한과 비밀번호를 관리할 수 있습니다.</p>
          </div>

          <StaffDetailForm staff={staff} appOptions={appOptions} canDeactivate={session.userId !== staff.id} />
        </div>
      </section>
    </>
  )
}
