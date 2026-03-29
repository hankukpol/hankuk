import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type Params = { params: { instructorId: string } };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { instructorId } = params;

  let body: { month: string; amount: number; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 유효하지 않습니다." }, { status: 400 });
  }

  const { month, amount, note } = body;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month는 YYYY-MM 형식이어야 합니다." }, { status: 400 });
  }
  if (typeof amount !== "number" || amount < 0) {
    return NextResponse.json({ error: "amount는 0 이상의 숫자여야 합니다." }, { status: 400 });
  }

  const prisma = getPrisma();

  // 강사 존재 여부 확인
  const instructor = await prisma.instructor.findUnique({ where: { id: instructorId } });
  if (!instructor) {
    return NextResponse.json({ error: "강사를 찾을 수 없습니다." }, { status: 404 });
  }

  // SpecialLectureSettlement에는 FK 제약이 없으므로 SUMMARY_ 접두사 ID를 사용해 upsert
  const specialLectureId = `SUMMARY_${month}`;
  const paidAt = new Date();

  const record = await prisma.specialLectureSettlement.upsert({
    where: {
      specialLectureId_instructorId_settlementMonth: {
        specialLectureId,
        instructorId,
        settlementMonth: month,
      },
    },
    create: {
      specialLectureId,
      instructorId,
      settlementMonth: month,
      totalRevenue: amount,
      instructorRate: 100,
      instructorAmount: amount,
      academyAmount: 0,
      status: "PAID",
      paidAt,
      note: note ?? null,
    },
    update: {
      status: "PAID",
      paidAt,
      note: note ?? null,
      totalRevenue: amount,
      instructorAmount: amount,
    },
  });

  // AuditLog 기록
  try {
    await prisma.auditLog.create({
      data: {
        adminId: auth.context.adminUser.id,
        action: "INSTRUCTOR_SETTLEMENT_PAID",
        targetType: "SpecialLectureSettlement",
        targetId: record.id,
        after: {
          instructorId,
          instructorName: instructor.name,
          month,
          amount,
          paidAt: paidAt.toISOString(),
          note: note ?? null,
        },
      },
    });
  } catch {
    // AuditLog 실패는 치명적이지 않으므로 무시
  }

  return NextResponse.json({ data: { paidAt: paidAt.toISOString() } });
}
