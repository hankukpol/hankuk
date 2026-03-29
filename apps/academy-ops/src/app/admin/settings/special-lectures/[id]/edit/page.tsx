import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { SpecialLectureEditForm } from "./special-lecture-edit-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function SpecialLectureEditPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const { id } = await params;

  const lecture = await getPrisma().specialLecture.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      lectureType: true,
      examCategory: true,
      startDate: true,
      endDate: true,
      isMultiSubject: true,
      fullPackagePrice: true,
      hasSeatAssignment: true,
      hasLive: true,
      hasOffline: true,
      maxCapacityLive: true,
      maxCapacityOffline: true,
      waitlistAllowed: true,
      isActive: true,
    },
  });

  if (!lecture) notFound();

  const initialData = {
    id: lecture.id,
    name: lecture.name,
    lectureType: lecture.lectureType,
    examCategory: lecture.examCategory ?? null,
    startDate: lecture.startDate.toISOString(),
    endDate: lecture.endDate.toISOString(),
    isMultiSubject: lecture.isMultiSubject,
    fullPackagePrice: lecture.fullPackagePrice ?? null,
    hasSeatAssignment: lecture.hasSeatAssignment,
    hasLive: lecture.hasLive,
    hasOffline: lecture.hasOffline,
    maxCapacityLive: lecture.maxCapacityLive ?? null,
    maxCapacityOffline: lecture.maxCapacityOffline ?? null,
    waitlistAllowed: lecture.waitlistAllowed,
    isActive: lecture.isActive,
  };

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "설정", href: "/admin/settings/special-lectures" },
          { label: "특강 단과 관리", href: "/admin/settings/special-lectures" },
          { label: lecture.name, href: `/admin/settings/special-lectures/${id}` },
          { label: "수정" },
        ]}
      />

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            설정 · 특강 수정
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-ink">{lecture.name} 수정</h1>
          <p className="mt-2 text-sm text-slate">
            특강 기본 정보를 수정합니다. 과목별 강사/수강료는 상세 페이지에서 변경하세요.
          </p>
        </div>
        <div className="pt-1">
          <Link
            href={`/admin/settings/special-lectures/${id}`}
            className="rounded-[20px] border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-ink/40 hover:text-ink"
          >
            ← 상세로 돌아가기
          </Link>
        </div>
      </div>

      {/* Form */}
      <div className="mt-8 max-w-2xl">
        <SpecialLectureEditForm initial={initialData} />
      </div>
    </div>
  );
}
