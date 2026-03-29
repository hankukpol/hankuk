import Link from "next/link";
import { AdminRole, ProspectStage } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PipelineClient } from "./pipeline-client";
import type {
  PipelineStats,
  StageStat,
  CounselorStat,
  FollowUpProspect,
} from "./pipeline-client";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<ProspectStage, string> = {
  INQUIRY: "초기문의",
  VISITING: "방문상담",
  DECIDING: "검토중",
  REGISTERED: "등록완료",
  DROPPED: "이탈",
};

const STAGE_ORDER: ProspectStage[] = [
  "INQUIRY",
  "VISITING",
  "DECIDING",
  "REGISTERED",
  "DROPPED",
];

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function ProspectPipelinePage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Load all prospects
  const [allProspects, monthProspects] = await Promise.all([
    prisma.consultationProspect.findMany({
      orderBy: { visitedAt: "desc" },
      include: {
        staff: { select: { id: true, name: true } },
      },
    }),
    prisma.consultationProspect.findMany({
      where: {
        visitedAt: { gte: monthStart, lt: monthEnd },
        stage: ProspectStage.REGISTERED,
      },
      select: { id: true },
    }),
  ]);

  const totalAll = allProspects.length;
  const monthRegistered = monthProspects.length;

  // Conversion rate: REGISTERED / (total - DROPPED)
  const droppedCount = allProspects.filter((p) => p.stage === ProspectStage.DROPPED).length;
  const registeredCount = allProspects.filter((p) => p.stage === ProspectStage.REGISTERED).length;
  const denominator = totalAll - droppedCount;
  const conversionRate = denominator > 0 ? Math.round((registeredCount / denominator) * 100) : 0;
  const dropRate = totalAll > 0 ? Math.round((droppedCount / totalAll) * 100) : 0;

  // Stage stats with avg days
  const stageStats: StageStat[] = STAGE_ORDER.map((stage) => {
    const group = allProspects.filter((p) => p.stage === stage);
    const avgDays =
      group.length > 0
        ? Math.round(group.reduce((sum, p) => sum + daysSince(p.visitedAt), 0) / group.length)
        : null;
    return {
      stage,
      label: STAGE_LABEL[stage],
      count: group.length,
      avgDays,
    };
  });

  // Per-counselor breakdown
  const counselorMap = new Map<
    string,
    { staffId: string; staffName: string; total: number; registered: number }
  >();
  for (const p of allProspects) {
    const existing = counselorMap.get(p.staffId);
    if (existing) {
      existing.total += 1;
      if (p.stage === ProspectStage.REGISTERED) existing.registered += 1;
    } else {
      counselorMap.set(p.staffId, {
        staffId: p.staffId,
        staffName: p.staff.name,
        total: 1,
        registered: p.stage === ProspectStage.REGISTERED ? 1 : 0,
      });
    }
  }
  const counselorStats: CounselorStat[] = Array.from(counselorMap.values())
    .map((c) => ({
      ...c,
      conversionRate: c.total > 0 ? Math.round((c.registered / c.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Follow-up needed: not REGISTERED or DROPPED, and updatedAt > 7 days ago
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pendingStages: ProspectStage[] = [
    ProspectStage.INQUIRY,
    ProspectStage.VISITING,
    ProspectStage.DECIDING,
  ];
  const followUps: FollowUpProspect[] = allProspects
    .filter((p) => pendingStages.includes(p.stage) && p.updatedAt < sevenDaysAgo)
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
    .map((p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone ?? null,
      stage: p.stage,
      stageLabel: STAGE_LABEL[p.stage],
      staffName: p.staff.name,
      lastContactDays: daysSince(p.updatedAt),
      updatedAt: p.updatedAt.toISOString(),
    }));

  const pipelineStats: PipelineStats = {
    totalAll,
    monthRegistered,
    conversionRate,
    dropRate,
    stageStats,
    counselorStats,
    followUps,
  };

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            파이프라인
          </div>
          <h1 className="mt-5 text-3xl font-semibold">상담 파이프라인</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            예비 원생이 초기 문의부터 등록 완료까지 어느 단계에 있는지, 상담사별 성과와 후속 연락 필요 대상을 한눈에 파악합니다.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 sm:mt-0">
          <Link
            href="/admin/prospects"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-forest/30 hover:text-forest"
          >
            전체 목록
          </Link>
          <Link
            href="/admin/counseling/pipeline"
            className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/10 px-5 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/20"
          >
            상담 파이프라인 →
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <PipelineClient stats={pipelineStats} />
      </div>
    </div>
  );
}
