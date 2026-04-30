export type AttendanceCodeInvalidEventDetailsInput = {
  enrollmentId: number
  displaySessionId: number
  subjectId: number | null
  currentRotation: number
  userAgent: string | null
  deviceSource: 'cookie' | 'local'
  localKeyMatchedCookie: boolean
}

export function buildAttendanceCodeInvalidEventDetails(input: AttendanceCodeInvalidEventDetailsInput) {
  return {
    enrollment_id: input.enrollmentId,
    display_session_id: input.displaySessionId,
    subject_id: input.subjectId,
    current_rotation: input.currentRotation,
    user_agent: input.userAgent,
    device_source: input.deviceSource,
    local_key_matched_cookie: input.localKeyMatchedCookie,
  }
}
