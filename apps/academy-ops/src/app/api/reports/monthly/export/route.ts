import { AdminRole } from "@prisma/client";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* ── 색상 상수 ── */
const FOREST = "FF1F4D3A";
const EMBER = "FFC55A11";
const MIST = "FFF7F4EF";
const WHITE = "FFFFFFFF";
const RED = "FFDC2626";
const LIGHT_GRAY = "FFF2F2F2";

function parseMonthParam(param: string | null): { year: number; month: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function applyHeaderRow(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });
}

function applyTitleRow(ws: ExcelJS.Worksheet, colSpan: string, text: string) {
  ws.mergeCells(colSpan);
  const cell = ws.getCell(colSpan.split(":")[0]);
  cell.value = text;
  cell.font = { bold: true, size: 14, color: { argb: FOREST } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MIST } };
  ws.getRow(1).height = 32;
}

function applyTotalRow(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: { style: "medium", color: { argb: "FF000000" } } };
  });
}

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소강",
  CUSTOM: "기타",
};

const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "미지급",
  PAID: "지급완료",
  CANCELLED: "취소",
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
  const { year, month } = parseMonthParam(sp.get("month"));
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const korMonth = `${year}년 ${month}월`;

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const prisma = getPrisma();

  // ── KPI 수집 ──
  let newEnrollments = 0;
  let cancelledEnrollments = 0;
  let activeEnrollments = 0;
  let waitingEnrollments = 0;
  try {
    [newEnrollments, cancelledEnrollments, activeEnrollments, waitingEnrollments] = await Promise.all([
      prisma.courseEnrollment.count({ where: { status: "ACTIVE", createdAt: { gte: monthStart, lte: monthEnd } } }),
      prisma.courseEnrollment.count({ where: { status: { in: ["CANCELLED", "WITHDRAWN"] }, updatedAt: { gte: monthStart, lte: monthEnd } } }),
      prisma.courseEnrollment.count({ where: { status: "ACTIVE" } }),
      prisma.courseEnrollment.count({ where: { status: "WAITING" } }),
    ]);
  } catch { /* 기본값 사용 */ }

  let paymentGross = 0;
  let paymentNet = 0;
  let paymentCount = 0;
  try {
    const payments = await prisma.payment.aggregate({
      where: { status: { in: ["APPROVED", "PARTIAL_REFUNDED"] }, processedAt: { gte: monthStart, lte: monthEnd } },
      _sum: { netAmount: true, grossAmount: true },
      _count: { id: true },
    });
    paymentGross = payments._sum.grossAmount ?? 0;
    paymentNet = payments._sum.netAmount ?? 0;
    paymentCount = payments._count.id ?? 0;
  } catch { /* 기본값 사용 */ }

  let refundTotal = 0;
  let refundCount = 0;
  try {
    const refunds = await prisma.refund.aggregate({
      where: { status: "COMPLETED", processedAt: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
      _count: { id: true },
    });
    refundTotal = refunds._sum.amount ?? 0;
    refundCount = refunds._count.id ?? 0;
  } catch { /* 기본값 사용 */ }

  let unpaidAmount = 0;
  let unpaidCount = 0;
  try {
    const unpaid = await prisma.installment.aggregate({
      where: { paidAt: null, dueDate: { lte: monthEnd } },
      _sum: { amount: true },
      _count: { id: true },
    });
    unpaidAmount = unpaid._sum.amount ?? 0;
    unpaidCount = unpaid._count.id ?? 0;
  } catch { /* 기본값 사용 */ }

  // ── 기수별 수강 현황 ──
  type CohortRow = { id: string; name: string; examCategory: string; maxCapacity: number | null; enrolled: number; waiting: number };
  let cohorts: CohortRow[] = [];
  try {
    const cohortRows = await prisma.cohort.findMany({
      where: { isActive: true },
      select: { id: true, name: true, examCategory: true, maxCapacity: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
      orderBy: { startDate: "desc" },
    });
    const waitingCounts = await prisma.courseEnrollment.groupBy({
      by: ["cohortId"],
      where: { cohortId: { in: cohortRows.map((c) => c.id) }, status: "WAITING" },
      _count: { id: true },
    });
    const waitingMap = new Map(waitingCounts.map((w) => [w.cohortId, w._count.id]));
    cohorts = cohortRows.map((c) => ({
      id: c.id,
      name: c.name,
      examCategory: c.examCategory,
      maxCapacity: c.maxCapacity,
      enrolled: c._count.enrollments,
      waiting: waitingMap.get(c.id) ?? 0,
    }));
  } catch { /* 기본값 사용 */ }

  // ── 교재 판매 ──
  let tbSalesCount = 0;
  let tbSalesTotal = 0;
  try {
    const tbSales = await prisma.textbookSale.aggregate({
      where: { soldAt: { gte: monthStart, lte: monthEnd } },
      _sum: { totalPrice: true, quantity: true },
      _count: { id: true },
    });
    tbSalesCount = tbSales._count.id ?? 0;
    tbSalesTotal = tbSales._sum.totalPrice ?? 0;
  } catch { /* 기본값 사용 */ }

  // ── 강사 정산 ──
  type SettlementRow = { instructorName: string; amount: number; status: string };
  let settlements: SettlementRow[] = [];
  try {
    const rows = await prisma.specialLectureSettlement.findMany({
      where: { settlementMonth: monthStr },
      orderBy: { instructorAmount: "desc" },
    });
    const instructorIds = [...new Set(rows.map((r) => r.instructorId))];
    const instructors = await prisma.instructor.findMany({
      where: { id: { in: instructorIds } },
      select: { id: true, name: true },
    });
    const instructorMap = new Map(instructors.map((i) => [i.id, i.name]));
    settlements = rows.map((r) => ({
      instructorName: instructorMap.get(r.instructorId) ?? r.instructorId,
      amount: r.instructorAmount,
      status: r.status,
    }));
  } catch { /* 기본값 사용 */ }

  // ── 워크북 생성 ──
  const wb = new ExcelJS.Workbook();
  wb.creator = "학원 통합 운영 시스템";
  wb.created = new Date();

  /* ════════════════════════════════════════════════════
     Sheet 1: 월간 요약 (KPI)
  ════════════════════════════════════════════════════ */
  const ws1 = wb.addWorksheet("월간 요약");
  ws1.columns = [
    { key: "label", width: 26 },
    { key: "value", width: 20 },
    { key: "unit", width: 10 },
  ];

  applyTitleRow(ws1, "A1:C1", `${korMonth} 월간 운영 보고서 — KPI 요약`);
  ws1.addRow([]);

  const h1 = ws1.addRow(["항목", "수치", "단위"]);
  applyHeaderRow(h1);

  const kpiRows: [string, number, string][] = [
    ["이번 달 신규 수강 등록", newEnrollments, "건"],
    ["이번 달 퇴원·취소", cancelledEnrollments, "건"],
    ["현재 활성 수강생", activeEnrollments, "명"],
    ["현재 대기 수강생", waitingEnrollments, "명"],
    ["수납 총액 (순수입)", paymentNet, "원"],
    ["수납 총액 (총수납)", paymentGross, "원"],
    ["수납 건수", paymentCount, "건"],
    ["환불 총액", refundTotal, "원"],
    ["환불 건수", refundCount, "건"],
    ["미수금 잔액", unpaidAmount, "원"],
    ["미납 건수", unpaidCount, "건"],
    ["교재 판매액", tbSalesTotal, "원"],
    ["교재 판매 건수", tbSalesCount, "건"],
  ];

  for (const [label, value, unit] of kpiRows) {
    const row = ws1.addRow([label, value, unit]);
    row.height = 20;
    row.getCell(1).font = { color: { argb: "FF374151" } };
    if (unit === "원") {
      row.getCell(2).numFmt = '#,##0"원"';
      row.getCell(2).font = { color: { argb: FOREST } };
    } else {
      row.getCell(2).alignment = { horizontal: "right" };
    }
    row.getCell(3).alignment = { horizontal: "center" };
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
  }

  ws1.views = [{ state: "frozen", ySplit: 3 }];

  /* ════════════════════════════════════════════════════
     Sheet 2: 수강 현황 (기수별)
  ════════════════════════════════════════════════════ */
  const ws2 = wb.addWorksheet("수강현황");
  ws2.columns = [
    { key: "name", width: 30 },
    { key: "category", width: 12 },
    { key: "enrolled", width: 12 },
    { key: "max", width: 12 },
    { key: "waiting", width: 12 },
    { key: "rate", width: 14 },
  ];

  applyTitleRow(ws2, "A1:F1", `${korMonth} 기수별 수강 현황`);
  ws2.addRow([]);

  const h2 = ws2.addRow(["기수명", "분류", "수강인원", "정원", "대기인원", "충원율"]);
  applyHeaderRow(h2);

  for (const c of cohorts) {
    const rate = c.maxCapacity && c.maxCapacity > 0 ? c.enrolled / c.maxCapacity : null;
    const row = ws2.addRow([
      c.name,
      EXAM_CATEGORY_LABEL[c.examCategory] ?? c.examCategory,
      c.enrolled,
      c.maxCapacity ?? "무제한",
      c.waiting,
      rate,
    ]);
    row.height = 18;
    row.getCell(2).alignment = { horizontal: "center" };
    row.getCell(3).alignment = { horizontal: "right" };
    row.getCell(4).alignment = { horizontal: "right" };
    row.getCell(5).alignment = { horizontal: "right" };
    if (rate !== null) {
      row.getCell(6).numFmt = "0.0%";
      row.getCell(6).alignment = { horizontal: "right" };
      if (rate >= 0.9) row.getCell(6).font = { color: { argb: RED }, bold: true };
      else if (rate >= 0.7) row.getCell(6).font = { color: { argb: EMBER } };
      else row.getCell(6).font = { color: { argb: FOREST } };
    } else {
      row.getCell(6).value = "-";
      row.getCell(6).alignment = { horizontal: "center" };
    }
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
  }

  if (cohorts.length === 0) {
    const empty = ws2.addRow(["활성 기수 없음", "", "", "", "", ""]);
    ws2.mergeCells(`A${empty.number}:F${empty.number}`);
    empty.getCell(1).alignment = { horizontal: "center" };
    empty.getCell(1).font = { color: { argb: "FF9CA3AF" } };
  } else {
    const totalEnrolled = cohorts.reduce((s, c) => s + c.enrolled, 0);
    const totalWaiting = cohorts.reduce((s, c) => s + c.waiting, 0);
    const tot2 = ws2.addRow(["합 계", "", totalEnrolled, "", totalWaiting, ""]);
    applyTotalRow(tot2);
    tot2.getCell(3).numFmt = '#,##0"명"';
    tot2.getCell(5).numFmt = '#,##0"명"';
  }

  ws2.views = [{ state: "frozen", ySplit: 3 }];

  /* ════════════════════════════════════════════════════
     Sheet 3: 수납내역
  ════════════════════════════════════════════════════ */
  const ws3 = wb.addWorksheet("수납내역");
  ws3.columns = [
    { key: "label", width: 24 },
    { key: "value", width: 20 },
  ];

  applyTitleRow(ws3, "A1:B1", `${korMonth} 수납·환불·미수금 요약`);
  ws3.addRow([]);

  const h3 = ws3.addRow(["항목", "금액"]);
  applyHeaderRow(h3);

  const paymentRows: [string, number][] = [
    ["총 수납액 (총수납)", paymentGross],
    ["총 수납액 (순수입)", paymentNet],
    ["환불 총액", refundTotal],
    ["미수금 잔액", unpaidAmount],
  ];

  for (const [label, value] of paymentRows) {
    const row = ws3.addRow([label, value]);
    row.height = 20;
    row.getCell(2).numFmt = '#,##0"원"';
    row.getCell(2).font = { color: { argb: FOREST } };
    if (label.includes("환불") || label.includes("미수")) {
      row.getCell(2).font = { color: { argb: RED } };
    }
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
  }

  ws3.addRow([]);

  // 강사 정산 섹션
  if (settlements.length > 0) {
    const settlSectionTitle = ws3.addRow(["[강사 정산]", ""]);
    settlSectionTitle.getCell(1).font = { bold: true, color: { argb: FOREST } };
    settlSectionTitle.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };

    const settlHeader = ws3.addRow(["강사명", "정산 금액"]);
    applyHeaderRow(settlHeader);

    for (const s of settlements) {
      const row = ws3.addRow([s.instructorName, s.amount]);
      row.height = 18;
      row.getCell(2).numFmt = '#,##0"원"';
      row.getCell(2).font = { color: { argb: EMBER } };
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
        cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
      });
    }

    const settlTotal = settlements.reduce((s, r) => s + r.amount, 0);
    const tot3 = ws3.addRow(["합 계", settlTotal]);
    applyTotalRow(tot3);
    tot3.getCell(2).numFmt = '#,##0"원"';
  }

  ws3.views = [{ state: "frozen", ySplit: 3 }];

  /* ── 응답 ── */
  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `월간운영보고서_${monthStr}.xlsx`;
  const encodedName = encodeURIComponent(fileName);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store",
    },
  });
}
