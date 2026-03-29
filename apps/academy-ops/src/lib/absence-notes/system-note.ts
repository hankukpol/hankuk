const ABSENCE_NOTE_PATTERN = /^\[absence-note:(\d+)\]\s*/;

export function buildAbsenceNoteSystemNote(noteId: number, reason: string) {
  const nextReason = reason.trim();
  return nextReason ? `[absence-note:${noteId}] ${nextReason}` : `[absence-note:${noteId}]`;
}

export function getAbsenceNoteSystemNoteId(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(ABSENCE_NOTE_PATTERN);
  if (!match) {
    return null;
  }

  const noteId = Number(match[1]);
  return Number.isInteger(noteId) ? noteId : null;
}

export function stripAbsenceNoteSystemNote(value: string | null, noteId?: number) {
  if (!value) {
    return null;
  }

  const matchedNoteId = getAbsenceNoteSystemNoteId(value);
  if (matchedNoteId === null || (noteId !== undefined && matchedNoteId !== noteId)) {
    return value;
  }

  const nextValue = value.replace(ABSENCE_NOTE_PATTERN, '').trim();
  return nextValue || null;
}

export function sanitizeAbsenceNoteDisplay(value: string | null) {
  return stripAbsenceNoteSystemNote(value);
}

export function preserveAbsenceNoteSystemNote(currentValue: string | null, nextDisplayValue: string | null) {
  const noteId = getAbsenceNoteSystemNoteId(currentValue);
  const nextReason = nextDisplayValue?.trim() ?? "";

  if (noteId === null) {
    return nextReason || null;
  }

  return buildAbsenceNoteSystemNote(noteId, nextReason);
}

export function withAbsenceNoteDisplay<T extends { note: string | null }>(row: T) {
  return {
    ...row,
    rawNote: row.note,
    note: sanitizeAbsenceNoteDisplay(row.note),
  };
}
