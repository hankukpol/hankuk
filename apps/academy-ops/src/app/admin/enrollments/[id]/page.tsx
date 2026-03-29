import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EnrollmentDetailClient } from "./enrollment-detail-client";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

export type LeaveRecordRow = {
  id: string;
  leaveDate: string;
  returnDate: string | null;
  reason: string | null;
};

export type AuditLogRow = {
  id: number;
  action: string;
  adminName: string;
  before: unknown;
  after: unknown;
  createdAt: string;
};

export type EnrollmentDetailData = {
  id: string;
  examNumber: string;
  courseType: string;
  startDate: string;
  endDate: string | null;
  regularFee: number;
  discountAmount: number;
  finalFee: number;
  status: string;
  enrollSource: string | null;
  isRe: boolean;
  createdAt: string;
  studentName: string;
  studentPhone: string | null;
  cohortId: string | null;
  cohortName: string | null;
  productName: string | null;
  specialLectureName: string | null;
  staffName: string;
  leaveRecords: LeaveRecordRow[];
  contractExists: boolean;
  contractPrintedAt: string | null;
  auditLogs: AuditLogRow[];
};

export default async function EnrollmentDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { modal?: string; leaveRecordId?: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const [enrollment, contract, auditLogs] = await Promise.all([
    prisma.courseEnrollment.findUnique({
      where: { id: params.id },
      include: {
        student: { select: { name: true, phone: true } },
        cohort: { select: { name: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
        staff: { select: { name: true } },
        leaveRecords: { orderBy: { leaveDate: "desc" } },
      },
    }),
    prisma.courseContract.findUnique({
      where: { enrollmentId: params.id },
      select: { printedAt: true },
    }),
    prisma.auditLog.findMany({
      where: { targetId: params.id, targetType: "courseEnrollment" },
      include: { admin: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!enrollment) notFound();

  const data: EnrollmentDetailData = {
    id: enrollment.id,
    examNumber: enrollment.examNumber,
    courseType: enrollment.courseType,
    startDate: enrollment.startDate.toISOString(),
    endDate: enrollment.endDate ? enrollment.endDate.toISOString() : null,
    regularFee: enrollment.regularFee,
    discountAmount: enrollment.discountAmount,
    finalFee: enrollment.finalFee,
    status: enrollment.status,
    enrollSource: enrollment.enrollSource,
    isRe: enrollment.isRe,
    createdAt: enrollment.createdAt.toISOString(),
    studentName: enrollment.student.name,
    studentPhone: enrollment.student.phone,
    cohortId: enrollment.cohortId ?? null,
    cohortName: enrollment.cohort?.name ?? null,
    productName: enrollment.product?.name ?? null,
    specialLectureName: enrollment.specialLecture?.name ?? null,
    staffName: enrollment.staff.name,
    leaveRecords: enrollment.leaveRecords.map((l) => ({
      id: l.id,
      leaveDate: l.leaveDate.toISOString(),
      returnDate: l.returnDate ? l.returnDate.toISOString() : null,
      reason: l.reason,
    })),
    contractExists: contract !== null,
    contractPrintedAt: contract?.printedAt ? contract.printedAt.toISOString() : null,
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      adminName: log.admin.name,
      before: log.before,
      after: log.after,
      createdAt: log.createdAt.toISOString(),
    })),
  };

  const courseName =
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    "수강 상세";

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수강 관리", href: "/admin/enrollments" },
          { label: "수강 목록", href: "/admin/enrollments" },
          { label: `${enrollment.student.name} - ${courseName}` },
        ]}
      />
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>
      <div className="mt-4 flex items-center gap-4">
        <h1 className="text-3xl font-semibold">수강 상세</h1>
        <Link
          href="/admin/enrollments"
          className="text-sm text-slate transition hover:text-ember"
        >
          ← 목록
        </Link>
        <Link
          href={`/admin/students/${enrollment.examNumber}?tab=enrollments`}
          className="text-sm text-slate transition hover:text-ember"
        >
          학생 수강 탭 →
        </Link>
      </div>
      <div className="mt-8 max-w-3xl">
        <EnrollmentDetailClient
          enrollment={data}
          initialModal={searchParams?.modal}
          initialLeaveRecordId={searchParams?.leaveRecordId}
        />
      </div>
    </div>
  );
}

