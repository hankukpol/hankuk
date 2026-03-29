import { NextRequest } from "next/server";
import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const cohortId = searchParams.get("cohortId");
  const month = searchParams.get("month"); // "YYYY-MM"

  if (!cohortId || !month) {
    return Response.json({ error: "cohortId와 month(YYYY-MM) 파라미터가 필요합니다." }, { status: 400 });
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(month);
  if (!monthMatch) {
    return Response.json({ error: "month 형식은 YYYY-MM 이어야 합니다." }, { status: 400 });
  }

  const year = parseInt(monthMatch[1], 10);
  const monthNum = parseInt(monthMatch[2], 10);
  const monthStart = new Date(year, monthNum - 1, 1);
  const monthEnd = new Date(year, monthNum, 1);

  const prisma = getPrisma();

  const cohort = await prisma.cohort.findUnique({
    where: { id: cohortId },
    select: { id: true, name: true },
  });

  if (!cohort) {
    return Response.json({ error: "해당 기수(코호트)를 찾을 수 없습니다." }, { status: 404 });
  }

  // Get all lecture sessions for this cohort within the month
  const sessions = await prisma.lectureSession.findMany({
    where: {
      isCancelled: false,
      sessionDate: { gte: monthStart, lt: monthEnd },
      schedule: { cohortId },
    },
    select: { id: true },
  });

  const sessionIds = sessions.map((s) => s.id);
  const totalSessions = sessionIds.length;

  if (totalSessions === 0) {
    return Response.json({
      data: {
        students: [],
        cohortName: cohort.name,
        month,
        totalSessions: 0,
      },
    });
  }

  // Get all attendance records for these sessions
  const attendances = await prisma.lectureAttendance.findMany({
    where: { sessionId: { in: sessionIds } },
    select: {
      studentId: true,
      status: true,
      student: { select: { name: true } },
    },
  });

  // Aggregate per student
  type StudentStats = {
    examNumber: string;
    name: string;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    excusedCount: number;
  };

  const statsMap = new Map<string, StudentStats>();

  for (const att of attendances) {
    const existing = statsMap.get(att.studentId);
    if (!existing) {
      statsMap.set(att.studentId, {
        examNumber: att.studentId,
        name: att.student.name,
        presentCount: 0,
        absentCount: 0,
        lateCount: 0,
        excusedCount: 0,
      });
    }
    const stats = statsMap.get(att.studentId)!;
    if (att.status === "PRESENT") stats.presentCount++;
    else if (att.status === "ABSENT") stats.absentCount++;
    else if (att.status === "LATE") stats.lateCount++;
    else if (att.status === "EXCUSED") stats.excusedCount++;
  }

  const students = Array.from(statsMap.values()).map((s) => {
    const attendanceRate =
      totalSessions > 0
        ? Math.round(((s.presentCount + s.lateCount + s.excusedCount) / totalSessions) * 100)
        : 0;
    return {
      examNumber: s.examNumber,
      name: s.name,
      totalSessions,
      presentCount: s.presentCount,
      absentCount: s.absentCount,
      lateCount: s.lateCount,
      excusedCount: s.excusedCount,
      attendanceRate,
    };
  });

  // Sort by examNumber
  students.sort((a, b) => a.examNumber.localeCompare(b.examNumber));

  return Response.json({
    data: {
      students,
      cohortName: cohort.name,
      month,
      totalSessions,
    },
  });
}
