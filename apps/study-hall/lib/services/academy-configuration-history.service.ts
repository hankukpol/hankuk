import type { AcademyConfiguration } from "@/lib/academy-template";
import { configurationForDate } from "@/lib/academy-configuration-history";
import { kstDate } from "@/lib/management-policy";
import { isMockMode } from "@/lib/mock-data";
import { readMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";
export async function getHistoricalAcademyConfiguration(slug: string, date: string): Promise<AcademyConfiguration | null> {
  if (date >= kstDate()) return null;
  if (isMockMode()) {
    const state = await readMockState(), division = state.divisions.find(d => d.slug === slug);
    const rows = (state.academyApplications ?? []).filter(r => r.divisionId === division?.id && r.status === "APPLIED").sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    return rows.length ? configurationForDate(rows[rows.length-1].after, rows, date) : null;
  }
  const prisma = await getPrismaClient(), division = await prisma.division.findUnique({ where: { slug }, select: { id: true } });
  if (!division) return null;
  const rows = await prisma.academyConfigurationApplication.findMany({where:{divisionId:division.id,status:"APPLIED"},orderBy:{createdAt:"asc"},select:{before:true,after:true,effectiveFrom:true,createdAt:true,status:true}});
  const history = rows.map(row=>({...row,effectiveFrom:row.effectiveFrom.toISOString().slice(0,10),createdAt:row.createdAt.toISOString(),before:row.before as unknown as AcademyConfiguration,after:row.after as unknown as AcademyConfiguration}));
  return history.length ? configurationForDate(history[history.length-1].after,history,date) : null;
}
