import { randomUUID } from "node:crypto";
import { configurationForDate, type AppliedConfiguration } from "@/lib/academy-configuration-history";
import { kstDate, type ManagementPolicy } from "@/lib/management-policy";
import { isMockMode } from "@/lib/mock-data";
import { updateMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";
import { buildPerfectAttendanceAwards, perfectAttendanceWindows, type PerfectAttendanceAward } from "@/lib/perfect-attendance";

type Settings = { perfectAttendanceWeeklyPts: number; perfectAttendanceMonthlyPts: number };
type StoredAward = PerfectAttendanceAward & { id: string; ruleId: string | null };
function configurationResolver(policy: ManagementPolicy, settings: Settings, periods: Parameters<typeof buildPerfectAttendanceAwards>[0]["periods"], history: AppliedConfiguration[]) {
  const current: { settings: Settings & { managementPolicy: Omit<ManagementPolicy, "optionalEnrollments"> | null }; periods: typeof periods } = { settings: { ...settings, managementPolicy: policy }, periods };
  return (day: string) => {
    const config = configurationForDate(current, history, day);
    return { policy: config.settings.managementPolicy ? { ...config.settings.managementPolicy, optionalEnrollments: policy.optionalEnrollments } : null,
      periods: config.periods, weeklyPts: config.settings.perfectAttendanceWeeklyPts, monthlyPts: config.settings.perfectAttendanceMonthlyPts };
  };
}

function reconcile(existing: StoredAward[], desired: PerfectAttendanceAward[]) {
  const keep = new Set<string>();
  const create: PerfectAttendanceAward[] = [];
  for (const award of desired) {
    const same = existing.find(r => !keep.has(r.id) && r.studentId === award.studentId && r.notes === award.notes && r.points === award.points && r.date === award.date);
    if (same) keep.add(same.id);
    else create.push(award);
  }
  return { create, remove: existing.filter(r => !keep.has(r.id)).map(r => r.id) };
}

/** 출결 원본 저장 후 호출한다. 같은 직렬의 주/월 재계산은 하나의 잠금으로 직렬화한다. */
export async function syncPeriodicPerfectAttendancePoints(
  divisionSlug: string, date: string, actorId: string, policy: ManagementPolicy, settings: Settings,
) {
  const now = new Date();
  if (date > kstDate(now)) return { grantedCount: 0, revokedCount: 0 };
  const windows = perfectAttendanceWindows(date);
  const notes = windows.map(w => w.notes);
  const amounts = { weeklyPts: settings.perfectAttendanceWeeklyPts ?? 0, monthlyPts: settings.perfectAttendanceMonthlyPts ?? 0 };
  if (isMockMode()) {
    return updateMockState(state => {
      const all = state.pointRecordsByDivision[divisionSlug] ?? [];
      const students = (state.studentsByDivision[divisionSlug] ?? []).filter(student => student.status === "ACTIVE");
      const activeIds = new Set(students.map(student => student.id));
      const existing = all.filter(r => activeIds.has(r.studentId) && r.ruleId === null && notes.includes(r.notes ?? ""));
      const division = state.divisions?.find(d => d.slug === divisionSlug);
      const history = (state.academyApplications ?? []).filter(h => h.divisionId === division?.id && h.status === "APPLIED");
      if (!history.length && !existing.length && amounts.weeklyPts <= 0 && amounts.monthlyPts <= 0) return { grantedCount: 0, revokedCount: 0 };
      // 신규 계산은 재원 학생만 대상으로 한다. 비재원 학생의 과거 지급분은 보존한다.
      const desired = buildPerfectAttendanceAwards({ windows, policy, now, ...amounts,
        configurationAt: configurationResolver(policy, settings, state.periodsByDivision[divisionSlug] ?? [], history),
        periods: state.periodsByDivision[divisionSlug] ?? [], studentIds: students.map(s => s.id),
        records: state.attendanceByDivision[divisionSlug] ?? [],
      });
      const { create, remove } = reconcile(existing.map(r => ({ ...r, notes: r.notes! })), desired);
      const removed = new Set(remove);
      state.pointRecordsByDivision[divisionSlug] = [
        ...all.filter(r => !removed.has(r.id)),
        ...create.map(award => ({ ...award, id: randomUUID(), ruleId: null, recordedById: actorId, createdAt: now.toISOString() })),
      ];
      return { grantedCount: create.length, revokedCount: remove.length };
    });
  }
  const prisma = await getPrismaClient();
  return prisma.$transaction(async tx => {
    const division = await tx.division.findUniqueOrThrow({ where: { slug: divisionSlug }, select: { id: true } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`perfect-attendance:${division.id}`}))`;
    const existing = await tx.pointRecord.findMany({ where: { student: { divisionId: division.id, status: "ACTIVE" }, ruleId: null, notes: { in: notes } } });
    const from = windows.map(w => w.dateFrom).sort()[0];
    const to = windows.map(w => w.dateTo).sort().at(-1)!;
    const [periods, students, records, historyRows] = await Promise.all([
      tx.period.findMany({ where: { divisionId: division.id } }),
      tx.student.findMany({ where: { divisionId: division.id, status: "ACTIVE" }, select: { id: true } }),
      tx.attendance.findMany({ where: { student: { divisionId: division.id }, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } }, select: { studentId: true, periodId: true, status: true, reason: true, date: true } }),
      tx.academyConfigurationApplication.findMany({ where: { divisionId: division.id, status: "APPLIED" }, select: { before: true, after: true, status: true, effectiveFrom: true, createdAt: true } }),
    ]);
    const desired = buildPerfectAttendanceAwards({ windows, policy, periods, now, ...amounts,
      configurationAt: configurationResolver(policy, settings, periods, historyRows.map(row => ({ ...row, effectiveFrom: row.effectiveFrom.toISOString().slice(0,10), createdAt: row.createdAt.toISOString(), before: row.before as unknown as AppliedConfiguration["before"], after: row.after as unknown as AppliedConfiguration["after"] }))),
      studentIds: students.map(s => s.id), records: records.map(r => ({ ...r, date: r.date.toISOString().slice(0, 10) })),
    });
    const { create, remove } = reconcile(existing.map(r => ({ ...r, notes: r.notes!, date: r.date.toISOString() })), desired);
    if (remove.length) await tx.pointRecord.deleteMany({ where: { student: { divisionId: division.id }, id: { in: remove } } });
    if (create.length) await tx.pointRecord.createMany({ data: create.map(award => ({ ...award, ruleId: null, date: new Date(award.date), recordedById: actorId })) });
    return { grantedCount: create.length, revokedCount: remove.length };
  });
}
