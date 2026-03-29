import { AdminRole, ExamCategory, SpecialLectureType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SpecialLectureManager } from "./special-lecture-manager";

export const dynamic = "force-dynamic";

export type SpecialLectureRow = {
  id: string;
  name: string;
  lectureType: SpecialLectureType;
  examCategory: ExamCategory | null;
  startDate: string;
  endDate: string;
  isMultiSubject: boolean;
  fullPackagePrice: number | null;
  hasSeatAssignment: boolean;
  hasLive: boolean;
  hasOffline: boolean;
  maxCapacityLive: number | null;
  maxCapacityOffline: number | null;
  waitlistAllowed: boolean;
  isActive: boolean;
  enrollmentCount: number;
  subjects: {
    id: string;
    subjectName: string;
    instructorId: string;
    instructorName: string;
    price: number;
    instructorRate: number;
    sortOrder: number;
  }[];
};

export type InstructorOption = {
  id: string;
  name: string;
  subject: string;
};

export default async function SpecialLecturesPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const [lectures, instructors] = await Promise.all([
    getPrisma().specialLecture.findMany({
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      include: {
        subjects: {
          include: { instructor: { select: { id: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
        _count: {
          select: {
            enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } },
          },
        },
      },
    }),
    getPrisma().instructor.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, subject: true },
    }),
  ]);

  const rows: SpecialLectureRow[] = lectures.map((l) => ({
    id: l.id,
    name: l.name,
    lectureType: l.lectureType,
    examCategory: l.examCategory,
    startDate: l.startDate.toISOString().slice(0, 10),
    endDate: l.endDate.toISOString().slice(0, 10),
    isMultiSubject: l.isMultiSubject,
    fullPackagePrice: l.fullPackagePrice,
    hasSeatAssignment: l.hasSeatAssignment,
    hasLive: l.hasLive,
    hasOffline: l.hasOffline,
    maxCapacityLive: l.maxCapacityLive,
    maxCapacityOffline: l.maxCapacityOffline,
    waitlistAllowed: l.waitlistAllowed,
    isActive: l.isActive,
    enrollmentCount: l._count.enrollments,
    subjects: l.subjects.map((s) => ({
      id: s.id,
      subjectName: s.subjectName,
      instructorId: s.instructorId,
      instructorName: s.instructor.name,
      price: s.price,
      instructorRate: s.instructorRate,
      sortOrder: s.sortOrder,
    })),
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">특강 단과 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        특강 및 단과 강좌를 등록하고 과목별 강사·수강료·배분율을 설정합니다.
      </p>
      <div className="mt-8">
        <SpecialLectureManager initialRows={rows} instructors={instructors} />
      </div>
    </div>
  );
}
