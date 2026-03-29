import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EnrollmentForm } from "@/components/enrollments/enrollment-form";

export const dynamic = "force-dynamic";

export default async function NewEnrollmentPage({
  searchParams,
}: {
  searchParams: { examNumber?: string; renew?: string; type?: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);
  const isInterviewCoachingMode = searchParams.type === "interview-coaching";
  const pageBadge = isInterviewCoachingMode ? "수강 관리 · 면접 코칭반 등록" : "수강 관리 · 신규 등록";
  const pageTitle = isInterviewCoachingMode ? "면접 코칭반 등록" : "수강 등록";
  const pageDescription = isInterviewCoachingMode
    ? "학생을 검색하여 선택한 뒤, 면접 코칭 강좌와 응시청·직급·조 편성 정보를 입력해 등록합니다."
    : "학생을 검색하여 선택한 뒤, 수강 유형과 기수, 수강료를 입력하여 등록합니다.";

  const [products, cohorts, specialLectures] = await Promise.all([
    getPrisma().comprehensiveCourseProduct.findMany({
      where: { isActive: true },
      orderBy: [{ examCategory: "asc" }, { durationMonths: "asc" }],
    }),
    getPrisma().cohort.findMany({
      where: { isActive: true },
      orderBy: [{ startDate: "desc" }],
    }),
    getPrisma().specialLecture.findMany({
      where: { isActive: true },
      orderBy: [{ startDate: "desc" }],
      include: {
        subjects: {
          include: { instructor: { select: { name: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        {pageBadge}
      </div>
      <h1 className="mt-5 text-3xl font-semibold">{pageTitle}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-8 text-slate sm:text-base">
        {pageDescription}
      </p>
      <div className="mt-8">
        <EnrollmentForm
          initialProducts={products as any}
          initialCohorts={cohorts as any}
          initialExamNumber={searchParams.examNumber}
          initialMode={isInterviewCoachingMode ? "interview-coaching" : "default"}
          initialSpecialLectures={specialLectures.map((l) => ({
            id: l.id,
            name: l.name,
            lectureType: l.lectureType,
            examCategory: l.examCategory ?? null,
            startDate: l.startDate.toISOString().slice(0, 10),
            endDate: l.endDate.toISOString().slice(0, 10),
            isMultiSubject: l.isMultiSubject,
            fullPackagePrice: l.fullPackagePrice,
            subjects: l.subjects.map((s) => ({
              id: s.id,
              subjectName: s.subjectName,
              instructorName: s.instructor.name,
              price: s.price,
              instructorRate: s.instructorRate,
            })),
          }))}
        />
      </div>
    </div>
  );
}
