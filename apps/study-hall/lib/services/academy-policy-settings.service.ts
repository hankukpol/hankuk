import { createHash } from "node:crypto";
import { academyPolicySaveSchema } from "@/lib/academy-policy-settings";
import { managementPolicySchema, type ManagementPolicy } from "@/lib/management-policy";
import { conflict, notFound } from "@/lib/errors";
import { isMockMode } from "@/lib/mock-data";
import { readMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";

function parsePolicy(value: unknown) { return value == null ? null : managementPolicySchema.parse(value); }
export function policyRevision(policy: ManagementPolicy | null) {
  const { optionalEnrollments: _enrollments, ...settings } = policy ?? {};
  void _enrollments;
  return createHash("sha256").update(JSON.stringify(settings)).digest("hex");
}
export async function getAcademyPolicySettings(slug: string) {
  if (isMockMode()) {
    const state = await readMockState();
    if (!state.divisions.some(d => d.slug === slug)) throw notFound("학원을 찾을 수 없습니다.");
    const row = state.divisionSettingsByDivision[slug] as unknown as { managementPolicy?: unknown };
    const policy = parsePolicy(row?.managementPolicy);
    return { policy, revision: policyRevision(policy), periods: state.periodsByDivision[slug] ?? [], rules: state.pointRulesByDivision[slug] ?? [] };
  }
  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({ where: { slug }, select: { id: true } });
  if (!division) throw notFound("학원을 찾을 수 없습니다.");
  const [settings, periods, rules] = await Promise.all([
    prisma.divisionSettings.findUnique({ where: { divisionId: division.id }, select: { managementPolicy: true } }),
    prisma.period.findMany({ where: { divisionId: division.id }, orderBy: { displayOrder: "asc" } }),
    prisma.pointRule.findMany({ where: { divisionId: division.id }, orderBy: { displayOrder: "asc" } }),
  ]);
  const policy = parsePolicy(settings?.managementPolicy);
  return { policy, revision: policyRevision(policy), periods, rules };
}
export async function saveAcademyPolicySettings(slug: string, value: unknown, actor: { id: string; name: string }) {
  const input = academyPolicySaveSchema.parse(value), before = await getAcademyPolicySettings(slug);
  if (input.revision !== before.revision) throw conflict("다른 관리자가 규정을 변경했습니다. 새로고침 후 다시 확인해 주세요.");
  const { applyAcademySettingsPatch } = await import("@/lib/services/academy-template.service");
  await applyAcademySettingsPatch(slug,"관리규정 변경",{managementPolicy:input.policy},actor);
  return getAcademyPolicySettings(slug);
}
