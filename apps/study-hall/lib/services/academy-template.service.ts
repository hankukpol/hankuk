import { randomUUID } from "node:crypto";
import { CONFIGURATION_LABELS } from "@/lib/academy-template-labels";
import { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { academyTemplateSchema, mergeConfigurationEdits, configurationRevision, planAcademyConfiguration, templateSaveSchema, templatePreviewSchema, templateApplySchema, type AcademyConfiguration, type ApplicationRecord, type TemplateRecord, type ConfigurationProtection } from "@/lib/academy-template";
import { managementPolicySchema, kstDate } from "@/lib/management-policy";
import { validateAcademyPolicyReferences } from "@/lib/academy-policy-settings";
import { examPointAutomationSchema } from "@/lib/exam-point-automation";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";
import { serializeSettingsRecord } from "@/lib/services/settings.service";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";

type State = Awaited<ReturnType<typeof readMockState>>;
type Actor = { id: string; name: string };
type Pending = Pick<ApplicationRecord, "id" | "effectiveFrom" | "after" | "baseRevision">;
type Context = { pending: Pending | null; divisionId: string; current: AcademyConfiguration; protection: ConfigurationProtection; studentCount: number; hasOperationsToday: boolean };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const pick = (value: unknown, keys: readonly string[]) => Object.fromEntries(keys.map(key => [key, (value as Record<string, unknown>)[key] ?? null]));
const fields = {
  periods: ["id","name","label","displayOrder","startTime","endTime","isMandatory","isActive"],
  pointRules: ["id","name","category","points","description","isActive","displayOrder"],
  rooms: ["id","name","columns","rows","aisleColumns","isActive","displayOrder"],
  seats: ["id","studyRoomId","label","positionX","positionY","isActive"],
  tuitionPlans: ["id","name","durationDays","amount","description","isActive","displayOrder"],
  paymentCategories: ["id","name","isActive","displayOrder"],
  examTypes: ["id","name","category","studyTrack","isActive","displayOrder"],
  subjects: ["id","name","totalItems","pointsPerItem","alternateGroup","isActive","displayOrder"],
  examSchedules: ["id","name","type","examDate","description","isActive"],
} as const;
function capture(settings: unknown, rows: Record<keyof Omit<typeof fields, "subjects">, unknown[]>) {
  const raw = settings as Parameters<typeof serializeSettingsRecord>[0] & { managementPolicy?: unknown; examPointAutomation?: unknown };
  const { divisionId: _division, updatedAt: _updated, ...normalized } = serializeSettingsRecord(raw);
  void _division; void _updated;
  const policy = raw.managementPolicy == null ? null : managementPolicySchema.parse(raw.managementPolicy);
  const { optionalEnrollments: _enrollments, ...policySettings } = policy ?? {};
  void _enrollments;
  const collections = Object.fromEntries(Object.entries(rows).map(([key, list]) => [key, list.map(row => {
    const result = pick(row, fields[key as keyof typeof rows]);
    if (key === "examTypes") result.subjects = ((row as { subjects: unknown[] }).subjects ?? []).map(s => pick(s, fields.subjects));
    if (key === "examSchedules") result.examDate = result.examDate instanceof Date ? result.examDate.toISOString().slice(0, 10) : String(result.examDate).slice(0, 10);
    return result;
  })]));
  // Parse the allowlist; personally identifying and operational fields are never copied.
  return academyTemplateSchema.parse({ version: 1, settings: { ...normalized,
    managementPolicy: policy ? { ...policySettings, source: "학원 관리자 설정" } : null,
    examPointAutomation: raw.examPointAutomation == null ? null : examPointAutomationSchema.parse(raw.examPointAutomation),
  }, ...collections });
}
function mockContext(state: State, slug: string): Context {
  const division = state.divisions.find(d => d.slug === slug);
  if (!division) throw notFound("학원을 찾을 수 없습니다.");
  const settings = state.divisionSettingsByDivision[slug];
  if (!settings) throw badRequest("학원 기본 설정을 먼저 저장해 주세요.");
  const policy = (settings as unknown as { managementPolicy?: unknown }).managementPolicy;
  return { divisionId: division.id, pending: state.academyApplications.find(r => r.divisionId === division.id && r.status === "PENDING") ?? null,
    hasOperationsToday: (state.attendanceByDivision[slug] ?? []).some(r => r.date === kstDate()) || (state.pointRecordsByDivision[slug] ?? []).some(r => kstDate(new Date(r.date)) === kstDate()), studentCount: (state.studentsByDivision[slug] ?? []).length,
    protection: { assignedSeatIds: (state.studentsByDivision[slug] ?? []).flatMap(s => s.seatId ? [s.seatId] : []).sort(), enrollments: policy ? managementPolicySchema.parse(policy).optionalEnrollments : [] },
    current: capture(settings, { periods: state.periodsByDivision[slug] ?? [], pointRules: state.pointRulesByDivision[slug] ?? [], rooms: state.studyRoomsByDivision[slug] ?? [], seats: state.seatsByDivision[slug] ?? [], tuitionPlans: state.tuitionPlansByDivision[slug] ?? [], paymentCategories: state.paymentCategoriesByDivision[slug] ?? [], examTypes: state.examTypesByDivision[slug] ?? [], examSchedules: state.examSchedulesByDivision[slug] ?? [] }),
  };
}
async function dbContext(tx: Prisma.TransactionClient, slug: string): Promise<Context> {
  const division = await tx.division.findUnique({ where: { slug }, select: { id: true } });
  if (!division) throw notFound("학원을 찾을 수 없습니다.");
  const where = { divisionId: division.id };
  const [settings, periods, pointRules, rooms, seats, tuitionPlans, paymentCategories, examTypes, examSchedules, students] = await Promise.all([
    tx.divisionSettings.findUnique({ where }),
    tx.period.findMany({ where, orderBy: { displayOrder: "asc" } }), tx.pointRule.findMany({ where, orderBy: { displayOrder: "asc" } }),
    tx.studyRoom.findMany({ where, orderBy: { displayOrder: "asc" } }), tx.seat.findMany({ where, orderBy: [{ studyRoomId: "asc" }, { positionY: "asc" }, { positionX: "asc" }] }),
    tx.tuitionPlan.findMany({ where, orderBy: { displayOrder: "asc" } }), tx.paymentCategory.findMany({ where, orderBy: { displayOrder: "asc" } }),
    tx.examType.findMany({ where, include: { subjects: { orderBy: { displayOrder: "asc" } } }, orderBy: { displayOrder: "asc" } }),
    tx.examSchedule.findMany({ where, orderBy: { id: "asc" } }), tx.student.findMany({ where, select: { seatId: true } }),
  ]);
  if (!settings) throw badRequest("학원 기본 설정을 먼저 저장해 주세요.");
  const today = new Date(kstDate() + "T00:00:00Z");
  const hasOperationsToday = !!await tx.attendance.findFirst({ where: { student: { divisionId: division.id }, date: today }, select: { id: true } }) ||
    !!await tx.pointRecord.findFirst({where:{student:{divisionId:division.id},date:{gte:new Date(kstDate()+"T00:00:00+09:00"),lt:new Date(Date.parse(kstDate()+"T00:00:00+09:00")+86400000)}},select:{id:true}});
  const reservation = await tx.academyConfigurationApplication.findFirst({where:{divisionId:division.id,status:"PENDING"}});
  const pending: Pending | null = reservation ? {id:reservation.id,effectiveFrom:reservation.effectiveFrom.toISOString().slice(0,10),after:academyTemplateSchema.parse(reservation.after),baseRevision:reservation.baseRevision} : null;
  return { divisionId: division.id, pending, hasOperationsToday, current: capture(settings, { periods, pointRules, rooms, seats, tuitionPlans, paymentCategories, examTypes, examSchedules }),
    studentCount: students.length, protection: { assignedSeatIds: students.flatMap(s => s.seatId ? [s.seatId] : []).sort(), enrollments: settings.managementPolicy ? managementPolicySchema.parse(settings.managementPolicy).optionalEnrollments : [] } };
}
function contextRevision(context: Context) { return configurationRevision({ current: context.current, protection: context.protection }); }
function plan(context: Context, value: unknown) {
  const input = templatePreviewSchema.parse(value);
  let payload = structuredClone(input.payload);
  const reservedIds = new Set<string>();
  if (context.pending) {
    if (!input.mergePending || input.effectiveFrom !== context.pending.effectiveFrom) throw conflict(`예약된 설정이 있습니다. ${context.pending.effectiveFrom} 적용 예약에 변경을 추가하거나 설정 템플릿에서 기존 예약을 취소해 주세요.`);
    if (context.pending.baseRevision !== contextRevision(context)) throw conflict("예약 이후 현재 설정이 바뀌었습니다. 기존 예약을 확인하고 다시 미리보기해 주세요.");
    const normalized = planAcademyConfiguration(context.divisionId, context.current, payload, context.protection).after;
    payload = mergeConfigurationEdits(context.current, normalized, context.pending.after);
    for (const [key,rows] of Object.entries(context.pending.after)) if (key !== "settings" && Array.isArray(rows)) for (const row of rows) {
      reservedIds.add(row.id);
      if ("subjects" in row) for (const subject of row.subjects) reservedIds.add(subject.id);
    }
  }
  // Inactive periods leave the control list in the same previewed transaction.
  const policyDraft = payload.settings.managementPolicy;
  if (policyDraft) {
    const active = new Set(payload.periods.filter(p => p.isActive).map(p => p.id));
    policyDraft.controlledPeriods = policyDraft.controlledPeriods.filter(p => active.has(p.periodId));
    policyDraft.attendancePeriodIds = policyDraft.attendancePeriodIds.filter(id => active.has(id));
    if (!active.has(policyDraft.morningExam.periodId)) policyDraft.morningExam.syncAttendance = false;
    if (!policyDraft.controlledPeriods.length) policyDraft.enabled = false;
  }
  // The selected application date versions calculations; keep administrator-entered start dates unchanged.
  let planned: ReturnType<typeof planAcademyConfiguration>;
  try {
    planned = planAcademyConfiguration(context.divisionId, context.current, payload, context.protection, reservedIds);
    const policy = planned.after.settings.managementPolicy;
    if (policy) validateAcademyPolicyReferences(policy, planned.after.periods, planned.after.pointRules, context.protection.enrollments, input.effectiveFrom);
    else if (context.protection.enrollments.some(e => e.dateTo >= input.effectiveFrom)) throw new Error("이 적용일에 기존 개별 관리 대상 기록이 남아 있어 관리규정을 제거할 수 없습니다. 적용일을 확인해 주세요.");
  } catch (error) { throw badRequest((error as Error).message); }
  return { ...planned, revision: configurationRevision({base:contextRevision(context),pending:context.pending}), effectiveFrom: input.effectiveFrom };
}
function revalidate(slug: string) {
  for (const key of ["periods", "division-settings", "tuition-plans", "division-theme", "exam-types"]) revalidateTag(key + ":" + slug);
  revalidateDivisionOperationalViews(slug);
  revalidatePath("/" + slug + "/admin/settings", "layout");
}
export async function getAcademyTemplateLibrary(slug: string) {
  if (isMockMode()) {
    const state = await readMockState(), context = mockContext(state, slug);
    return { current: context.current, pending: context.pending ? {id:context.pending.id,effectiveFrom:context.pending.effectiveFrom} : null, earliestCalculationDate: kstDate(), templates: state.academyTemplates.filter(t => t.divisionId === context.divisionId),
      applications: state.academyApplications.filter(t => t.divisionId === context.divisionId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(({ before: _before, after: _after, baseRevision: _rev, ...row }) => { void _before; void _after; void _rev; return row; }) };
  }
  const prisma = await getPrismaClient(), context = await dbContext(prisma, slug);
  const templates = await prisma.academyTemplate.findMany({ where: { divisionId: context.divisionId }, orderBy: { updatedAt: "desc" } });
  const applications = await prisma.academyConfigurationApplication.findMany({ where: { divisionId: context.divisionId }, select: { id: true, templateName: true, effectiveFrom: true, status: true, requestedByName: true, createdAt: true, appliedAt: true, error: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return { current: context.current, pending: context.pending ? {id:context.pending.id,effectiveFrom:context.pending.effectiveFrom} : null, earliestCalculationDate: kstDate(), templates: templates.map(row => ({ ...row, payload: academyTemplateSchema.parse(row.payload), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })),
    applications: applications.map(row => ({ ...row, effectiveFrom: row.effectiveFrom.toISOString().slice(0,10), createdAt: row.createdAt.toISOString(), appliedAt: row.appliedAt?.toISOString() ?? null })) };
}
export async function saveAcademyTemplate(slug: string, value: unknown, actor: Actor) {
  const input = templateSaveSchema.parse(value), now = new Date().toISOString();
  // New versions are independent copies. No overwrite of an already scheduled template.
  const row = { id: randomUUID(), ...input, revision: configurationRevision(input.payload), createdById: actor.id, createdAt: now, updatedAt: now };
  if (isMockMode()) return updateMockState(state => {
    const division = state.divisions.find(d => d.slug === slug);
    if (!division) throw notFound("학원을 찾을 수 없습니다.");
    if (state.academyTemplates.filter(t => t.divisionId === division.id).length >= 100) throw badRequest("학원당 템플릿은 100개까지 저장할 수 있습니다.");
    const saved: TemplateRecord = { ...row, divisionId: division.id }; state.academyTemplates.push(saved); return saved;
  });
  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({ where: { slug }, select: { id: true } });
  if (!division) throw notFound("학원을 찾을 수 없습니다.");
  if (await prisma.academyTemplate.count({ where: { divisionId: division.id } }) >= 100) throw badRequest("학원당 템플릿은 100개까지 저장할 수 있습니다.");
  return prisma.academyTemplate.create({ data: { ...row, divisionId: division.id, payload: json(input.payload) } });
}
export async function previewAcademyTemplate(slug: string, value: unknown) {
  const context = isMockMode() ? mockContext(await readMockState(), slug) : await dbContext(await getPrismaClient(), slug);
  return plan(context, value);
}
function settingsChanges(before: AcademyConfiguration, after: AcademyConfiguration) {
  return Object.keys(after.settings).filter(k => configurationRevision(before.settings[k as keyof typeof before.settings]) !== configurationRevision(after.settings[k as keyof typeof after.settings])).map(field => {
    const previous=before.settings[field as keyof typeof before.settings], next=after.settings[field as keyof typeof after.settings];
    const describe=(value:unknown) => value && typeof value === "object" ? "세부 설정 (적용 이력에서 확인)" : value;
    return {field,label:CONFIGURATION_LABELS[field]??field,before:describe(previous),after:describe(next)};
  });
}
function mockWrite(state: State, slug: string, context: Context, after: AcademyConfiguration, actorId: string, actorName: string) {
  const now = new Date().toISOString(), divisionId = context.divisionId;
  function records<T extends { id: string }>(rows: T[], old: { id: string; createdAt: string }[]) {
    return rows.map(row => ({ ...row, divisionId, createdAt: old.find(r => r.id === row.id)?.createdAt ?? now, updatedAt: now }));
  }
  const changes=settingsChanges(context.current,after);
  if (changes.length) (state.divisionSettingsHistoryByDivision[slug] ??= []).push({id:randomUUID(),divisionId,section:"rules",changes,changedById:actorId,changedByName:actorName,changedAt:now});
  const managementPolicy = after.settings.managementPolicy ? { ...after.settings.managementPolicy, optionalEnrollments: context.protection.enrollments } : null;
  Object.assign(state.divisionSettingsByDivision[slug], after.settings, { managementPolicy, updatedAt: now });
  state.periodsByDivision[slug] = records(after.periods, state.periodsByDivision[slug] ?? []);
  state.pointRulesByDivision[slug] = records(after.pointRules, state.pointRulesByDivision[slug] ?? []);
  state.studyRoomsByDivision[slug] = records(after.rooms, state.studyRoomsByDivision[slug] ?? []);
  state.seatsByDivision[slug] = records(after.seats, state.seatsByDivision[slug] ?? []);
  state.tuitionPlansByDivision[slug] = records(after.tuitionPlans, state.tuitionPlansByDivision[slug] ?? []);
  state.paymentCategoriesByDivision[slug] = records(after.paymentCategories, state.paymentCategoriesByDivision[slug] ?? []);
  state.examTypesByDivision[slug] = records(after.examTypes, state.examTypesByDivision[slug] ?? []).map(e => ({ ...e, subjects: e.subjects.map(s => ({ ...s, examTypeId: e.id, createdAt: now, updatedAt: now })) }));
  state.examSchedulesByDivision[slug] = records(after.examSchedules, state.examSchedulesByDivision[slug] ?? []).map(e => ({ ...e, createdById: state.examSchedulesByDivision[slug]?.find(old => old.id === e.id)?.createdById ?? actorId }));
}
async function dbWrite(tx: Prisma.TransactionClient, context: Context, after: AcademyConfiguration, actorId: string, actorName: string) {
  const divisionId = context.divisionId;
  const changes=settingsChanges(context.current,after);
  if (changes.length) await tx.divisionSettingsHistory.create({data:{divisionId,section:"rules",changes:json(changes),changedById:actorId,changedByName:actorName}});

  // Move ordinals out of the way so swaps never violate the academy/order unique index.
  await tx.period.updateMany({ where: { divisionId }, data: { displayOrder: { increment: 100000 } } });
  for (const row of after.periods) await tx.period.upsert({ where: { id: row.id, divisionId }, create: { ...row, divisionId }, update: row });
  for (const row of after.pointRules) await tx.pointRule.upsert({ where: { id: row.id, divisionId }, create: { ...row, divisionId }, update: row });
  for (const row of context.current.rooms) await tx.studyRoom.update({where:{id:row.id,divisionId},data:{name:"template-swap-"+row.id}});
  for (const row of context.current.tuitionPlans) await tx.tuitionPlan.update({where:{id:row.id,divisionId},data:{name:"template-swap-"+row.id}});
  for (const row of context.current.paymentCategories) await tx.paymentCategory.update({where:{id:row.id,divisionId},data:{name:"template-swap-"+row.id}});
  await tx.seat.updateMany({where:{divisionId},data:{positionX:{increment:100000},label:""}});
  for (const row of after.rooms) await tx.studyRoom.upsert({ where: { id: row.id, divisionId }, create: { ...row, divisionId }, update: row });
  for (const row of after.seats) await tx.seat.upsert({ where: { id: row.id, divisionId }, create: { ...row, divisionId }, update: row });
  for (const row of after.tuitionPlans) await tx.tuitionPlan.upsert({ where: { id: row.id, divisionId }, create: { ...row, divisionId }, update: row });
  for (const row of after.paymentCategories) await tx.paymentCategory.upsert({ where: { id: row.id, divisionId }, create: { ...row, divisionId }, update: row });
  for (const { subjects, ...row } of after.examTypes) {
    await tx.examType.upsert({ where: { id: row.id, divisionId }, create: { ...row, divisionId }, update: row });
    for (const subject of subjects) await tx.examSubject.upsert({ where: { id: subject.id, examTypeId: row.id }, create: { ...subject, examTypeId: row.id }, update: subject });
  }
  for (const row of after.examSchedules) {
    const data = { ...row, examDate: new Date(row.examDate + "T00:00:00Z") };
    await tx.examSchedule.upsert({ where: { id: row.id, divisionId }, create: { ...data, divisionId, createdById: actorId }, update: data });
  }
  const { managementPolicy, examPointAutomation, ...settings } = after.settings;
  await tx.divisionSettings.update({ where: { divisionId }, data: { ...settings,
    examAnalysis: settings.examAnalysis ? json(settings.examAnalysis) : undefined,
    managementPolicy: managementPolicy ? json({ ...managementPolicy, optionalEnrollments: context.protection.enrollments }) : Prisma.DbNull,
    examPointAutomation: examPointAutomation ? json(examPointAutomation) : Prisma.DbNull,
  } });
}
export async function applyAcademyTemplate(slug: string, value: unknown, actor: Actor) {
  const input = templateApplySchema.parse(value);
  function prepare(context: Context): ApplicationRecord {
    if (input.revision !== configurationRevision({base:contextRevision(context),pending:context.pending})) throw conflict("미리보기 이후 설정이나 예약이 변경되었습니다. 변경 미리보기를 다시 확인해 주세요.");
    const planned = plan(context, { name: input.name, payload: input.payload, effectiveFrom: input.effectiveFrom, mergePending: input.mergePending });
    if (input.revision !== planned.revision) throw conflict("미리보기 이후 설정이나 좌석 배정이 변경되었습니다. 변경 미리보기를 다시 확인해 주세요.");
    if (!planned.changes.length) throw badRequest("변경할 설정이 없습니다.");
    const now = new Date().toISOString(), today = input.effectiveFrom <= kstDate();
    return { id: randomUUID(), divisionId: context.divisionId, templateName: input.name, effectiveFrom: input.effectiveFrom, status: today ? "APPLIED" : "PENDING", baseRevision: contextRevision(context), before: context.current, after: planned.after, requestedById: actor.id, requestedByName: actor.name, createdAt: now, appliedAt: today ? now : null, error: null };
  }
  let result: ApplicationRecord;
  if (isMockMode()) result = await updateMockState(state => {
    const context = mockContext(state, slug);
    const row = prepare(context);
    if (context.pending) { const previous=state.academyApplications.find(r=>r.id===context.pending!.id)!; previous.status="CANCELLED"; previous.error="추가 변경을 포함한 새 예약으로 교체되었습니다."; }
    if (row.status === "APPLIED") mockWrite(state, slug, context, row.after, actor.id, actor.name);
    state.academyApplications.push(row); return row;
  });
  else {
    const prisma = await getPrismaClient();
    result = await prisma.$transaction(async tx => {
      const context = await dbContext(tx, slug);
      const row = prepare(context);
      if (context.pending) await tx.academyConfigurationApplication.update({where:{id:context.pending.id,divisionId:context.divisionId},data:{status:"CANCELLED",error:"추가 변경을 포함한 새 예약으로 교체되었습니다."}});
      if (row.status === "APPLIED") await dbWrite(tx, context, row.after, actor.id, actor.name);
      await tx.academyConfigurationApplication.create({ data: { ...row, effectiveFrom: new Date(row.effectiveFrom + "T00:00:00Z"), before: json(row.before), after: json(row.after) } }); return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 25000 });
  }
  revalidate(slug);
  return { id: result.id, status: result.status, effectiveFrom: result.effectiveFrom };
}
export async function cancelAcademyTemplateApplication(slug: string, id: string) {
  if (isMockMode()) await updateMockState(state => {
    const division = state.divisions.find(d => d.slug === slug);
    const row = state.academyApplications.find(r => r.id === id && r.divisionId === division?.id && ["PENDING","REVIEW"].includes(r.status));
    if (!row) throw notFound("취소할 예약을 찾을 수 없습니다."); row.status = "CANCELLED";
  });
  else {
    const prisma = await getPrismaClient(), division = await prisma.division.findUnique({ where: { slug }, select: { id: true } });
    if (!division) throw notFound("학원을 찾을 수 없습니다.");
    const result = await prisma.academyConfigurationApplication.updateMany({ where: { id, divisionId: division.id, status: { in: ["PENDING","REVIEW"] } }, data: { status: "CANCELLED" } });
    if (!result.count) throw notFound("취소할 예약을 찾을 수 없습니다.");
  }
  revalidate(slug);
}
export async function applyDueAcademyTemplates(slug: string, today = kstDate()) {
  const apply = (context: Context, row: ApplicationRecord) => {
    if (row.baseRevision !== contextRevision(context)) { row.status = "REVIEW"; row.error = "예약 이후 설정 또는 좌석 배정이 바뀌었습니다. 새 미리보기가 필요합니다."; return false; }
    row.status = "APPLIED"; row.appliedAt = new Date().toISOString(); return true;
  };
  let applied = false;
  if (isMockMode()) {
    const state = await readMockState(), division = state.divisions.find(d => d.slug === slug);
    if (!state.academyApplications.some(r => r.divisionId === division?.id && r.status === "PENDING" && r.effectiveFrom <= today)) return;
    await updateMockState(draft => {
      const context = mockContext(draft, slug), row = draft.academyApplications.find(r => r.divisionId === context.divisionId && r.status === "PENDING" && r.effectiveFrom <= today);
      if (row && apply(context, row)) { mockWrite(draft, slug, context, row.after, row.requestedById, row.requestedByName); applied = true; }
    });
  } else {
    const prisma = await getPrismaClient(), division = await prisma.division.findUnique({ where: { slug }, select: { id: true } });
    if (!division || !await prisma.academyConfigurationApplication.count({ where: { divisionId: division.id, status: "PENDING", effectiveFrom: { lte: new Date(today + "T00:00:00Z") } } })) return;
    await prisma.$transaction(async tx => {
      const context = await dbContext(tx, slug);
      const pending = await tx.academyConfigurationApplication.findFirst({ where: { divisionId: context.divisionId, status: "PENDING", effectiveFrom: { lte: new Date(today + "T00:00:00Z") } }, orderBy: { effectiveFrom: "asc" } });
      if (!pending) return;
      const row = { ...pending, effectiveFrom: pending.effectiveFrom.toISOString().slice(0,10), createdAt: pending.createdAt.toISOString(), appliedAt: null, before: pending.before as unknown as AcademyConfiguration, after: pending.after as unknown as AcademyConfiguration } as ApplicationRecord;
      if (apply(context, row)) { await dbWrite(tx, context, row.after, row.requestedById, row.requestedByName); applied = true; }
      await tx.academyConfigurationApplication.update({ where: { id: row.id, divisionId: context.divisionId }, data: { status: row.status, error: row.error, appliedAt: row.appliedAt } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 25000 });
  }
  if (applied) revalidate(slug);
}

export { getHistoricalAcademyConfiguration } from "./academy-configuration-history.service";

export async function getAcademyTemplateApplication(slug: string, id: string) {
  if (isMockMode()) {
    const state = await readMockState(), division = state.divisions.find(d => d.slug === slug);
    const row = state.academyApplications.find(r => r.id === id && r.divisionId === division?.id);
    if (!row) throw notFound("적용 이력을 찾을 수 없습니다.");
    return { before: row.before, after: row.after };
  }
  const prisma = await getPrismaClient();
  const row = await prisma.academyConfigurationApplication.findFirst({
    where: { id, division: { slug } }, select: { before: true, after: true },
  });
  if (!row) throw notFound("적용 이력을 찾을 수 없습니다.");
  return { before: row.before as unknown as AcademyConfiguration, after: row.after as unknown as AcademyConfiguration };
}

/** Backward-compatible API writes use the same validated, non-retroactive snapshot transaction. */
export async function applyAcademySettingsPatch(slug: string, name: string, settings: Partial<AcademyConfiguration["settings"]>, actor: Actor) {
  const library = await getAcademyTemplateLibrary(slug);
  const payload = {...library.current, settings:{...library.current.settings,...settings}};
  const value = {name,payload,effectiveFrom:kstDate()};
  const preview = await previewAcademyTemplate(slug,value);
  if (!preview.changes.length) return;
  await applyAcademyTemplate(slug,{...value,revision:preview.revision},actor);
}

export async function applyAcademyConfigurationEdit(slug: string, name: string, edit: (current: AcademyConfiguration) => AcademyConfiguration, actor: Actor) {
  const library=await getAcademyTemplateLibrary(slug);
  const value={name,payload:edit(structuredClone(library.current)),effectiveFrom:kstDate()};
  const preview=await previewAcademyTemplate(slug,value);
  if(preview.changes.length) await applyAcademyTemplate(slug,{...value,revision:preview.revision},actor);
  return (await getAcademyTemplateLibrary(slug)).current;
}
