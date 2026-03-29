import AppConfigManager from '../_components/AppConfigManager'
import ConfigFeatureDisabled from '../_components/ConfigFeatureDisabled'
import { getAppConfig } from '@/lib/app-config'

export default async function ConfigAppPage() {
  const config = await getAppConfig()

  if (!config.admin_app_settings_enabled) {
    return (
      <ConfigFeatureDisabled
        title="앱 기본설정이 비활성화되었습니다."
        description="이 지점에서는 앱 이름과 테마 색상 수정 기능을 잠가 두었습니다. 기능 설정에서 다시 켜면 페이지와 저장 API가 함께 복구됩니다."
      />
    )
  }

  return <AppConfigManager />
}
