import { AbsenceCategory, AbsenceStatus, AdminRole, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { listAbsenceNotes } from "@/lib/absence-notes/service";
import {
  createXlsxBuffer,
  createDownloadResponse,
  type ExportColumn,
} from "@/lib/export";
import {
  ABSENCE_CATEGORY_LABEL,
  EXAM_TYPE_LABEL,
  SUBJECT_LABEL,
} from "@/lib/constants";

type NoteRow = Awaited<ReturnType<typeof listAbsenceNotes>>[number];

const STATUS_LABEL: Record<AbsenceStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "반려",
};

const columns: ExportColumn<NoteRow>[] = [
  { header: "수험번호", value: (r) => r.examNumber },
  { header: "이름", value: (r) => r.student.name },
  { header: "상태", value: (r) => STATUS_LABEL[r.status] },
  { header: "학생 상태", value: (r) => r.student.currentStatus },
  {
    header: "사유 유형",
    value: (r) =>
      r.absenceCategory ? (ABSENCE_CATEGORY_LABEL[r.absenceCategory] ?? r.absenceCategory) : "",
  },
  { header: "출석포함", value: (r) => (r.attendCountsAsAttendance ? "O" : "") },
  { header: "개근인정", value: (r) => (r.attendGrantsPerfectAttendance ? "O" : "") },
  { header: "기간", value: (r) => r.session.period.name },
  {
    header: "시험 날짜",
    value: (r) => r.session.examDate.toISOString().slice(0, 10),
  },
  { header: "주차", value: (r) => r.session.week },
  { header: "과목", value: (r) => SUBJECT_LABEL[r.session.subject] ?? r.session.subject },
  { header: "사유 내용", value: (r) => r.reason },
  { header: "관리자 메모", value: (r) => r.adminNote ?? "" },
  {
    header: "제출일시",
    value: (r) => (r.submittedAt ? r.submittedAt.toISOString().replace("T", " ").slice(0, 19) : ""),
  },
  {
    header: "승인일시",
    value: (r) => (r.approvedAt ? r.approvedAt.toISOString().replace("T", " ").slice(0, 19) : ""),
  },
];

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sp = request.nextUrl.searchParams;
  const periodIdValue = sp.get("periodId");
  const examType = (sp.get("examType") as ExamType | null) ?? ExamType.GONGCHAE;

  if (!periodIdValue) {
    return NextResponse.json({ error: "시험 기간을 선택하세요." }, { status: 400 });
  }

  try {
    const notes = await listAbsenceNotes({
      periodId: Number(periodIdValue),
      examType,
      status: (sp.get("status") as AbsenceStatus | null) ?? undefined,
      absenceCategory: (sp.get("absenceCategory") as AbsenceCategory | null) ?? undefined,
      search: sp.get("search") ?? undefined,
      submittedFrom: sp.get("submittedFrom") ?? undefined,
      submittedTo: sp.get("submittedTo") ?? undefined,
    });

    const examTypeLabel = EXAM_TYPE_LABEL[examType];
    const fileName = `사유서_${examTypeLabel}.xlsx`;
    const buffer = createXlsxBuffer(notes, columns, "사유서");

    return createDownloadResponse(buffer, fileName, "xlsx");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "내보내기에 실패했습니다." },
      { status: 400 },
    );
  }
}
