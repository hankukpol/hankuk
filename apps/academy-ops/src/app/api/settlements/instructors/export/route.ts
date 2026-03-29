import { AdminRole } from "@prisma/client";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

function parseMonthParam(param: string | null): string {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    return param;
  }
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

const EMBER = "FFC55A11";
const FOREST = "FF1F4D3A";
const MIST = "FFF7F4EF";
const LIGHT_GRAY = "FFF2F2F2";
const WHITE = "FFFFFFFF";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sp = request.nextUrl.searchParams;
  const monthStr = parseMonthParam(sp.get("month"));
  const [yearStr, monStr] = monthStr.split("-");
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monStr, 10);

  const firstDay = new Date(year, mon - 1, 1);
  const lastDay = new Date(year, mon, 0, 23, 59, 59, 999);

  // Fetch data
  const instructors = await getPrisma().instructor.findMany({
    where: { isActive: true },
    include: {
      lectureSubjects: {
        include: {
          lecture: {
            select: {
              id: true,
              name: true,
              isActive: true,
              startDate: true,
              endDate: true,
              _count: {
                select: {
                  enrollments: {
                    where: {
                      status: { in: ["ACTIVE", "COMPLETED"] },
                      startDate: { lte: lastDay },
                      OR: [
                        { endDate: { gte: firstDay } },
                        { endDate: null },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  type LectureRow = {
    lectureName: string;
    subjectName: string;
    enrolledCount: number;
    price: number;
    totalRevenue: number;
    instructorRate: number;
    instructorAmount: number;
    academyAmount: number;
  };

  type InstructorRow = {
    instructorName: string;
    subject: string;
    lectures: LectureRow[];
    totalRevenue: number;
    totalInstructorAmount: number;
    totalAcademyAmount: number;
  };

  const rows: InstructorRow[] = instructors
    .map((instructor) => {
      const lectures = instructor.lectureSubjects
        .filter((subject) => {
          const lec = subject.lecture;
          const lectureStart = new Date(lec.startDate);
          const lectureEnd = lec.endDate ? new Date(lec.endDate) : null;
          return (
            lectureStart <= lastDay && (lectureEnd === null || lectureEnd >= firstDay)
          );
        })
        .map((subject) => {
          const enrolledCount = subject.lecture._count.enrollments;
          const totalRevenue = enrolledCount * subject.price;
          const instructorAmount = Math.floor(totalRevenue * (subject.instructorRate / 100));
          const academyAmount = totalRevenue - instructorAmount;
          return {
            lectureName: subject.lecture.name,
            subjectName: subject.subjectName,
            enrolledCount,
            price: subject.price,
            totalRevenue,
            instructorRate: subject.instructorRate,
            instructorAmount,
            academyAmount,
          };
        });

      const totalRevenue = lectures.reduce((s, l) => s + l.totalRevenue, 0);
      const totalInstructorAmount = lectures.reduce((s, l) => s + l.instructorAmount, 0);
      const totalAcademyAmount = totalRevenue - totalInstructorAmount;

      return {
        instructorName: instructor.name,
        subject: instructor.subject,
        lectures,
        totalRevenue,
        totalInstructorAmount,
        totalAcademyAmount,
      };
    })
    .filter((r) => r.lectures.length > 0);

  // Build workbook
  const wb = new ExcelJS.Workbook();
  wb.creator = "학원 통합 운영 시스템";
  wb.created = new Date();

  const sheetName = `${year}년 ${mon}월 강사 정산서`;
  const ws = wb.addWorksheet(sheetName);

  // Column widths
  ws.columns = [
    { key: "instructorName", width: 14 },
    { key: "lectureName",    width: 28 },
    { key: "subjectName",    width: 18 },
    { key: "enrolledCount",  width: 12 },
    { key: "price",          width: 14 },
    { key: "totalRevenue",   width: 16 },
    { key: "instructorRate", width: 10 },
    { key: "instructorAmount", width: 16 },
    { key: "academyAmount",  width: 16 },
  ];

  // Title row
  ws.mergeCells("A1:I1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `${year}년 ${mon}월 강사 정산서`;
  titleCell.font = { bold: true, size: 14, color: { argb: FOREST } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MIST } };
  ws.getRow(1).height = 32;

  // Blank separator row
  ws.addRow([]);

  // Header row
  const headerRow = ws.addRow([
    "강사명",
    "강좌명",
    "과목",
    "수강생수",
    "단가",
    "총매출",
    "배분율",
    "강사금액",
    "학원금액",
  ]);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    };
  });

  // Data rows
  let grandRevenue = 0;
  let grandInstructor = 0;
  let grandAcademy = 0;

  for (const row of rows) {
    // Detail rows for each lecture-subject under this instructor
    for (let i = 0; i < row.lectures.length; i++) {
      const lec = row.lectures[i];
      const dataRow = ws.addRow([
        i === 0 ? row.instructorName : "",   // Only show instructor name on first row
        lec.lectureName,
        lec.subjectName,
        lec.enrolledCount,
        lec.price,
        lec.totalRevenue,
        `${lec.instructorRate}%`,
        lec.instructorAmount,
        lec.academyAmount,
      ]);
      dataRow.height = 18;

      // Style cells
      dataRow.getCell(1).font = i === 0 ? { bold: true } : {};
      dataRow.getCell(4).alignment = { horizontal: "right" };
      dataRow.getCell(5).numFmt = '#,##0"원"';
      dataRow.getCell(6).numFmt = '#,##0"원"';
      dataRow.getCell(7).alignment = { horizontal: "center" };
      dataRow.getCell(8).numFmt = '#,##0"원"';
      dataRow.getCell(8).font = { color: { argb: EMBER } };
      dataRow.getCell(9).numFmt = '#,##0"원"';
      dataRow.getCell(9).font = { color: { argb: FOREST } };

      dataRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
        cell.border = {
          bottom: { style: "hair", color: { argb: "FFDDDDDD" } },
        };
      });
    }

    // Subtotal row per instructor (bold)
    const subtotalRow = ws.addRow([
      `${row.instructorName} 소계`,
      "",
      "",
      "",
      "",
      row.totalRevenue,
      "",
      row.totalInstructorAmount,
      row.totalAcademyAmount,
    ]);
    subtotalRow.height = 20;
    ws.mergeCells(`A${subtotalRow.number}:E${subtotalRow.number}`);

    subtotalRow.getCell(1).font = { bold: true };
    subtotalRow.getCell(1).alignment = { horizontal: "right" };
    subtotalRow.getCell(6).numFmt = '#,##0"원"';
    subtotalRow.getCell(6).font = { bold: true };
    subtotalRow.getCell(8).numFmt = '#,##0"원"';
    subtotalRow.getCell(8).font = { bold: true, color: { argb: EMBER } };
    subtotalRow.getCell(9).numFmt = '#,##0"원"';
    subtotalRow.getCell(9).font = { bold: true, color: { argb: FOREST } };

    subtotalRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
      };
    });

    grandRevenue += row.totalRevenue;
    grandInstructor += row.totalInstructorAmount;
    grandAcademy += row.totalAcademyAmount;
  }

  // Grand total row
  const totalRow = ws.addRow([
    "합 계",
    "",
    "",
    "",
    "",
    grandRevenue,
    "",
    grandInstructor,
    grandAcademy,
  ]);
  totalRow.height = 24;
  ws.mergeCells(`A${totalRow.number}:E${totalRow.number}`);

  totalRow.getCell(1).font = { bold: true, size: 12, color: { argb: WHITE } };
  totalRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  totalRow.getCell(6).numFmt = '#,##0"원"';
  totalRow.getCell(6).font = { bold: true, size: 12, color: { argb: WHITE } };
  totalRow.getCell(8).numFmt = '#,##0"원"';
  totalRow.getCell(8).font = { bold: true, size: 12, color: { argb: WHITE } };
  totalRow.getCell(9).numFmt = '#,##0"원"';
  totalRow.getCell(9).font = { bold: true, size: 12, color: { argb: WHITE } };

  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.border = {
      top: { style: "medium", color: { argb: "FF000000" } },
    };
  });

  // Freeze header rows (title + blank + header = row 3)
  ws.views = [{ state: "frozen", ySplit: 3 }];

  // Write buffer and return response
  const buffer = await wb.xlsx.writeBuffer();

  const fileName = `강사정산_${monthStr}.xlsx`;
  const encodedName = encodeURIComponent(fileName);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store",
    },
  });
}
