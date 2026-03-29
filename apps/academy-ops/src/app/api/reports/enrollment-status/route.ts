import { AdminRole } from "@prisma/client";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* ── 색상 상수 ── */
const FOREST = "FF1F4D3A";
const MIST = "FFF7F4EF";
const WHITE = "FFFFFFFF";
const RED = "FFDC2626";

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소강",
  CUSTOM: "기타",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  ACTIVE: "활성",
  WAITING: "대기번호",
  SUSPENDED: "휴원",
  COMPLETED: "수료",
  WITHDRAWN: "퇴원",
};

// Matching STATUS_COLORS in the page for Excel cells
const STATUS_ARGB: Record<string, string> = {
  PENDING: "FF6B7280",
  ACTIVE: "FF15803D",
  WAITING: "FFB45309",
  SUSPENDED: "FF1D4ED8",
  COMPLETED: "FF1F4D3A",
  WITHDRAWN: RED,
};

function parseMonthParam(raw: string | null): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
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

const STATUSES = ["ACTIVE", "PENDING", "WAITING", "SUSPENDED", "COMPLETED", "WITHDRAWN"] as const;
type EnrollStatus = typeof STATUSES[number];

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
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
  const rangeEnd = new Date(year, month, 1); // exclusive upper bound

  const prisma = getPrisma();

  // 수강반 목록 (해당 월 이전에 생성된 것)
  const cohorts = await prisma.cohort.findMany({
    where: { createdAt: { lt: rangeEnd } },
    orderBy: [{ examCategory: "asc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      examCategory: true,
      startDate: true,
      endDate: true,
      isActive: true,
      maxCapacity: true,
    },
  }).catch(() => []);

  // 수강 등록 상태별 카운트
  const enrollmentStats = cohorts.length
    ? await prisma.courseEnrollment.groupBy({
        by: ["cohortId", "status"],
        where: {
          cohortId: { in: cohorts.map((c) => c.id) },
          createdAt: { lt: rangeEnd },
        },
        _count: { id: true },
      }).catch(() => [])
    : [];

  // cohortId -> status -> count
  const statsByCohort = new Map<string, Record<string, number>>();
  for (const row of enrollmentStats) {
    if (!row.cohortId) continue;
    const existing = statsByCohort.get(row.cohortId) ?? {};
    existing[row.status] = row._count.id;
    statsByCohort.set(row.cohortId, existing);
  }

  // 전체 합계 계산
  const grandTotals: Record<string, number> = {};
  for (const s of STATUSES) grandTotals[s] = 0;
  let grandTotal = 0;

  for (const cohort of cohorts) {
    const stats = statsByCohort.get(cohort.id) ?? {};
    for (const s of STATUSES) {
      grandTotals[s] = (grandTotals[s] ?? 0) + (stats[s] ?? 0);
    }
    grandTotal += STATUSES.reduce((sum, s) => sum + (stats[s] ?? 0), 0);
  }

  /* ── 워크북 생성 ── */
  const wb = new ExcelJS.Workbook();
  wb.creator = "학원 통합 운영 시스템";
  wb.created = new Date();

  /* ════════════════════════════════════════════════════
     Sheet 1: 수강반별 현황
  ════════════════════════════════════════════════════ */
  // columns: 수강반명, 카테고리, ACTIVE, PENDING, WAITING, SUSPENDED, COMPLETED, WITHDRAWN, 합계, 정원, 충원율, 상태
  const ws1 = wb.addWorksheet("수강반별 현황");
  ws1.columns = [
    { key: "name", width: 32 },
    { key: "category", width: 10 },
    { key: "active", width: 10 },
    { key: "pending", width: 10 },
    { key: "waiting", width: 10 },
    { key: "suspended", width: 10 },
    { key: "completed", width: 10 },
    { key: "withdrawn", width: 10 },
    { key: "total", width: 10 },
    { key: "capacity", width: 10 },
    { key: "rate", width: 10 },
    { key: "isActive", width: 10 },
  ];

  const colSpan1 = `A1:L1`;
  applyTitleRow(ws1, colSpan1, `${korMonth} 수강반별 수강생 현황 보고서`);
  ws1.addRow([]);

  const h1 = ws1.addRow([
    "수강반명",
    "분류",
    STATUS_LABEL.ACTIVE,
    STATUS_LABEL.PENDING,
    STATUS_LABEL.WAITING,
    STATUS_LABEL.SUSPENDED,
    STATUS_LABEL.COMPLETED,
    STATUS_LABEL.WITHDRAWN,
    "합계",
    "정원",
    "충원율",
    "운영상태",
  ]);
  applyHeaderRow(h1);

  for (const cohort of cohorts) {
    const stats = statsByCohort.get(cohort.id) ?? {};
    const rowTotal = STATUSES.reduce((sum, s) => sum + (stats[s] ?? 0), 0);
    const activeCount = stats["ACTIVE"] ?? 0;
    const capacity = cohort.maxCapacity;
    const utilizationPct = capacity && capacity > 0
      ? Math.round((activeCount / capacity) * 100)
      : null;

    const row = ws1.addRow([
      cohort.name,
      EXAM_CATEGORY_LABEL[cohort.examCategory] ?? cohort.examCategory,
      stats["ACTIVE"] ?? 0,
      stats["PENDING"] ?? 0,
      stats["WAITING"] ?? 0,
      stats["SUSPENDED"] ?? 0,
      stats["COMPLETED"] ?? 0,
      stats["WITHDRAWN"] ?? 0,
      rowTotal,
      capacity ?? "무제한",
      utilizationPct !== null ? utilizationPct / 100 : null,
      cohort.isActive ? "운영중" : "종료",
    ]);

    row.height = 18;
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });

    // 수강반명
    row.getCell(1).font = { bold: false, color: { argb: "FF111827" } };

    // 분류 뱃지
    row.getCell(2).alignment = { horizontal: "center" };
    row.getCell(2).font = { color: { argb: FOREST } };

    // 상태별 카운트 컬러
    const statusCols = [3, 4, 5, 6, 7, 8] as const;
    const statusKeys: EnrollStatus[] = ["ACTIVE", "PENDING", "WAITING", "SUSPENDED", "COMPLETED", "WITHDRAWN"];
    for (let i = 0; i < statusCols.length; i++) {
      const colIdx = statusCols[i];
      const count = stats[statusKeys[i]] ?? 0;
      row.getCell(colIdx).alignment = { horizontal: "right" };
      if (count > 0) {
        row.getCell(colIdx).font = { color: { argb: STATUS_ARGB[statusKeys[i]] }, bold: true };
      } else {
        row.getCell(colIdx).font = { color: { argb: "FFD1D5DB" } };
      }
    }

    // 합계
    row.getCell(9).alignment = { horizontal: "right" };
    row.getCell(9).font = { bold: true, color: { argb: "FF111827" } };

    // 정원
    row.getCell(10).alignment = { horizontal: "right" };
    row.getCell(10).font = { color: { argb: "FF6B7280" } };

    // 충원율
    if (utilizationPct !== null) {
      row.getCell(11).numFmt = "0%";
      row.getCell(11).alignment = { horizontal: "right" };
      row.getCell(11).font = {
        color: {
          argb: utilizationPct >= 100 ? RED : utilizationPct >= 80 ? "FFF59E0B" : FOREST,
        },
        bold: utilizationPct >= 100,
      };
    } else {
      row.getCell(11).value = "-";
      row.getCell(11).alignment = { horizontal: "center" };
      row.getCell(11).font = { color: { argb: "FFD1D5DB" } };
    }

    // 운영상태
    row.getCell(12).alignment = { horizontal: "center" };
    row.getCell(12).font = {
      color: { argb: cohort.isActive ? STATUS_ARGB["ACTIVE"] : "FF6B7280" },
    };
  }

  // 합계 행
  const totRow1 = ws1.addRow([
    "합 계",
    "",
    grandTotals["ACTIVE"],
    grandTotals["PENDING"],
    grandTotals["WAITING"],
    grandTotals["SUSPENDED"],
    grandTotals["COMPLETED"],
    grandTotals["WITHDRAWN"],
    grandTotal,
    "",
    "",
    "",
  ]);
  applyTotalRow(totRow1);

  ws1.views = [{ state: "frozen", ySplit: 3 }];

  /* ════════════════════════════════════════════════════
     Sheet 2: 상태별 요약
  ════════════════════════════════════════════════════ */
  const ws2 = wb.addWorksheet("상태별 요약");
  ws2.columns = [
    { key: "status", width: 20 },
    { key: "count", width: 14 },
    { key: "pct", width: 12 },
  ];

  applyTitleRow(ws2, "A1:C1", `${korMonth} 수강생 상태별 요약`);
  ws2.addRow([]);

  const h2 = ws2.addRow(["상태", "인원", "비중"]);
  applyHeaderRow(h2);

  for (const s of STATUSES) {
    const count = grandTotals[s] ?? 0;
    const pct = grandTotal > 0 ? count / grandTotal : 0;
    const row = ws2.addRow([STATUS_LABEL[s], count, pct]);
    row.height = 20;
    row.getCell(1).font = { color: { argb: STATUS_ARGB[s] }, bold: count > 0 };
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(2).font = { color: { argb: count > 0 ? STATUS_ARGB[s] : "FFD1D5DB" }, bold: count > 0 };
    row.getCell(3).numFmt = "0.0%";
    row.getCell(3).alignment = { horizontal: "right" };
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
  }

  ws2.addRow([]);
  const totRow2 = ws2.addRow(["합 계", grandTotal, 1]);
  applyTotalRow(totRow2);
  totRow2.getCell(3).numFmt = "0.0%";

  ws2.addRow([]);
  const noteRow = ws2.addRow([`※ 조회 기준: ${korMonth} 말일까지 생성된 수강 등록 건의 현재 상태`]);
  ws2.mergeCells(`A${noteRow.number}:C${noteRow.number}`);
  noteRow.getCell(1).font = { italic: true, color: { argb: "FF6B7280" }, size: 10 };

  ws2.views = [{ state: "frozen", ySplit: 3 }];

  /* ── 응답 ── */
  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `수강생현황_${monthStr}.xlsx`;
  const encodedName = encodeURIComponent(fileName);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store",
    },
  });
}
