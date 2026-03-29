import { AttendStatus, StudentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type LectureAttendanceStats = {
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  attendanceRate: number;
};

export type LectureAttendanceRow = {
  id: string;
  sessionDate: string; // ISO date string
  subjectName: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  status: AttendStatus;
  note: string | null;
};

export type LectureAttendanceData = {
  stats: LectureAttendanceStats;
  attendanceWarningStatus: StudentStatus;
  recentAttendances: LectureAttendanceRow[];
  cohortName: string | null;
  hasData: boolean;
};

export async function GET(request: NextRequest) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { examNumber } = auth.student;
  const prisma = getPrisma();

  // Find the student's active course enrollment with a cohort
  const activeEnrollment = await prisma.courseEnrollment.findFirst({
    where: {
      examNumber,
      status: "ACTIVE",
      cohortId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      cohortId: true,
      cohort: {
        select: { id: true, name: true },
      },
    },
  });

  // Also fetch the student's current warning status
  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: { currentStatus: true },
  });

  const attendanceWarningStatus: StudentStatus = student?.currentStatus ?? StudentStatus.NORMAL;

  if (!activeEnrollment?.cohortId) {
    // No active cohort enrollment — return empty stats
    const emptyData: LectureAttendanceData = {
      stats: {
        totalSessions: 0,
        presentCount: 0,
        absentCount: 0,
        lateCount: 0,
        attendanceRate: 100,
      },
      attendanceWarningStatus,
      recentAttendances: [],
      cohortName: null,
      hasData: false,
    };
    return NextResponse.json({ data: emptyData });
  }

  const cohortId = activeEnrollment.cohortId;

  // Fetch all LectureAttendance records for this student in this cohort
  // Join through LectureSession → LectureSchedule → Cohort
  const attendances = await prisma.lectureAttendance.findMany({
    where: {
      studentId: examNumber,
      session: {
        schedule: {
          cohortId,
        },
        isCancelled: false,
      },
    },
    include: {
      session: {
        include: {
          schedule: {
            select: { subjectName: true },
          },
        },
      },
    },
    orderBy: {
      session: { sessionDate: "desc" },
    },
    take: 50, // most recent 50 sessions
  });

  // Compute aggregated stats
  const totalSessions = attendances.length;
  const presentCount = attendances.filter(
    (a) => a.status === AttendStatus.PRESENT
  ).length;
  const absentCount = attendances.filter(
    (a) => a.status === AttendStatus.ABSENT
  ).length;
  const lateCount = attendances.filter(
    (a) => a.status === AttendStatus.LATE
  ).length;
  const attendanceRate =
    totalSessions > 0
      ? Math.round((presentCount / totalSessions) * 100)
      : 100;

  const stats: LectureAttendanceStats = {
    totalSessions,
    presentCount,
    absentCount,
    lateCount,
    attendanceRate,
  };

  // Serialize recent attendances
  const recentAttendances: LectureAttendanceRow[] = attendances.map((a) => ({
    id: a.id,
    sessionDate: a.session.sessionDate instanceof Date
      ? a.session.sessionDate.toISOString()
      : String(a.session.sessionDate),
    subjectName: a.session.schedule.subjectName,
    sessionId: a.sessionId,
    startTime: a.session.startTime,
    endTime: a.session.endTime,
    status: a.status,
    note: a.note,
  }));

  const responseData: LectureAttendanceData = {
    stats,
    attendanceWarningStatus,
    recentAttendances,
    cohortName: activeEnrollment.cohort?.name ?? null,
    hasData: totalSessions > 0,
  };

  return NextResponse.json({ data: responseData });
}
