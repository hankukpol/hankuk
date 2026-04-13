import { listStaffAccounts } from '@/lib/staff-accounts'
import StaffAccountsPageClient from './staff-page-client'

export default async function StaffAccountsPage() {
  try {
    const accounts = await listStaffAccounts()
    return <StaffAccountsPageClient initialAccounts={accounts} />
  } catch {
    return (
      <StaffAccountsPageClient
        initialAccounts={[]}
        initialError="직원 목록을 불러오지 못했습니다."
        initialLoaded={false}
      />
    )
  }
}
