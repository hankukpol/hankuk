import { AdminRole, ExamDivision, ExamEventType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/exams/external/[id]/registrations — 등록자 목록
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const prisma = getPrisma();

  const event = await prisma.examEvent.findFirst({
    where: { id, eventType: ExamEventType.EXTERNAL },
    select: {
      id: true,
      title: true,
      examDate: true,
      venue: true,
      registrationFee: true,
    },
  });
  if (!event) {
    return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
  }

  const registrations = await prisma.examRegistration.findMany({
    where: { examEventId: id, cancelledAt: null },
    orderBy: { registeredAt: "asc" },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
        },
      },
      score: { select: { id: true, score: true } },
    },
  });

  const rows = registrations.map((reg) => ({
    id: reg.id,
    examNumber: reg.examNumber,
    externalName: reg.externalName,
    externalPhone: reg.externalPhone,
    division: reg.division,
    isPaid: reg.isPaid,
    paidAmount: reg.paidAmount,
    paidAt: reg.paidAt?.toISOString() ?? null,
    seatNumber: reg.seatNumber,
    registeredAt: reg.registeredAt.toISOString(),
    student: reg.student
      ? {
          examNumber: reg.student.examNumber,
          name: reg.student.name,
          phone: reg.student.phone ?? null,
        }
      : null,
    hasScore: reg.score !== null,
  }));

  return NextResponse.json({
    data: {
      event: {
        id: event.id,
        title: event.title,
        examDate: event.examDate.toISOString(),
        venue: event.venue,
        registrationFee: event.registrationFee,
      },
      registrations: rows,
    },
  });
}

// POST /api/exams/external/[id]/registrations — 등록 추가
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const prisma = getPrisma();

  const event = await prisma.examEvent.findFirst({
    where: { id, eventType: ExamEventType.EXTERNAL },
    select: { id: true, registrationFee: true },
  });
  if (!event) {
    return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const {
    examNumber,
    externalName,
    externalPhone,
    division,
    isPaid,
  } = body as {
    examNumber?: string;
    externalName?: string;
    externalPhone?: string;
    division?: string;
    isPaid?: boolean;
  };

  // Must have either examNumber (internal) or externalName (external)
  if (!examNumber && !externalName?.trim()) {
    return NextResponse.json(
      { error: "학번 또는 외부 수험생 이름을 입력하세요." },
      { status: 400 },
    );
  }

  // Validate division
  const validDivisions = Object.values(ExamDivision);
  const divisionValue = (division ?? "GONGCHAE_M") as ExamDivision;
  if (!validDivisions.includes(divisionValue)) {
    return NextResponse.json({ error: "유효하지 않은 구분입니다." }, { status: 400 });
  }

  // If internal student, verify student exists
  if (examNumber) {
    const student = await prisma.student.findUnique({
      where: { examNumber },
      select: { examNumber: true },
    });
    if (!student) {
      return NextResponse.json({ error: "해당 학번의 학생을 찾을 수 없습니다." }, { status: 400 });
    }

    // Check for duplicate
    const existing = await prisma.examRegistration.findFirst({
      where: { examEventId: id, examNumber, cancelledAt: null },
    });
    if (existing) {
      return NextResponse.json({ error: "이미 등록된 학생입니다." }, { status: 400 });
    }
  }

  const registration = await prisma.examRegistration.create({
    data: {
      examEventId: id,
      examNumber: examNumber ?? null,
      externalName: externalName?.trim() ?? null,
      externalPhone: externalPhone?.trim() ?? null,
      division: divisionValue,
      isPaid: isPaid ?? false,
      paidAmount: isPaid ? event.registrationFee : 0,
      paidAt: isPaid ? new Date() : null,
    },
    include: {
      student: {
        select: { examNumber: true, name: true, phone: true },
      },
    },
  });

  return NextResponse.json({
    data: {
      id: registration.id,
      examNumber: registration.examNumber,
      externalName: registration.externalName,
      externalPhone: registration.externalPhone,
      division: registration.division,
      isPaid: registration.isPaid,
      paidAmount: registration.paidAmount,
      registeredAt: registration.registeredAt.toISOString(),
      student: registration.student
        ? {
            examNumber: registration.student.examNumber,
            name: registration.student.name,
            phone: registration.student.phone ?? null,
          }
        : null,
      hasScore: false,
    },
  });
}
