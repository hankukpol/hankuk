import { AdminRole, AttendType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── GET /api/documents/bulk-preview ─────────────────────────────────────────
// Query params:
//   docType:     ENROLLMENT_CERT | ATTENDANCE_CERT | SCORE_REPORT (required)
//   cohortId:    string  (cohort-based selection)
//   examNumbers: comma-separated string  (manual selection)
// Returns: { data: StudentDoc[] }

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const docType = sp.get("docType");
  const cohortId = sp.get("cohortId");
  const examNumbersRaw = sp.get("examNumbers");

  if (!docType) {
    return NextResponse.json({ error: "docType is required" }, { status: 400 });
  }

  const validDocTypes = ["ENROLLMENT_CERT", "ATTENDANCE_CERT", "SCORE_REPORT"];
  if (!validDocTypes.includes(docType)) {
    return NextResponse.json({ error: "Invalid docType" }, { status: 400 });
  }

  if (!cohortId && !examNumbersRaw) {
    return NextResponse.json({ error: "Either cohortId or examNumbers is required" }, { status: 400 });
  }

  const prisma = getPrisma();

  // ── Resolve examNumbers ──────────────────────────────────────────────────
  let targetExamNumbers: string[] = [];

  if (cohortId) {
    // Fetch all active enrollments for the cohort
    const enrollments = await prisma.courseEnrollment.findMany({
      where: {
        cohortId,
        status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] },
      },
      select: { examNumber: true },
    });
    targetExamNumbers = [...new Set(enrollments.map((e) => e.examNumber))];
  } else if (examNumbersRaw) {
    targetExamNumbers = examNumbersRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100); // Hard limit
  }

  if (targetExamNumbers.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // ── Fetch students with enrollments ──────────────────────────────────────
  const students = await prisma.student.findMany({
    where: { examNumber: { in: targetExamNumbers } },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      courseEnrollments: {
        where: { status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          startDate: true,
          endDate: true,
          cohort: { select: { name: true } },
          specialLecture: { select: { name: true } },
          product: { select: { name: true } },
        },
      },
    },
    orderBy: { examNumber: "asc" },
  });

  // ── For ATTENDANCE_CERT: fetch attendance logs ────────────────────────────
  type AttendanceMap = Map<
    string,
    {
      totalDays: number;
      presentDays: number;
      absentDays: number;
      attendanceRate: string;
      attendStartDate: string | null;
      attendEndDate: string | null;
    }
  >;
  let attendanceMap: AttendanceMap = new Map();

  if (docType === "ATTENDANCE_CERT") {
    const logs = await prisma.classroomAttendanceLog.findMany({
      where: { examNumber: { in: targetExamNumbers } },
      select: {
        examNumber: true,
        attendDate: true,
        attendType: true,
      },
      orderBy: { attendDate: "asc" },
    });

    // Group by examNumber
    const byStudent = new Map<string, typeof logs>();
    for (const log of logs) {
      if (!byStudent.has(log.examNumber)) byStudent.set(log.examNumber, []);
      byStudent.get(log.examNumber)!.push(log);
    }

    for (const [examNumber, studentLogs] of byStudent) {
      const total = studentLogs.length;
      const present = studentLogs.filter(
        (l) => l.attendType === AttendType.NORMAL || l.attendType === AttendType.LIVE
      ).length;
      const absent = studentLogs.filter((l) => l.attendType === AttendType.ABSENT).length;
      const rate = total > 0 ? ((present / total) * 100).toFixed(1) : "0.0";
      const first = studentLogs[0]?.attendDate?.toISOString() ?? null;
      const last = studentLogs[studentLogs.length - 1]?.attendDate?.toISOString() ?? null;
      attendanceMap.set(examNumber, {
        totalDays: total,
        presentDays: present,
        absentDays: absent,
        attendanceRate: rate,
        attendStartDate: first,
        attendEndDate: last,
      });
    }
  }

  // ── For SCORE_REPORT: fetch score averages ────────────────────────────────
  type ScoreMap = Map<string, { average: number | null; lastExamDate: string | null }>;
  let scoreMap: ScoreMap = new Map();

  if (docType === "SCORE_REPORT") {
    const scores = await prisma.score.findMany({
      where: {
        examNumber: { in: targetExamNumbers },
        finalScore: { not: null },
      },
      select: {
        examNumber: true,
        finalScore: true,
        session: { select: { examDate: true } },
      },
      orderBy: { session: { examDate: "asc" } },
    });

    const byStudent = new Map<string, typeof scores>();
    for (const s of scores) {
      if (!byStudent.has(s.examNumber)) byStudent.set(s.examNumber, []);
      byStudent.get(s.examNumber)!.push(s);
    }

    for (const [examNumber, studentScores] of byStudent) {
      const validScores = studentScores.filter((s) => s.finalScore != null);
      const avg =
        validScores.length > 0
          ? validScores.reduce((sum, s) => sum + (s.finalScore ?? 0), 0) / validScores.length
          : null;
      const last = studentScores[studentScores.length - 1]?.session.examDate?.toISOString() ?? null;
      scoreMap.set(examNumber, { average: avg, lastExamDate: last });
    }
  }

  // ── Build response ────────────────────────────────────────────────────────
  const data = students.map((s) => {
    const enr = s.courseEnrollments[0];
    const courseName = enr?.cohort?.name ?? enr?.specialLecture?.name ?? enr?.product?.name ?? "강좌 미지정";
    const attendance = attendanceMap.get(s.examNumber);
    const score = scoreMap.get(s.examNumber);

    return {
      examNumber: s.examNumber,
      name: s.name,
      mobile: s.phone ?? null,
      courseName,
      startDate: enr?.startDate?.toISOString() ?? new Date().toISOString(),
      endDate: enr?.endDate?.toISOString() ?? null,
      // Attendance fields
      totalDays: attendance?.totalDays,
      presentDays: attendance?.presentDays,
      absentDays: attendance?.absentDays,
      attendanceRate: attendance?.attendanceRate,
      attendStartDate: attendance?.attendStartDate,
      attendEndDate: attendance?.attendEndDate,
      // Score fields
      scoreAverage: score?.average ?? null,
      lastExamDate: score?.lastExamDate ?? null,
    };
  });

  return NextResponse.json({ data });
}
