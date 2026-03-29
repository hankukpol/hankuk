import { NextRequest } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireStudentPortalStudent(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const prisma = getPrisma();

  const appointments = await prisma.counselingAppointment.findMany({
    where: {
      examNumber: auth.student.examNumber,
    },
    orderBy: { scheduledAt: "desc" },
    take: 20,
    select: {
      id: true,
      scheduledAt: true,
      counselorName: true,
      agenda: true,
      status: true,
      cancelReason: true,
      createdAt: true,
    },
  });

  return Response.json({ data: appointments });
}

const TIME_SLOT_LABELS: Record<string, string> = {
  "09-10": "오전 9시 ~ 10시",
  "10-11": "오전 10시 ~ 11시",
  "11-12": "오전 11시 ~ 12시",
  "13-14": "오후 1시 ~ 2시",
  "14-15": "오후 2시 ~ 3시",
  "15-16": "오후 3시 ~ 4시",
};

export async function POST(request: NextRequest) {
  const auth = await requireStudentPortalStudent(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const {
    preferredDate,
    preferredTimeSlot,
    note,
  } = body as Record<string, unknown>;

  // Validate required fields
  if (!preferredDate || typeof preferredDate !== "string") {
    return Response.json({ error: "선호 날짜를 입력해 주세요." }, { status: 400 });
  }
  if (!preferredTimeSlot || typeof preferredTimeSlot !== "string") {
    return Response.json({ error: "선호 시간대를 선택해 주세요." }, { status: 400 });
  }
  if (!note || typeof note !== "string" || note.trim().length < 5) {
    return Response.json(
      { error: "상담 내용을 5자 이상 입력해 주세요." },
      { status: 400 },
    );
  }
  if (note.trim().length > 500) {
    return Response.json(
      { error: "상담 내용은 500자 이내로 입력해 주세요." },
      { status: 400 },
    );
  }

  // Validate date format YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(preferredDate)) {
    return Response.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // Validate date is not in the past
  const parsedDate = new Date(preferredDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (isNaN(parsedDate.getTime()) || parsedDate < today) {
    return Response.json({ error: "오늘 이후 날짜를 선택해 주세요." }, { status: 400 });
  }

  // Validate time slot
  const validSlots = Object.keys(TIME_SLOT_LABELS);
  if (!validSlots.includes(preferredTimeSlot)) {
    return Response.json({ error: "올바른 시간대를 선택해 주세요." }, { status: 400 });
  }

  // Build scheduledAt from date + time slot start hour
  const [startHour] = preferredTimeSlot.split("-").map(Number);
  const scheduledAt = new Date(parsedDate);
  scheduledAt.setHours(startHour ?? 9, 0, 0, 0);

  // Build agenda: time slot label + user note
  const timeLabel = TIME_SLOT_LABELS[preferredTimeSlot] ?? preferredTimeSlot;
  const agenda = `[희망 시간: ${timeLabel}]\n${note.trim()}`;

  const prisma = getPrisma();

  // Check for duplicate pending/scheduled appointments on same date
  const existingForDate = await prisma.counselingAppointment.findFirst({
    where: {
      examNumber: auth.student.examNumber,
      status: { in: ["SCHEDULED"] },
      scheduledAt: {
        gte: new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()),
        lt: new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate() + 1),
      },
    },
  });

  if (existingForDate) {
    return Response.json(
      { error: "해당 날짜에 이미 신청된 면담이 있습니다. 다른 날짜를 선택해 주세요." },
      { status: 400 },
    );
  }

  const appointment = await prisma.counselingAppointment.create({
    data: {
      examNumber: auth.student.examNumber,
      scheduledAt,
      counselorName: "미정",
      agenda,
      status: "SCHEDULED",
    },
    select: {
      id: true,
      scheduledAt: true,
      counselorName: true,
      agenda: true,
      status: true,
      createdAt: true,
    },
  });

  return Response.json({ data: appointment }, { status: 201 });
}
