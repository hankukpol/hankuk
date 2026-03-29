import { AdminRole, PaymentCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  createCsvBuffer,
  createDownloadResponse,
  createXlsxBuffer,
  type ExportColumn,
  type ExportFormat,
} from "@/lib/export";
import { requireApiAdmin } from "@/lib/api-auth";
import { applyAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/constants";
import { formatDateTime, formatFileDate } from "@/lib/format";

type PaymentExportRow = {
  processedAt: string;
  examNumber: string;
  studentName: string;
  mobile: string;
  itemNames: string;
  netAmount: number;
  method: string;
  category: string;
  status: string;
  processedBy: string;
};

const PAYMENT_STATUS_VALUES = [
  "PENDING",
  "APPROVED",
  "PARTIAL_REFUNDED",
  "FULLY_REFUNDED",
  "CANCELLED",
] as const satisfies readonly PaymentStatus[];

const COLUMNS: ExportColumn<PaymentExportRow>[] = [
  { header: "결제시각", value: (row) => row.processedAt },
  { header: "학번", value: (row) => row.examNumber },
  { header: "이름", value: (row) => row.studentName },
  { header: "연락처", value: (row) => row.mobile },
  { header: "항목/과정", value: (row) => row.itemNames },
  { header: "수납금액", value: (row) => row.netAmount },
  { header: "결제수단", value: (row) => row.method },
  { header: "카테고리", value: (row) => row.category },
  { header: "상태", value: (row) => row.status },
  { header: "처리자", value: (row) => row.processedBy },
];

function parseStatuses(searchParams: URLSearchParams) {
  const raw = searchParams.getAll("status");
  const values = raw.filter((value): value is PaymentStatus =>
    (PAYMENT_STATUS_VALUES as readonly string[]).includes(value),
  );
  return values.length > 0 ? values : undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const academyId = resolveVisibleAcademyId(auth.context);
  const format = (searchParams.get("format") as ExportFormat | null) ?? "xlsx";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const method = searchParams.get("method") as PaymentMethod | null;
  const category = searchParams.get("category") as PaymentCategory | null;
  const statuses = parseStatuses(searchParams);

  const fromDate = from ? new Date(`${from}T00:00:00`) : undefined;
  const toDate = to ? new Date(`${to}T23:59:59.999`) : undefined;

  const payments = await getPrisma().payment.findMany({
    where: applyAcademyScope(
      {
        ...(fromDate || toDate
          ? {
              processedAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
        ...(method ? { method } : {}),
        ...(category ? { category } : {}),
        ...(statuses ? { status: { in: statuses } } : {}),
      },
      academyId,
    ),
    orderBy: { processedAt: "desc" },
    select: {
      processedAt: true,
      examNumber: true,
      category: true,
      method: true,
      status: true,
      netAmount: true,
      student: {
        select: {
          name: true,
          phone: true,
        },
      },
      items: {
        select: { itemName: true },
      },
      processor: {
        select: { email: true },
      },
    },
  });

  const rows: PaymentExportRow[] = payments.map((payment) => ({
    processedAt: formatDateTime(payment.processedAt),
    examNumber: payment.examNumber ?? "",
    studentName: payment.student?.name ?? "",
    mobile: payment.student?.phone ?? "",
    itemNames: payment.items.map((item) => item.itemName).join(", "),
    netAmount: payment.netAmount,
    method: PAYMENT_METHOD_LABEL[payment.method],
    category: PAYMENT_CATEGORY_LABEL[payment.category],
    status: PAYMENT_STATUS_LABEL[payment.status],
    processedBy: payment.processor?.email ?? "",
  }));

  const fileName = `수납이력_${formatFileDate()}.${format}`;
  const buffer = format === "csv" ? createCsvBuffer(rows, COLUMNS) : createXlsxBuffer(rows, COLUMNS, "Payments");

  return createDownloadResponse(buffer, fileName, format);
}