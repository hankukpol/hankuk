import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { AttendanceInput } from "./attendance-input";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { sessionId: string };
};

export default async function LectureAttendanceInputPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { sessionId } = params;

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
              startDate: true,
              endDate: true,
            },
          },
        },
      },
      attendances: {
        select: {
          id: true,
          studentId: true,
          status: true,
          note: true,
          checkedAt: true,
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

  // 직렬화
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

  const sessionDate = session.sessionDate;
  const sessionData = {
    id: session.id,
    scheduleId: session.scheduleId,
    sessionDate:
      sessionDate.getFullYear() +
      "-" +
      String(sessionDate.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(sessionDate.getDate()).padStart(2, "0"),
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
      <AttendanceInput session={sessionData} students={studentsData} />
    </div>
  );
}
