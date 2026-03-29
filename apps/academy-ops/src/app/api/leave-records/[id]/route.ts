import { NextRequest } from "next/server";
import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/leave-records/[id]
// Body: { returnDate?: string (ISO) }   — omit to use today
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: "id가 필요합니다." }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // empty body → treat as return today
  }

  const prisma = getPrisma();

  // Verify leave record exists
  const existing = await prisma.leaveRecord.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "휴원 기록을 찾을 수 없습니다." }, { status: 404 });
  }

  // Parse returnDate
  let returnDate: Date;
  if (body.returnDate && typeof body.returnDate === "string") {
    const parsed = new Date(body.returnDate);
    if (isNaN(parsed.getTime())) {
      return Response.json({ error: "returnDate 형식이 올바르지 않습니다." }, { status: 400 });
    }
    returnDate = parsed;
  } else {
    // Default to today (start of day in local time)
    returnDate = new Date();
    returnDate.setHours(0, 0, 0, 0);
  }

  const updated = await prisma.leaveRecord.update({
    where: { id },
    data: {
      returnDate,
      updatedAt: new Date(),
    },
    include: {
      enrollment: {
        include: {
          student: { select: { examNumber: true, name: true } },
        },
      },
    },
  });

  return Response.json({
    data: {
      id: updated.id,
      enrollmentId: updated.enrollmentId,
      leaveDate: updated.leaveDate,
      returnDate: updated.returnDate,
      studentName: updated.enrollment.student.name,
      examNumber: updated.enrollment.student.examNumber,
    },
  });
}
