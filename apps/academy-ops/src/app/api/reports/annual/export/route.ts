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
const SKY = "FF0EA5E9";
const LIGHT_GRAY = "FFF2F2F2";

function parseYearParam(param: string | null): number {
  if (param && /^\d{4}$/.test(param)) {
    const y = parseInt(param, 10);
    if (y >= 2020 && y <= 2099) return y;
  }
  return new Date().getFullYear();
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

function applyDataRow(row: ExcelJS.Row) {
  row.height = 18;
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
    cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sp = request.nextUrl.searchParams;
  const year = parseYearParam(sp.get("year"));
  const prisma = getPrisma();

  /* ── 12개월 데이터 집계 ── */
  type MonthData = {
    month: string;
    monthLabel: string;
    paymentNet: number;
    paymentGross: number;
    paymentCount: number;
    refundTotal: number;
    refundCount: number;
    newEnrollments: number;
    cancelledEnrollments: number;
    writtenPass: number;
    finalPass: number;
  };

  const months: MonthData[] = [];

  for (let m = 1; m <= 12; m++) {
    const monthStart = new Date(year, m - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, m, 0, 23, 59, 59, 999);

    let paymentNet = 0;
    let paymentGross = 0;
    let paymentCount = 0;
    let refundTotal = 0;
    let refundCount = 0;
    let newEnrollments = 0;
    let cancelledEnrollments = 0;
    let writtenPass = 0;
    let finalPass = 0;

    try {
      const [payAgg, refAgg, newEnroll, cancelledEnroll] = await Promise.all([
        prisma.payment.aggregate({
          where: {
            status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
            processedAt: { gte: monthStart, lte: monthEnd },
          },
          _sum: { netAmount: true, grossAmount: true },
          _count: { id: true },
        }),
        prisma.refund.aggregate({
          where: {
            status: "COMPLETED",
            processedAt: { gte: monthStart, lte: monthEnd },
          },
          _sum: { amount: true },
          _count: { id: true },
        }),
        prisma.courseEnrollment.count({
          where: { status: "ACTIVE", createdAt: { gte: monthStart, lte: monthEnd } },
        }),
        prisma.courseEnrollment.count({
          where: {
            status: { in: ["CANCELLED", "WITHDRAWN"] },
            updatedAt: { gte: monthStart, lte: monthEnd },
          },
        }),
      ]);
      paymentNet = payAgg._sum.netAmount ?? 0;
      paymentGross = payAgg._sum.grossAmount ?? 0;
      paymentCount = payAgg._count.id ?? 0;
      refundTotal = refAgg._sum.amount ?? 0;
      refundCount = refAgg._count.id ?? 0;
      newEnrollments = newEnroll;
      cancelledEnrollments = cancelledEnroll;
    } catch { /* 기본값 유지 */ }

    try {
      const [written, final] = await Promise.all([
        prisma.graduateRecord.count({
          where: {
            passType: "WRITTEN_PASS",
            writtenPassDate: { gte: monthStart, lte: monthEnd },
          },
        }),
        prisma.graduateRecord.count({
          where: {
            passType: "FINAL_PASS",
            finalPassDate: { gte: monthStart, lte: monthEnd },
          },
        }),
      ]);
      writtenPass = written;
      finalPass = final;
    } catch { /* 합격자 데이터 없음 */ }

    months.push({
      month: `${year}-${String(m).padStart(2, "0")}`,
      monthLabel: `${m}월`,
      paymentNet,
      paymentGross,
      paymentCount,
      refundTotal,
      refundCount,
      newEnrollments,
      cancelledEnrollments,
      writtenPass,
      finalPass,
    });
  }

  // 연간 합계
  const annual = {
    paymentNet: months.reduce((s, m) => s + m.paymentNet, 0),
    paymentGross: months.reduce((s, m) => s + m.paymentGross, 0),
    paymentCount: months.reduce((s, m) => s + m.paymentCount, 0),
    refundTotal: months.reduce((s, m) => s + m.refundTotal, 0),
    refundCount: months.reduce((s, m) => s + m.refundCount, 0),
    newEnrollments: months.reduce((s, m) => s + m.newEnrollments, 0),
    cancelledEnrollments: months.reduce((s, m) => s + m.cancelledEnrollments, 0),
    writtenPass: months.reduce((s, m) => s + m.writtenPass, 0),
    finalPass: months.reduce((s, m) => s + m.finalPass, 0),
  };

  let currentActiveEnrollments = 0;
  try {
    currentActiveEnrollments = await prisma.courseEnrollment.count({
      where: { status: "ACTIVE" },
    });
  } catch { /* 기본값 유지 */ }

  /* ── 워크북 생성 ── */
  const wb = new ExcelJS.Workbook();
  wb.creator = "학원 통합 운영 시스템";
  wb.created = new Date();

  /* ════════════════════════════════════════════════════
     Sheet 1: 연간 요약 (KPI)
  ════════════════════════════════════════════════════ */
  const ws1 = wb.addWorksheet("연간 요약");
  ws1.columns = [
    { key: "label", width: 28 },
    { key: "value", width: 22 },
    { key: "unit", width: 10 },
  ];

  applyTitleRow(ws1, "A1:C1", `${year}년 연간 운영 통계 — KPI 요약`);
  ws1.addRow([]);

  const h1 = ws1.addRow(["항목", "수치", "단위"]);
  applyHeaderRow(h1);

  const kpiRows: [string, number, string][] = [
    ["연간 수납 총액 (순수입)", annual.paymentNet, "원"],
    ["연간 수납 총액 (총수납)", annual.paymentGross, "원"],
    ["수납 건수", annual.paymentCount, "건"],
    ["연간 환불 총액", annual.refundTotal, "원"],
    ["환불 건수", annual.refundCount, "건"],
    ["신규 수강 등록", annual.newEnrollments, "명"],
    ["퇴원·취소", annual.cancelledEnrollments, "명"],
    ["순 수강 증감 (신규 - 퇴원)", annual.newEnrollments - annual.cancelledEnrollments, "명"],
    ["현재 수강생 (스냅샷)", currentActiveEnrollments, "명"],
    ["필기합격자", annual.writtenPass, "명"],
    ["최종합격자", annual.finalPass, "명"],
  ];

  for (const [label, value, unit] of kpiRows) {
    const row = ws1.addRow([label, value, unit]);
    applyDataRow(row);
    row.getCell(1).font = { color: { argb: "FF374151" } };
    if (unit === "원") {
      row.getCell(2).numFmt = '#,##0"원"';
      row.getCell(2).font = {
        color: { argb: label.includes("환불") ? RED : FOREST },
        bold: true,
      };
    } else if (label.includes("합격")) {
      row.getCell(2).font = { color: { argb: SKY }, bold: true };
      row.getCell(2).alignment = { horizontal: "right" };
    } else {
      row.getCell(2).alignment = { horizontal: "right" };
    }
    row.getCell(3).alignment = { horizontal: "center" };
  }

  ws1.views = [{ state: "frozen", ySplit: 3 }];

  /* ════════════════════════════════════════════════════
     Sheet 2: 월별 상세 집계
  ════════════════════════════════════════════════════ */
  const ws2 = wb.addWorksheet("월별 상세");
  ws2.columns = [
    { key: "month", width: 12 },
    { key: "paymentNet", width: 18 },
    { key: "paymentCount", width: 12 },
    { key: "refundTotal", width: 16 },
    { key: "refundCount", width: 10 },
    { key: "netRevenue", width: 18 },
    { key: "newEnroll", width: 12 },
    { key: "cancelled", width: 12 },
    { key: "netEnroll", width: 12 },
    { key: "writtenPass", width: 12 },
    { key: "finalPass", width: 12 },
  ];

  applyTitleRow(ws2, "A1:K1", `${year}년 월별 수납·수강·합격 상세 집계`);
  ws2.addRow([]);

  const h2 = ws2.addRow([
    "월",
    "수납액(순)",
    "수납건",
    "환불액",
    "환불건",
    "순매출",
    "신규등록",
    "퇴원·취소",
    "순증감",
    "필기합격",
    "최종합격",
  ]);
  applyHeaderRow(h2);

  for (const m of months) {
    const netRevenue = m.paymentNet - m.refundTotal;
    const netEnroll = m.newEnrollments - m.cancelledEnrollments;
    const row = ws2.addRow([
      `${m.monthLabel}`,
      m.paymentNet,
      m.paymentCount,
      m.refundTotal,
      m.refundCount,
      netRevenue,
      m.newEnrollments,
      m.cancelledEnrollments,
      netEnroll,
      m.writtenPass,
      m.finalPass,
    ]);
    applyDataRow(row);

    // 월 컬럼
    row.getCell(1).font = { bold: true, color: { argb: "FF374151" } };
    row.getCell(1).alignment = { horizontal: "center" };

    // 수납액 (순)
    row.getCell(2).numFmt = '#,##0"원"';
    row.getCell(2).font = { color: { argb: m.paymentNet > 0 ? EMBER : "FF9CA3AF" } };

    // 수납건
    row.getCell(3).alignment = { horizontal: "right" };
    if (m.paymentCount === 0) row.getCell(3).font = { color: { argb: "FF9CA3AF" } };

    // 환불액
    row.getCell(4).numFmt = '#,##0"원"';
    if (m.refundTotal > 0) row.getCell(4).font = { color: { argb: RED } };
    else row.getCell(4).font = { color: { argb: "FF9CA3AF" } };

    // 환불건
    row.getCell(5).alignment = { horizontal: "right" };
    if (m.refundCount === 0) row.getCell(5).font = { color: { argb: "FF9CA3AF" } };

    // 순매출
    row.getCell(6).numFmt = '#,##0"원"';
    row.getCell(6).font = {
      bold: true,
      color: { argb: netRevenue >= 0 ? FOREST : RED },
    };

    // 신규등록
    row.getCell(7).alignment = { horizontal: "right" };
    if (m.newEnrollments > 0) row.getCell(7).font = { color: { argb: FOREST } };
    else row.getCell(7).font = { color: { argb: "FF9CA3AF" } };

    // 퇴원·취소
    row.getCell(8).alignment = { horizontal: "right" };
    if (m.cancelledEnrollments > 0) row.getCell(8).font = { color: { argb: "FFF59E0B" } };
    else row.getCell(8).font = { color: { argb: "FF9CA3AF" } };

    // 순증감
    row.getCell(9).alignment = { horizontal: "right" };
    row.getCell(9).font = {
      color: { argb: netEnroll > 0 ? FOREST : netEnroll < 0 ? RED : "FF9CA3AF" },
    };

    // 필기합격
    row.getCell(10).alignment = { horizontal: "right" };
    if (m.writtenPass > 0) row.getCell(10).font = { color: { argb: SKY } };
    else row.getCell(10).font = { color: { argb: "FF9CA3AF" } };

    // 최종합격
    row.getCell(11).alignment = { horizontal: "right" };
    if (m.finalPass > 0) row.getCell(11).font = { bold: true, color: { argb: FOREST } };
    else row.getCell(11).font = { color: { argb: "FF9CA3AF" } };
  }

  // 합계 행
  const annualNetRevenue = annual.paymentNet - annual.refundTotal;
  const annualNetEnroll = annual.newEnrollments - annual.cancelledEnrollments;
  const totRow = ws2.addRow([
    "연간 합계",
    annual.paymentNet,
    annual.paymentCount,
    annual.refundTotal,
    annual.refundCount,
    annualNetRevenue,
    annual.newEnrollments,
    annual.cancelledEnrollments,
    annualNetEnroll,
    annual.writtenPass,
    annual.finalPass,
  ]);
  applyTotalRow(totRow);
  totRow.getCell(2).numFmt = '#,##0"원"';
  totRow.getCell(4).numFmt = '#,##0"원"';
  totRow.getCell(6).numFmt = '#,##0"원"';

  ws2.views = [{ state: "frozen", ySplit: 3 }];

  /* ════════════════════════════════════════════════════
     Sheet 3: 수납 분기별 요약
  ════════════════════════════════════════════════════ */
  const ws3 = wb.addWorksheet("분기별 요약");
  ws3.columns = [
    { key: "quarter", width: 14 },
    { key: "months", width: 16 },
    { key: "paymentNet", width: 20 },
    { key: "paymentCount", width: 12 },
    { key: "refundTotal", width: 18 },
    { key: "newEnroll", width: 12 },
    { key: "cancelled", width: 12 },
    { key: "finalPass", width: 12 },
  ];

  applyTitleRow(ws3, "A1:H1", `${year}년 분기별 집계`);
  ws3.addRow([]);

  const h3 = ws3.addRow(["분기", "월 범위", "수납액(순)", "수납건", "환불액", "신규등록", "퇴원·취소", "최종합격"]);
  applyHeaderRow(h3);

  const quarters = [
    { label: "1분기", start: 0, end: 3 },
    { label: "2분기", start: 3, end: 6 },
    { label: "3분기", start: 6, end: 9 },
    { label: "4분기", start: 9, end: 12 },
  ];

  for (const q of quarters) {
    const qMonths = months.slice(q.start, q.end);
    const qPayNet = qMonths.reduce((s, m) => s + m.paymentNet, 0);
    const qPayCount = qMonths.reduce((s, m) => s + m.paymentCount, 0);
    const qRefund = qMonths.reduce((s, m) => s + m.refundTotal, 0);
    const qNew = qMonths.reduce((s, m) => s + m.newEnrollments, 0);
    const qCancel = qMonths.reduce((s, m) => s + m.cancelledEnrollments, 0);
    const qPass = qMonths.reduce((s, m) => s + m.finalPass, 0);
    const monthRange = `${q.start + 1}월 ~ ${q.end}월`;

    const row = ws3.addRow([q.label, monthRange, qPayNet, qPayCount, qRefund, qNew, qCancel, qPass]);
    applyDataRow(row);
    row.getCell(1).font = { bold: true, color: { argb: FOREST } };
    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(2).alignment = { horizontal: "center" };
    row.getCell(2).font = { color: { argb: "FF6B7280" } };
    row.getCell(3).numFmt = '#,##0"원"';
    row.getCell(3).font = { color: { argb: qPayNet > 0 ? EMBER : "FF9CA3AF" } };
    row.getCell(4).alignment = { horizontal: "right" };
    row.getCell(5).numFmt = '#,##0"원"';
    if (qRefund > 0) row.getCell(5).font = { color: { argb: RED } };
    row.getCell(6).alignment = { horizontal: "right" };
    if (qNew > 0) row.getCell(6).font = { color: { argb: FOREST } };
    row.getCell(7).alignment = { horizontal: "right" };
    if (qCancel > 0) row.getCell(7).font = { color: { argb: "FFF59E0B" } };
    row.getCell(8).alignment = { horizontal: "right" };
    if (qPass > 0) row.getCell(8).font = { bold: true, color: { argb: FOREST } };
  }

  ws3.addRow([]);

  // 연간 합계 행
  const annTot = ws3.addRow([
    "연간 합계",
    "1월 ~ 12월",
    annual.paymentNet,
    annual.paymentCount,
    annual.refundTotal,
    annual.newEnrollments,
    annual.cancelledEnrollments,
    annual.finalPass,
  ]);
  applyTotalRow(annTot);
  annTot.getCell(3).numFmt = '#,##0"원"';
  annTot.getCell(5).numFmt = '#,##0"원"';

  // 추가 메모 행
  ws3.addRow([]);
  const noteRow = ws3.addRow([`※ 현재 수강생 수: ${currentActiveEnrollments.toLocaleString("ko-KR")}명 (조회 시점 기준)`]);
  noteRow.getCell(1).font = { italic: true, color: { argb: "FF6B7280" }, size: 10 };
  ws3.mergeCells(`A${noteRow.number}:H${noteRow.number}`);

  ws3.views = [{ state: "frozen", ySplit: 3 }];

  /* ── 응답 ── */
  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `연간운영통계_${year}년.xlsx`;
  const encodedName = encodeURIComponent(fileName);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store",
    },
  });
}
