import { NextRequest } from "next/server";
import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

function formatKoreanDate(date: Date): string {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const ids = [
    searchParams.get("cohort1"),
    searchParams.get("cohort2"),
    searchParams.get("cohort3"),
    searchParams.get("cohort4"),
  ].filter(Boolean) as string[];

  if (ids.length === 0) {
    return Response.json({ error: "기수를 선택해 주세요." }, { status: 400 });
  }

  const prisma = getPrisma();

  const cohorts = await prisma.cohort.findMany({
    where: { id: { in: ids } },
    orderBy: { startDate: "asc" },
  });

  type Row = {
    name: string;
    examCategory: string;
    startDate: string;
    endDate: string;
    enrollmentCount: number;
    activeCount: number;
    completedCount: number;
    completionRate: string;
    avgScore: string;
    attendanceRate: string;
    passCount: number;
  };

  const rows: Row[] = [];

  for (const cohort of cohorts) {
    const enrollmentRows = await prisma.courseEnrollment.findMany({
      where: { cohortId: cohort.id },
      select: { id: true, examNumber: true, status: true },
    });

    const total = enrollmentRows.length;
    const active = enrollmentRows.filter((e) => e.status === "ACTIVE" || e.status === "PENDING").length;
    const completed = enrollmentRows.filter((e) => e.status === "COMPLETED").length;
    const examNumbers = enrollmentRows.map((e) => e.examNumber);
    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) + "%" : "—";

    let avgScore = "—";
    if (examNumbers.length > 0) {
      const agg = await prisma.score.aggregate({
        _avg: { finalScore: true },
        where: {
          examNumber: { in: examNumbers },
          finalScore: { not: null },
          session: { examDate: { gte: cohort.startDate, lte: cohort.endDate }, isCancelled: false },
        },
      });
      if (agg._avg.finalScore !== null) {
        avgScore = agg._avg.finalScore.toFixed(1) + "점";
      }
    }

    let attendanceRate = "—";
    if (examNumbers.length > 0) {
      const logs = await prisma.classroomAttendanceLog.groupBy({
        by: ["attendType"],
        _count: { attendType: true },
        where: {
          examNumber: { in: examNumbers },
          attendDate: { gte: cohort.startDate, lte: cohort.endDate },
        },
      });
      const present = logs
        .filter((l) => l.attendType === "NORMAL" || l.attendType === "LIVE")
        .reduce((s, l) => s + l._count.attendType, 0);
      const totalLogs = logs.reduce((s, l) => s + l._count.attendType, 0);
      if (totalLogs > 0) attendanceRate = ((present / totalLogs) * 100).toFixed(1) + "%";
    }

    let passCount = 0;
    if (examNumbers.length > 0) {
      passCount = await prisma.graduateRecord.count({
        where: { examNumber: { in: examNumbers }, finalPassDate: { not: null } },
      });
    }

    rows.push({
      name: cohort.name,
      examCategory: EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ?? cohort.examCategory,
      startDate: formatKoreanDate(cohort.startDate),
      endDate: formatKoreanDate(cohort.endDate),
      enrollmentCount: total,
      activeCount: active,
      completedCount: completed,
      completionRate,
      avgScore,
      attendanceRate,
      passCount,
    });
  }

  // Build CSV
  const headers = [
    "기수명",
    "직렬",
    "시작일",
    "종료일",
    "학생수",
    "수강중",
    "수강완료",
    "수강완료율",
    "평균점수",
    "출석률",
    "합격자수",
  ];

  const csvRows = [
    headers.join(","),
    ...rows.map((r) =>
      [
        `"${r.name}"`,
        `"${r.examCategory}"`,
        r.startDate,
        r.endDate,
        r.enrollmentCount,
        r.activeCount,
        r.completedCount,
        r.completionRate,
        r.avgScore,
        r.attendanceRate,
        r.passCount,
      ].join(",")
    ),
  ];

  const csv = "\uFEFF" + csvRows.join("\n"); // BOM for Excel

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cohort-comparison-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
