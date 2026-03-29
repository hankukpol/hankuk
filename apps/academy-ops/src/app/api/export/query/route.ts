import {
  AttendType,
  ExamType,
  StudentStatus,
  Subject,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  createCsvBuffer,
  createDownloadResponse,
  createXlsxBuffer,
  type ExportColumn,
  type ExportFormat,
} from "@/lib/export";
import {
  ATTEND_TYPE_LABEL,
  EXAM_TYPE_LABEL,
  SUBJECT_LABEL,
} from "@/lib/constants";
import { formatDate, formatFileDate } from "@/lib/format";
import { requireApiAdmin } from "@/lib/api-auth";
import { AdminRole } from "@prisma/client";
import {
  getDateQueryRows,
  getStudentHistoryRows,
  getSubjectTrendRows,
  type QueryMode,
} from "@/lib/query/service";
import { STATUS_LABEL } from "@/lib/analytics/presentation";

type DateRow = Awaited<ReturnType<typeof getDateQueryRows>>[number];
type SubjectRow = Awaited<ReturnType<typeof getSubjectTrendRows>>[number];
const dateColumns: ExportColumn<DateRow>[] = [
  { header: "시험일", value: (row) => formatDate(row.examDate) },
  { header: "기간", value: (row) => row.periodName },
  { header: "직렬", value: (row) => EXAM_TYPE_LABEL[row.examType] },
  { header: "주차", value: (row) => `${row.week}주차` },
  { header: "과목", value: (row) => SUBJECT_LABEL[row.subject] },
  { header: "수험번호", value: (row) => row.examNumber },
  { header: "이름", value: (row) => row.studentName },
  { header: "출결", value: (row) => ATTEND_TYPE_LABEL[row.attendType] },
  { header: "원점수", value: (row) => row.rawScore ?? "" },
  { header: "최종점수", value: (row) => row.finalScore ?? "" },
  { header: "현재 상태", value: (row) => STATUS_LABEL[row.currentStatus] },
];

const subjectColumns: ExportColumn<SubjectRow>[] = [
  { header: "시험일", value: (row) => formatDate(row.examDate) },
  { header: "직렬", value: (row) => EXAM_TYPE_LABEL[row.examType] },
  { header: "주차", value: (row) => `${row.week}주차` },
  { header: "과목", value: (row) => SUBJECT_LABEL[row.subject] },
  { header: "평균", value: (row) => row.averageScore ?? "" },
  { header: "최고점", value: (row) => row.highestScore ?? "" },
  { header: "최저점", value: (row) => row.lowestScore ?? "" },
  { header: "현장 응시", value: (row) => row.normalCount },
  { header: "온라인 응시", value: (row) => row.liveCount },
  { header: "결시", value: (row) => row.absentCount },
  { header: "사유 결시", value: (row) => row.excusedCount },
];

type StudentExportRow = {
  examNumber: string;
  name: string;
  examType: ExamType;
  currentStatus: StudentStatus;
  examDate: Date;
  periodName: string;
  week: number;
  subject: Subject;
  attendType: AttendType;
  rawScore: number | null;
  finalScore: number | null;
  note: string | null;
};

const studentColumns: ExportColumn<StudentExportRow>[] = [
  { header: "수험번호", value: (row) => row.examNumber },
  { header: "이름", value: (row) => row.name },
  { header: "직렬", value: (row) => EXAM_TYPE_LABEL[row.examType] },
  { header: "현재 상태", value: (row) => STATUS_LABEL[row.currentStatus] },
  { header: "시험일", value: (row) => formatDate(row.examDate) },
  { header: "기간", value: (row) => row.periodName },
  { header: "주차", value: (row) => `${row.week}주차` },
  { header: "과목", value: (row) => SUBJECT_LABEL[row.subject] },
  { header: "출결", value: (row) => ATTEND_TYPE_LABEL[row.attendType] },
  { header: "원점수", value: (row) => row.rawScore ?? "" },
  { header: "최종점수", value: (row) => row.finalScore ?? "" },
  { header: "메모", value: (row) => row.note ?? "" },
];

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const format = (searchParams.get("format") as ExportFormat | null) ?? "xlsx";
  const mode = (searchParams.get("mode") as QueryMode | null) ?? "date";
  const periodId = searchParams.get("periodId");
  const examType = (searchParams.get("examType") as ExamType | null) ?? undefined;

  if (mode === "date") {
    const rows = await getDateQueryRows({
      mode,
      periodId: periodId ? Number(periodId) : undefined,
      examType,
      date: searchParams.get("date") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    });
    const buffer =
      format === "csv"
        ? createCsvBuffer(rows, dateColumns)
        : createXlsxBuffer(rows, dateColumns, "DateQuery");

    return createDownloadResponse(
      buffer,
      `query-date-${formatFileDate()}.${format}`,
      format,
    );
  }

  if (mode === "subject") {
    const rows = await getSubjectTrendRows({
      mode,
      periodId: periodId ? Number(periodId) : undefined,
      examType,
      subject: (searchParams.get("subject") as Subject | null) ?? undefined,
    });
    const buffer =
      format === "csv"
        ? createCsvBuffer(rows, subjectColumns)
        : createXlsxBuffer(rows, subjectColumns, "SubjectQuery");

    return createDownloadResponse(
      buffer,
      `query-subject-${formatFileDate()}.${format}`,
      format,
    );
  }

  const students = await getStudentHistoryRows({
    mode: "student",
    periodId: periodId ? Number(periodId) : undefined,
    examType,
    keyword: searchParams.get("keyword") ?? undefined,
  });
  const rows: StudentExportRow[] = students.flatMap((student) =>
    student.scores.map((score) => ({
      examNumber: student.examNumber,
      name: student.name,
      examType: student.examType,
      currentStatus: student.currentStatus,
      examDate: score.examDate,
      periodName: score.periodName,
      week: score.week,
      subject: score.subject,
      attendType: score.attendType,
      rawScore: score.rawScore,
      finalScore: score.finalScore,
      note: score.note,
    })),
  );
  const buffer =
    format === "csv"
      ? createCsvBuffer(rows, studentColumns)
      : createXlsxBuffer(rows, studentColumns, "StudentQuery");

  return createDownloadResponse(
    buffer,
    `query-student-${formatFileDate()}.${format}`,
    format,
  );
}
