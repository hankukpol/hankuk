import { createHash } from "node:crypto";
import { z } from "zod";
import { rulesSettingsSchema, operatingDaysSchema, studyTracksSchema, divisionFeatureFlagsSchema } from "./settings-schemas";
import { academyPolicyInputSchema } from "./academy-policy-settings";
import { examPointAutomationSchema, EXAM_POINT_RULE_FIELDS } from "./exam-point-automation";
import { normalizeYmdDate } from "./date-utils";

const id = z.string().min(1).max(120);
const name = z.string().trim().min(1).max(100);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const order = z.number().int().min(0).max(10000);
const nullableText = z.string().max(2000).nullable();
const base = { id, name, isActive: z.boolean(), displayOrder: order };
const date = z.string().refine(v => { try { normalizeYmdDate(v); return true; } catch { return false; } }, "유효한 날짜를 입력해 주세요.");

export const templateSettingsSchema = z.object({ ...rulesSettingsSchema.shape,
  operatingDays: operatingDaysSchema,
  studyTracks: studyTracksSchema,
  pointCategories: z.array(z.string().trim().min(1).max(40)).max(100),
  featureFlags: divisionFeatureFlagsSchema,
  managementPolicy: academyPolicyInputSchema.nullable(),
  examPointAutomation: examPointAutomationSchema.nullable(),
}).strict().superRefine((v, ctx) => {
  const result = rulesSettingsSchema.safeParse(v);
  if (!result.success) result.error.issues.forEach(issue => ctx.addIssue({ code: "custom", path: issue.path, message: issue.message }));
});
const subject = z.object({ ...base, totalItems: z.number().int().min(1).max(1000).nullable(), pointsPerItem: z.number().min(0).max(1000).nullable(), alternateGroup: z.string().max(100).nullable() }).strict();
export const academyTemplateSchema = z.object({
  version: z.literal(1),
  settings: templateSettingsSchema,
  periods: z.array(z.object({ ...base, label: z.string().max(100).nullable(), startTime: time, endTime: time, isMandatory: z.boolean() }).strict()).max(50),
  pointRules: z.array(z.object({ ...base, category: z.string().trim().min(1).max(40), points: z.number().int().min(-10000).max(10000), description: nullableText }).strict()).max(300),
  rooms: z.array(z.object({ ...base, columns: z.number().int().min(1).max(50), rows: z.number().int().min(1).max(50), aisleColumns: z.array(z.number().int().min(1).max(50)).max(50) }).strict()).max(30),
  seats: z.array(z.object({ id, studyRoomId: id, label: z.string().max(100), positionX: z.number().int().min(1).max(50), positionY: z.number().int().min(1).max(50), isActive: z.boolean() }).strict()).max(5000),
  tuitionPlans: z.array(z.object({ ...base, durationDays: z.number().int().min(1).max(3660).nullable(), amount: z.number().int().min(0).max(100000000), description: nullableText }).strict()).max(100),
  paymentCategories: z.array(z.object(base).strict()).max(100),
  examTypes: z.array(z.object({ ...base, category: z.enum(["REGULAR", "MORNING"]), studyTrack: z.string().max(40).nullable(), subjects: z.array(subject).max(100) }).strict()).max(100),
  examSchedules: z.array(z.object({ id, name, type: z.enum(["WRITTEN", "PHYSICAL", "INTERVIEW", "RESULT", "OTHER"]), examDate: date, description: nullableText, isActive: z.boolean() }).strict()).max(100),
}).strict().superRefine((v, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const unique = (rows: { id: string }[], label: string) => { if (new Set(rows.map(r => r.id)).size !== rows.length) fail(label + " 식별자가 중복됩니다."); };
  for (const key of ["periods", "pointRules", "rooms", "seats", "tuitionPlans", "paymentCategories", "examTypes", "examSchedules"] as const) unique(v[key], key);
  unique(v.examTypes.flatMap(e => e.subjects), "과목");
  const periodIds = new Set(v.periods.map(p => p.id)), rules = new Map(v.pointRules.map(r => [r.id, r]));
  const rule = (key: string | null | undefined, positive = false) => {
    if (!key) return;
    const r = rules.get(key);
    if (!r || !r.isActive || (positive ? r.points <= 0 : r.points >= 0)) fail("자동 계산에 연결할 활성 " + (positive ? "상점" : "벌점") + " 규칙을 확인해 주세요.");
  };
  rule(v.settings.tardyPointRuleId); rule(v.settings.absentPointRuleId);
  const p = v.settings.managementPolicy;
  if (p) {
    if (p.morningExam.syncAttendance && !v.periods.some(period=>period.id===p.morningExam.periodId && period.isActive)) fail("자동 출석에 사용할 활성 아침모의고사 교시를 선택해 주세요.");
    if ([...p.controlledPeriods.map(r => r.periodId), ...p.attendancePeriodIds, p.morningExam.periodId].filter(Boolean).some(key => !periodIds.has(key))) fail("규정에 연결한 교시가 템플릿에 없습니다.");
    [p.fullDayAbsenceRuleId, p.partialAbsenceRuleId, p.tardyRuleId, p.earlyExit.ruleId, p.unauthorizedEntry.ruleId].forEach(key => rule(key));
  }
  const auto = v.settings.examPointAutomation;
  if (auto) for (const key of Object.keys(EXAM_POINT_RULE_FIELDS) as (keyof typeof EXAM_POINT_RULE_FIELDS)[]) rule(auto[key], !key.includes("Absence"));
  for (const p of v.periods) if (p.startTime >= p.endTime) fail("교시 종료 시각은 시작 시각보다 늦어야 합니다.");
  for (const room of v.rooms) if (room.aisleColumns.some(x => x > room.columns) || new Set(room.aisleColumns).size !== room.aisleColumns.length) fail("통로 위치는 강의실 가로 범위 안에서 중복 없이 지정해 주세요.");
  const positions = new Set<string>(), labels = new Set<string>();
  for (const seat of v.seats) {
    const room = v.rooms.find(r => r.id === seat.studyRoomId);
    if (!room || (seat.isActive && (seat.positionX > room.columns || seat.positionY > room.rows || room.aisleColumns.includes(seat.positionX)))) fail("좌석 위치가 강의실 범위를 벗어납니다.");
    const pos = seat.studyRoomId + ":" + seat.positionX + ":" + seat.positionY, label = seat.studyRoomId + ":" + seat.label;
    if (positions.has(pos) || (seat.label && labels.has(label))) fail("같은 강의실의 좌석 위치나 이름이 중복됩니다.");
    positions.add(pos); if (seat.label) labels.add(label);
  }
  for (const key of ["rooms", "tuitionPlans", "paymentCategories"] as const) if (new Set(v[key].map(r => r.name)).size !== v[key].length) fail("같은 항목 이름을 중복 등록할 수 없습니다.");
});
export type AcademyConfiguration = z.infer<typeof academyTemplateSchema>;
export const templateSaveSchema = z.object({ name, payload: academyTemplateSchema }).strict();
export const templatePreviewSchema = z.object({ name, payload: academyTemplateSchema, effectiveFrom: date, mergePending: z.boolean().optional() }).strict();
export const templateApplySchema = templatePreviewSchema.extend({ revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type TemplateRecord = { id: string; divisionId: string; name: string; payload: AcademyConfiguration; revision: string; createdById: string; createdAt: string; updatedAt: string };
export type ApplicationRecord = { id: string; divisionId: string; templateName: string; effectiveFrom: string; status: "PENDING" | "APPLIED" | "CANCELLED" | "REVIEW"; baseRevision: string; before: AcademyConfiguration; after: AcademyConfiguration; requestedById: string; requestedByName: string; createdAt: string; appliedAt: string | null; error: string | null };

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
export function configurationRevision(value: unknown) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
export type ConfigurationProtection = { assignedSeatIds: string[]; enrollments: import("./management-policy").ManagementPolicy["optionalEnrollments"] };

/** IDs come only from the target academy or are newly allocated; no source ID is written. */
export function planAcademyConfiguration(targetId: string, current: AcademyConfiguration, incoming: AcademyConfiguration, protection: ConfigurationProtection, reservedIds = new Set<string>()) {
  const result = structuredClone(incoming);
  const changes: { section: string; name: string; before: unknown; after: unknown }[] = [];
  function merge<T extends { id: string; isActive: boolean }>(section: string, source: T[], existing: T[], identity: (row: T) => string): { rows: T[]; ids: Map<string, string> } {
    const ids = new Map<string, string>(), used = new Set<string>();
    const rows = source.map(row => {
      const exact = existing.find(e => e.id === row.id);
      const matches = existing.filter(e => identity(e) === identity(row));
      if (!exact && matches.length > 1) throw new Error(section + ": 같은 이름의 항목이 여러 개입니다. 대상 학원에서 이름을 구분해 주세요.");
      const match = exact ?? matches[0];
      const nextId = match?.id ?? (reservedIds.has(row.id) ? row.id : "tpl-" + configurationRevision([targetId, section, row.id]).slice(0, 32));
      if (used.has(nextId)) throw new Error(section + ": 여러 항목을 하나에 연결할 수 없습니다.");
      used.add(nextId); ids.set(row.id, nextId);
      const next = { ...row, id: nextId };
      if (configurationRevision(match ?? null) !== configurationRevision(next)) changes.push({ section, name: identity(row), before: match ?? null, after: next });
      return next;
    });
    for (const old of existing.filter(row => !used.has(row.id))) {
      const next = { ...old, isActive: false };
      rows.push(next);
      if (old.isActive) changes.push({ section, name: identity(old), before: old, after: next });
    }
    return { rows, ids };
  }
  const periods = merge("시간표", result.periods, current.periods, r => r.name);
  const rules = merge("상벌점 규칙", result.pointRules, current.pointRules, r => r.category + " / " + r.name);
  const rooms = merge("강의실", result.rooms, current.rooms, r => r.name);
  result.periods = periods.rows.map((p, index) => ({ ...p, displayOrder: index })); result.pointRules = rules.rows; result.rooms = rooms.rows;
  result.seats = merge("좌석", result.seats.map(s => ({ ...s, studyRoomId: rooms.ids.get(s.studyRoomId)! })), current.seats, s => s.studyRoomId + "/" + s.positionX + "/" + s.positionY).rows;
  for (const id of protection.assignedSeatIds) {
    const before = current.seats.find(s => s.id === id), after = result.seats.find(s => s.id === id);
    const room = after ? result.rooms.find(r => r.id === after.studyRoomId) : null;
    if (!before || !after || configurationRevision(before) !== configurationRevision(after) || !room?.isActive || room.aisleColumns.includes(after.positionX) || after.positionX > room.columns || after.positionY > room.rows)
      throw new Error("학생이 배정된 좌석은 템플릿으로 변경하거나 비활성화할 수 없습니다. 좌석 배정 메뉴에서 먼저 조정해 주세요.");
  }
  result.tuitionPlans = merge("수강료", result.tuitionPlans, current.tuitionPlans, r => r.name).rows;
  result.paymentCategories = merge("수납 항목", result.paymentCategories, current.paymentCategories, r => r.name).rows;
  const exams = merge("시험 종류", result.examTypes, current.examTypes, r => r.category + "/" + (r.studyTrack ?? "") + "/" + r.name);
  result.examTypes = exams.rows.map(exam => ({ ...exam, subjects: merge("과목:" + exam.id, exam.subjects, current.examTypes.find(e => e.id === exam.id)?.subjects ?? [], s => s.name).rows }));
  result.examSchedules = merge("시험 일정", result.examSchedules, current.examSchedules, r => r.type + "/" + r.name).rows;
  const mapRule = (key: string | null) => key ? rules.ids.get(key) ?? null : null;
  result.settings.tardyPointRuleId = mapRule(result.settings.tardyPointRuleId);
  result.settings.absentPointRuleId = mapRule(result.settings.absentPointRuleId);
  const p = result.settings.managementPolicy;
  if (p) {
    p.attendancePeriodIds = p.attendancePeriodIds.map(key => periods.ids.get(key)!);
    p.controlledPeriods = p.controlledPeriods.map(row => ({ ...row, periodId: periods.ids.get(row.periodId)! }));
    p.morningExam.periodId = periods.ids.get(p.morningExam.periodId) ?? "";
    p.fullDayAbsenceRuleId = mapRule(p.fullDayAbsenceRuleId) ?? ""; p.partialAbsenceRuleId = mapRule(p.partialAbsenceRuleId);
    p.tardyRuleId = mapRule(p.tardyRuleId) ?? ""; p.earlyExit.ruleId = mapRule(p.earlyExit.ruleId) ?? ""; p.unauthorizedEntry.ruleId = mapRule(p.unauthorizedEntry.ruleId) ?? "";
  }
  const auto = result.settings.examPointAutomation;
  if (auto) for (const key of Object.keys(EXAM_POINT_RULE_FIELDS) as (keyof typeof EXAM_POINT_RULE_FIELDS)[]) auto[key] = mapRule(auto[key]);
  for (const [key, after] of Object.entries(result.settings)) {
    const before = current.settings[key as keyof typeof current.settings];
    if (configurationRevision(before ?? null) !== configurationRevision(after ?? null)) changes.push({ section: "운영 설정", name: key, before, after });
  }
  // Retired configuration is retained for history and foreign-key references.
  academyTemplateSchema.parse(result);
  return { after: result, changes };
}

function hasConfigurationId(value: unknown): value is {id: string} {
  return value !== null && typeof value === "object" && typeof (value as {id?: unknown}).id === "string";
}

/** Keep untouched reserved fields while applying only edits relative to the live form. */
export function mergeConfigurationEdits<T>(base: T, edited: T, reserved: T): T {
  if (Object.is(base, edited) || (base !== undefined && edited !== undefined && configurationRevision(base) === configurationRevision(edited))) return structuredClone(reserved);
  if (Array.isArray(base) && Array.isArray(edited) && Array.isArray(reserved)) {
    const keyed = [...base, ...edited, ...reserved];
    if (keyed.length && keyed.every(hasConfigurationId)) {
      const result = edited.map(row => {
        const old = base.find(v => v.id === row.id), pending = reserved.find(v => v.id === row.id);
        return old && pending ? mergeConfigurationEdits(old, row, pending) : structuredClone(row);
      });
      for (const row of reserved) if (!base.some(v => v.id === row.id) && !result.some(v => v.id === row.id)) result.push(structuredClone(row));
      return result as T;
    }
  } else if (base && edited && reserved && typeof base === "object" && typeof edited === "object" && typeof reserved === "object" && !Array.isArray(base)) {
    return Object.fromEntries(Object.entries(edited).map(([key,value]) => [key, mergeConfigurationEdits((base as Record<string,unknown>)[key],value,(reserved as Record<string,unknown>)[key])])) as T;
  }
  return structuredClone(edited);
}
