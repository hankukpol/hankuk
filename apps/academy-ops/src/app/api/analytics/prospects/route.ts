/**
 * GET /api/analytics/prospects
 * 상담 방문자 파이프라인 퍼널 통계 API
 * - ProspectStage별 인원 수 반환
 * - 단계 순서: INQUIRY → VISITING → DECIDING → REGISTERED → DROPPED
 */
import { AdminRole, ProspectStage } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

const STAGE_ORDER: ProspectStage[] = [
  ProspectStage.INQUIRY,
  ProspectStage.VISITING,
  ProspectStage.DECIDING,
  ProspectStage.REGISTERED,
  ProspectStage.DROPPED,
];

export type FunnelStageData = {
  stage: string;
  count: number;
};

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const prisma = getPrisma();

    // Group by stage — counts across ALL time
    const stageCounts = await prisma.consultationProspect.groupBy({
      by: ["stage"],
      _count: { _all: true },
    });

    // Build a map for quick lookup
    const countMap = new Map<string, number>();
    for (const row of stageCounts) {
      countMap.set(row.stage, row._count._all);
    }

    // Return in canonical order, filling 0 for missing stages
    const stages: FunnelStageData[] = STAGE_ORDER.map((stage) => ({
      stage,
      count: countMap.get(stage) ?? 0,
    }));

    return NextResponse.json({ data: { stages } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "통계 조회 실패" },
      { status: 500 },
    );
  }
}
