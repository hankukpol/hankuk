import { invalidateCache } from '@/lib/cache/revalidate'

/** Run only after the DB mutation has committed; cache errors cannot undo it. */
export async function invalidateMaterialCache(): Promise<{ refreshRequired?: true; warning?: string }> {
  try {
    await invalidateCache('materials')
    return {}
  } catch (error) {
    console.error('materials.postcommit-cache', error)
    return {
      refreshRequired: true,
      warning: '변경 사항은 저장되었습니다. 다른 화면의 반영이 늦으면 잠시 후 새로고침해 주세요.',
    }
  }
}
