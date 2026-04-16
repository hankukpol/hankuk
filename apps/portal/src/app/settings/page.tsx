import { redirect } from 'next/navigation'
import { PortalNav } from '@/components/PortalNav'
import { SettingsAppsForm } from '@/components/SettingsAppsForm'
import { isSuperAdmin } from '@/lib/portal-access'
import { getPortalSession } from '@/lib/portal-session'
import { listSettingsApps } from '@/lib/staff-management'

export default async function SettingsPage() {
  const session = await getPortalSession()
  if (!session) {
    redirect('/login')
  }

  const superAdmin = await isSuperAdmin(session.userId)
  if (!superAdmin) {
    redirect('/')
  }

  const apps = await listSettingsApps()

  return (
    <>
      <PortalNav session={session} isSuperAdmin current="settings" />

      <section className="portal-content">
        <div className="portal-content-inner portal-stack">
          <div>
            <h1 className="portal-page-title">포털 설정</h1>
            <p className="portal-section-sub">대시보드와 관리 화면에 표시되는 앱 이름을 변경합니다.</p>
          </div>

          <SettingsAppsForm apps={apps} />
        </div>
      </section>
    </>
  )
}
