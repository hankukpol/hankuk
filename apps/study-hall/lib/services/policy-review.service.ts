import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { kstDate, kstMonthBounds, isPolicyEffective } from "@/lib/management-policy";
import { isMockMode } from "@/lib/mock-data";
import { readMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";

export async function getPolicyReviewSignals(divisionSlug: string) {
  const policy = await getManagementPolicy(divisionSlug);
  const today = kstDate();
  if (!isPolicyEffective(policy, today)) return [];
  const since = (days: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const bounds = kstMonthBounds();
  let points: { studentId: string; ruleId: string | null; date: string }[];
  let phones: { studentId: string; rentalNote: string | null }[];
  if (isMockMode()) {
    const state = await readMockState();
    points = (state.pointRecordsByDivision[divisionSlug] ?? []).map((r) => ({ ...r, date: r.date.slice(0, 10) }));
    phones = state.phoneSubmissionsByDivision[divisionSlug] ?? [];
  } else {
    const prisma = await getPrismaClient();
    const earliest = [bounds.dateFrom, since(policy.earlyExit.windowDays), since(policy.phone.repeatDays)].sort()[0];
    const [records, loans] = await Promise.all([
      prisma.pointRecord.findMany({ where: { student: { division: { slug: divisionSlug } }, ruleId: { in: [policy.earlyExit.ruleId, policy.unauthorizedEntry.ruleId] }, date: { gte: new Date(`${earliest}T00:00:00Z`) } }, select: { studentId: true, ruleId: true, date: true } }),
      prisma.phoneSubmission.findMany({ where: { division: { slug: divisionSlug }, date: { gte: new Date(`${earliest}T00:00:00Z`) } }, select: { studentId: true, rentalNote: true } }),
    ]);
    points = records.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10) })); phones = loans;
  }
  const signals: { studentId: string; reason: string; action: string }[] = [];
  const ids = Array.from(new Set([...points, ...phones].map((r) => r.studentId)));
  for (const studentId of ids) {
    const mine = points.filter((r) => r.studentId === studentId && r.date >= policy.effectiveFrom && r.date <= today);
    const exits = mine.filter((r) => r.ruleId === policy.earlyExit.ruleId && r.date >= since(policy.earlyExit.windowDays)).length;
    if (exits >= policy.earlyExit.interviewCount) signals.push({ studentId, reason: `최근 ${policy.earlyExit.windowDays}일 무사유 중도퇴실 ${exits}회`, action: exits >= policy.earlyExit.missionCount ? `${policy.earlyExit.missionDays}일 개선미션` : "면담" });
    const entries = mine.filter((r) => r.ruleId === policy.unauthorizedEntry.ruleId && r.date >= bounds.dateFrom).length;
    if (entries >= policy.unauthorizedEntry.monthlyReviewCount) signals.push({ studentId, reason: `이번 달 무단입실·통제 불응 ${entries}회`, action: "즉시 퇴실심의" });
    const loans = phones.filter((r) => r.studentId === studentId).flatMap((r) => Array.from((r.rentalNote ?? "").matchAll(/\[반출 ([^\]]+)\]/g))).filter((m) => { const date = kstDate(new Date(m[1])); return date >= since(policy.phone.repeatDays) && date <= today; }).length;
    if (loans >= policy.phone.repeatCount) signals.push({ studentId, reason: `최근 ${policy.phone.repeatDays}일 휴대폰 예외 ${loans}회`, action: "관리자 예외 사용 검토" });
  }
  return signals;
}
