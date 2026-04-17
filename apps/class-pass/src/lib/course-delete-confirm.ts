'use client'

export type CourseDeleteConfirmation =
  | { confirmed: true }
  | { confirmed: false; reason: 'cancelled' | 'mismatch' }

export function confirmPermanentCourseDeletion(courseName: string): CourseDeleteConfirmation {
  const firstConfirmed = window.confirm(
    `"${courseName}" 강좌를 완전 삭제할까요?\n\n이 작업은 되돌릴 수 없으며 강좌 설정, 수강생, 좌석, 출석, 교재, 배부 이력이 함께 삭제됩니다.`,
  )

  if (!firstConfirmed) {
    return { confirmed: false, reason: 'cancelled' }
  }

  const typedCourseName = window.prompt(
    `마지막 확인입니다.\n완전 삭제하려면 강좌명을 정확히 입력하세요.\n\n${courseName}`,
    '',
  )

  if (typedCourseName === null) {
    return { confirmed: false, reason: 'cancelled' }
  }

  if (typedCourseName.trim() !== courseName) {
    return { confirmed: false, reason: 'mismatch' }
  }

  return { confirmed: true }
}
