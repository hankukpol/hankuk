import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ examNumber: string }> },
) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { examNumber } = await context.params;

  const student = await getPrisma().student.findUnique({
    where: { examNumber },
    select: { examNumber: true },
  });
  if (!student) {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
  }

  const points = await getPrisma().pointLog.findMany({
    where: { examNumber },
    include: {
      period: { select: { name: true } },
    },
    orderBy: { grantedAt: "desc" },
  });

  const data = points.map((p) => ({
    id: p.id,
    type: p.type,
    amount: p.amount,
    reason: p.reason,
    grantedAt: p.grantedAt.toISOString(),
    grantedBy: p.grantedBy,
    period: p.period ? { name: p.period.name } : null,
  }));

  return NextResponse.json({ data });
}
