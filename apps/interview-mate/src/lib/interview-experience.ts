export const INTERVIEW_EXPERIENCE_HEADER_KEYWORDS = [
  "면접 경험 여부",
  "면접경험여부",
  "면접 경험",
  "면접경험",
  "면접 유무",
  "면접유무",
  "experience",
  "interview experience",
  "interviewexperience",
];

function normalizeInterviewExperienceValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, "");
}

export function parseInterviewExperience(value: unknown): boolean | null {
  const normalized = normalizeInterviewExperienceValue(value);

  if (!normalized) {
    return null;
  }

  if (
    [
      "있음",
      "있다",
      "유",
      "예",
      "o",
      "y",
      "yes",
      "true",
      "1",
      "경험있음",
      "면접있음",
      "면접유",
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "없음",
      "없다",
      "무",
      "아니오",
      "x",
      "n",
      "no",
      "false",
      "0",
      "경험없음",
      "면접없음",
      "면접무",
    ].includes(normalized)
  ) {
    return false;
  }

  return null;
}

export function formatInterviewExperience(
  value: boolean | null | undefined,
): string {
  if (value === true) {
    return "있음";
  }

  if (value === false) {
    return "없음";
  }

  return "";
}
