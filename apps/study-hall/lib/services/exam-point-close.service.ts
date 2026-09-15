import { kstDate } from "@/lib/management-policy";
import { isMockMode } from "@/lib/mock-data";
import { readMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";
import { getExamPointSettings } from "@/lib/services/exam-point-settings.service";
import { syncExamPoints } from "@/lib/services/exam-point.service";
import { settleLeaveMonth } from "@/lib/services/leave.service";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";

/** Repeat both months so late imports and approved leave corrections are repaired, without duplicate points. */
export async function closeDivisionExamPoints(slug: string) {
  const {config} = await getExamPointSettings(slug);
  const today = kstDate();
  const previous = new Date(`${today.slice(0,7)}-01T00:00:00Z`);
  previous.setUTCDate(0);
  const lastDay = previous.toISOString().slice(0,10);
  const { getHistoricalAcademyConfiguration } = await import("@/lib/services/academy-configuration-history.service");
  const previousConfig = (await getHistoricalAcademyConfiguration(slug,lastDay))?.settings.examPointAutomation ?? config;
  if (!config.enabled && !previousConfig.enabled) return {grantedCount:0,revokedCount:0,leaveCount:0};
  const actor = isMockMode()
    ? (await readMockState()).admins.find(a=>a.isActive && (a.role === "SUPER_ADMIN" || (a.role === "ADMIN" && a.divisionSlug === slug)))
    : await (await getPrismaClient()).admin.findFirst({where:{isActive:true,OR:[{role:"SUPER_ADMIN"},{role:"ADMIN",division:{slug}}]},select:{id:true,role:true}});
  if (!actor) throw new Error("자동 상벌점을 기록할 관리자가 없습니다.");
  const current = await syncExamPoints(slug, today, actor.id);
  const closed = await syncExamPoints(slug, lastDay, actor.id);
  const leave = previousConfig.enabled && previousConfig.settleUnusedLeaveAutomatically && !!previousConfig.effectiveFrom && lastDay >= previousConfig.effectiveFrom
    ? await settleLeaveMonth(slug,actor,{month:lastDay.slice(0,7)},{activeOnly:true})
    : {createdCount:0};
  if(leave.createdCount) revalidateDivisionOperationalViews(slug);
  return {grantedCount:current.grantedCount+closed.grantedCount,revokedCount:current.revokedCount+closed.revokedCount,leaveCount:leave.createdCount};
}
