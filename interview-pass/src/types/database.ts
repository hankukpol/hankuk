export interface Student {
  id: string
  name: string
  phone: string
  exam_number: string | null
  gender: string | null
  region: string | null
  series: string | null
  created_at: string
  updated_at: string
}

export interface Material {
  id: number
  name: string
  description: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DistributionLog {
  id: number
  student_id: string
  material_id: number
  distributed_at: string
  distributed_by: string
  note: string
  students?: Pick<Student, 'name' | 'phone' | 'exam_number' | 'series' | 'region'>
  materials?: Pick<Material, 'name'>
}

export interface AppConfig {
  config_key: string
  config_value: string | number | boolean | object
  description: string
  updated_at: string
}

export interface PopupContent {
  popup_key: string
  title: string
  body: string
  is_active: boolean
  updated_at: string
}

export interface QrTokenPayload {
  sid: string    // student id
  ts: number     // issued at (unix ms)
  exp: number    // expires at (unix ms)
}

export interface StaffJwtPayload {
  sub: string    // session id
  role: 'staff' | 'admin'
  division?: 'police' | 'fire'
  adminId?: string
  staffAccountId?: string
  staffLoginId?: string
  staffName?: string
  authMethod?: 'legacy_staff_pin' | 'staff_account' | 'staff_shared' | 'admin_pin' | 'admin_shared'
  sharedUserId?: string | null
  sharedLinked?: boolean
  iat: number
  exp: number
}
