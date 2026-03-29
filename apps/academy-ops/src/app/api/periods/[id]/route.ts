import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  generatePeriodSessions,
  parsePeriodForm,
  updatePeriod,
} from "@/lib/periods/service";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const periodId = Number(params.id);
    const body = (await request.json()) as Record<string, unknown>;

    if (!Number.isInteger(periodId)) {
      throw new Error("기간 ID가 올바르지 않습니다.");
    }

    if (body.action === "generateSessions") {
      const result = await generatePeriodSessions({
        adminId: auth.context.adminUser.id,
        periodId,
        ipAddress: request.headers.get("x-forwarded-for"),
      });

      return NextResponse.json(result);
    }

    const period = parsePeriodForm(body);
    const result = await updatePeriod({
      adminId: auth.context.adminUser.id,
      periodId,
      period,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ period: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "기간 수정에 실패했습니다." },
      { status: 400 },
    );
  }
}
