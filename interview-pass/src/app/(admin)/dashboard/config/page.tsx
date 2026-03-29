import { getAppConfig } from '@/lib/app-config'
import ConfigFeatureDisabled from './_components/ConfigFeatureDisabled'
import ConfigHub from './_components/ConfigHub'

export default async function ConfigPage() {
  const config = await getAppConfig()

  if (!config.admin_config_hub_enabled) {
    return (
      <ConfigFeatureDisabled
        title="설정 허브가 비활성화되었습니다."
        description="이 지점에서는 관리자 설정 개요 페이지를 사용하지 않습니다. 기능 설정 페이지에서 다시 켜면 언제든지 복구할 수 있습니다."
      />
    )
  }

  return <ConfigHub />
}
