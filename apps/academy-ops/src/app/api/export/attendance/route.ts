import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  createCsvBuffer,
  createDownloadResponse,
  createXlsxBuffer,
  type ExportColumn,
  type ExportFormat,
} from "@/lib/export";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { ATTEND_TYPE_LABEL } from "@/lib/constants";
import { formatDate, formatFileDate } from "@/lib/format";

type AttendanceExportRow = {
  attendDate: string;
  examNumber: string;
  studentName: string;
  attendType: string;
  classroomOrLecture: string;
  time: string;
};

const columns: ExportColumn<AttendanceExportRow>[] = [
  { header: "날짜", value: (row) => row.attendDate },
  { header: "학번", value: (row) => row.examNumber },
  { header: "이름", value: (row) => row.studentName },
  { header: "출석유형", value: (row) => row.attendType },
  { header: "강의/반", value: (row) => row.classroomOrLecture },
  { header: "시간", value: (row) => row.time },
];

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const format = (searchParams.get("format") as ExportFormat | null) ?? "xlsx";
  const type = searchParams.get("type") ?? "classroom";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;

  const prisma = getPrisma();
  const rows: AttendanceExportRow[] = [];

  if (type === "classroom") {
    const logs = await prisma.classroomAttendanceLog.findMany({
      where: {
        ...(fromDate || toDate
          ? {
              attendDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ attendDate: "desc" }, { examNumber: "asc" }],
      select: {
        attendDate: true,
        examNumber: true,
        attendType: true,
        createdAt: true,
        student: {
          select: { name: true },
        },
        classroom: {
          select: { name: true },
        },
      },
    });

    for (const log of logs) {
      rows.push({
        attendDate: formatDate(log.attendDate),
        examNumber: log.examNumber,
        studentName: log.student.name,
        attendType: ATTEND_TYPE_LABEL[log.attendType],
        classroomOrLecture: log.classroom.name,
        time: "",
      });
    }
  } else {
    // type === "lecture"
    const attendances = await prisma.lectureAttendance.findMany({
      where: {
        session: {
          ...(fromDate || toDate
            ? {
                sessionDate: {
                  ...(fromDate ? { gte: fromDate } : {}),
                  ...(toDate ? { lte: toDate } : {}),
                },
              }
            : {}),
        },
      },
      orderBy: [{ session: { sessionDate: "desc" } }, { studentId: "asc" }],
      select: {
        studentId: true,
        status: true,
        session: {
          select: {
            sessionDate: true,
            startTime: true,
            endTime: true,
            schedule: {
              select: { subjectName: true },
            },
          },
        },
        student: {
          select: { name: true },
        },
      },
    });

    const ATTEND_STATUS_LABEL: Record<string, string> = {
      PRESENT: "출석",
      LATE: "지각",
      ABSENT: "결석",
      EXCUSED: "공결",
    };

    for (const att of attendances) {
      rows.push({
        attendDate: formatDate(att.session.sessionDate),
        examNumber: att.studentId,
        studentName: att.student.name,
        attendType: ATTEND_STATUS_LABEL[att.status] ?? att.status,
        classroomOrLecture: att.session.schedule.subjectName,
        time: `${att.session.startTime}~${att.session.endTime}`,
      });
    }
  }

  const typeLabel = type === "classroom" ? "담임반" : "강의";
  const fileName = `출결내역_${typeLabel}_${formatFileDate()}.${format}`;
  const buffer =
    format === "csv"
      ? createCsvBuffer(rows, columns)
      : createXlsxBuffer(rows, columns, "Attendance");

  return createDownloadResponse(buffer, fileName, format);
}
