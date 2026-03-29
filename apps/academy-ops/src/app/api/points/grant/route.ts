import { AdminRole, PointType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { grantPoints } from "@/lib/points/service";

type RequestBody = {
  entries?: Array<{
    examNumber?: string;
    type?: PointType;
    amount?: number;
    reason?: string;
    periodId?: number | null;
    year?: number | null;
    month?: number | null;
  }>;
};

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const entries =
      body.entries?.map((entry) => ({
        examNumber: String(entry.examNumber ?? "").trim(),
        type: entry.type ?? PointType.MANUAL,
        amount: Number(entry.amount ?? 0),
        reason: String(entry.reason ?? ""),
        periodId: entry.periodId ?? null,
        year: entry.year ?? null,
        month: entry.month ?? null,
      })) ?? [];

    const result = await grantPoints({
      adminId: auth.context.adminUser.id,
      adminName: auth.context.adminUser.name,
      entries,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "포인트 지급에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
