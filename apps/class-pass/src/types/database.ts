import type { AppConfigSnapshot } from '@/lib/app-config.shared'
import type { TenantType } from '@/lib/tenant'

export type CourseType = 'interview' | 'mock_exam' | 'lecture' | 'general'
export type CourseStatus = 'active' | 'archived'
export type EnrollmentStatus = 'active' | 'refunded'
export type StudentAuthMethod = 'birth_date' | 'pin'

export interface EnrollmentFieldDef {
  key: string
  label: string
  type: 'text' | 'select'
  options?: string[]
}

export interface Course {
  id: number
  division: TenantType
  name: string
  slug: string
  course_type: CourseType
  status: CourseStatus
  theme_color: string | null
  feature_qr_pass: boolean
  feature_qr_distribution: boolean
  feature_seat_assignment: boolean
  feature_designated_seat: boolean
  feature_attendance: boolean
  feature_time_window: boolean
  feature_photo: boolean
  feature_dday: boolean
  feature_notices: boolean
  feature_refund_policy: boolean
  feature_exam_delivery_mode: boolean
  feature_weekday_color: boolean
  feature_anti_forgery_motion: boolean
  time_window_start: string | null
  time_window_end: string | null
  target_date: string | null
  target_date_label: string | null
  notice_title: string | null
  notice_content: string | null
  notice_visible: boolean
  refund_policy: string | null
  kakao_chat_url: string | null
  enrolled_from: string | null
  enrolled_until: string | null
  enrollment_fields: EnrollmentFieldDef[]
  designated_seat_open: boolean
  attendance_open: boolean
  copied_from_course_id: number | null
  copied_from_course_name: string | null
  copied_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CourseSubject {
  id: number
  course_id: number
  name: string
  sort_order: number
}

export interface Student {
  id: number
  division: TenantType
  name: string
  phone: string
  exam_number: string | null
  birth_date: string | null
  pin_hash: string | null
  auth_method: StudentAuthMethod | null
  photo_url: string | null
  created_at: string
  updated_at: string
}

export interface Enrollment {
  id: number
  course_id: number
  student_id: number | null
  student_profile?: {
    id: number
    birth_date: string | null
    auth_method: StudentAuthMethod | null
  } | null
  name: string
  phone: string
  exam_number: string | null
  gender: string | null
  region: string | null
  series: string | null
  status: EnrollmentStatus
  photo_url: string | null
  memo: string | null
  refunded_at: string | null
  custom_data: Record<string, string>
  created_at: string
}

export interface SeatAssignment {
  id: number
  enrollment_id: number
  subject_id: number
  seat_number: string
  course_subjects?: Pick<CourseSubject, 'id' | 'name' | 'sort_order'>
}

export interface DesignatedSeatLayout {
  course_id: number
  columns: number
  rows: number
  aisle_columns: number[]
  created_at: string
  updated_at: string
}

export interface DesignatedSeat {
  id: number
  course_id: number
  label: string
  position_x: number
  position_y: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DesignatedSeatReservation {
  id: number
  course_id: number
  seat_id: number
  enrollment_id: number
  device_key_hash: string | null
  reserved_at: string
  updated_at: string
  seat?: Pick<DesignatedSeat, 'id' | 'label' | 'position_x' | 'position_y' | 'is_active'>
  enrollments?: Pick<Enrollment, 'id' | 'name' | 'exam_number' | 'status'>
}

export interface DesignatedSeatAuthSession {
  id: number
  course_id: number
  enrollment_id: number
  device_key_hash: string
  device_signature: Record<string, string>
  verification_method: 'qr' | 'code'
  verified_at: string
  expires_at: string
  used_for_reservation_at: string | null
  last_verified_rotation: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DesignatedSeatDisplaySession {
  id: number
  course_id: number
  display_token_hash: string
  created_by: string | null
  expires_at: string
  last_seen_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface DesignatedSeatEvent {
  id: number
  course_id: number
  enrollment_id: number | null
  seat_id: number | null
  event_type: string
  details: Record<string, unknown>
  created_at: string
}

export interface DesignatedSeatStudentState {
  enabled: boolean
  open: boolean
  verified: boolean
  writable: boolean
  requires_reauth: boolean
  restriction_reason: string | null
  auth_expires_at: string | null
  layout: DesignatedSeatLayout | null
  seats: DesignatedSeat[]
  occupied_seat_ids: number[]
  reservation: DesignatedSeatReservation | null
}

export interface AttendanceDisplaySession {
  id: number
  course_id: number
  display_token_hash: string
  created_by: string
  expires_at: string
  revoked_at: string | null
  last_seen_at: string
  created_at: string
}

export interface AttendanceRecord {
  id: number
  course_id: number
  enrollment_id: number
  display_session_id: number | null
  device_key_hash: string
  attended_date: string
  attended_at: string
  created_at: string
}

export interface AttendanceEvent {
  id: number
  course_id: number
  event_type: string
  details: Record<string, unknown>
  created_at: string
}

export interface AttendanceStudentState {
  enabled: boolean
  open: boolean
  attended_today: boolean
  attended_at: string | null
}

export interface Material {
  id: number
  course_id: number
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
}

export interface DistributionLog {
  id: number
  enrollment_id: number
  material_id: number
  distributed_at: string
  distributed_by: string | null
  note: string | null
  materials?: Pick<Material, 'name'>
}

export interface AppConfigRecord {
  id: number
  key: string
  value: string | null
  updated_at: string
}

export interface PassCourseSummary {
  enrollment_id: number
  course: Pick<
    Course,
    | 'id'
    | 'name'
    | 'slug'
    | 'course_type'
    | 'theme_color'
    | 'feature_qr_pass'
    | 'feature_qr_distribution'
    | 'feature_seat_assignment'
    | 'feature_designated_seat'
    | 'feature_attendance'
    | 'feature_time_window'
    | 'feature_dday'
    | 'feature_exam_delivery_mode'
    | 'feature_weekday_color'
    | 'feature_anti_forgery_motion'
  >
  attendance: Pick<AttendanceStudentState, 'enabled' | 'open' | 'attended_today' | 'attended_at'>
}

export interface PassPayload {
  appConfig: AppConfigSnapshot
  course: Course
  enrollment: Enrollment
  subjects: CourseSubject[]
  seatAssignments: SeatAssignment[]
  designatedSeat: DesignatedSeatStudentState
  attendance: AttendanceStudentState
  materials: Material[]
  receipts: Record<number, string>
  qrToken: string
}

export interface Branch {
  id: number
  slug: TenantType
  name: string
  track_type: 'police' | 'fire'
  description: string
  admin_title: string
  series_label: string
  region_label: string
  app_name: string
  theme_color: string
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface OperatorMembership {
  id: number
  operator_account_id: number
  role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'STAFF'
  branch_id: number | null
  is_active: boolean
  created_at: string
  updated_at: string
  branch?: Pick<Branch, 'id' | 'slug' | 'name' | 'track_type' | 'is_active'>
}

export interface OperatorAccount {
  id: number
  login_id: string
  display_name: string
  pin_hash: string | null
  shared_user_id: string | null
  is_active: boolean
  credential_version: number
  last_login_at: string | null
  created_at: string
  updated_at: string
  memberships?: OperatorMembership[]
}

export interface QrTokenPayload {
  enrollmentId: number
  courseId: number
  ts: number
  exp: number
}

export interface DesignatedSeatRotationTokenPayload {
  courseId: number
  displaySessionId: number
  rotation: number
  iat: number
  exp: number
}

export interface StaffJwtPayload {
  sub: string
  role: 'staff' | 'admin'
  division?: TenantType
  adminId?: string
  staffName?: string
  authMethod?: 'admin_pin' | 'staff_pin' | 'operator' | 'operator_staff' | 'portal_bridge' | 'super_admin'
  sessionVersion?: number
  accountId?: number
  membershipId?: number
  branchSlug?: TenantType
  sessionScope?: 'legacy' | 'branch_admin' | 'staff' | 'super_admin'
  credentialVersion?: number
  sharedUserId?: string
  iat: number
  exp: number
}
