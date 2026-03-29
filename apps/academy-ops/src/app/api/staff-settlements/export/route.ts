import { AdminRole } from "@prisma/client";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseYearMonth(yearParam: string | null, monthParam: string | null): { year: number; month: number } {
  const today = new Date();
  const year = yearParam ? parseInt(yearParam, 10) : today.getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : today.getMonth() + 1;
  return {
    year: isNaN(year) ? today.getFullYear() : year,
    month: isNaN(month) ? today.getMonth() + 1 : Math.max(1, Math.min(12, month)),
  };
}

const EMBER = "FFC55A11";
const FOREST = "FF1F4D3A";
const MIST = "FFF7F4EF";
const LIGHT_GRAY = "FFF2F2F2";
const WHITE = "FFFFFFFF";

const STAFF_ROLE_LABEL: Record<string, string> = {
  OWNER: "대표",
  DIRECTOR: "원장",
  DEPUTY_DIRECTOR: "부원장",
  MANAGER: "실장",
  ACADEMIC_ADMIN: "교무행정",
  COUNSELOR: "상담",
  TEACHER: "강사",
};

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sp = request.nextUrl.searchParams;
  const { year, month } = parseYearMonth(sp.get("year"), sp.get("month"));

  // Parse per-staff commission rates from query params: rates[adminUserId]=N
  const ratesMap = new Map<string, number>();
  sp.forEach((value, key) => {
    const match = key.match(/^rates\[(.+)\]$/);
    if (match) {
      const adminId = match[1];
      const rate = parseFloat(value);
      if (!isNaN(rate)) ratesMap.set(adminId, rate);
    }
  });

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

  // Get staff with linked AdminUser
  const staffList = await getPrisma().staff.findMany({
    where: { isActive: true, adminUserId: { not: null } },
    select: {
      id: true,
      name: true,
      role: true,
      adminUserId: true,
    },
    orderBy: { name: "asc" },
  });

  const adminUserIds = staffList
    .map((s) => s.adminUserId)
    .filter((id): id is string => id !== null);

  // Aggregate payments by processedBy
  const paymentAggregates = await getPrisma().payment.groupBy({
    by: ["processedBy"],
    where: {
      processedBy: { in: adminUserIds },
      processedAt: { gte: firstDay, lte: lastDay },
      status: { notIn: ["CANCELLED"] },
    },
    _count: { id: true },
    _sum: { netAmount: true },
  });

  const aggregateMap = new Map(
    paymentAggregates.map((agg) => [
      agg.processedBy,
      { count: agg._count.id, total: agg._sum.netAmount ?? 0 },
    ])
  );

  type RowData = {
    name: string;
    roleLabel: string;
    paymentCount: number;
    totalRevenue: number;
    commissionRate: number;
    commissionAmount: number;
  };

  const rows: RowData[] = staffList.map((staff) => {
    const adminId = staff.adminUserId ?? "";
    const agg = aggregateMap.get(adminId);
    const paymentCount = agg?.count ?? 0;
    const totalRevenue = agg?.total ?? 0;
    const commissionRate = ratesMap.get(adminId) ?? 0;
    const commissionAmount = Math.floor(totalRevenue * (commissionRate / 100));
    return {
      name: staff.name,
      roleLabel: STAFF_ROLE_LABEL[staff.role] ?? staff.role,
      paymentCount,
      totalRevenue,
      commissionRate,
      commissionAmount,
    };
  });

  // Build workbook
  const wb = new ExcelJS.Workbook();
  wb.creator = "학원 통합 운영 시스템";
  wb.created = new Date();

  const sheetName = `${year}년 ${month}월 직원 정산`;
  const ws = wb.addWorksheet(sheetName);

  ws.columns = [
    { key: "name",             width: 14 },
    { key: "role",             width: 14 },
    { key: "paymentCount",     width: 12 },
    { key: "totalRevenue",     width: 18 },
    { key: "commissionRate",   width: 12 },
    { key: "commissionAmount", width: 18 },
  ];

  // Title row
  ws.mergeCells("A1:F1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `${year}년 ${month}월 직원 정산서`;
  titleCell.font = { bold: true, size: 14, color: { argb: FOREST } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MIST } };
  ws.getRow(1).height = 32;

  // Blank separator
  ws.addRow([]);

  // Header row
  const headerRow = ws.addRow([
    "직원명",
    "역할",
    "수납 건수",
    "수납 총액",
    "배분율(%)",
    "정산 금액",
  ]);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });

  let grandCount = 0;
  let grandRevenue = 0;
  let grandCommission = 0;

  for (const row of rows) {
    const dataRow = ws.addRow([
      row.name,
      row.roleLabel,
      row.paymentCount,
      row.totalRevenue,
      row.commissionRate > 0 ? `${row.commissionRate}%` : "-",
      row.commissionAmount,
    ]);
    dataRow.height = 18;

    dataRow.getCell(3).alignment = { horizontal: "right" };
    dataRow.getCell(4).numFmt = '#,##0"원"';
    dataRow.getCell(5).alignment = { horizontal: "center" };
    dataRow.getCell(6).numFmt = '#,##0"원"';
    dataRow.getCell(6).font = { color: { argb: EMBER } };

    dataRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });

    grandCount += row.paymentCount;
    grandRevenue += row.totalRevenue;
    grandCommission += row.commissionAmount;
  }

  // Grand total row
  const totalRow = ws.addRow([
    "합 계",
    "",
    grandCount,
    grandRevenue,
    "",
    grandCommission,
  ]);
  totalRow.height = 24;
  ws.mergeCells(`A${totalRow.number}:B${totalRow.number}`);

  totalRow.getCell(1).font = { bold: true, size: 12, color: { argb: WHITE } };
  totalRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  totalRow.getCell(3).font = { bold: true, size: 12, color: { argb: WHITE } };
  totalRow.getCell(3).alignment = { horizontal: "right" };
  totalRow.getCell(4).numFmt = '#,##0"원"';
  totalRow.getCell(4).font = { bold: true, size: 12, color: { argb: WHITE } };
  totalRow.getCell(6).numFmt = '#,##0"원"';
  totalRow.getCell(6).font = { bold: true, size: 12, color: { argb: WHITE } };

  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.border = { top: { style: "medium", color: { argb: "FF000000" } } };
  });

  // Freeze header rows
  ws.views = [{ state: "frozen", ySplit: 3 }];

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `직원정산_${year}년${String(month).padStart(2, "0")}월.xlsx`;
  const encodedName = encodeURIComponent(fileName);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store",
    },
  });
}
