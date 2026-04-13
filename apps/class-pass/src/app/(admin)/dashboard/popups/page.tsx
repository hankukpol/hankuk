import { listPopupsByDivision } from '@/lib/popups'
import { getServerTenantType } from '@/lib/tenant.server'
import PopupManagementPageClient from './popups-page-client'

export default async function PopupManagementPage() {
  try {
    const division = await getServerTenantType()
    const popups = await listPopupsByDivision(division)
    return <PopupManagementPageClient initialPopups={popups} />
  } catch {
    return (
      <PopupManagementPageClient
        initialPopups={[]}
        initialError="팝업 목록을 불러오지 못했습니다."
        initialLoaded={false}
      />
    )
  }
}
