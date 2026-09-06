/**
 * 배부·교재 RPC가 돌려주는 사유 코드를 사용자 문구로 옮긴다.
 * 직원 스캔 화면과 관리자 수동 배부가 같은 문구를 쓰도록 한 곳에 둔다.
 *
 * 규칙 두 가지를 지킨다.
 * 1. 사유 코드나 서버 원문을 그대로 내보내지 않는다. 매핑에 없으면 기본 문구를 쓴다.
 * 2. 좌석 미배정·교재 미배정처럼 새로고침으로 해결되지 않는 조건에는 재시도를 권하지 않고
 *    어느 화면을 점검해야 하는지 알려준다.
 */
const DISTRIBUTION_REASON_MESSAGES: Record<string, string> = Object.assign(Object.create(null), {
  INVALID_TOKEN: 'QR이 만료되었거나 올바르지 않습니다. 학생 수강증을 새로고침하거나 다시 열어 달라고 안내해 주세요.',
  ENROLLMENT_NOT_FOUND: '수강생을 찾을 수 없습니다. 명단에서 삭제되었는지 확인해 주세요.',
  STUDENT_NOT_FOUND: '수강생을 찾을 수 없습니다. 명단에서 삭제되었는지 확인해 주세요.',
  STUDENT_INACTIVE: '수강 상태가 아닙니다. 정지 또는 수강종료·환불 상태에서는 배부할 수 없습니다. 명단에서 상태를 확인해 주세요.',
  COURSE_INACTIVE: '운영 중인 강좌가 아닙니다. 강좌 설정에서 상태를 확인해 주세요.',
  COURSE_MISMATCH: '다른 강좌의 QR 또는 자료입니다. 선택한 강좌를 확인해 주세요.',
  MATERIAL_NOT_FOUND: '자료를 찾을 수 없거나 비활성 상태입니다. 자료 탭에서 활성화 여부를 확인해 주세요.',
  TEXTBOOK_NOT_FOUND: '교재를 찾을 수 없습니다. 교재 목록에서 삭제되었는지 확인해 주세요.',
  NOT_ASSIGNED: '학생에게 배정되지 않은 교재입니다. 교재 배정 탭에서 먼저 배정해 주세요.',
  NO_SEAT_FOR_SUBJECT: '해당 과목의 좌석을 배정받지 않은 학생이라 자료를 받을 수 없습니다. 좌석 배정 탭에서 확인해 주세요.',
  ALREADY_DISTRIBUTED: '이미 수령한 자료입니다. 수령 내역에서 배부 기록을 확인해 주세요.',
  ALL_RECEIVED: '현재 수령할 자료가 없습니다.',
  SELECT_MATERIAL: '배부할 자료를 선택해 주세요.',
  DISTRIBUTION_FAILED: '배부 처리에 실패했습니다. 수령 내역을 확인한 뒤 남은 자료만 다시 배부해 주세요.',
  ASSIGN_FAILED: '교재 배정을 저장하지 못했습니다. 배정 내역을 확인한 뒤 남은 학생만 다시 배정해 주세요.',
  UNASSIGN_FAILED: '교재 배정을 해제하지 못했습니다. 배정 내역을 확인한 뒤 다시 시도해 주세요.',
  HAS_RECEIPTS: '이미 수령 기록이 있는 자료라 삭제할 수 없습니다. 수령 내역을 먼저 정리해 주세요.',
  HAS_ASSIGNMENTS: '학생에게 배정된 교재라 삭제할 수 없습니다. 배정을 먼저 해제해 주세요.',
})

const DEFAULT_DISTRIBUTION_MESSAGE = '배부 처리에 실패했습니다. 수령 내역을 확인한 뒤 남은 자료만 다시 배부해 주세요.'

/**
 * 사유 코드에 대응하는 한국어 안내.
 * 매핑에 없는 값은 서버 원문·SQL·HTML일 수 있으므로 절대 그대로 돌려주지 않는다.
 */
export function getDistributionReasonMessage(reason?: string | null, fallback = DEFAULT_DISTRIBUTION_MESSAGE) {
  if (typeof reason === 'string' && Object.hasOwn(DISTRIBUTION_REASON_MESSAGES, reason)) {
    return DISTRIBUTION_REASON_MESSAGES[reason]
  }

  return fallback
}

export function isKnownDistributionReason(reason?: string | null) {
  return typeof reason === 'string' && Object.hasOwn(DISTRIBUTION_REASON_MESSAGES, reason)
}

/** API의 표시 문구뿐 아니라 분기용 reason에도 알 수 없는 서버 원문을 담지 않는다. */
export function getDistributionFailureDetails(rawReason?: string | null) {
  const reason = rawReason && isKnownDistributionReason(rawReason) ? rawReason : 'DISTRIBUTION_FAILED'
  return {
    reason,
    error: getDistributionReasonMessage(reason),
    status: reason === 'DISTRIBUTION_FAILED' ? 500 : 400,
  }
}
