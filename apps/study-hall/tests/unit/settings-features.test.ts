import assert from "node:assert/strict";
import test from "node:test";
import { generalSettingsSchema, operatingDaysSchema, studyTracksSchema, divisionFeatureFlagsSchema, featureSettingsSchema, rulesSettingsSchema, normalizeOperatingDays, normalizeStudyTracks } from "../../lib/settings-schemas";
import { normalizeDivisionFeatureFlags, DEFAULT_DIVISION_FEATURE_FLAGS } from "../../lib/division-features";
import { rejectsAt } from "./schema-assertions";

const days = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: false };
const rules = {
  tardyMinutes: 12, assistantPastEditDays: 0, warnLevel1: 7, warnLevel2: 13, warnInterview: 19, warnWithdraw: 31,
  holidayLimit: 2, halfDayLimit: 3, healthLimit: 1, holidayUnusedPts: 4, halfDayUnusedPts: 2,
  warnMsgLevel1: " 1차 안내 ", warnMsgLevel2: "2차 안내", warnMsgInterview: "면담 안내", warnMsgWithdraw: "퇴실 안내",
  perfectAttendancePts: 3, expirationWarningDays: 7,
};

test("general settings preserves database-driven tenant branding and an intentionally empty track list", () => {
  assert.deepEqual(generalSettingsSchema.parse({ name: " 지점 ", fullName: " 학원 ", color: " #Ab12ef ", operatingDays: days, studyTracks: [] }), { name: "지점", fullName: "학원", color: "#Ab12ef", operatingDays: days, studyTracks: [], isActive: true });
  rejectsAt(generalSettingsSchema, { name: "지점", fullName: "학원", color: "red", operatingDays: days, studyTracks: [] }, "color");
  rejectsAt(operatingDaysSchema, { ...days, mon: "true" }, "mon");
  rejectsAt(operatingDaysSchema, { ...days, sun: undefined }, "sun");
});

test("rule settings coerce numeric form input, trim templates and apply optional defaults", () => {
  const parsed = rulesSettingsSchema.parse({ ...rules, tardyMinutes: "15", tardyPointRuleId: " rule-a ", absentPointRuleId: " " });
  assert.equal(parsed.tardyMinutes, 15);
  assert.equal(parsed.warnMsgLevel1, "1차 안내");
  assert.equal(parsed.assistantPastEditAllowed, false);
  assert.equal(parsed.perfectAttendancePtsEnabled, false);
  assert.equal(parsed.tardyPointRuleId, "rule-a");
  assert.equal(parsed.absentPointRuleId, null);
  assert.equal(rulesSettingsSchema.parse(rules).tardyPointRuleId, null);
  rejectsAt(rulesSettingsSchema, { ...rules, tardyPointRuleId: 42 }, "tardyPointRuleId");
});

for (const [field, nextField] of [["warnLevel1", "warnLevel2"], ["warnLevel2", "warnInterview"], ["warnInterview", "warnWithdraw"]] as const) {
  test(`${field} must remain strictly below ${nextField}`, () => {
    rejectsAt(rulesSettingsSchema, { ...rules, [field]: rules[nextField] }, field);
    rejectsAt(rulesSettingsSchema, { ...rules, [field]: rules[nextField] + 1 }, field);
    assert.equal(rulesSettingsSchema.safeParse({ ...rules, [field]: rules[nextField] - 1 }).success, true);
  });
}

test("past attendance edit permissions and day limits agree", () => {
  rejectsAt(rulesSettingsSchema, { ...rules, assistantPastEditAllowed: false, assistantPastEditDays: 1 }, "assistantPastEditDays");
  assert.equal(rulesSettingsSchema.safeParse({ ...rules, assistantPastEditAllowed: true, assistantPastEditDays: 30 }).success, true);
  rejectsAt(rulesSettingsSchema, { ...rules, assistantPastEditAllowed: true, assistantPastEditDays: 31 }, "assistantPastEditDays");
  rejectsAt(rulesSettingsSchema, { ...rules, assistantPastEditAllowed: "true" }, "assistantPastEditAllowed");
});

for (const [field, min, max] of [["tardyMinutes", 0, 180], ["holidayLimit", 0, 31], ["halfDayLimit", 0, 31], ["healthLimit", 0, 31], ["holidayUnusedPts", 0, 100], ["halfDayUnusedPts", 0, 100], ["perfectAttendancePts", 0, 100], ["expirationWarningDays", 1, 90]] as const) {
  test(`${field} accepts configured bounds and rejects out-of-range or nonnumeric values`, () => {
    for (const value of [min, max]) assert.equal(rulesSettingsSchema.safeParse({ ...rules, [field]: value }).success, true);
    for (const value of [min - 1, max + 1, 0.5, "invalid", Infinity]) rejectsAt(rulesSettingsSchema, { ...rules, [field]: value }, field);
  });
}

test("all warning templates are required and limited after trimming", () => {
  for (const field of ["warnMsgLevel1", "warnMsgLevel2", "warnMsgInterview", "warnMsgWithdraw"] as const) {
    for (const value of [undefined, null, "  ", "가".repeat(1001)]) rejectsAt(rulesSettingsSchema, { ...rules, [field]: value }, field);
    assert.equal(rulesSettingsSchema.safeParse({ ...rules, [field]: "가".repeat(1000) }).success, true);
  }
});

test("operating-day normalization repairs malformed persisted input and preserves explicit booleans", () => {
  for (const value of [undefined, null, [], "bad", 3]) assert.deepEqual(normalizeOperatingDays(value), days);
  assert.deepEqual(normalizeOperatingDays({ mon: false, sun: true, tue: "false", wed: null, extra: true }), { ...days, mon: false, sun: true });
  assert.deepEqual(normalizeOperatingDays(Object.fromEntries(Object.keys(days).map((day) => [day, false]))), { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false });
});

test("track normalization removes blanks, wrong types and duplicates without mutating input", () => {
  const source = Object.freeze([" 경찰 ", null, "", 1, "소방", "경찰", "소방 ", "일반"]);
  assert.deepEqual(normalizeStudyTracks(source), ["경찰", "소방", "일반"]);
  for (const value of [null, undefined, {}, "경찰", []]) assert.deepEqual(normalizeStudyTracks(value), []);
  const many = Array.from({ length: 31 }, (_, i) => `직렬${i}`);
  assert.deepEqual(normalizeStudyTracks(many), many.slice(0, 30));
  assert.equal(studyTracksSchema.safeParse(many.slice(0, 30)).success, true);
  assert.equal(studyTracksSchema.safeParse(many).success, false);
  rejectsAt(studyTracksSchema, [" "], "0");
  rejectsAt(studyTracksSchema, ["가".repeat(41)], "0");
});

test("feature flags preserve false values and default malformed or absent values", () => {
  const expected = { ...DEFAULT_DIVISION_FEATURE_FLAGS, reporting: false, paymentManagement: false };
  assert.deepEqual(normalizeDivisionFeatureFlags({ reporting: false, paymentManagement: false, studentManagement: "false", examManagement: null, unknown: false }), expected);
  for (const value of [undefined, null, [], "off"]) assert.deepEqual(normalizeDivisionFeatureFlags(value), DEFAULT_DIVISION_FEATURE_FLAGS);
  const flags = normalizeDivisionFeatureFlags({});
  flags.reporting = false;
  assert.equal(normalizeDivisionFeatureFlags({}).reporting, true);
});

test("feature settings validate booleans strictly and strip unknown settings", () => {
  assert.deepEqual(divisionFeatureFlagsSchema.parse({ paymentManagement: false, extra: false }), { ...DEFAULT_DIVISION_FEATURE_FLAGS, paymentManagement: false });
  assert.deepEqual(featureSettingsSchema.parse({ featureFlags: {} }), { featureFlags: DEFAULT_DIVISION_FEATURE_FLAGS });
  rejectsAt(featureSettingsSchema, {}, "featureFlags");
  for (const value of [null, "false", 0]) rejectsAt(divisionFeatureFlagsSchema, { paymentManagement: value }, "paymentManagement");
});
