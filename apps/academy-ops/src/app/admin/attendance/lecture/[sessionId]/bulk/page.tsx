import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { BulkAttendanceClient } from "./bulk-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function BulkAttendancePage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { sessionId } = await params;

  // 세션 조회
  const session = await getPrisma().lectureSession.findUnique({
    where: { id: sessionId },
    include: {
      schedule: {
        include: {
          cohort: {
            select: {
              id: true,
              name: true,
              examCategory: true,
            },
          },
        },
      },
      attendances: {
        select: {
          studentId: true,
          status: true,
          note: true,
        },
      },
    },
  });

  if (!session) notFound();

  // 기수에 속한 수강생 목록 (ACTIVE, PENDING)
  const enrollments = await getPrisma().courseEnrollment.findMany({
    where: {
      cohortId: session.schedule.cohortId,
      status: { in: ["ACTIVE", "PENDING"] },
    },
    include: {
      student: {
        select: { examNumber: true, name: true, phone: true },
      },
    },
    orderBy: [{ student: { examNumber: "asc" } }],
  });

  // 기존 출결 맵
  const attendanceMap = new Map(
    session.attendances.map((a) => [a.studentId, { status: a.status, note: a.note ?? null }]),
  );

  const studentsData = enrollments.map((e) => ({
    examNumber: e.student.examNumber,
    name: e.student.name,
    phone: e.student.phone ?? null,
    currentStatus: attendanceMap.get(e.student.examNumber)?.status ?? null,
    currentNote: attendanceMap.get(e.student.examNumber)?.note ?? null,
  }));

  // 날짜 직렬화
  const sessionDate = session.sessionDate;
  const sessionDateStr =
    sessionDate.getFullYear() +
    "-" +
    String(sessionDate.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(sessionDate.getDate()).padStart(2, "0");

  const sessionData = {
    id: session.id,
    scheduleId: session.scheduleId,
    sessionDate: sessionDateStr,
    startTime: session.startTime,
    endTime: session.endTime,
    isCancelled: session.isCancelled,
    note: session.note ?? null,
    schedule: {
      id: session.schedule.id,
      subjectName: session.schedule.subjectName,
      instructorName: session.schedule.instructorName ?? null,
      cohort: {
        id: session.schedule.cohort.id,
        name: session.schedule.cohort.name,
        examCategory: session.schedule.cohort.examCategory,
      },
    },
  };

  return (
    <div className="p-8 sm:p-10">
      <BulkAttendanceClient session={sessionData} students={studentsData} />
    </div>
  );
}
