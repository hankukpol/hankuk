import type { AppFeatureKey } from '@/lib/app-config.shared'

type ConfigSection = {
  key: string
  href: string
  label: string
  title: string
  description: string
  feature?: AppFeatureKey
}

export const CONFIG_SECTIONS: readonly ConfigSection[] = [
  {
    key: 'overview',
    href: '/dashboard/config',
    label: '개요',
    title: '설정 허브',
    description: '현재 지점 설정 상태를 확인하고 각 설정 섹션으로 이동합니다.',
    feature: 'admin_config_hub_enabled',
  },
  {
    key: 'app',
    href: '/dashboard/config/app',
    label: '앱',
    title: '앱 이름과 테마',
    description: '서비스 전반에 노출되는 앱 이름과 테마 색상을 관리합니다.',
    feature: 'admin_app_settings_enabled',
  },
  {
    key: 'features',
    href: '/dashboard/config/features',
    label: '기능',
    title: '기능 토글',
    description: '학생, 직원, 관리자, 공개 기능을 지점별로 켜고 끕니다.',
  },
  {
    key: 'popups',
    href: '/dashboard/config/popups',
    label: '팝업',
    title: '팝업 노출',
    description: '학생 수령 화면에 표시되는 안내/환불 팝업을 관리합니다.',
    feature: 'admin_popup_management_enabled',
  },
  {
    key: 'access',
    href: '/dashboard/config/access',
    label: '접근',
    title: '관리자 접근 정보',
    description: '관리자 ID와 직원/관리자 PIN 설정을 별도로 관리합니다.',
    feature: 'admin_access_management_enabled',
  },
  {
    key: 'cache',
    href: '/dashboard/config/cache',
    label: '캐시',
    title: '캐시 도구',
    description: '운영 변경 후 설정, 팝업, 자료 캐시를 수동으로 갱신합니다.',
    feature: 'admin_cache_tools_enabled',
  },
] as const
