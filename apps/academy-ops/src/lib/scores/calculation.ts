import { AttendType } from "@prisma/client";

type ScoreFields = {
  rawScore: number | null;
  oxScore?: number | null;
  finalScore: number | null;
};

type ScoreWithAttendType = ScoreFields & {
  attendType: AttendType | null;
};

export function getMockScore(score: ScoreFields) {
  if (score.rawScore !== null) {
    return score.rawScore;
  }

  if ((score.oxScore ?? null) !== null) {
    return null;
  }

  return score.finalScore;
}

export function getPoliceOxScore(score: ScoreFields) {
  return score.oxScore ?? null;
}

export function getCombinedScore(score: ScoreFields) {
  if (score.rawScore !== null || (score.oxScore ?? null) !== null) {
    return (score.rawScore ?? 0) + (score.oxScore ?? 0);
  }

  return score.finalScore;
}

export function getCombinedAverage(
  mockAverage: number | null,
  policeOxAverage: number | null,
) {
  if (mockAverage === null && policeOxAverage === null) {
    return null;
  }

  if (mockAverage === null) {
    return policeOxAverage;
  }

  if (policeOxAverage === null) {
    return mockAverage;
  }

  return Math.round(((mockAverage + policeOxAverage) / 2) * 100) / 100;
}

export function countsAsAttendance(attendType: AttendType | null) {
  return (
    attendType === AttendType.NORMAL ||
    attendType === AttendType.LIVE
  );
}

export function countsAsConfiguredAttendance(
  attendType: AttendType | null,
  includeExcused = false,
) {
  return countsAsAttendance(attendType) || (attendType === AttendType.EXCUSED && includeExcused);
}

export function countsAsScored(attendType: AttendType | null) {
  return attendType === AttendType.NORMAL;
}

export function getScoredMockScore(score: ScoreWithAttendType) {
  return countsAsScored(score.attendType) ? getMockScore(score) : null;
}
