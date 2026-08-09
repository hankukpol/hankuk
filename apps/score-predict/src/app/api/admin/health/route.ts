import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { getActiveExamHealth } from "@/lib/active-exam";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;

  const health = await getActiveExamHealth(prisma);
  return NextResponse.json({
    tenantType: guard.tenantType,
    ...health,
    activeExams: health.activeExams.map((exam) => ({
      id: exam.id,
      name: exam.name,
      year: exam.year,
      round: exam.round,
      examDate: exam.examDate,
    })),
  });
}
