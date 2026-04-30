import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildAttendanceCodeInvalidEventDetails } from '../../src/lib/attendance/submit-event-details'

describe('attendance submit event details', () => {
  it('builds invalid-code event details without storing the submitted code', () => {
    const details = buildAttendanceCodeInvalidEventDetails({
      enrollmentId: 123,
      displaySessionId: 456,
      subjectId: 7,
      currentRotation: 98765,
      userAgent: 'Mobile Safari',
      deviceSource: 'cookie',
      localKeyMatchedCookie: false,
    })

    assert.deepEqual(details, {
      enrollment_id: 123,
      display_session_id: 456,
      subject_id: 7,
      current_rotation: 98765,
      user_agent: 'Mobile Safari',
      device_source: 'cookie',
      local_key_matched_cookie: false,
    })
    assert.equal('code' in details, false)
    assert.equal('submitted_code' in details, false)
  })
})
