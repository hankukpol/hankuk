import { AdminRole, PassType } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { GraduateDetailClient } from "./graduate-detail-client";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

export type GraduateDetail = {
  id: string;
  examNumber: string;
  examName: string;
  passType: PassType;
  writtenPassDate: string | null;
  finalPassDate: string | null;
  appointedDate: string | null;
  enrolledMonths: number | null;
  testimony: string | null;
  isPublic: boolean;
  note: string | null;
  createdAt: string;
  student: {
    name: string;
    mobile: string | null;
    generation: number | null;
    examType: string;
    courseEnrollmentCount: number;
  };
  staff: { name: string };
  scoreSnapshots: Array<{
    id: string;
    snapshotType: PassType;
    totalEnrolledMonths: number;
    overallAverage: number | null;
    finalMonthAverage: number | null;
    attendanceRate: number | null;
    subjectAverages: Record<string, number>;
    monthlyAverages: Array<{ month: string; avg: number }>;
    first3MonthsAvg: number | null;
    last3MonthsAvg: number | null;
    createdAt: string;
  }>;
};

type PageProps = { params: Promise<{ id: string }> };

export default async function GraduateDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { id } = await params;

  const record = await getPrisma().graduateRecord.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
          generation: true,
          examType: true,
          _count: { select: { courseEnrollments: true } },
        },
      },
      staff: { select: { name: true } },
      scoreSnapshots: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!record) notFound();

  const detail: GraduateDetail = {
    ...record,
    writtenPassDate: record.writtenPassDate?.toISOString() ?? null,
    finalPassDate: record.finalPassDate?.toISOString() ?? null,
    appointedDate: record.appointedDate?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    student: {
      name: record.student.name,
      mobile: record.student.phone ?? null,
      generation: record.student.generation,
      examType: record.student.examType,
      courseEnrollmentCount: record.student._count.courseEnrollments,
    },
    scoreSnapshots: record.scoreSnapshots.map((s) => ({
      id: s.id,
      snapshotType: s.snapshotType,
      totalEnrolledMonths: s.totalEnrolledMonths,
      overallAverage: s.overallAverage,
      finalMonthAverage: s.finalMonthAverage,
      attendanceRate: s.attendanceRate,
      subjectAverages: s.subjectAverages as Record<string, number>,
      monthlyAverages: s.monthlyAverages as Array<{ month: string; avg: number }>,
      first3MonthsAvg: s.first3MonthsAvg,
      last3MonthsAvg: s.last3MonthsAvg,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "판정 관리", href: "/admin/graduates" },
          { label: "합격자 관리", href: "/admin/graduates" },
          { label: record.student.name },
        ]}
      />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
            합격자 상세
          </div>
          <h1 className="mt-4 text-3xl font-semibold">
            {record.student.name}
            <span className="ml-2 text-lg font-normal text-slate">
              {record.student.generation ? `${record.student.generation}기` : ""}
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href="/admin/graduates"
            className="rounded-[20px] border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-ink/40 hover:text-ink"
          >
            ← 목록으로
          </Link>
          <Link
            href={`/admin/graduates/${id}/score-journey`}
            className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
          >
            성적 궤적 보기 →
          </Link>
          <Link
            href={`/admin/students/${record.examNumber}`}
            className="rounded-[20px] border border-forest/30 bg-forest/5 px-4 py-2 text-sm font-medium text-forest transition-colors hover:bg-forest/10"
          >
            학생 프로필 →
          </Link>
        </div>
      </div>

      <GraduateDetailClient detail={detail} />
    </div>
  );
}
