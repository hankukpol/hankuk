import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { createSession, parseSessionCreate } from "@/lib/periods/service";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const periodId = Number(params.id);

    if (!Number.isInteger(periodId)) {
      throw new Error("기간 ID가 올바르지 않습니다.");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const session = await createSession({
      adminId: auth.context.adminUser.id,
      periodId,
      session: parseSessionCreate(body),
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "회차 추가에 실패했습니다." },
      { status: 400 },
    );
  }
}
