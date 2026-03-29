export const DISPLAY_SUBJECT_NAME_MAX_LENGTH = 40;

export function normalizeDisplaySubjectName(value: unknown) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length > DISPLAY_SUBJECT_NAME_MAX_LENGTH) {
    throw new Error(`표시 과목명은 ${DISPLAY_SUBJECT_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }

  return normalized;
}