import { invalidateCache } from '@/lib/cache/revalidate'

export type DistributionRefreshNotice = { refreshRequired?: true; warning?: string }

/** Cache invalidation follows a committed write and must never undo its result. */
export async function invalidateDistributionCache(): Promise<DistributionRefreshNotice> {
  try {
    await invalidateCache('distribution-logs')
    return {}
  } catch (error) {
    console.error('[distribution.cache] Saved result needs refresh', error)
    return { refreshRequired: true, warning: '처리는 저장됐습니다. 화면 반영이 늦으면 수령 현황을 새로고침해 주세요.' }
  }
}
