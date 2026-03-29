import { NextRequest, NextResponse } from "next/server";
import { AdminRole, ExamEventType } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getStudentIntegratedScoreHistory } from "@/lib/students/integrated-score-history";

type RouteContext = {
  params: { examNumber: string };
};

function escapeCsv(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function pickFilter(value: string | null) {
  if (!value) {
    return null;
  }

  return Object.values(ExamEventType).includes(value as ExamEventType)
    ? (value as ExamEventType)
    : null;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const history = await getStudentIntegratedScoreHistory(params.examNumber);
  if (!history) {
    return NextResponse.json({ error: "수강생을 찾을 수 없습니다." }, { status: 404 });
  }

  const filter = pickFilter(request.nextUrl.searchParams.get("type"));
  const rows = filter ? history.rows.filter((row) => row.examType === filter) : history.rows;

  const header = ["시험일", "시험명", "유형", "과목", "상태/구분", "점수", "석차", "메모"];
  const csvRows = rows
    .map((row) => {
      const rankText =
        row.rank === null || row.participantCount === null
          ? ""
          : `${row.rank}위 / ${row.participantCount}`;

      return [
        row.examDate.toLocaleDateString("ko-KR"),
        row.title,
        row.examTypeLabel,
        row.subjectLabel,
        row.metricLabel ?? "",
        row.score ?? "",
        rankText,
        row.note ?? "",
      ]
        .map((value) => escapeCsv(value))
        .join(",");
    })
    .join("\n");

  const typeSuffix = filter ? filter : "ALL";
  const fileName = `통합성적_${history.student.name}_${history.student.examNumber}_${typeSuffix}.csv`;
  const csv = `\uFEFF${header.map((value) => escapeCsv(value)).join(",")}\n${csvRows}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
