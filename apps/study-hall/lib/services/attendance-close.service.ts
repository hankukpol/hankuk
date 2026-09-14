import { kstDate, isPolicyEffective } from "@/lib/management-policy";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { applyPolicyAttendancePoints } from "@/lib/services/policy-attendance.service";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";
import { getDivisionSettings } from "@/lib/services/settings.service";
import { syncPeriodicPerfectAttendancePoints } from "@/lib/services/perfect-attendance.service";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";

function nextDate(date: string, days = 1) {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
}

/** 지난 날을 순서대로 마감한다. 실패한 날짜의 체크포인트는 전진하지 않는다. */
export async function closeDivisionAttendance(divisionSlug: string, deadline = Date.now() + 20_000) {
  const through = nextDate(kstDate(), -1);
  const policy = await getManagementPolicy(divisionSlug);
  if (!isPolicyEffective(policy, through)) return {closedDays: 0, pending: false};
  const settings = await getDivisionSettings(divisionSlug);
  const mock = isMockMode();
  const prisma = mock ? null : await getPrismaClient();
  const division = prisma ? await prisma.division.findUniqueOrThrow({where: {slug: divisionSlug}, select: {id: true}}) : null;
  const saved = mock
    ? (await readMockState()).attendanceClosedThroughByDivision?.[divisionSlug]
    : (await prisma!.attendanceCloseState.findUnique({where: {divisionId: division!.id}}))?.closedThrough.toISOString().slice(0,10);
  let date = saved ? nextDate(saved) : policy.effectiveFrom;
  if (date < policy.effectiveFrom) date = policy.effectiveFrom;
  let closedDays = 0;
  while (date <= through && Date.now() < deadline) {
    const record = mock
      ? (await readMockState()).attendanceByDivision[divisionSlug]?.find(row => row.date === date)
      : await prisma!.attendance.findFirst({where: {date: new Date(`${date}T00:00:00Z`), student: {divisionId: division!.id}}, select: {recordedById: true}});
    if (record) {
      // 가져온 출결처럼 기록자가 없는 경우에도 그 직렬 관리자를 기준으로 마감한다.
      const actorId = record.recordedById ?? (mock
        ? (await readMockState()).admins.find(admin => admin.isActive && (admin.role === "SUPER_ADMIN" || (admin.role === "ADMIN" && admin.divisionSlug === divisionSlug)))?.id
        : (await prisma!.admin.findFirst({where: {isActive: true, OR: [{role: "SUPER_ADMIN"}, {role: "ADMIN", divisionId: division!.id}]}, select: {id: true}}))?.id);
      if (!actorId) throw new Error("출결 마감을 기록할 관리자가 없습니다.");
      // 개근 상점은 자동 마감하되 벌점은 지점의 관리자 확정 설정을 지킨다.
      const merits = await syncPeriodicPerfectAttendancePoints(divisionSlug, date, actorId, policy, settings);
      if (merits.grantedCount || merits.revokedCount) revalidateDivisionOperationalViews(divisionSlug);
      if (!policy.managerConfirmsAttendance) await applyPolicyAttendancePoints(divisionSlug, date, actorId);
    }
    if (mock) {
      await updateMockState(state=>{
        const checkpoints = state.attendanceClosedThroughByDivision ??= {};
        if (!checkpoints[divisionSlug] || checkpoints[divisionSlug] < date) checkpoints[divisionSlug] = date;
      });
    } else {
      const closedThrough = new Date(`${date}T00:00:00Z`);
      // 동시 실행에서도 완료일이 뒤로 돌아가지 않는다.
      await prisma!.attendanceCloseState.upsert({where: {divisionId: division!.id}, create: {divisionId: division!.id, closedThrough}, update: {}});
      await prisma!.attendanceCloseState.updateMany({where: {divisionId: division!.id, closedThrough: {lt: closedThrough}}, data: {closedThrough}});
    }
    closedDays++; date = nextDate(date);
  }
  return {closedDays, pending: date <= through};
}

export async function closeAllAttendance() {
  const divisions = isMockMode()
    ? (await readMockState()).divisions.filter(row=>row.isActive).map(row=>({slug:row.slug}))
    : await (await getPrismaClient()).division.findMany({where: {isActive: true}, select: {slug:true}});
  const deadline = Date.now() + 20_000;
  const results: Array<{division: string; closedDays?: number; pending?: boolean; failed?: boolean}> = [];
  for (let index = 0; index < divisions.length; index++) {
    const division = divisions[index];
    try {
      const remaining = Math.max(0, deadline - Date.now());
      const result = await closeDivisionAttendance(division.slug, Date.now() + remaining / (divisions.length - index));
      results.push({division:division.slug, ...result});
    } catch {
      results.push({division:division.slug, failed:true});
    }
  }
  return results;
}
