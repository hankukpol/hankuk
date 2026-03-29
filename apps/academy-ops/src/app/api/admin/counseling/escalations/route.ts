import { AdminRole, StudentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ESCALATION_PREFIX = "[ESCALATED]";

// GET /api/admin/counseling/escalations
// Returns students at risk (WARNING_2 / DROPOUT) with their escalation status
export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const prisma = getPrisma();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Students at WARNING_2 or DROPOUT
  const riskStudents = await prisma.student.findMany({
    where: {
      currentStatus: { in: [StudentStatus.WARNING_2, StudentStatus.DROPOUT] },
      isActive: true,
    },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      currentStatus: true,
      statusUpdatedAt: true,
      counselingRecords: {
        orderBy: { counseledAt: "desc" },
        take: 5,
        select: {
          id: true,
          counseledAt: true,
          counselorName: true,
          content: true,
        },
      },
    },
    orderBy: { statusUpdatedAt: "asc" },
  });

  const result = riskStudents.map((s) => {
    const latestRecord = s.counselingRecords[0] ?? null;
    const hasRecentEscalation = s.counselingRecords.some(
      (r) =>
        r.content.startsWith(ESCALATION_PREFIX) &&
        r.counseledAt >= thirtyDaysAgo,
    );
    const daysInWarning = s.statusUpdatedAt
      ? Math.floor((now.getTime() - s.statusUpdatedAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      examNumber: s.examNumber,
      name: s.name,
      phone: s.phone,
      currentStatus: s.currentStatus,
      statusUpdatedAt: s.statusUpdatedAt?.toISOString() ?? null,
      daysInWarning,
      lastCounselingDate: latestRecord?.counseledAt.toISOString() ?? null,
      lastCounselorName: latestRecord?.counselorName ?? null,
      hasRecentEscalation,
    };
  });

  const pending = result.filter((r) => !r.hasRecentEscalation);
  const inProgress = result.filter((r) => r.hasRecentEscalation);

  return NextResponse.json({ data: { pending, inProgress } });
}

// POST /api/admin/counseling/escalations
// Creates a CounselingRecord with [ESCALATED] prefix
export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as {
      examNumber?: string;
      counselorName?: string;
      note?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH";
    };

    const { examNumber, counselorName, note, priority } = body;

    if (!examNumber?.trim()) {
      return NextResponse.json({ error: "학번을 입력하세요." }, { status: 400 });
    }
    if (!counselorName?.trim()) {
      return NextResponse.json({ error: "상담사 이름을 입력하세요." }, { status: 400 });
    }

    const prisma = getPrisma();

    const student = await prisma.student.findUnique({
      where: { examNumber: examNumber.trim() },
      select: { examNumber: true, name: true, currentStatus: true },
    });

    if (!student) {
      return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
    }

    const priorityLabel = priority === "HIGH" ? "[긴급]" : priority === "MEDIUM" ? "[보통]" : "[낮음]";
    const content = `${ESCALATION_PREFIX}${priorityLabel} ${note?.trim() ?? "에스컬레이션 등록됨"}`;

    const record = await prisma.counselingRecord.create({
      data: {
        examNumber: student.examNumber,
        counselorName: counselorName.trim(),
        content,
        counseledAt: new Date(),
      },
    });

    return NextResponse.json({ data: record });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "에스컬레이션 등록 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
