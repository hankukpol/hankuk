import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { deleteAppointment, updateAppointment } from "@/lib/counseling/service";

type UpdateBody = {
  action?: "cancel" | "complete" | "reschedule";
  cancelReason?: string | null;
  scheduledAt?: string;
  counselorName?: string;
  agenda?: string | null;
};

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const appointmentId = parseInt(id, 10);

  if (Number.isNaN(appointmentId)) {
    return NextResponse.json({ error: "잘못된 예약 ID입니다." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as UpdateBody;
    const action = body.action;

    if (!action || !["cancel", "complete", "reschedule"].includes(action)) {
      return NextResponse.json({ error: "action이 필요합니다." }, { status: 400 });
    }

    const record = await updateAppointment({
      adminId: auth.context.adminUser.id,
      appointmentId,
      action,
      cancelReason: body.cancelReason ?? null,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      counselorName: body.counselorName,
      agenda: body.agenda,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "예약 수정에 실패했습니다." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const appointmentId = parseInt(id, 10);

  if (Number.isNaN(appointmentId)) {
    return NextResponse.json({ error: "잘못된 예약 ID입니다." }, { status: 400 });
  }

  try {
    await deleteAppointment({
      adminId: auth.context.adminUser.id,
      appointmentId,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "예약 삭제에 실패했습니다." },
      { status: 400 },
    );
  }
}
