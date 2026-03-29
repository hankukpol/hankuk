import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { formatDate } from "@/lib/format";
import { LeaveRecordForm } from "./leave-record-form";

export const dynamic = "force-dynamic";

export type EnrollmentOption = {
  id: string;
  label: string;
  status: string;
};

export type LeaveRecordRow = {
  id: string;
  enrollmentId: string;
  enrollmentLabel: string;
  leaveDate: string;
  returnDate: string | null;
  reason: string | null;
  approvedByName: string | null;
};

export default async function StudentLeavePage({
  params,
}: {
  params: { examNumber: string };
}) {
  const { examNumber } = await Promise.resolve(params);
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: { examNumber: true, name: true },
  });

  if (!student) notFound();

  // Load all enrollments with leave records
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { examNumber },
    include: {
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
      leaveRecords: {
        orderBy: { leaveDate: "desc" },
        include: {
          enrollment: {
            select: {
              cohort: { select: { name: true } },
              product: { select: { name: true } },
              specialLecture: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get approved-by admin names
  const approvedByIds = new Set<string>();
  for (const enrollment of enrollments) {
    for (const lr of enrollment.leaveRecords) {
      if (lr.approvedBy) approvedByIds.add(lr.approvedBy);
    }
  }

  const adminMap: Record<string, string> = {};
  if (approvedByIds.size > 0) {
    const admins = await prisma.adminUser.findMany({
      where: { id: { in: Array.from(approvedByIds) } },
      select: { id: true, name: true },
    });
    for (const admin of admins) {
      adminMap[admin.id] = admin.name;
    }
  }

  // Build flat list of all leave records
  const allLeaveRecords: LeaveRecordRow[] = [];
  for (const enrollment of enrollments) {
    const enrollmentLabel =
      enrollment.cohort?.name ??
      enrollment.product?.name ??
      enrollment.specialLecture?.name ??
      "수강 등록";
    for (const lr of enrollment.leaveRecords) {
      allLeaveRecords.push({
        id: lr.id,
        enrollmentId: lr.enrollmentId,
        enrollmentLabel,
        leaveDate: lr.leaveDate.toISOString(),
        returnDate: lr.returnDate ? lr.returnDate.toISOString() : null,
        reason: lr.reason,
        approvedByName: lr.approvedBy ? (adminMap[lr.approvedBy] ?? null) : null,
      });
    }
  }

  // Sort by leaveDate desc
  allLeaveRecords.sort(
    (a, b) => new Date(b.leaveDate).getTime() - new Date(a.leaveDate).getTime(),
  );

  // Options for new leave record: only ACTIVE or SUSPENDED enrollments
  const enrollmentOptions: EnrollmentOption[] = enrollments
    .filter((e) => e.status === "ACTIVE" || e.status === "SUSPENDED")
    .map((e) => ({
      id: e.id,
      label:
        e.cohort?.name ??
        e.product?.name ??
        e.specialLecture?.name ??
        "수강 등록",
      status: e.status,
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
          { label: "휴원 관리" },
        ]}
      />

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            휴원 관리
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-ink">
            {student.name}
            <span className="ml-3 text-xl font-normal text-slate">{student.examNumber}</span>
          </h1>
        </div>
        <Link
          href={`/admin/students/${examNumber}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30"
        >
          ← 학생 상세
        </Link>
      </div>

      <div className="space-y-8">
        {/* Leave records table */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold text-ink">휴원 이력</h2>

          {allLeaveRecords.length === 0 ? (
            <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              휴원 이력이 없습니다.
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-[20px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold">수강 등록</th>
                    <th className="px-5 py-3.5 font-semibold">휴원일</th>
                    <th className="px-5 py-3.5 font-semibold">복귀일</th>
                    <th className="px-5 py-3.5 font-semibold">기간</th>
                    <th className="px-5 py-3.5 font-semibold">사유</th>
                    <th className="px-5 py-3.5 font-semibold">승인자</th>
                    <th className="px-5 py-3.5 font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10 bg-white">
                  {allLeaveRecords.map((leave) => {
                    const days = leave.returnDate
                      ? Math.ceil(
                          (new Date(leave.returnDate).getTime() -
                            new Date(leave.leaveDate).getTime()) /
                            (1000 * 60 * 60 * 24),
                        )
                      : null;
                    const isOnLeave =
                      !leave.returnDate ||
                      new Date(leave.returnDate) > new Date();

                    return (
                      <tr key={leave.id}>
                        <td className="px-5 py-3.5 font-medium text-ink">
                          <Link
                            href={`/admin/students/${examNumber}?tab=enrollments`}
                            className="hover:text-ember transition-colors"
                          >
                            {leave.enrollmentLabel}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">{formatDate(leave.leaveDate)}</td>
                        <td className="px-5 py-3.5">
                          {leave.returnDate ? formatDate(leave.returnDate) : "-"}
                        </td>
                        <td className="px-5 py-3.5 text-slate">
                          {days !== null ? `${days}일` : "진행 중"}
                        </td>
                        <td className="px-5 py-3.5 text-slate">{leave.reason ?? "-"}</td>
                        <td className="px-5 py-3.5 text-slate">
                          {leave.approvedByName ?? "-"}
                        </td>
                        <td className="px-5 py-3.5">
                          {isOnLeave ? (
                            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                              휴원 중
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                              복귀 완료
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* New leave record form */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold text-ink">새 휴원 처리</h2>
          <p className="mt-1 text-sm text-slate">
            수강 중(ACTIVE) 상태의 등록에 대해 휴원을 신청합니다.
          </p>
          {enrollmentOptions.filter((e) => e.status === "ACTIVE").length === 0 ? (
            <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 p-6 text-center text-sm text-slate">
              현재 수강 중인 등록이 없습니다.
            </div>
          ) : (
            <LeaveRecordForm
              enrollmentOptions={enrollmentOptions.filter((e) => e.status === "ACTIVE")}
              examNumber={examNumber}
              today={today}
            />
          )}
        </section>
      </div>
    </div>
  );
}
