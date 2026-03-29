import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const SUBJECT_LABELS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  POLICE_SCIENCE: "경찰학",
  CUMULATIVE: "종합",
};

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = request.nextUrl;
  const dateFromStr = searchParams.get("dateFrom");
  const dateToStr = searchParams.get("dateTo");

  let dateFilter: { soldAt?: { gte: Date; lte: Date } } = {};

  if (dateFromStr && dateToStr) {
    const start = new Date(dateFromStr + "T00:00:00");
    const end = new Date(dateToStr + "T23:59:59");
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      dateFilter = { soldAt: { gte: start, lte: end } };
    }
  } else {
    // 기본: 오늘
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    dateFilter = { soldAt: { gte: start, lte: end } };
  }

  const sales = await getPrisma().textbookSale.findMany({
    where: dateFilter,
    include: {
      textbook: { select: { title: true, subject: true } },
      staff: { select: { name: true } },
    },
    orderBy: { soldAt: "asc" },
    take: 5000,
  });

  // BOM + CSV 헤더
  const BOM = "\uFEFF";
  const header = ["판매일시", "교재명", "과목", "수험번호", "수량", "단가", "합계", "처리자", "메모"].join(",");

  const rows = sales.map((s) => {
    const dt = new Date(s.soldAt);
    const dateTime =
      `${dt.getFullYear()}-` +
      `${String(dt.getMonth() + 1).padStart(2, "0")}-` +
      `${String(dt.getDate()).padStart(2, "0")} ` +
      `${String(dt.getHours()).padStart(2, "0")}:` +
      `${String(dt.getMinutes()).padStart(2, "0")}`;

    const subject = s.textbook.subject
      ? (SUBJECT_LABELS[s.textbook.subject] ?? s.textbook.subject)
      : "";

    return [
      escapeCsv(dateTime),
      escapeCsv(s.textbook.title),
      escapeCsv(subject),
      escapeCsv(s.examNumber),
      escapeCsv(s.quantity),
      escapeCsv(s.unitPrice),
      escapeCsv(s.totalPrice),
      escapeCsv(s.staff.name),
      escapeCsv(s.note),
    ].join(",");
  });

  const csv = BOM + [header, ...rows].join("\r\n");

  const labelFrom = dateFromStr ?? new Date().toISOString().slice(0, 10);
  const labelTo = dateToStr ?? labelFrom;
  const filename = `교재판매_${labelFrom}_${labelTo}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
