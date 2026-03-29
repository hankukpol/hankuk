import { AdminRole, Subject } from "@prisma/client";
import { NextRequest } from "next/server";
import {
  createCsvBuffer,
  createDownloadResponse,
  type ExportColumn,
} from "@/lib/export";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { formatDate, formatFileDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const SUBJECT_LABEL: Record<Subject, string> = {
  POLICE_SCIENCE: "경찰학",
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  CUMULATIVE: "누적 모의고사",
};

type TextbookSaleRow = {
  soldAt: string;
  examNumber: string;
  studentName: string;
  title: string;
  subject: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

const COLUMNS: ExportColumn<TextbookSaleRow>[] = [
  { header: "판매일", value: (row) => row.soldAt },
  { header: "학번", value: (row) => row.examNumber },
  { header: "학생명", value: (row) => row.studentName },
  { header: "교재명", value: (row) => row.title },
  { header: "과목", value: (row) => row.subject },
  { header: "수량", value: (row) => row.quantity },
  { header: "단가", value: (row) => row.unitPrice },
  { header: "합계", value: (row) => row.totalPrice },
];

function currentMonthRange(): { startDate: Date; endDate: Date } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endDate = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { startDate, endDate };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sp = request.nextUrl.searchParams;
  const startDateParam = sp.get("startDate");
  const endDateParam = sp.get("endDate");

  let startDate: Date;
  let endDate: Date;

  if (startDateParam && /^\d{4}-\d{2}-\d{2}$/.test(startDateParam)) {
    startDate = new Date(`${startDateParam}T00:00:00`);
  } else {
    startDate = currentMonthRange().startDate;
  }

  if (endDateParam && /^\d{4}-\d{2}-\d{2}$/.test(endDateParam)) {
    endDate = new Date(`${endDateParam}T23:59:59`);
  } else {
    endDate = currentMonthRange().endDate;
  }

  const prisma = getPrisma();

  const sales = await prisma.textbookSale.findMany({
    where: {
      soldAt: { gte: startDate, lte: endDate },
    },
    orderBy: { soldAt: "desc" },
    select: {
      id: true,
      soldAt: true,
      examNumber: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      textbook: {
        select: { title: true, subject: true },
      },
    },
  });

  // Batch-fetch student names for exam numbers present in the results
  const examNumbers = [
    ...new Set(sales.map((s) => s.examNumber).filter((n): n is string => n !== null)),
  ];

  const students = await prisma.student.findMany({
    where: { examNumber: { in: examNumbers } },
    select: { examNumber: true, name: true },
  });
  const studentMap = new Map(students.map((s) => [s.examNumber, s.name]));

  const rows: TextbookSaleRow[] = sales.map((sale) => ({
    soldAt: formatDate(sale.soldAt),
    examNumber: sale.examNumber ?? "",
    studentName: sale.examNumber ? (studentMap.get(sale.examNumber) ?? "") : "외부구매",
    title: sale.textbook.title,
    subject: sale.textbook.subject
      ? (SUBJECT_LABEL[sale.textbook.subject] ?? sale.textbook.subject)
      : "일반",
    quantity: sale.quantity,
    unitPrice: sale.unitPrice,
    totalPrice: sale.totalPrice,
  }));

  const fileName = `교재판매내역_${formatFileDate()}.csv`;
  const buffer = createCsvBuffer(rows, COLUMNS);

  return createDownloadResponse(buffer, fileName, "csv");
}
