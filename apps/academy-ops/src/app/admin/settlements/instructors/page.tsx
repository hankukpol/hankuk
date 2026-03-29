import { AdminRole, SettlementStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { InstructorSettlementView } from "@/components/settlements/instructor-settlement-view";

export const dynamic = "force-dynamic";

export type InstructorSettlementRow = {
  instructorId: string;
  instructorName: string;
  subject: string;
  lectures: Array<{
    lectureId: string;
    lectureName: string;
    subjectName: string;
    price: number;
    instructorRate: number;
    enrolledCount: number;
    totalRevenue: number;
    instructorAmount: number;
    academyAmount: number;
  }>;
  totalRevenue: number;
  totalInstructorAmount: number;
  totalAcademyAmount: number;
  settlementStatus: SettlementStatus | null;
  paidAt: string | null;
};

function parseMonthParam(param: string | null): string {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    return param;
  }
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export default async function InstructorSettlementsPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const monthStr = parseMonthParam(searchParams.month ?? null);
  const [yearStr, monStr] = monthStr.split("-");
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monStr, 10);

  // First day and last day of the requested month
  const firstDay = new Date(year, mon - 1, 1);
  const lastDay = new Date(year, mon, 0, 23, 59, 59, 999); // last ms of last day

  // Get all active instructors with their lecture subjects and month-filtered enrollment counts
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
                      // Enrollment's lecture must overlap with the requested month:
                      //   lecture.startDate <= lastDay of month
                      //   AND (lecture.endDate >= firstDay of month OR endDate is null)
                      // We filter on the enrollment's startDate/endDate instead:
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
        // Only include lectures whose period overlaps the requested month
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

  // Filter out instructors with no lectures in this month
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

  const rowsWithStatus: InstructorSettlementRow[] = activeRows.map((row) => {
    const record = settlementMap.get(row.instructorId);
    return {
      ...row,
      settlementStatus: record?.status ?? null,
      paidAt: record?.paidAt ? record.paidAt.toISOString() : null,
    };
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 정산
      </div>
      <h1 className="mt-5 text-3xl font-semibold">강사 정산</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        특강 강사별 수강료 배분 및 정산 현황을 조회합니다. 강사별 배분율은 강사 설정에서 특강 과목을
        등록할 때 설정됩니다.
      </p>
      <div className="mt-8">
        <InstructorSettlementView month={monthStr} rows={rowsWithStatus} />
      </div>
    </div>
  );
}
