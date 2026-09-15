import type { Prisma } from "@prisma/client";
import { normalizeArrivalSettings, type ArrivalSettingsDocument, type ArrivalRecord, type ArrivalHistory, type ArrivalDevice, type ArrivalPairing, type ArrivalStudent } from "@/lib/arrivals";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState, type MockDivisionSettingsHistoryRecord } from "@/lib/mock-store";
import { notFound } from "@/lib/errors";

type Scope = {
  write?: boolean; students?: "all" | { id?: string; studentNumber?: string };
  records?: { date?: string; month?: string; studentId?: string }; history?: boolean;
  devices?: boolean; pairings?: boolean;
};
export type ArrivalData = {
  divisionId: string; divisionActive: boolean; attendanceEnabled: boolean;
  settings: ArrivalSettingsDocument; students: ArrivalStudent[]; records: ArrivalRecord[];
  history: ArrivalHistory[]; devices: ArrivalDevice[]; pairings: ArrivalPairing[];
  settingsEvents: MockDivisionSettingsHistoryRecord[];
};
function matchesRecord(row: ArrivalRecord, scope: Scope) {
  return !!scope.records && (!scope.records.date || row.date === scope.records.date) && (!scope.records.month || row.date.startsWith(`${scope.records.month}-`)) && (!scope.records.studentId || row.studentId === scope.records.studentId);
}
function matchesStudent(row: ArrivalStudent, scope: Scope) {
  if (!scope.students) return false;
  return scope.students === "all" || ((!scope.students.id || row.id === scope.students.id) && (!scope.students.studentNumber || row.studentNumber === scope.students.studentNumber));
}
function merge<T extends { id: string }>(all: T[], changed: T[]) {
  const byId = new Map(all.map((r) => [r.id, r]));
  changed.forEach((r) => byId.set(r.id, r));
  return Array.from(byId.values());
}
function plain<T>(value: unknown): T { return JSON.parse(JSON.stringify(value)) as T; }
function json(value: unknown): Prisma.InputJsonValue { return plain<Prisma.InputJsonValue>(value); }

/** A division transaction serializes receipt, correction, device revocation and settings.
 * Only requested dates/students are loaded; the archive is never read on each check-in.
 * The same domain callback runs with the persistent mock store and PostgreSQL.
 */
export async function withArrivalData<T>(slug: string, scope: Scope, run: (data: ArrivalData) => T | Promise<T>): Promise<T> {
  if (isMockMode()) {
    const operation = async (state: Awaited<ReturnType<typeof readMockState>>) => {
      const division = state.divisions.find((d) => d.slug === slug);
      if (!division) throw notFound("학원 정보를 찾을 수 없습니다.");
      const setting = state.divisionSettingsByDivision[slug];
      const data: ArrivalData = {
        divisionId: division.id, divisionActive: division.isActive,
        attendanceEnabled: setting?.featureFlags?.attendanceManagement !== false,
        settings: normalizeArrivalSettings(setting?.arrivalSettings),
        students: (state.studentsByDivision[slug] ?? []).filter((s) => s.divisionId === division.id && matchesStudent(s, scope)),
        records: (state.arrivalsByDivision[slug] ?? []).filter((r) => r.divisionId === division.id && matchesRecord(r, scope)),
        history: scope.history ? (state.arrivalHistoryByDivision[slug] ?? []).filter((h) => h.divisionId === division.id && (!scope.records?.studentId || h.studentId === scope.records.studentId) && (!scope.records?.month || h.after.date.startsWith(`${scope.records.month}-`))) : [],
        devices: scope.devices ? state.arrivalDevicesByDivision[slug] ?? [] : [],
        pairings: scope.pairings ? state.arrivalPairingsByDivision[slug] ?? [] : [], settingsEvents: [],
      };
      const result = await run(data);
      if (scope.write) {
        if (setting) setting.arrivalSettings = data.settings;
        state.arrivalsByDivision[slug] = merge(state.arrivalsByDivision[slug] ?? [], data.records);
        state.arrivalHistoryByDivision[slug] = merge(state.arrivalHistoryByDivision[slug] ?? [], data.history);
        state.arrivalDevicesByDivision[slug] = merge(state.arrivalDevicesByDivision[slug] ?? [], data.devices);
        state.arrivalPairingsByDivision[slug] = merge(state.arrivalPairingsByDivision[slug] ?? [], data.pairings);
        state.divisionSettingsHistoryByDivision[slug] = [...state.divisionSettingsHistoryByDivision[slug] ?? [], ...data.settingsEvents];
      }
      return result;
    };
    return scope.write ? updateMockState(operation) : operation(await readMockState());
  }
  const { prisma } = await import("@/lib/prisma");
  return prisma.$transaction(async (tx) => {
    if (scope.write) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`arrivals:${slug}`}))`;
    const division = await tx.division.findUnique({ where: { slug }, select: { id: true, isActive: true, settings: { select: { arrivalSettings: true, featureFlags: true } } } });
    if (!division) throw notFound("학원 정보를 찾을 수 없습니다.");
    const divisionId = division.id;
    const studentFilter = typeof scope.students === "object" ? scope.students : {};
    const recordFilter: Prisma.ArrivalRecordWhereInput = { divisionId, studentId: scope.records?.studentId };
    if (scope.records?.date) recordFilter.date = new Date(`${scope.records.date}T00:00:00Z`);
    else if (scope.records?.month) {
      const start = new Date(`${scope.records.month}-01T00:00:00Z`);
      const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
      recordFilter.date = { gte: start, lt: end };
    }
    const [students, records, histories, devices, pairings] = await Promise.all([
      scope.students ? tx.student.findMany({ where: { divisionId, ...studentFilter }, select: { id: true, divisionId: true, name: true, studentNumber: true, status: true } }) : [],
      scope.records ? tx.arrivalRecord.findMany({ where: recordFilter }) : [],
      scope.history ? tx.arrivalHistory.findMany({ where: { divisionId, studentId: scope.records?.studentId, arrival: recordFilter }, orderBy: { createdAt: "asc" } }) : [],
      scope.devices ? tx.arrivalDevice.findMany({ where: { divisionId } }) : [],
      scope.pairings ? tx.arrivalPairing.findMany({ where: { divisionId, expiresAt: { gt: new Date() } } }) : [],
    ]);
    const data: ArrivalData = {
      divisionId, divisionActive: division.isActive,
      attendanceEnabled: (division.settings?.featureFlags as { attendanceManagement?: boolean } | null)?.attendanceManagement !== false,
      settings: normalizeArrivalSettings(division.settings?.arrivalSettings), students,
      records: plain<ArrivalRecord[]>(records).map((r) => ({ ...r, date: r.date.slice(0, 10) })),
      history: plain<ArrivalHistory[]>(histories), devices: plain<ArrivalDevice[]>(devices), pairings: plain<ArrivalPairing[]>(pairings), settingsEvents: [],
    };
    const before = structuredClone(data);
    const result = await run(data);
    if (!scope.write) return result;
    const changed = <R extends { id: string }>(old: R[], next: R[]) => next.filter((r) => JSON.stringify(old.find((o) => o.id === r.id)) !== JSON.stringify(r));
    for (const row of changed(before.devices, data.devices)) {
      const value = { ...row, createdAt: new Date(row.createdAt), expiresAt: new Date(row.expiresAt), revokedAt: row.revokedAt ? new Date(row.revokedAt) : null };
      if (before.devices.some((r) => r.id === row.id)) await tx.arrivalDevice.updateMany({ where: { divisionId, id: row.id }, data: value });
      else await tx.arrivalDevice.create({ data: value });
    }
    for (const row of changed(before.pairings, data.pairings)) {
      const value = { ...row, createdAt: new Date(row.createdAt), expiresAt: new Date(row.expiresAt) };
      if (before.pairings.some((r) => r.id === row.id)) await tx.arrivalPairing.updateMany({ where: { divisionId, id: row.id }, data: value });
      else await tx.arrivalPairing.create({ data: value });
    }
    for (const row of changed(before.records, data.records)) {
      const value = { ...row, date: new Date(`${row.date}T00:00:00Z`), firstReceivedAt: row.firstReceivedAt ? new Date(row.firstReceivedAt) : null, effectiveAt: new Date(row.effectiveAt), cancelledAt: row.cancelledAt ? new Date(row.cancelledAt) : null, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
      if (before.records.some((r) => r.id === row.id)) await tx.arrivalRecord.updateMany({ where: { divisionId, id: row.id }, data: value });
      else await tx.arrivalRecord.create({ data: value });
    }
    for (const row of data.history.filter((r) => !before.history.some((h) => h.id === r.id))) {
      await tx.arrivalHistory.create({ data: { ...row, before: row.before ? json(row.before) : undefined, after: json(row.after), createdAt: new Date(row.createdAt) } });
    }
    if (JSON.stringify(before.settings) !== JSON.stringify(data.settings)) {
      await tx.divisionSettings.upsert({ where: { divisionId }, create: { divisionId, arrivalSettings: json(data.settings) }, update: { arrivalSettings: json(data.settings) } });
    }
    for (const event of data.settingsEvents) await tx.divisionSettingsHistory.create({ data: { ...event, changes: json(event.changes), changedAt: new Date(event.changedAt) } });
    return result;
  }, { timeout: 15000, maxWait: 10000 });
}
