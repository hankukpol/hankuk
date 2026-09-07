import type { Enrollment } from '@/types/database'

/**
 * 한 강좌 안에서 수강중인 연락처는 하나뿐이다.
 *
 * 수령현황에서 자료를 건네줄 때 이름 아래 연락처로 사람을 가르기 때문이다.
 * 이름은 동명이인이 있을 수 있어 그대로 두고, 연락처만 유일하게 잡는다.
 *
 * 최종 보증은 DB의 부분 유니크 인덱스(enrollments_course_active_phone_key)에 있다.
 * 여기 함수들은 그 전에 걸러 학생 레코드를 만들기 전에 멈추고,
 * 인덱스에 걸렸을 때는 무엇을 고쳐야 하는지 알려 주기 위한 것이다.
 */
export const ACTIVE_PHONE_CONSTRAINT = 'enrollments_course_active_phone_key'

export const ACTIVE_PHONE_CONFLICT_MESSAGE =
  '같은 강좌에 이 연락처로 수강중인 수강생이 이미 있습니다. 연락처를 확인해 주세요.'

type PhoneConflictCandidate = Pick<Enrollment, 'id' | 'name' | 'phone' | 'status' | 'student_id'>

/**
 * 같은 강좌의 등록들 중 이 연락처를 이미 쓰고 있는 다른 사람을 고른다.
 * 본인의 등록(같은 학생이거나 이름까지 같은 행)은 충돌로 보지 않는다.
 * 환불·수강종료 건도 제외한다. 그래야 환불한 본인이 같은 번호로 재등록할 수 있다.
 */
export function pickActivePhoneConflict<T extends PhoneConflictCandidate>(
  rows: T[],
  options: {
    phone: string
    studentId: number | null
    name: string
    ignoreEnrollmentId?: number | null
  },
): T | null {
  const phone = options.phone.trim()
  if (!phone) {
    return null
  }

  return rows.find((row) => {
    if (row.status !== 'active' || (row.phone ?? '').trim() !== phone) {
      return false
    }

    if (options.ignoreEnrollmentId != null && row.id === options.ignoreEnrollmentId) {
      return false
    }

    if (options.studentId != null && row.student_id === options.studentId) {
      return false
    }

    // 학생 레코드가 아직 없는 옛 데이터는 이름으로 본인 여부를 가린다.
    return !(row.student_id == null && row.name === options.name)
  }) ?? null
}

/** 유니크 인덱스에 걸린 오류를 무엇이 겹쳤는지 알 수 있는 문장으로 옮긴다. */
export function describeEnrollmentConflict(
  error: { message?: string | null; details?: string | null } | null | undefined,
  fallback: string,
) {
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`
  return text.includes(ACTIVE_PHONE_CONSTRAINT) ? ACTIVE_PHONE_CONFLICT_MESSAGE : fallback
}
