import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { createPeriod, listPeriods, parsePeriodForm } from "@/lib/periods/service";

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const periods = await listPeriods();
  return NextResponse.json({ periods });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const period = parsePeriodForm(body);
    const autoGenerateSessions = Boolean(body.autoGenerateSessions);
    const result = await createPeriod({
      adminId: auth.context.adminUser.id,
      period,
      autoGenerateSessions,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "기간 생성에 실패했습니다." },
      { status: 400 },
    );
  }
}
