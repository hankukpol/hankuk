import type { AppConfigSnapshot } from '@/lib/app-config.shared'
import type { TenantType } from '@/lib/tenant'

export type CourseType = 'interview' | 'mock_exam' | 'lecture' | 'general'
export type CourseStatus = 'active' | 'archived'
export type EnrollmentStatus = 'active' | 'refunded'
export type EnrollmentStudentType = 'academy' | 'general'
export type StudentAuthMethod = 'birth_date' | 'pin'
export type MaterialType = 'handout' | 'textbook'
export type PaymentMethod = 'card' | 'homepage' | 'cash' | 'bank_transfer' | 'point' | 'mixed' | 'free' | 'other'
export type WritablePaymentMethod = Exclude<PaymentMethod, 'mixed'>
export type PaymentStatus = 'paid' | 'partial_refunded' | 'fully_refunded' | 'voided'
export type BillingStatus = 'unpaid' | 'partial' | 'paid' | 'exempt' | 'refunded'
export type PaymentCategory = 'tuition' | 'textbook' | 'material' | 'exam_fee' | 'extension' | 'etc'
export type BranchSeriesGroup = 'public' | 'career'
export type RefundMethod = 'card_cancel' | 'cash' | 'bank_transfer' | 'point' | 'other'
export type RefundReasonCategory =
  | 'withdrawal'
  | 'transfer'
  | 'schedule_change'
  | 'change_of_mind'
  | 'payment_correction'
  | 'policy_application'
  | 'other'

export const ENROLLMENT_STUDENT_TYPE_LABEL: Record<EnrollmentStudentType, string> = {
  academy: '학원생',
  general: '일반생',
}

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
  tuition_amount: number
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
  extra_site_url: string | null
  extra_site_label: string | null
  presence_location_enabled: boolean
  presence_enforcement_mode: 'monitor' | 'enforce'
  presence_latitude: number | null
  presence_longitude: number | null
  presence_radius_m: number
  presence_accuracy_max_m: number
  presence_required_for_attendance: boolean
  presence_required_for_designated_seat: boolean
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
  active_enrollment_count?: number
  total_enrollment_count?: number
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
  series_option_id: number | null
  series_group: BranchSeriesGroup | null
  series: string | null
  student_type: EnrollmentStudentType
  status: EnrollmentStatus
  photo_url: string | null
  memo: string | null
  refunded_at: string | null
  suspended_at: string | null
  suspension_reason: string | null
  suspended_by: string | null
  custom_data: Record<string, string>
  attendance_device?: AttendanceDeviceState | null
  billing?: EnrollmentBilling | null
  created_at: string
}

export interface EnrollmentBilling {
  id: number
  enrollment_id: number
  course_id: number
  expected_amount: number
  discount_amount: number
  discount_reason: string | null
  payable_amount: number
  tuition_exempt: boolean
  tuition_exempt_reason: string | null
  status: BillingStatus
  created_by_staff_id: number | null
  created_at: string
  updated_at: string
}

export type AttendanceDeviceStateStatus = 'unregistered' | 'active' | 'pending_reset'

export interface AttendanceDeviceState {
  status: AttendanceDeviceStateStatus
  registered_count: number
  max_registered_count: number
  bound_at: string | null
  last_seen_at: string | null
  reset_requested_at: string | null
  reset_requested_user_agent: string | null
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
  presence_location_verified: boolean
  presence_verified_at: string | null
  presence_verification_event_id: number | null
  presence_distance_m: number | null
  presence_accuracy_m: number | null
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
  source: 'manual' | 'schedule'
  schedule_id: number | null
  created_at: string
}

export interface DesignatedSeatDisplayDevice {
  id: number
  course_id: number
  device_name: string
  device_token_hash: string
  registered_by: string | null
  last_seen_at: string | null
  revoked_at: string | null
  revoked_by: string | null
  created_at: string
  updated_at: string
}

export interface DesignatedSeatDisplaySchedule {
  id: number
  course_id: number
  day_of_week: number
  start_time: string
  end_time: string
  label: string | null
  is_active: boolean
  created_at: string
  updated_at: string
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

export type DesignatedSeatAttendanceStatus = 'present' | 'absent'

export type DesignatedSeatAttendanceEventType =
  | 'seat_reserved'
  | 'seat_changed'
  | 'seat_unchanged'
  | 'admin_seat_reserved'
  | 'admin_seat_changed'
  | 'admin_seat_unchanged'

export interface DesignatedSeatAttendanceRecord {
  enrollmentId: number
  studentName: string
  examNumber: string | null
  phone: string
  status: DesignatedSeatAttendanceStatus
  consecutiveAbsences: number
  lastAttendedDate: string | null
  seatId: number | null
  seatLabel: string | null
  checkedInAt: string | null
  eventType: DesignatedSeatAttendanceEventType | null
}

export interface DesignatedSeatAttendanceDashboard {
  date: string
  courseId: number
  stats: {
    targetCount: number
    presentCount: number
    absentCount: number
    attendanceRate: number
  }
  records: DesignatedSeatAttendanceRecord[]
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
  subject_id: number | null
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
  subject_id: number | null
  device_key_hash: string
  attended_date: string
  attended_at: string
  created_at: string
}

export interface AttendanceExcuse {
  id: number
  course_id: number
  enrollment_id: number
  subject_id: number
  excuse_date: string
  reason: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface AttendanceHistoryEntry {
  attended_date: string
  attended_at: string
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
  material_type: MaterialType
}

export interface TextbookAssignment {
  id: number
  enrollment_id: number
  material_id: number
  assigned_at: string
  assigned_by: string | null
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

export interface EnrollmentPaymentItem {
  id: number
  payment_id: number
  label: string
  amount: number
  sort_order: number
}

export interface EnrollmentRefund {
  id: number
  payment_id: number
  amount: number
  method: RefundMethod
  reason_category: RefundReasonCategory
  reason: string | null
  cancel_receipt_no: string | null
  refund_account_last4: string | null
  refunded_at: string
  refund_date: string
  processed_by_staff_id: number | null
  memo: string | null
  created_at: string
}

export interface EnrollmentPayment {
  id: number
  enrollment_id: number
  course_id: number
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  category: PaymentCategory
  paid_at: string
  paid_date: string
  memo: string | null
  card_last4: string | null
  installment_months: number
  bank_name: string | null
  bank_account_last4: string | null
  cash_receipt_approval_no: string | null
  series_option_id_snapshot: number | null
  series_group_snapshot: BranchSeriesGroup | null
  series_label_snapshot: string | null
  created_by_staff_id: number | null
  created_at: string
  updated_at: string
  enrollment_payment_items?: EnrollmentPaymentItem[]
  enrollment_refunds?: EnrollmentRefund[]
  enrollments?: Pick<
    Enrollment,
    'id' | 'name' | 'phone' | 'exam_number' | 'status' | 'series_option_id' | 'series_group' | 'series'
  > | null
  courses?: Pick<Course, 'id' | 'name'> | null
}

export interface PaymentEvent {
  id: number
  payment_id: number | null
  enrollment_id: number | null
  event_type: 'payment_created' | 'payment_updated' | 'payment_voided' | 'refund_created' | 'refund_voided'
  actor_staff_id: number | null
  before_json: Record<string, unknown> | null
  after_json: Record<string, unknown> | null
  created_at: string
}

export interface AppConfigRecord {
  id: number
  key: string
  value: string | null
  updated_at: string
}

export interface PassCourseSummary {
  enrollment_id: number
  suspended_at: string | null
  course: Pick<
    Course,
    | 'id'
    | 'name'
    | 'slug'
    | 'status'
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
  attendanceHistory: AttendanceHistoryEntry[]
  materials: Material[]
  receipts: Record<number, string>
  textbooks: Material[]
  textbookReceipts: Record<number, string>
  qrToken: string
}

export interface ArchivedAttendanceSummary {
  enabled: boolean
  total_count: number
  latest_attended_at: string | null
  attended_today: boolean
  attended_at: string | null
}

export interface ArchivedPassPayload {
  course: Course
  enrollment: Enrollment
  attendanceSummary: ArchivedAttendanceSummary
  materials: Material[]
  receipts: Record<number, string>
  textbooks: Material[]
  textbookReceipts: Record<number, string>
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

export interface BranchSeriesOption {
  id: number
  branch_id: number
  group_key: BranchSeriesGroup
  label: string
  is_default: boolean
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
