import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { EnrollmentEditForm } from "./enrollment-edit-form";

export const dynamic = "force-dynamic";

export default async function EnrollmentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const prisma = getPrisma();

  const [enrollment, cohorts] = await Promise.all([
    prisma.courseEnrollment.findUnique({
      where: { id },
      include: {
        student: { select: { name: true, examNumber: true } },
        cohort: { select: { id: true, name: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
      },
    }),
    prisma.cohort.findMany({
      where: { isActive: true },
      select: { id: true, name: true, startDate: true, endDate: true },
      orderBy: { startDate: "desc" },
    }),
  ]);

  if (!enrollment) notFound();

  const extraData = enrollment.extraData as Record<string, unknown> | null;
  const note = typeof extraData?.note === "string" ? extraData.note : "";

  const courseName =
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    "수강";

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수강 관리", href: "/admin/enrollments" },
          { label: "수강 상세", href: `/admin/enrollments/${id}` },
          { label: "수정" },
        ]}
      />
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>
      <div className="mt-4">
        <h1 className="text-3xl font-semibold">수강 정보 수정</h1>
        <p className="mt-1 text-sm text-slate">
          {enrollment.student.name} ({enrollment.student.examNumber}) — {courseName}
        </p>
      </div>
      <div className="mt-8 max-w-xl">
        <EnrollmentEditForm
          enrollmentId={id}
          initialStatus={enrollment.status}
          initialCohortId={enrollment.cohortId ?? null}
          initialEndDate={enrollment.endDate ? enrollment.endDate.toISOString().split("T")[0] : ""}
          initialDiscountAmount={enrollment.discountAmount}
          initialFinalFee={enrollment.finalFee}
          initialEnrollSource={enrollment.enrollSource ?? null}
          initialNote={note}
          courseType={enrollment.courseType}
          cohorts={cohorts.map((c) => ({
            id: c.id,
            name: c.name,
            startDate: c.startDate.toISOString(),
            endDate: c.endDate.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
