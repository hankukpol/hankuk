import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { createAppointment, listAppointments } from "@/lib/counseling/service";

type CreateBody = {
  examNumber?: string;
  scheduledAt?: string;
  counselorName?: string;
  agenda?: string | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const searchParams = request.nextUrl.searchParams;
  const examNumber = searchParams.get("examNumber") ?? undefined;
  const statusParam = searchParams.get("status");

  const appointments = await listAppointments({
    examNumber,
    status: statusParam ? (statusParam as "SCHEDULED" | "COMPLETED" | "CANCELLED") : undefined,
  });

  return NextResponse.json({ appointments });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as CreateBody;
    const record = await createAppointment({
      adminId: auth.context.adminUser.id,
      payload: {
        examNumber: String(body.examNumber ?? ""),
        scheduledAt: new Date(String(body.scheduledAt ?? "")),
        counselorName: String(body.counselorName ?? ""),
        agenda: body.agenda ?? null,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "예약 저장에 실패했습니다." },
      { status: 400 },
    );
  }
}
