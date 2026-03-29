import { AdminRole, ExamDivision } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/exams/monthly/[eventId]/registrations
export async function GET(
  request: NextRequest,
  context: { params: { eventId: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { eventId } = await context.params;
  const sp = request.nextUrl.searchParams;
  const division = sp.get("division") as ExamDivision | null;
  const includeCancelled = sp.get("includeCancelled") === "true";

  const registrations = await getPrisma().examRegistration.findMany({
    where: {
      examEventId: eventId,
      ...(division ? { division } : {}),
      ...(includeCancelled ? {} : { cancelledAt: null }),
    },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
          examType: true,
        },
      },
    },
    orderBy: { registeredAt: "asc" },
  });

  return NextResponse.json({ registrations });
}

// POST /api/exams/monthly/[eventId]/registrations — 접수 등록
export async function POST(
  request: Request,
  context: { params: { eventId: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { eventId } = await context.params;

  try {
    const body = await request.json();
    const { examNumber, externalName, externalPhone, division, paidAmount } = body;

    if (!division) throw new Error("구분을 선택하세요.");
    if (!examNumber && !externalName?.trim()) throw new Error("학생 또는 외부 수험생 정보를 입력하세요.");

    // Check event exists
    const event = await getPrisma().examEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new Error("시험을 찾을 수 없습니다.");
    if (!event.isActive) throw new Error("비활성화된 시험입니다.");

    // Check duplicate registration for existing students
    if (examNumber) {
      const existing = await getPrisma().examRegistration.findFirst({
        where: {
          examEventId: eventId,
          examNumber,
          cancelledAt: null,
        },
      });
      if (existing) throw new Error("이미 접수된 학생입니다.");
    }

    const paid = paidAmount ? Number(paidAmount) : 0;
    const registration = await getPrisma().examRegistration.create({
      data: {
        examEventId: eventId,
        examNumber: examNumber || null,
        externalName: externalName?.trim() || null,
        externalPhone: externalPhone?.trim() || null,
        division,
        isPaid: paid > 0,
        paidAmount: paid,
        paidAt: paid > 0 ? new Date() : null,
      },
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
            examType: true,
          },
        },
      },
    });

    return NextResponse.json({ registration });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "접수 실패" },
      { status: 400 },
    );
  }
}
