import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PortalNav } from '@/components/PortalNav'
import { getPortalRoleLabel, getPortalStatusLabel } from '@/lib/staff-management-config'
import { isSuperAdmin } from '@/lib/portal-access'
import { getPortalSession } from '@/lib/portal-session'
import { listSettingsApps, listStaff } from '@/lib/staff-management'

type StaffListPageProps = {
  searchParams: Promise<{
    search?: string
    role?: string
    app?: string
    status?: string
    page?: string
  }>
}

export default async function StaffListPage({ searchParams }: StaffListPageProps) {
  const session = await getPortalSession()
  if (!session) {
    redirect('/login')
  }

  const superAdmin = await isSuperAdmin(session.userId)
  if (!superAdmin) {
    redirect('/')
  }

  const resolvedSearchParams = await searchParams
  const page = Number(resolvedSearchParams.page ?? '1')
  const [staffResult, apps] = await Promise.all([
    listStaff({
      search: resolvedSearchParams.search,
      role: resolvedSearchParams.role,
      app: resolvedSearchParams.app,
      status: resolvedSearchParams.status,
      page: Number.isFinite(page) ? page : 1,
      limit: 20,
    }),
    listSettingsApps(),
  ])

  const totalPages = Math.max(1, Math.ceil(staffResult.total / staffResult.limit))

  return (
    <>
      <PortalNav session={session} isSuperAdmin current="staff" />

      <section className="portal-content">
        <div className="portal-content-inner portal-stack">
          <div className="portal-section-row">
            <div>
              <h1 className="portal-page-title">직원 관리</h1>
              <p className="portal-section-sub">운영 직원의 계정, 앱 권한, 상태를 한 곳에서 관리합니다.</p>
            </div>

            <Link href="/staff/invite" className="portal-button">
              직원 초대
            </Link>
          </div>

          <form className="portal-card portal-panel portal-filter-grid" method="GET">
            <input
              className="portal-input"
              type="search"
              name="search"
              defaultValue={resolvedSearchParams.search ?? ''}
              placeholder="이름, 이메일, 연락처 검색"
            />

            <select className="portal-input" name="role" defaultValue={resolvedSearchParams.role ?? ''}>
              <option value="">전체 역할</option>
              <option value="super_admin">총괄관리자</option>
              <option value="admin">관리자</option>
              <option value="assistant">조교</option>
              <option value="staff">직원</option>
            </select>

            <select className="portal-input" name="app" defaultValue={resolvedSearchParams.app ?? ''}>
              <option value="">전체 앱</option>
              {apps.map((app) => (
                <option key={app.appKey} value={app.appKey}>
                  {app.displayName}
                </option>
              ))}
            </select>

            <select className="portal-input" name="status" defaultValue={resolvedSearchParams.status ?? ''}>
              <option value="">전체 상태</option>
              <option value="active">활성</option>
              <option value="invited">초대됨</option>
              <option value="suspended">정지</option>
              <option value="archived">보관</option>
            </select>

            <button className="portal-button" type="submit">
              조회
            </button>
          </form>

          <div className="portal-card portal-panel">
            {staffResult.staff.length === 0 ? (
              <div className="portal-empty">
                <p>조건에 맞는 직원이 없습니다.</p>
                <p>검색어와 필터를 조정하거나 새 직원을 초대해보세요.</p>
              </div>
            ) : (
              <div className="portal-table-wrap">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th>이메일</th>
                      <th>앱 권한</th>
                      <th>마지막 로그인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffResult.staff.map((staff) => (
                      <tr key={staff.id}>
                        <td>
                          <Link href={`/staff/${staff.id}`} className="portal-table-link">
                            <strong>{staff.fullName || '-'}</strong>
                          </Link>
                          {staff.isSuperAdmin ? <span className="portal-status-chip danger">총괄관리자</span> : null}
                        </td>
                        <td>{staff.email}</td>
                        <td>
                          <div className="portal-chip-list">
                            {staff.apps.map((app) => (
                              <span key={`${app.appKey}-${app.roleKey}`} className="portal-chip">
                                {app.displayName} · {getPortalRoleLabel(app.roleKey)} · {getPortalStatusLabel(app.status)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>{staff.lastSignInAt ? new Date(staff.lastSignInAt).toLocaleString('ko-KR') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="portal-pagination">
            <span>
              총 {staffResult.total}명 · {staffResult.page} / {totalPages} 페이지
            </span>
          </div>
        </div>
      </section>
    </>
  )
}
