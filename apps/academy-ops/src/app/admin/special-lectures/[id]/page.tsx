import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SpecialLectureDetailClient } from "./special-lecture-detail-client";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

export type SubjectRow = {
  id: string;
  subjectName: string;
  instructorId: string;
  instructorName: string;
  price: number;
  instructorRate: number;
  sortOrder: number;
};

export type EnrollmentRow = {
  id: string;
  examNumber: string;
  studentName: string;
  studentPhone: string | null;
  startDate: string;
  endDate: string | null;
  regularFee: number;
  discountAmount: number;
  finalFee: number;
  status: string;
  createdAt: string;
};

export type LectureDetailData = {
  id: string;
  name: string;
  lectureType: string;
  examCategory: string | null;
  startDate: string;
  endDate: string;
  isMultiSubject: boolean;
  fullPackagePrice: number | null;
  maxCapacityOffline: number | null;
  maxCapacityLive: number | null;
  hasLive: boolean;
  hasOffline: boolean;
  waitlistAllowed: boolean;
  isActive: boolean;
  createdAt: string;
  subjects: SubjectRow[];
  enrollments: EnrollmentRow[];
};

export default async function SpecialLectureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);
  const { id } = await params;

  const lecture = await getPrisma().specialLecture.findUnique({
    where: { id },
    include: {
      subjects: {
        include: {
          instructor: { select: { id: true, name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
      enrollments: {
        include: {
          student: { select: { name: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!lecture) notFound();

  const data: LectureDetailData = {
    id: lecture.id,
    name: lecture.name,
    lectureType: lecture.lectureType,
    examCategory: lecture.examCategory ?? null,
    startDate: lecture.startDate.toISOString(),
    endDate: lecture.endDate.toISOString(),
    isMultiSubject: lecture.isMultiSubject,
    fullPackagePrice: lecture.fullPackagePrice ?? null,
    maxCapacityOffline: lecture.maxCapacityOffline ?? null,
    maxCapacityLive: lecture.maxCapacityLive ?? null,
    hasLive: lecture.hasLive,
    hasOffline: lecture.hasOffline,
    waitlistAllowed: lecture.waitlistAllowed,
    isActive: lecture.isActive,
    createdAt: lecture.createdAt.toISOString(),
    subjects: lecture.subjects.map((s) => ({
      id: s.id,
      subjectName: s.subjectName,
      instructorId: s.instructorId,
      instructorName: s.instructor.name,
      price: s.price,
      instructorRate: s.instructorRate,
      sortOrder: s.sortOrder,
    })),
    enrollments: lecture.enrollments.map((e) => ({
      id: e.id,
      examNumber: e.examNumber,
      studentName: e.student.name,
      studentPhone: e.student.phone ?? null,
      startDate: e.startDate.toISOString(),
      endDate: e.endDate ? e.endDate.toISOString() : null,
      regularFee: e.regularFee,
      discountAmount: e.discountAmount,
      finalFee: e.finalFee,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    })),
  };

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수강 관리", href: "/admin/special-lectures" },
          { label: "특강 수강 현황", href: "/admin/special-lectures" },
          { label: lecture.name },
        ]}
      />
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        특강 단과
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-semibold">{lecture.name}</h1>
        <Link
          href="/admin/special-lectures"
          className="text-sm text-slate transition hover:text-ember"
        >
          ← 목록
        </Link>
      </div>
      <div className="mt-8">
        <SpecialLectureDetailClient lecture={data} />
      </div>
    </div>
  );
}
