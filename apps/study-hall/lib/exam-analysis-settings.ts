import { z } from "zod";

// All analysis threshold defaults live here; the DB stores {} until configured.
export const DEFAULT_EXAM_ANALYSIS_SETTINGS = {
  morning: {
    consecutiveDrops: 3, classGapPercent: 15, ownAverageDropPercent: 10,
    movingAverageSessions: 4, trendWindowSessions: 8, attendanceRatePercent: 70,
  },
  regular: { totalDropPercent: 10, rankDropPercent: 20, targetGapPercent: 10 },
  common: { weakSubjectRatePercent: 60, balanceStdDev: 18, easyMissedRatePercent: 70, killerRatePercent: 40 },
};

const percent = z.number().finite().min(0, "비율은 0 이상이어야 합니다.").max(100, "비율은 100 이하여야 합니다.");
const sections = {
  morning: z.object({
    consecutiveDrops: z.number().int().min(2, "연속 하락 횟수는 2회 이상이어야 합니다.").max(10, "연속 하락 횟수는 10회 이하여야 합니다."), classGapPercent: percent, ownAverageDropPercent: percent,
    movingAverageSessions: z.number().int().min(2, "이동평균 응시 횟수는 2회 이상이어야 합니다.").max(20, "이동평균 응시 횟수는 20회 이하여야 합니다."), trendWindowSessions: z.number().int().min(3, "추세 응시 횟수는 3회 이상이어야 합니다.").max(40, "추세 응시 횟수는 40회 이하여야 합니다."), attendanceRatePercent: percent,
  }),
  regular: z.object({ totalDropPercent: percent, rankDropPercent: percent, targetGapPercent: percent }),
  common: z.object({ weakSubjectRatePercent: percent, balanceStdDev: percent, easyMissedRatePercent: percent, killerRatePercent: percent }),
};

export const examAnalysisSettingsSchema = z.object(sections).superRefine((value, ctx) => {
  if (value.morning.movingAverageSessions > value.morning.trendWindowSessions) ctx.addIssue({
    code: "custom", path: ["morning", "trendWindowSessions"], message: "추세 응시 횟수는 이동평균 응시 횟수 이상이어야 합니다.",
  });
  if (value.common.killerRatePercent > value.common.easyMissedRatePercent) ctx.addIssue({
    code: "custom", path: ["common", "killerRatePercent"], message: "고난도 기준은 쉬운 문항 기준 이하여야 합니다.",
  });
});
export type ExamAnalysisSettings = z.infer<typeof examAnalysisSettingsSchema>;

/** Repair fields independently. Legacy day windows are ignored, never converted to sessions. */
export function normalizeExamAnalysisSettings(value: unknown): ExamAnalysisSettings {
  const incoming = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const result = structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS);
  for (const section of Object.keys(sections) as Array<keyof typeof sections>) {
    const raw = incoming[section];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const shape = sections[section].shape as Record<string, z.ZodNumber>;
    for (const [key, schema] of Object.entries(shape)) {
      const parsed = schema.safeParse((raw as Record<string, unknown>)[key]);
      if (parsed.success) (result[section] as Record<string, number>)[key] = parsed.data;
    }
  }
  result.morning.trendWindowSessions = Math.max(result.morning.trendWindowSessions, result.morning.movingAverageSessions);
  result.common.easyMissedRatePercent = Math.max(result.common.easyMissedRatePercent, result.common.killerRatePercent);
  return result;
}
