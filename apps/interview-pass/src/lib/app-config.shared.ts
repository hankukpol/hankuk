export const APP_FEATURE_KEYS = [
  'student_login_enabled',
  'student_receipt_enabled',
  'receipt_qr_enabled',
  'receipt_materials_enabled',
  'staff_scan_enabled',
  'staff_quick_distribution_enabled',
  'admin_config_hub_enabled',
  'admin_app_settings_enabled',
  'admin_dashboard_overview_enabled',
  'admin_student_management_enabled',
  'admin_materials_enabled',
  'admin_distribution_logs_enabled',
  'admin_popup_management_enabled',
  'admin_access_management_enabled',
  'admin_cache_tools_enabled',
  'monitor_enabled',
] as const

export type AppFeatureKey = (typeof APP_FEATURE_KEYS)[number]
export type AppFeatureScope = 'student' | 'staff' | 'admin' | 'public'

export type AppFeatureMeta = {
  label: string
  description: string
  scope: AppFeatureScope
  disabledMessage: string
}

export type AppRecoverySurface = {
  label: string
  path: string
  description: string
}

export type AppConfigSnapshot = {
  app_name: string
  theme_color: string
} & Record<AppFeatureKey, boolean>

export const APP_FEATURE_META: Record<AppFeatureKey, AppFeatureMeta> = {
  student_login_enabled: {
    label: '학생 로그인',
    description: '학생이 랜딩 페이지에서 본인 정보를 조회하고 로그인할 수 있게 합니다.',
    scope: 'student',
    disabledMessage: '학생 로그인이 현재 비활성화되어 있습니다.',
  },
  student_receipt_enabled: {
    label: '수령 포털',
    description: '학생 로그인 이후의 수령증 메인 페이지를 제어합니다.',
    scope: 'student',
    disabledMessage: '학생 수령 포털이 현재 비활성화되어 있습니다.',
  },
  receipt_qr_enabled: {
    label: '수령 QR',
    description: '학생 수령 페이지의 개인 QR 블록 노출 여부를 제어합니다.',
    scope: 'student',
    disabledMessage: '수령 QR이 현재 비활성화되어 있습니다.',
  },
  receipt_materials_enabled: {
    label: '수령 현황 목록',
    description: '학생 수령 페이지의 자료별 수령 상태 목록을 제어합니다.',
    scope: 'student',
    disabledMessage: '수령 현황 목록이 현재 비활성화되어 있습니다.',
  },
  staff_scan_enabled: {
    label: '직원 QR 스캔',
    description: '직원이 스캔 화면을 열고 QR로 배부할 수 있게 합니다.',
    scope: 'staff',
    disabledMessage: '직원 QR 스캔이 현재 비활성화되어 있습니다.',
  },
  staff_quick_distribution_enabled: {
    label: '직원 빠른 배부',
    description: '직원이 QR 없이 전화번호로 빠르게 배부할 수 있게 합니다.',
    scope: 'staff',
    disabledMessage: '직원 빠른 배부가 현재 비활성화되어 있습니다.',
  },
  admin_config_hub_enabled: {
    label: '설정 허브',
    description: '각 관리자 설정 섹션으로 이동하는 개요 페이지를 제어합니다.',
    scope: 'admin',
    disabledMessage: '설정 허브가 현재 비활성화되어 있습니다.',
  },
  admin_app_settings_enabled: {
    label: '앱 기본설정',
    description: '앱 이름과 테마 색상을 수정하는 페이지를 제어합니다.',
    scope: 'admin',
    disabledMessage: '앱 기본설정 페이지가 현재 비활성화되어 있습니다.',
  },
  admin_dashboard_overview_enabled: {
    label: '관리자 대시보드',
    description: '관리자 메인 대시보드 요약 카드와 현황 패널을 제어합니다.',
    scope: 'admin',
    disabledMessage: '관리자 대시보드가 현재 비활성화되어 있습니다.',
  },
  admin_student_management_enabled: {
    label: '학생/수령 관리',
    description: '학생 목록, 수령 상태, 수동 배부 도구를 제어합니다.',
    scope: 'admin',
    disabledMessage: '학생/수령 관리가 현재 비활성화되어 있습니다.',
  },
  admin_materials_enabled: {
    label: '자료 설정',
    description: '자료 생성, 정렬, 활성화 도구를 제어합니다.',
    scope: 'admin',
    disabledMessage: '자료 설정이 현재 비활성화되어 있습니다.',
  },
  admin_distribution_logs_enabled: {
    label: '배부 로그',
    description: '배부 로그 목록, 내보내기, 되돌리기 도구를 제어합니다.',
    scope: 'admin',
    disabledMessage: '배부 로그가 현재 비활성화되어 있습니다.',
  },
  admin_popup_management_enabled: {
    label: '팝업 관리',
    description: '학생 수령 화면의 안내/환불 팝업 편집 기능을 제어합니다.',
    scope: 'admin',
    disabledMessage: '팝업 관리가 현재 비활성화되어 있습니다.',
  },
  admin_access_management_enabled: {
    label: '접근 정보 관리',
    description: '관리자 ID와 직원/관리자 PIN 관리 기능을 제어합니다.',
    scope: 'admin',
    disabledMessage: '접근 정보 관리가 현재 비활성화되어 있습니다.',
  },
  admin_cache_tools_enabled: {
    label: '캐시 도구',
    description: '설정, 팝업, 자료 캐시를 수동으로 갱신하는 도구를 제어합니다.',
    scope: 'admin',
    disabledMessage: '캐시 도구가 현재 비활성화되어 있습니다.',
  },
  monitor_enabled: {
    label: '공개 모니터',
    description: '공개 현황 모니터 페이지와 모니터 통계 API를 제어합니다.',
    scope: 'public',
    disabledMessage: '공개 모니터가 현재 비활성화되어 있습니다.',
  },
}

export const APP_FEATURE_GROUPS: Array<{
  key: AppFeatureScope
  title: string
  description: string
}> = [
  {
    key: 'student',
    title: '학생 화면',
    description: '학생 로그인과 수령 경험을 지점별로 독립 제어합니다.',
  },
  {
    key: 'staff',
    title: '직원 도구',
    description: '직원 스캔과 빠른 배부 기능을 각각 제어합니다.',
  },
  {
    key: 'admin',
    title: '관리자 운영',
    description: '대시보드, 설정 페이지, 운영 도구를 지점별로 분리 제어합니다.',
  },
  {
    key: 'public',
    title: '공개 화면',
    description: '외부 공개용 현황 모니터 노출 여부를 제어합니다.',
  },
]

export const APP_RECOVERY_SURFACES: AppRecoverySurface[] = [
  {
    label: '기능 복구',
    path: '/dashboard/config/features',
    description:
      '항상 열어 두어 지점 관리자가 학생, 직원, 관리자, 공개 기능을 다시 켤 수 있게 합니다.',
  },
  {
    label: '관리자 로그인',
    path: '/admin/login',
    description:
      '대시보드 기능이 꺼져 있어도 관리자 영역으로 다시 들어올 수 있도록 유지합니다.',
  },
  {
    label: '초기 관리자 설정',
    path: '/admin/setup',
    description:
      '지점에 관리자 PIN이 아직 없을 때 초기 설정 경로로 계속 유지합니다.',
  },
]

export const APP_CONFIG_DEFAULTS: AppConfigSnapshot = {
  app_name: '',
  theme_color: '#1a237e',
  student_login_enabled: true,
  student_receipt_enabled: true,
  receipt_qr_enabled: true,
  receipt_materials_enabled: true,
  staff_scan_enabled: true,
  staff_quick_distribution_enabled: true,
  admin_config_hub_enabled: true,
  admin_app_settings_enabled: true,
  admin_dashboard_overview_enabled: true,
  admin_student_management_enabled: true,
  admin_materials_enabled: true,
  admin_distribution_logs_enabled: true,
  admin_popup_management_enabled: true,
  admin_access_management_enabled: true,
  admin_cache_tools_enabled: true,
  monitor_enabled: true,
}

export const APP_CONFIG_DESCRIPTIONS: Record<keyof AppConfigSnapshot, string> = {
  app_name: '앱 이름',
  theme_color: '테마 색상',
  student_login_enabled: '학생 로그인 사용',
  student_receipt_enabled: '학생 수령 포털 사용',
  receipt_qr_enabled: '수령 QR 사용',
  receipt_materials_enabled: '수령 현황 목록 사용',
  staff_scan_enabled: '직원 QR 스캔 사용',
  staff_quick_distribution_enabled: '직원 빠른 배부 사용',
  admin_config_hub_enabled: '설정 허브 사용',
  admin_app_settings_enabled: '앱 기본설정 사용',
  admin_dashboard_overview_enabled: '관리자 대시보드 사용',
  admin_student_management_enabled: '학생/수령 관리 사용',
  admin_materials_enabled: '자료 설정 사용',
  admin_distribution_logs_enabled: '배부 로그 사용',
  admin_popup_management_enabled: '팝업 관리 사용',
  admin_access_management_enabled: '접근 정보 관리 사용',
  admin_cache_tools_enabled: '캐시 도구 사용',
  monitor_enabled: '공개 모니터 사용',
}

export function isStaffDistributionEnabled(
  config: Pick<AppConfigSnapshot, 'staff_scan_enabled' | 'staff_quick_distribution_enabled'>,
) {
  return config.staff_scan_enabled || config.staff_quick_distribution_enabled
}
