import ConfigFeatureDisabled from '../_components/ConfigFeatureDisabled'
import { getAppConfig } from '@/lib/app-config'
import PopupConfigManager from '../_components/PopupConfigManager'

export default async function ConfigPopupsPage() {
  const config = await getAppConfig()
  if (!config.admin_popup_management_enabled) {
    return (
      <ConfigFeatureDisabled
        title="팝업 관리가 비활성화되었습니다."
        description="이 지점에서는 학생 수령 안내/환불 팝업 편집 기능을 사용하지 않습니다. 기능 설정에서 다시 켜면 즉시 복구됩니다."
      />
    )
  }

  return <PopupConfigManager />
}
