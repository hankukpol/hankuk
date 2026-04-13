import type { DesignatedSeat } from '@/types/database'

export function rowIndexToLetters(index: number) {
  let value = index
  let result = ''

  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }

  return result || 'A'
}

export function defaultSeatLabel(positionY: number, positionX: number) {
  return `${rowIndexToLetters(positionY)}-${positionX}`
}

export function sortSeats<T extends Pick<DesignatedSeat, 'position_y' | 'position_x'>>(seats: T[]) {
  return [...seats].sort((left, right) => {
    if (left.position_y !== right.position_y) {
      return left.position_y - right.position_y
    }

    return left.position_x - right.position_x
  })
}
