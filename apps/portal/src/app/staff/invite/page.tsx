import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PortalNav } from '@/components/PortalNav'
import { StaffInviteForm } from '@/components/StaffInviteForm'
import { isSuperAdmin } from '@/lib/portal-access'
import { getPortalSession } from '@/lib/portal-session'
import { listStaffAppOptions } from '@/lib/staff-management'

export default async function StaffInvitePage() {
  const session = await getPortalSession()
  if (!session) {
    redirect('/login')
  }

  const superAdmin = await isSuperAdmin(session.userId)
  if (!superAdmin) {
    redirect('/')
  }

  const appOptions = await listStaffAppOptions()

  return (
    <>
      <PortalNav session={session} isSuperAdmin current="staff" />

      <section className="portal-content">
        <div className="portal-content-inner portal-stack">
          <Link href="/staff" className="portal-back-link">
            ← 직원 목록으로
          </Link>

          <div>
            <h1 className="portal-page-title">직원 초대</h1>
            <p className="portal-section-sub">포털 계정을 생성하고 앱별 운영 권한을 즉시 연결합니다.</p>
          </div>

          <StaffInviteForm appOptions={appOptions} />
        </div>
      </section>
    </>
  )
}
