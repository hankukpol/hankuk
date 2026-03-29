import { AdminRole, NotificationChannel, NotificationType } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RecipientType = "individual" | "cohort" | "all-active";

type ComposeBody = {
  recipientType: RecipientType;
  examNumber?: string;
  cohortId?: string;
  messageType: "INFO" | "WARNING" | "REMINDER";
  title: string;
  body: string;
  channel: NotificationChannel;
};

export async function POST(req: Request) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body: ComposeBody;
  try {
    body = (await req.json()) as ComposeBody;
  } catch {
    return Response.json({ error: "요청 본문을 파싱할 수 없습니다." }, { status: 400 });
  }

  const { recipientType, examNumber, cohortId, messageType, title, channel } = body;

  const messageBody = body.body ?? "";

  if (!messageBody?.trim()) {
    return Response.json({ error: "메시지 내용을 입력하세요." }, { status: 400 });
  }
  if (!title?.trim()) {
    return Response.json({ error: "제목을 입력하세요." }, { status: 400 });
  }

  const prisma = getPrisma();

  // Determine recipients
  let examNumbers: string[] = [];

  if (recipientType === "individual") {
    if (!examNumber?.trim()) {
      return Response.json({ error: "학번을 입력하세요." }, { status: 400 });
    }
    const student = await prisma.student.findUnique({
      where: { examNumber: examNumber.trim() },
      select: { examNumber: true },
    });
    if (!student) {
      return Response.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
    }
    examNumbers = [examNumber.trim()];
  } else if (recipientType === "cohort") {
    if (!cohortId?.trim()) {
      return Response.json({ error: "기수를 선택하세요." }, { status: 400 });
    }
    const enrollments = await prisma.courseEnrollment.findMany({
      where: {
        cohortId,
        status: { in: ["ACTIVE", "SUSPENDED"] },
      },
      select: { examNumber: true },
    });
    examNumbers = [...new Set(enrollments.map((e) => e.examNumber))];
  } else if (recipientType === "all-active") {
    const students = await prisma.student.findMany({
      where: { isActive: true },
      select: { examNumber: true },
    });
    examNumbers = students.map((s) => s.examNumber);
  } else {
    return Response.json({ error: "유효하지 않은 수신자 유형입니다." }, { status: 400 });
  }

  if (examNumbers.length === 0) {
    return Response.json({ error: "수신 대상 학생이 없습니다." }, { status: 400 });
  }

  // Map messageType to NotificationType
  const notifType: NotificationType =
    messageType === "WARNING"
      ? NotificationType.WARNING_1
      : messageType === "REMINDER"
        ? NotificationType.SCORE_DEADLINE
        : NotificationType.NOTICE;

  // Build the full message
  const fullMessage = `[${title.trim()}] ${messageBody.trim()}`;

  // Create NotificationLog entries
  const now = new Date();
  const logs = examNumbers.map((en) => ({
    examNumber: en,
    type: notifType,
    channel,
    message: fullMessage,
    status: "pending",
    sentAt: now,
  }));

  // Batch insert in chunks of 100
  const CHUNK = 100;
  let created = 0;
  for (let i = 0; i < logs.length; i += CHUNK) {
    const chunk = logs.slice(i, i + CHUNK);
    const result = await prisma.notificationLog.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    created += result.count;
  }

  return Response.json({
    data: {
      queued: created,
      total: examNumbers.length,
      channel,
      notifType,
    },
  });
}

// GET: preview recipient count
export async function GET(req: Request) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const recipientType = url.searchParams.get("recipientType") as RecipientType | null;
  const cohortId = url.searchParams.get("cohortId");
  const examNumber = url.searchParams.get("examNumber");

  const prisma = getPrisma();

  if (recipientType === "individual") {
    if (!examNumber) {
      return Response.json({ data: { count: 0, students: [] } });
    }
    const student = await prisma.student.findMany({
      where: {
        OR: [
          { examNumber: { contains: examNumber } },
          { name: { contains: examNumber } },
        ],
        isActive: true,
      },
      select: {
        examNumber: true,
        name: true,
        phone: true,
      },
      take: 10,
    });
    return Response.json({ data: { count: student.length, students: student } });
  }

  if (recipientType === "cohort") {
    if (!cohortId) {
      return Response.json({ data: { count: 0, students: [] } });
    }
    const enrollments = await prisma.courseEnrollment.findMany({
      where: {
        cohortId,
        status: { in: ["ACTIVE", "SUSPENDED"] },
      },
      select: {
        examNumber: true,
        student: { select: { name: true, phone: true } },
      },
    });
    const unique = [
      ...new Map(enrollments.map((e) => [e.examNumber, e])).values(),
    ];
    return Response.json({
      data: {
        count: unique.length,
        students: unique.map((e) => ({
          examNumber: e.examNumber,
          name: e.student.name,
          phone: e.student.phone,
        })),
      },
    });
  }

  if (recipientType === "all-active") {
    const count = await prisma.student.count({ where: { isActive: true } });
    return Response.json({ data: { count, students: [] } });
  }

  // Return cohorts list for the form
  const cohorts = await prisma.cohort.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { startDate: "desc" },
    take: 50,
  });
  return Response.json({ data: { cohorts } });
}
