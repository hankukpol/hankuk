import type { AcademyConfiguration } from "@/lib/academy-template";
import { kstDate } from "@/lib/management-policy";
import { isMockMode } from "@/lib/mock-data";
import { readMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";
export async function getHistoricalAcademyConfiguration(slug: string, date: string): Promise<AcademyConfiguration | null> {
  if (date >= kstDate()) return null;
  if (isMockMode()) {
    const state = await readMockState(), division = state.divisions.find(d => d.slug === slug);
    const next = (state.academyApplications ?? []).filter(r => r.divisionId === division?.id && r.status === "APPLIED" && r.effectiveFrom > date)
      .sort((a,b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt))[0];
    return next?.before ?? null;
  }
  const prisma = await getPrismaClient(), division = await prisma.division.findUnique({ where: { slug }, select: { id: true } });
  if (!division) return null;
  const row = await prisma.academyConfigurationApplication.findFirst({ where: { divisionId: division.id, status: "APPLIED", effectiveFrom: { gt: new Date(date + "T00:00:00Z") } }, orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }], select: { before: true } });
  return row?.before as unknown as AcademyConfiguration ?? null;
}
