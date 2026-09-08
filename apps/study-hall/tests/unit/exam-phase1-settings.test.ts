import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EXAM_ANALYSIS_SETTINGS, examAnalysisSettingsSchema, normalizeExamAnalysisSettings } from "../../lib/exam-analysis-settings";
import { getGroupedFullScore } from "../../lib/exam-full-score";
import { buildExamSessionIdentity } from "../../lib/exam-session-identity";
import { examTypeSchema } from "../../lib/exam-schemas";

test("analysis settings repair individual legacy fields without losing valid choices", () => {
  const normalized = normalizeExamAnalysisSettings({
    morning: { classGapPercent: 23, consecutiveDrops: 0, movingAverageSessions: 40 },
    regular: { totalDropPercent: 0, rankDropPercent: 101 },
    common: { balanceStdDev: "18", killerRatePercent: 90 },
  });
  assert.equal(normalized.morning.classGapPercent, 23);
  assert.equal(normalized.morning.consecutiveDrops, DEFAULT_EXAM_ANALYSIS_SETTINGS.morning.consecutiveDrops);
  assert.equal(normalized.morning.movingAverageSessions, DEFAULT_EXAM_ANALYSIS_SETTINGS.morning.movingAverageSessions);
  assert.equal(normalized.morning.trendWindowSessions, DEFAULT_EXAM_ANALYSIS_SETTINGS.morning.trendWindowSessions);
  assert.equal(normalized.regular.totalDropPercent, 0);
  assert.equal(normalized.regular.rankDropPercent, DEFAULT_EXAM_ANALYSIS_SETTINGS.regular.rankDropPercent);
  assert.equal(normalized.common.easyMissedRatePercent, 90);
  assert.equal(examAnalysisSettingsSchema.safeParse(normalized).success, true);
});

test("defaults are cloned and malformed JSON is safe", () => {
  for (const raw of [null, undefined, [], "bad", 5]) {
    assert.deepEqual(normalizeExamAnalysisSettings(raw), DEFAULT_EXAM_ANALYSIS_SETTINGS);
  }
  const edited = normalizeExamAnalysisSettings({});
  edited.morning.consecutiveDrops = 22;
  assert.notEqual(normalizeExamAnalysisSettings({}).morning.consecutiveDrops, 22);
});

test("saving analysis settings rejects invalid ranges and inconsistent windows", () => {
  const value = normalizeExamAnalysisSettings({});
  value.morning.movingAverageSessions = value.morning.trendWindowSessions + 1;
  assert.equal(examAnalysisSettingsSchema.safeParse(value).success, false);
  value.morning.movingAverageSessions = 7;
  value.common.killerRatePercent = value.common.easyMissedRatePercent + 1;
  assert.equal(examAnalysisSettingsSchema.safeParse(value).success, false);
  value.common.killerRatePercent = 0;
  value.regular.totalDropPercent = Number.NaN;
  assert.equal(examAnalysisSettingsSchema.safeParse(value).success, false);
});

test("choose-one groups count once and inactive subjects never inflate full score", () => {
  const subjects = [
    { totalItems: 20, pointsPerItem: 2.5, alternateGroup: "choice" },
    { totalItems: 20, pointsPerItem: 2.5, alternateGroup: " choice " },
    { totalItems: 40, pointsPerItem: 2.5 },
    { totalItems: 40, pointsPerItem: 2.5, alternateGroup: " " },
    { totalItems: 100, pointsPerItem: 10, isActive: false },
  ];
  assert.equal(getGroupedFullScore(subjects), 250);
  assert.equal(getGroupedFullScore([...subjects, { totalItems: 30, pointsPerItem: 2.5, alternateGroup: "choice" }]), 275);
  assert.equal(getGroupedFullScore([]), 0);
});

test("alternate group input is trimmed, bounded and compatible with existing payloads", () => {
  const parse = (alternateGroup?: string | null) => examTypeSchema.safeParse({ name: "Exam", subjects: [{ name: "Subject", alternateGroup }] });
  assert.equal(parse().success, true);
  assert.equal(parse(null).success, true);
  assert.equal(parse("x".repeat(81)).success, false);
  const result = parse(" group ");
  assert.equal(result.success && result.data.subjects[0].alternateGroup, "group");
});

test("morning identity includes primary subject and exam date", () => {
  const base = { category: "MORNING" as const, examDate: "2026-09-08", primarySubjectId: "s1" };
  assert.equal(buildExamSessionIdentity(base), "morning:s1:2026-09-08");
  assert.notEqual(buildExamSessionIdentity(base), buildExamSessionIdentity({ ...base, primarySubjectId: "s2" }));
  assert.notEqual(buildExamSessionIdentity(base), buildExamSessionIdentity({ ...base, examDate: "2026-09-09" }));
  for (const primarySubjectId of [undefined, null, "", " "]) {
    assert.throws(() => buildExamSessionIdentity({ ...base, primarySubjectId }));
  }
  for (const examDate of ["2026-02-30", "2026-2-1", "invalid"]) {
    assert.throws(() => buildExamSessionIdentity({ ...base, examDate }));
  }
});

test("regular identity uses YYYY-MM-DD and rejects a primary subject", () => {
  const base = { category: "REGULAR" as const, examDate: "2026-09-08" };
  assert.equal(buildExamSessionIdentity(base), "regular:2026-09-08");
  assert.equal(buildExamSessionIdentity({ ...base, primarySubjectId: null }), "regular:2026-09-08");
  assert.equal(buildExamSessionIdentity({ ...base, examDate: "2026-09-09" }), "regular:2026-09-09");
  assert.notEqual(buildExamSessionIdentity(base), buildExamSessionIdentity({ ...base, examDate: "2026-09-09" }));
  for (const examDate of ["2026-02-30", "2026-2-1", "invalid"]) assert.throws(() => buildExamSessionIdentity({ ...base, examDate }));
  for (const primarySubjectId of ["s1", "", " "]) assert.throws(() => buildExamSessionIdentity({ ...base, primarySubjectId }));
});

for (const [field, min, max] of [
  ["consecutiveDrops", 2, 10],
  ["movingAverageSessions", 2, 20],
  ["trendWindowSessions", 3, 40],
] as const) {
  test(`analysis settings enforce inclusive integer bounds for ${field}`, () => {
    for (const candidate of [min, max]) {
      const value = normalizeExamAnalysisSettings({ morning: { movingAverageSessions: 2, trendWindowSessions: 40 } });
      value.morning[field] = candidate;
      assert.equal(examAnalysisSettingsSchema.safeParse(value).success, true, String(candidate));
      assert.equal(normalizeExamAnalysisSettings(value).morning[field], candidate);
    }
    for (const candidate of [min - 1, max + 1, min + 0.5, NaN, Infinity, -Infinity]) {
      const value = normalizeExamAnalysisSettings({});
      value.morning[field] = candidate;
      const parsed = examAnalysisSettingsSchema.safeParse(value);
      assert.equal(parsed.success, false, String(candidate));
      if (!parsed.success) assert.ok(parsed.error.issues.some((issue) => issue.path.join(".") === `morning.${field}`));
      const repaired = normalizeExamAnalysisSettings(value);
      assert.equal(repaired.morning[field], DEFAULT_EXAM_ANALYSIS_SETTINGS.morning[field]);
      assert.equal(examAnalysisSettingsSchema.safeParse(repaired).success, true);
    }
  });
}

test("valid analysis windows retain the existing cross-field repair", () => {
  const repaired = normalizeExamAnalysisSettings({ morning: { movingAverageSessions: 20, trendWindowSessions: 3 } });
  assert.equal(repaired.morning.movingAverageSessions, 20);
  assert.equal(repaired.morning.trendWindowSessions, 20);
  assert.equal(examAnalysisSettingsSchema.safeParse(repaired).success, true);
});


test("analysis settings never reinterpret legacy days as subject session counts", () => {
  const legacy = { morning: { movingAverageDays: 7, trendWindowDays: 28, classGapPercent: 23 } };
  const normalized = normalizeExamAnalysisSettings(legacy);
  assert.equal(normalized.morning.movingAverageSessions, 4);
  assert.equal(normalized.morning.trendWindowSessions, 8);
  assert.equal(normalized.morning.classGapPercent, 23);
  assert.equal("movingAverageDays" in normalized.morning, false);
  assert.equal("trendWindowDays" in normalized.morning, false);
  const mixed = normalizeExamAnalysisSettings({ morning: { ...legacy.morning, movingAverageSessions: 6, trendWindowSessions: 12 } });
  assert.equal(mixed.morning.movingAverageSessions, 6);
  assert.equal(mixed.morning.trendWindowSessions, 12);
  const invalid = normalizeExamAnalysisSettings({ morning: { ...legacy.morning, movingAverageSessions: 21, trendWindowSessions: 41 } });
  assert.equal(invalid.morning.movingAverageSessions, 4);
  assert.equal(invalid.morning.trendWindowSessions, 8);
  const { movingAverageSessions, trendWindowSessions, ...other } = normalized.morning;
  assert.equal(examAnalysisSettingsSchema.safeParse({ ...normalized, morning: { ...other, ...legacy.morning } }).success, false);
  assert.equal(movingAverageSessions, 4);
  assert.equal(trendWindowSessions, 8);
  assert.equal(examAnalysisSettingsSchema.safeParse(normalized).success, true);
});
