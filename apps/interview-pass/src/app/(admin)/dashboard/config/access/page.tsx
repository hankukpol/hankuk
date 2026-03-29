import ConfigFeatureDisabled from '../_components/ConfigFeatureDisabled'
import { getAppConfig } from '@/lib/app-config'
import AccessConfigManager from '../_components/AccessConfigManager'

export default async function ConfigAccessPage() {
  const config = await getAppConfig()
  if (!config.admin_access_management_enabled) {
    return (
      <ConfigFeatureDisabled
        title="접근 정보 관리가 비활성화되었습니다."
        description="이 지점에서는 관리자 ID와 직원/관리자 PIN 변경 도구를 잠가 두었습니다. 기능 설정에서 다시 켜면 즉시 복구됩니다."
      />
    )
  }

  return <AccessConfigManager />
}
