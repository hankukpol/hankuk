import { AdminRole, CourseType, EnrollmentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireApiAdmin } from "@/lib/api-auth";
import { applyAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";

const FOREST = "FF1F4D3A";
const WHITE = "FFFFFFFF";
const MIST = "FFF7F4EF";
const LIGHT_GRAY = "FFF2F2F2";

const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: "접수",
  ACTIVE: "수강 중",
  WAITING: "대기",
  SUSPENDED: "휴원",
  COMPLETED: "수강 종료",
  WITHDRAWN: "자퇴",
  CANCELLED: "취소",
};

const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강",
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function applyHeaderRow(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sp = request.nextUrl.searchParams;
  const academyId = resolveVisibleAcademyId(auth.context);
  const startDate = sp.get("startDate") ?? "";
  const endDate = sp.get("endDate") ?? "";
  const cohortId = sp.get("cohortId") ?? "";
  const status = sp.get("status") as EnrollmentStatus | null;
  const courseType = sp.get("courseType") as CourseType | null;

  const fromDate = startDate ? new Date(`${startDate}T00:00:00`) : undefined;
  const toDate = endDate ? new Date(`${endDate}T23:59:59`) : undefined;

  const where = applyAcademyScope(
    {
      ...(cohortId ? { cohortId } : {}),
      ...(status ? { status } : {}),
      ...(courseType ? { courseType } : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    academyId,
  );

  const enrollments = await getPrisma().courseEnrollment.findMany({
    where,
    include: {
      student: { select: { name: true, examNumber: true, phone: true } },
      cohort: { select: { name: true, startDate: true, endDate: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
      staff: { select: { name: true } },
    },
    orderBy: { student: { examNumber: "asc" } },
    take: 5000,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "학원 통합 운영 시스템";
  wb.created = new Date();

  const ws = wb.addWorksheet("수강대장");

  ws.columns = [
    { key: "no", width: 6 },
    { key: "examNumber", width: 14 },
    { key: "name", width: 12 },
    { key: "phone", width: 16 },
    { key: "courseName", width: 30 },
    { key: "courseType", width: 14 },
    { key: "startDate", width: 14 },
    { key: "endDate", width: 14 },
    { key: "finalFee", width: 14 },
    { key: "status", width: 12 },
    { key: "createdAt", width: 14 },
    { key: "staff", width: 12 },
  ];

  const today = new Date();
  const todayStr = formatDate(today);
  ws.mergeCells("A1:L1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `학원 수강대장 출력 (${todayStr})`;
  titleCell.font = { bold: true, size: 14, color: { argb: FOREST } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MIST } };
  ws.getRow(1).height = 32;

  const filterParts: string[] = [];
  if (startDate || endDate) filterParts.push(`등록일: ${startDate || "~"} ~ ${endDate || "오늘"}`);
  if (courseType) filterParts.push(`유형: ${COURSE_TYPE_LABEL[courseType]}`);
  if (status) filterParts.push(`상태: ${STATUS_LABEL[status]}`);
  filterParts.push(`총 ${enrollments.length}건`);

  ws.mergeCells("A2:L2");
  const filterCell = ws.getCell("A2");
  filterCell.value = filterParts.join("  |  ");
  filterCell.font = { size: 10, color: { argb: "FF6B7280" } };
  filterCell.alignment = { horizontal: "center", vertical: "middle" };
  filterCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAFA" } };
  ws.getRow(2).height = 18;

  ws.addRow([]);

  const headerRow = ws.addRow([
    "번호",
    "학번",
    "이름",
    "연락처",
    "강좌명",
    "수강유형",
    "수강시작",
    "수강종료",
    "수강료",
    "상태",
    "등록일",
    "담당자",
  ]);
  applyHeaderRow(headerRow);

  enrollments.forEach((enrollment, idx) => {
    const courseName =
      enrollment.cohort?.name ?? enrollment.specialLecture?.name ?? enrollment.product?.name ?? "-";

    const row = ws.addRow([
      idx + 1,
      enrollment.student.examNumber,
      enrollment.student.name,
      enrollment.student.phone ?? "-",
      courseName,
      COURSE_TYPE_LABEL[enrollment.courseType],
      formatDate(enrollment.startDate),
      enrollment.endDate ? formatDate(enrollment.endDate) : "-",
      enrollment.finalFee,
      STATUS_LABEL[enrollment.status],
      formatDate(enrollment.createdAt),
      enrollment.staff?.name ?? "-",
    ]);

    row.height = 18;
    const isEven = idx % 2 === 0;

    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isEven ? WHITE : LIGHT_GRAY },
      };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
      cell.alignment = { vertical: "middle" };
    });

    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(8).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(9).numFmt = '#,##0"원"';
    row.getCell(9).alignment = { horizontal: "right", vertical: "middle" };
    row.getCell(10).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(11).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(12).alignment = { horizontal: "center", vertical: "middle" };
  });

  if (enrollments.length > 0) {
    const totalFee = enrollments.reduce((sum, enrollment) => sum + enrollment.finalFee, 0);
    const totalRow = ws.addRow([
      "",
      "합계",
      `${enrollments.length}명`,
      "",
      "",
      "",
      "",
      "",
      totalFee,
      "",
      "",
      "",
    ]);
    totalRow.height = 22;
    totalRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    totalRow.getCell(9).numFmt = '#,##0"원"';
  }

  ws.views = [{ state: "frozen", ySplit: 4 }];

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `수강대장_${todayStr}.xlsx`;
  const encodedName = encodeURIComponent(fileName);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store",
    },
  });
}