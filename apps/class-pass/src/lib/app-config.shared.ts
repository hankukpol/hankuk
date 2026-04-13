import type { TrackType } from '@/lib/tenant'

export const APP_FEATURE_KEYS = [
  'student_login_enabled',
  'student_courses_enabled',
  'student_pass_enabled',
  'staff_scan_enabled',
  'admin_course_management_enabled',
  'admin_student_management_enabled',
  'admin_seat_management_enabled',
  'admin_material_management_enabled',
  'admin_log_view_enabled',
  'admin_config_enabled',
] as const

export type AppFeatureKey = (typeof APP_FEATURE_KEYS)[number]
export type AppFeatureScope = 'student' | 'staff' | 'admin'

export type AppConfigSnapshot = {
  branch_name: string
  branch_track_type: TrackType
  branch_description: string
  branch_admin_title: string
  branch_series_label: string
  branch_region_label: string
  app_name: string
  theme_color: string
} & Record<AppFeatureKey, boolean>

export const APP_FEATURE_META: Record<
  AppFeatureKey,
  {
    label: string
    scope: AppFeatureScope
    disabledMessage: string
  }
> = {
  student_login_enabled: {
    label: '학생 로그인',
    scope: 'student',
    disabledMessage: '학생 로그인이 현재 비활성화되어 있습니다.',
  },
  student_courses_enabled: {
    label: '강좌 목록',
    scope: 'student',
    disabledMessage: '수강 중인 강좌 목록이 현재 비활성화되어 있습니다.',
  },
  student_pass_enabled: {
    label: '수강증 화면',
    scope: 'student',
    disabledMessage: '수강증 화면이 현재 비활성화되어 있습니다.',
  },
  staff_scan_enabled: {
    label: '직원 스캔',
    scope: 'staff',
    disabledMessage: '직원 스캔 기능이 현재 비활성화되어 있습니다.',
  },
  admin_course_management_enabled: {
    label: '강좌 관리',
    scope: 'admin',
    disabledMessage: '강좌 관리 기능이 현재 비활성화되어 있습니다.',
  },
  admin_student_management_enabled: {
    label: '수강생 관리',
    scope: 'admin',
    disabledMessage: '수강생 관리 기능이 현재 비활성화되어 있습니다.',
  },
  admin_seat_management_enabled: {
    label: '좌석 관리',
    scope: 'admin',
    disabledMessage: '좌석 관리 기능이 현재 비활성화되어 있습니다.',
  },
  admin_material_management_enabled: {
    label: '자료 관리',
    scope: 'admin',
    disabledMessage: '자료 관리 기능이 현재 비활성화되어 있습니다.',
  },
  admin_log_view_enabled: {
    label: '배부 로그',
    scope: 'admin',
    disabledMessage: '배부 로그 화면이 현재 비활성화되어 있습니다.',
  },
  admin_config_enabled: {
    label: '지점 설정',
    scope: 'admin',
    disabledMessage: '지점 설정 화면이 현재 비활성화되어 있습니다.',
  },
}

export const APP_CONFIG_DEFAULTS: AppConfigSnapshot = {
  branch_name: '경찰',
  branch_track_type: 'police',
  branch_description: '강좌 수강증과 좌석 배정, 자료 배부를 한곳에서 운영합니다.',
  branch_admin_title: 'Class Pass 관리자',
  branch_series_label: '구분',
  branch_region_label: '응시지',
  app_name: 'Class Pass',
  theme_color: '#1A237E',
  student_login_enabled: true,
  student_courses_enabled: true,
  student_pass_enabled: true,
  staff_scan_enabled: true,
  admin_course_management_enabled: true,
  admin_student_management_enabled: true,
  admin_seat_management_enabled: true,
  admin_material_management_enabled: true,
  admin_log_view_enabled: true,
  admin_config_enabled: true,
}

export const APP_CONFIG_DESCRIPTIONS: Record<keyof AppConfigSnapshot, string> = {
  branch_name: '지점명',
  branch_track_type: '계열',
  branch_description: '지점 설명',
  branch_admin_title: '관리자 타이틀',
  branch_series_label: '계열 라벨',
  branch_region_label: '지점 라벨',
  app_name: '앱 이름',
  theme_color: '테마 색상',
  student_login_enabled: '학생 로그인 사용',
  student_courses_enabled: '강좌 목록 사용',
  student_pass_enabled: '수강증 화면 사용',
  staff_scan_enabled: '직원 스캔 사용',
  admin_course_management_enabled: '강좌 관리 사용',
  admin_student_management_enabled: '수강생 관리 사용',
  admin_seat_management_enabled: '좌석 관리 사용',
  admin_material_management_enabled: '자료 관리 사용',
  admin_log_view_enabled: '배부 로그 사용',
  admin_config_enabled: '지점 설정 사용',
}
