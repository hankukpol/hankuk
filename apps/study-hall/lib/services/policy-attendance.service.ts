import { randomUUID } from "node:crypto";
import { buildPolicyAttendanceCandidates, isPolicyEffective, kstDate } from "@/lib/management-policy";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { getPeriods } from "@/lib/services/period.service";
import { getPrismaClient } from "@/lib/service-helpers";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState } from "@/lib/mock-store";
import { badRequest } from "@/lib/errors";
import { normalizeYmdDate } from "@/lib/date-utils";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";

export async function previewPolicyAttendance(divisionSlug: string, date: string) {
  normalizeYmdDate(date);
  if (date > kstDate()) throw badRequest("미래 날짜의 벌점은 확정할 수 없습니다.");
  const policy = await getManagementPolicy(divisionSlug);
  if (!isPolicyEffective(policy, date)) return [];
  if (isMockMode()) {
    const state = await readMockState();
    return buildPolicyAttendanceCandidates(policy, state.periodsByDivision[divisionSlug] ?? [],
      (state.attendanceByDivision[divisionSlug] ?? []).filter((r) => r.date === date), state.pointRulesByDivision[divisionSlug] ?? [], date)
      .filter((c) => !(state.pointRecordsByDivision[divisionSlug] ?? []).some((r) => r.studentId === c.studentId && r.ruleId === c.ruleId && r.date.slice(0, 10) === date && !r.notes?.startsWith(`[자동][출결벌점][${date}]`)));
  }
  const prisma = await getPrismaClient();
  const [records, periods, rules, existing] = await Promise.all([
    prisma.attendance.findMany({ where: { student: { division: { slug: divisionSlug } }, date: new Date(`${date}T00:00:00Z`) }, select: { studentId: true, periodId: true, status: true } }),
    getPeriods(divisionSlug),
    prisma.pointRule.findMany({ where: { division: { slug: divisionSlug }, isActive: true }, select: { id: true, points: true, isActive: true } }),
    prisma.pointRecord.findMany({ where: { student: { division: { slug: divisionSlug } }, date: { gte: new Date(`${date}T00:00:00Z`), lt: new Date(new Date(`${date}T00:00:00Z`).getTime()+86400000) } }, select: { studentId: true, ruleId: true, notes: true } }),
  ]);
  return buildPolicyAttendanceCandidates(policy, periods, records, rules, date).filter((c) => !existing.some((r) => r.studentId === c.studentId && r.ruleId === c.ruleId && !r.notes?.startsWith(`[자동][출결벌점][${date}]`)));
}

/**
 * 출석을 저장한 직후 시스템이 부르는 자동 반영.
 *
 * 조용히 넘기는 두 경우가 있다. 규정 적용 전 날짜는 이 계산의 대상이 아니고,
 * 미래 날짜는 반복 적용이 한 달치를 미리 써 두기 때문이다 — 그때 벌점을 붙이면
 * 아직 오지 않은 날의 지각이 생긴다. 그 날이 오면 그 날 저장이 다시 계산한다.
 */
export async function applyPolicyAttendancePoints(divisionSlug: string, date: string, actorId: string) {
  if (date > kstDate()) return { confirmedCount: 0 };
  const policy = await getManagementPolicy(divisionSlug);
  if (!isPolicyEffective(policy, date)) return { confirmedCount: 0 };
  return confirmPolicyAttendance(divisionSlug, date, actorId, { requireManager: false });
}

/**
 * 출결 벌점을 다시 계산해 그 날짜에 반영한다. 원본 출결은 건드리지 않는다.
 *
 * `requireManager` 가 참이면 관리자 화면의 확정 버튼이고, 거짓이면 출석 저장 직후
 * 시스템이 부르는 자동 반영이다. 자동 쪽은 사람이 누른 것이 아니므로 관리자 확인을
 * 요구하지 않는다 — 조교가 지각·결석을 기록하면 그 자리에서 벌점이 붙는다.
 *
 * 어느 쪽이든 계산과 중복 처리는 같다. 자동 기록은 `[자동][출결벌점][날짜]` 로
 * 자기를 밝히고, 다시 계산할 때 값이 같은 것은 그대로 두고 사라진 것만 지운다.
 * 관리자가 손으로 넣은 같은 규칙의 기록은 후보에서 빠지므로 이중으로 부과되지 않는다.
 */
export async function confirmPolicyAttendance(
  divisionSlug: string,
  date: string,
  actorId: string,
  { requireManager = true }: { requireManager?: boolean } = {},
) {
  normalizeYmdDate(date);
  if (date > kstDate()) throw badRequest("미래 날짜의 벌점은 확정할 수 없습니다.");
  const policy = await getManagementPolicy(divisionSlug);
  if (!isPolicyEffective(policy, date)) throw badRequest("새 관리규정 적용일 이후의 출결만 확정할 수 있습니다.");
  const prefix = `[자동][출결벌점][${date}]`;
  const result = isMockMode() ? await updateMockState((state) => {
    const actor = state.admins.find((a) => a.id === actorId && a.isActive && (a.role === "SUPER_ADMIN" || (a.role === "ADMIN" && a.divisionSlug === divisionSlug)));
    if (requireManager && !actor) throw badRequest("관리자만 출결 벌점을 확정할 수 있습니다.");
    let candidates = buildPolicyAttendanceCandidates(policy, state.periodsByDivision[divisionSlug] ?? [], (state.attendanceByDivision[divisionSlug] ?? []).filter((r) => r.date === date), state.pointRulesByDivision[divisionSlug] ?? [], date);
    const existing = state.pointRecordsByDivision[divisionSlug] ?? [];
    candidates = candidates.filter((c) => !existing.some((r) => r.studentId === c.studentId && r.ruleId === c.ruleId && r.date.slice(0, 10) === date && !r.notes?.startsWith(prefix)));
    const old = existing.filter((r) => r.notes?.startsWith(prefix));
    const next = candidates.map((c) => old.find((r) => r.studentId === c.studentId && r.notes === c.notes && r.points === c.points && r.ruleId === c.ruleId) ?? {
      ...c, id: randomUUID(), date: `${date}T00:00:00.000Z`, recordedById: actorId, createdAt: new Date().toISOString(),
    });
    state.pointRecordsByDivision[divisionSlug] = [...existing.filter((r) => !r.notes?.startsWith(prefix)), ...next];
    return { confirmedCount: next.length };
  }) : await (await getPrismaClient()).$transaction(async (tx) => {
    const division = await tx.division.findUniqueOrThrow({ where: { slug: divisionSlug }, select: { id: true } });
    const actor = requireManager
      ? await tx.admin.findFirst({ where: { id: actorId, isActive: true, OR: [{ role: "SUPER_ADMIN" }, { role: "ADMIN", divisionId: division.id }] } })
      : true;
    if (!actor) throw badRequest("관리자만 출결 벌점을 확정할 수 있습니다.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`policy-attendance:${division.id}:${date}`}))`;
    const day = new Date(`${date}T00:00:00Z`);
    const [records, periods, rules, existing] = await Promise.all([
      tx.attendance.findMany({ where: { student: { divisionId: division.id }, date: day }, select: { studentId: true, periodId: true, status: true } }),
      tx.period.findMany({ where: { divisionId: division.id } }),
      tx.pointRule.findMany({ where: { divisionId: division.id, isActive: true } }),
      tx.pointRecord.findMany({ where: { student: { divisionId: division.id }, date: { gte: day, lt: new Date(day.getTime() + 86400000) } } }),
    ]);
    const candidates = buildPolicyAttendanceCandidates(policy, periods, records, rules, date).filter((c) => !existing.some((r) => r.studentId === c.studentId && r.ruleId === c.ruleId && !r.notes?.startsWith(prefix)));
    const keep = new Set<string>();
    for (const c of candidates) {
      const same = existing.find((e) => e.notes?.startsWith(prefix) && e.studentId === c.studentId && e.notes === c.notes && e.ruleId === c.ruleId && e.points === c.points && !keep.has(e.id));
      if (same) { keep.add(same.id); continue; }
      await tx.pointRecord.create({ data: { ...c, date: day, recordedById: actorId } });
    }
    await tx.pointRecord.deleteMany({ where: { student: { divisionId: division.id }, id: { in: existing.filter((e) => e.notes?.startsWith(prefix) && !keep.has(e.id)).map((e) => e.id) } } });
    return { confirmedCount: candidates.length };
  });
  revalidateDivisionOperationalViews(divisionSlug);
  return result;
}
