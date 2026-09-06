const LAYOUT_FAILURES: Record<string, { status: number; message: string }> = {
  INVALID_LAYOUT_SIZE: { status: 400, message: '좌석 배치의 행과 열은 각각 1~30 범위로 입력해 주세요.' },
  INVALID_SEATS: { status: 400, message: '좌석 이름과 위치를 확인해 주세요. 모든 좌석은 설정한 행·열 안에 있어야 합니다.' },
  ROOM_NOT_FOUND: { status: 404, message: '강의실을 찾을 수 없거나 비활성 상태입니다. 강의실 설정을 확인해 주세요.' },
  SEAT_NOT_FOUND: { status: 404, message: '수정할 좌석을 찾을 수 없거나 다른 강의실의 좌석입니다. 최신 좌석 배치를 불러와 확인해 주세요.' },
  DUPLICATE_SEAT_LABEL: { status: 409, message: '좌석 이름이 중복되었습니다. 같은 강의실 안에서는 서로 다른 이름을 사용해 주세요.' },
  DUPLICATE_SEAT_POSITION: { status: 409, message: '좌석 위치가 중복되었습니다. 한 칸에 하나의 좌석만 배치해 주세요.' },
  RESERVED_SEAT_INACTIVE: { status: 409, message: '현재 배정 중인 좌석은 비활성화할 수 없습니다. 배정 현황을 확인해 주세요.' },
  RESERVED_SEAT_DELETE: { status: 409, message: '현재 배정 중인 좌석은 삭제할 수 없습니다. 배정 현황을 확인해 주세요.' },
  HISTORICAL_SEAT_DELETE: { status: 409, message: '배정 이력이 있는 좌석은 삭제할 수 없습니다. 운영 대상에서 제외하려면 좌석을 비활성화해 주세요.' },
}

/** SQL 예외 중 공개 가능한 업무 사유만 번역한다. 서버 원문은 응답에 넣지 않는다. */
export function getSeatLayoutFailure(error: { code?: string; message?: string }) {
  const reason = error.message?.trim()
  if (error.code !== 'P0001' || !reason || !Object.hasOwn(LAYOUT_FAILURES, reason)) return null
  return { ...LAYOUT_FAILURES[reason], reason }
}
