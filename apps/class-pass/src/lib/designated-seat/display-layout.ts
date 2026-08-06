export const DESIGNATED_SEAT_SINGLE_QR_SIZE = 520
export const DESIGNATED_SEAT_TWO_UP_QR_SIZE = 420
export const DESIGNATED_SEAT_MULTI_QR_SIZE = 340
export const DESIGNATED_SEAT_COMPACT_QR_FRAME_PADDING = 40
export const DESIGNATED_SEAT_COMPACT_QR_MIN_SIZE = 260
export const DESIGNATED_SEAT_COMPACT_VERTICAL_RESERVE = 280

export function getDesignatedSeatQrSize(targetCount: number, compact: boolean) {
  if (!compact) {
    return DESIGNATED_SEAT_SINGLE_QR_SIZE
  }

  return targetCount === 2
    ? DESIGNATED_SEAT_TWO_UP_QR_SIZE
    : DESIGNATED_SEAT_MULTI_QR_SIZE
}

export function getDesignatedSeatCompactQrFrameWidth(targetCount: number) {
  const maximum = getDesignatedSeatQrSize(targetCount, true) + DESIGNATED_SEAT_COMPACT_QR_FRAME_PADDING
  const minimum = DESIGNATED_SEAT_COMPACT_QR_MIN_SIZE + DESIGNATED_SEAT_COMPACT_QR_FRAME_PADDING
  return `min(100%, clamp(${minimum}px, calc(100dvh - ${DESIGNATED_SEAT_COMPACT_VERTICAL_RESERVE}px), ${maximum}px))`
}
