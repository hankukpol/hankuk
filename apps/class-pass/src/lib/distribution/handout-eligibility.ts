export function isPendingHandout(
  row: { receipts: Record<number, unknown>; seatSubjects: Record<number, true> },
  material: { id: number; subject_id: number | null },
) {
  return !row.receipts[material.id]
    && (material.subject_id == null || Boolean(row.seatSubjects[material.subject_id]))
}
