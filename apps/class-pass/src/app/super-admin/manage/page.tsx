import { listBranches, listOperatorAccounts } from '@/lib/branch-ops'
import SuperAdminManagePageClient from './super-admin-manage-page-client'

export default async function SuperAdminManagePage() {
  try {
    const [branches, accounts] = await Promise.all([
      listBranches(),
      listOperatorAccounts(),
    ])

    return (
      <SuperAdminManagePageClient
        initialBranches={branches}
        initialAccounts={accounts}
      />
    )
  } catch {
    return (
      <SuperAdminManagePageClient
        initialBranches={[]}
        initialAccounts={[]}
        initialError="운영 관리 화면을 불러오지 못했습니다."
        initialLoaded={false}
      />
    )
  }
}
