import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { SuspensionForm, type EnrollmentOption } from "./suspension-form";

export const dynamic = "force-dynamic";

export default async function NewSuspensionPage({
  params,
}: {
  params: Promise<{ examNumber: string }>;
}) {
  const { examNumber } = await params;
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: { examNumber: true, name: true },
  });
  if (!student) notFound();

  // Only ACTIVE enrollments can be put on leave
  const activeEnrollments = await prisma.courseEnrollment.findMany({
    where: { examNumber, status: "ACTIVE" },
    include: {
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const enrollmentOptions: EnrollmentOption[] = activeEnrollments.map((e) => ({
    id: e.id,
    label:
      e.cohort?.name ??
      e.product?.name ??
      e.specialLecture?.name ??
      `수강 등록 (${e.id.slice(0, 8)})`,
  }));

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-[#F7F4EF] p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "학사 관리", href: "/admin/students" },
          { label: "전체 명단", href: "/admin/students" },
          {
            label: `${student.name} (${student.examNumber})`,
            href: `/admin/students/${examNumber}`,
          },
          {
            label: "휴원·복귀 관리",
            href: `/admin/students/${examNumber}/suspension`,
          },
          { label: "신규 휴원 신청" },
        ]}
      />

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            신규 휴원 신청
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-[#111827]">
            {student.name}
            <span className="ml-3 text-xl font-normal text-[#4B5563]">{student.examNumber}</span>
          </h1>
          <p className="mt-1 text-sm text-[#4B5563]">
            수강 중인 등록에 대해 휴원을 신청합니다.
          </p>
        </div>
        <Link
          href={`/admin/students/${examNumber}/suspension`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
        >
          ← 휴원 목록
        </Link>
      </div>

      {/* Form Card */}
      <div className="mx-auto max-w-2xl">
        <div className="rounded-[28px] border border-[#111827]/10 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-[#111827]">휴원 정보 입력</h2>
          <SuspensionForm
            examNumber={examNumber}
            enrollmentOptions={enrollmentOptions}
            today={today}
          />
        </div>
      </div>
    </div>
  );
}
