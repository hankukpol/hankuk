import ConfigFeatureDisabled from '../_components/ConfigFeatureDisabled'
import { getAppConfig } from '@/lib/app-config'
import CacheToolsManager from '../_components/CacheToolsManager'

export default async function ConfigCachePage() {
  const config = await getAppConfig()
  if (!config.admin_cache_tools_enabled) {
    return (
      <ConfigFeatureDisabled
        title="캐시 도구가 비활성화되었습니다."
        description="이 지점에서는 수동 캐시 초기화 도구를 사용하지 않습니다. 기능 설정에서 다시 켜면 즉시 복구됩니다."
      />
    )
  }

  return <CacheToolsManager />
}
