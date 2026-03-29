import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { InstructorSubjectsClient } from "./instructor-subjects-client";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export type InstructorSubjectRow = {
  id: string;
  lectureId: string;
  lectureName: string;
  lectureType: string;
  lectureStartDate: string;
  lectureEndDate: string;
  lectureIsActive: boolean;
  subjectName: string;
  price: number;
  instructorRate: number;
  sortOrder: number;
};

export type SpecialLectureOption = {
  id: string;
  name: string;
  lectureType: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export default async function InstructorSubjectsPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);
  const { id } = await params;

  const [instructor, allLectures] = await Promise.all([
    getPrisma().instructor.findUnique({
      where: { id },
      include: {
        lectureSubjects: {
          include: {
            lecture: {
              select: {
                id: true,
                name: true,
                lectureType: true,
                startDate: true,
                endDate: true,
                isActive: true,
              },
            },
          },
          orderBy: [{ lecture: { startDate: "desc" } }, { sortOrder: "asc" }],
        },
      },
    }),
    getPrisma().specialLecture.findMany({
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      select: {
        id: true,
        name: true,
        lectureType: true,
        startDate: true,
        endDate: true,
        isActive: true,
      },
    }),
  ]);

  if (!instructor) notFound();

  const subjectRows: InstructorSubjectRow[] = instructor.lectureSubjects.map((ls) => ({
    id: ls.id,
    lectureId: ls.lectureId,
    lectureName: ls.lecture.name,
    lectureType: ls.lecture.lectureType,
    lectureStartDate: ls.lecture.startDate.toISOString(),
    lectureEndDate: ls.lecture.endDate.toISOString(),
    lectureIsActive: ls.lecture.isActive,
    subjectName: ls.subjectName,
    price: ls.price,
    instructorRate: ls.instructorRate,
    sortOrder: ls.sortOrder,
  }));

  const lectureOptions: SpecialLectureOption[] = allLectures.map((l) => ({
    id: l.id,
    name: l.name,
    lectureType: l.lectureType,
    startDate: l.startDate.toISOString(),
    endDate: l.endDate.toISOString(),
    isActive: l.isActive,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/settings/instructors" className="hover:text-ink">
          강사 목록
        </Link>
        <span>/</span>
        <Link href={`/admin/settings/instructors/${id}`} className="hover:text-ink">
          {instructor.name}
        </Link>
        <span>/</span>
        <span className="text-ink">담당 과목</span>
      </nav>

      <div className="mt-5 inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        강사 과목 배정
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">{instructor.name} — 담당 과목 관리</h1>
          <p className="mt-2 text-sm text-slate">
            강사가 담당하는 특강 과목을 조회하고 추가·수정·삭제합니다.
          </p>
        </div>
        <Link
          href={`/admin/settings/instructors/${id}`}
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          ← 강사 상세
        </Link>
      </div>

      <div className="mt-8">
        <InstructorSubjectsClient
          instructorId={id}
          instructorName={instructor.name}
          subjectRows={subjectRows}
          lectureOptions={lectureOptions}
        />
      </div>
    </div>
  );
}
