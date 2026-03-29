import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SpecialLectureManager } from "./special-lecture-manager";

export const dynamic = "force-dynamic";

export default async function SpecialLecturesPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const lectures = await getPrisma().specialLecture.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    include: {
      subjects: {
        include: { instructor: { select: { name: true } } },
        orderBy: { sortOrder: "asc" },
      },
      _count: {
        select: {
          enrollments: { where: { status: { in: ["ACTIVE", "PENDING"] } } },
        },
      },
    },
  });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [thisMonthEnrollCount, totalEnrollCount] = await Promise.all([
    getPrisma().courseEnrollment.count({
      where: {
        courseType: "SPECIAL_LECTURE",
        status: { in: ["ACTIVE", "PENDING", "COMPLETED"] },
        startDate: { gte: startOfMonth, lte: endOfMonth },
      },
    }),
    getPrisma().courseEnrollment.count({
      where: {
        courseType: "SPECIAL_LECTURE",
        status: { in: ["ACTIVE", "PENDING", "COMPLETED"] },
      },
    }),
  ]);

  const serialized = lectures.map((l) => ({
    id: l.id,
    name: l.name,
    lectureType: l.lectureType,
    examCategory: l.examCategory,
    startDate: l.startDate.toISOString(),
    endDate: l.endDate.toISOString(),
    isMultiSubject: l.isMultiSubject,
    fullPackagePrice: l.fullPackagePrice,
    maxCapacityOffline: l.maxCapacityOffline,
    maxCapacityLive: l.maxCapacityLive,
    isActive: l.isActive,
    createdAt: l.createdAt.toISOString(),
    enrolledCount: l._count.enrollments,
    instructorNames: Array.from(
      new Set(l.subjects.map((s) => s.instructor.name)),
    ),
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        특강 단과
      </div>
      <h1 className="mt-5 text-3xl font-semibold">특강 단과 관리</h1>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
        특강·단과 강좌를 등록하고 수강생 현황을 조회합니다.
      </p>

      {/* Quick-access shortcuts */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/special-lectures/interview-coaching"
          className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/10 px-5 py-2.5 text-sm font-semibold text-ember transition hover:bg-ember/20"
        >
          면접 코칭반 대시보드
        </Link>
      </div>

      <div className="mt-8">
        <SpecialLectureManager
          initialLectures={serialized}
          thisMonthEnrollCount={thisMonthEnrollCount}
          totalEnrollCount={totalEnrollCount}
        />
      </div>
    </div>
  );
}
