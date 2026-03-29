import { AdminRole, SettlementStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

function parseMonthParam(param: string | null): string {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    return param;
  }
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const monthStr = parseMonthParam(sp.get("month"));
  const [yearStr, monStr] = monthStr.split("-");
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monStr, 10);

  const firstDay = new Date(year, mon - 1, 1);
  const lastDay = new Date(year, mon, 0, 23, 59, 59, 999);

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

  const rows = instructors.map((instructor) => {
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
          lectureId: subject.lectureId,
          lectureName: subject.lecture.name,
          subjectName: subject.subjectName,
          price: subject.price,
          instructorRate: subject.instructorRate,
          enrolledCount,
          totalRevenue,
          instructorAmount,
          academyAmount,
        };
      });

    const totalRevenue = lectures.reduce((s, l) => s + l.totalRevenue, 0);
    const totalInstructorAmount = lectures.reduce((s, l) => s + l.instructorAmount, 0);
    const totalAcademyAmount = totalRevenue - totalInstructorAmount;

    return {
      instructorId: instructor.id,
      instructorName: instructor.name,
      subject: instructor.subject,
      lectures,
      totalRevenue,
      totalInstructorAmount,
      totalAcademyAmount,
    };
  });

  const activeRows = rows.filter((r) => r.lectures.length > 0);

  // 각 강사별 정산 완료 기록 조회
  const instructorIds = activeRows.map((r) => r.instructorId);
  const settlementRecords = instructorIds.length > 0
    ? await getPrisma().specialLectureSettlement.findMany({
        where: {
          specialLectureId: `SUMMARY_${monthStr}`,
          instructorId: { in: instructorIds },
          settlementMonth: monthStr,
        },
      })
    : [];

  const settlementMap = new Map(settlementRecords.map((r) => [r.instructorId, r]));

  const rowsWithStatus = activeRows.map((row) => {
    const record = settlementMap.get(row.instructorId);
    return {
      ...row,
      settlementStatus: (record?.status ?? null) as SettlementStatus | null,
      paidAt: record?.paidAt ? record.paidAt.toISOString() : null,
    };
  });

  const grandTotalRevenue = rowsWithStatus.reduce((s, r) => s + r.totalRevenue, 0);
  const grandTotalInstructor = rowsWithStatus.reduce((s, r) => s + r.totalInstructorAmount, 0);
  const grandTotalAcademy = rowsWithStatus.reduce((s, r) => s + r.totalAcademyAmount, 0);

  return NextResponse.json({
    data: {
      month: monthStr,
      rows: rowsWithStatus,
      summary: {
        totalRevenue: grandTotalRevenue,
        totalInstructorAmount: grandTotalInstructor,
        totalAcademyAmount: grandTotalAcademy,
      },
    },
  });
}
