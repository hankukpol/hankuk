import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function calcDdays(returnDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ret = new Date(returnDate);
  ret.setHours(0, 0, 0, 0);
  return Math.ceil((ret.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function StudentSuspensionPage({
  params,
}: {
  params: Promise<{ examNumber: string }>;
}) {
  const { examNumber } = await params;
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: { examNumber: true, name: true, phone: true },
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
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Collect approvedBy admin IDs
  const approvedByIds = new Set<string>();
  for (const e of enrollments) {
    for (const lr of e.leaveRecords) {
      if (lr.approvedBy) approvedByIds.add(lr.approvedBy);
    }
  }
  const adminMap: Record<string, string> = {};
  if (approvedByIds.size > 0) {
    const admins = await prisma.adminUser.findMany({
      where: { id: { in: Array.from(approvedByIds) } },
      select: { id: true, name: true },
    });
    for (const a of admins) adminMap[a.id] = a.name;
  }

  // Flatten leave records
  const allLeaveRecords = enrollments.flatMap((e) => {
    const label =
      e.cohort?.name ?? e.product?.name ?? e.specialLecture?.name ?? "수강 등록";
    return e.leaveRecords.map((lr) => ({
      id: lr.id,
      enrollmentId: lr.enrollmentId,
      enrollmentLabel: label,
      leaveDate: lr.leaveDate,
      returnDate: lr.returnDate,
      reason: lr.reason,
      approvedByName: lr.approvedBy ? (adminMap[lr.approvedBy] ?? "알 수 없음") : null,
    }));
  });
  allLeaveRecords.sort(
    (a, b) => new Date(b.leaveDate).getTime() - new Date(a.leaveDate).getTime(),
  );

  // KPI
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeLeaves = allLeaveRecords.filter(
    (lr) => !lr.returnDate || new Date(lr.returnDate) > today,
  );
  const totalLeaveDays = allLeaveRecords
    .filter((lr) => lr.returnDate)
    .reduce((sum, lr) => {
      const days = Math.ceil(
        (new Date(lr.returnDate!).getTime() - new Date(lr.leaveDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      return sum + days;
    }, 0);
  const isCurrentlyOnLeave = activeLeaves.length > 0;

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
          { label: "휴원·복귀 관리" },
        ]}
      />

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            휴원·복귀 관리
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-[#111827]">
            {student.name}
            <span className="ml-3 text-xl font-normal text-[#4B5563]">{student.examNumber}</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/students/${examNumber}/suspension/new`}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#C55A11] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#C55A11]/90"
          >
            + 신규 휴원 신청
          </Link>
          <Link
            href={`/admin/students/${examNumber}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
          >
            ← 학생 상세
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-[#111827]/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#4B5563]">
            현재 상태
          </p>
          <p className="mt-2 text-2xl font-bold">
            {isCurrentlyOnLeave ? (
              <span className="text-amber-600">휴원 중</span>
            ) : (
              <span className="text-[#1F4D3A]">정상 수강</span>
            )}
          </p>
        </div>
        <div className="rounded-[28px] border border-[#111827]/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#4B5563]">
            총 휴원 횟수
          </p>
          <p className="mt-2 text-2xl font-bold text-[#111827]">
            {allLeaveRecords.length}
            <span className="ml-1 text-base font-normal text-[#4B5563]">회</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-[#111827]/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#4B5563]">
            총 휴원 일수
          </p>
          <p className="mt-2 text-2xl font-bold text-[#111827]">
            {totalLeaveDays}
            <span className="ml-1 text-base font-normal text-[#4B5563]">일</span>
          </p>
          <p className="mt-0.5 text-xs text-[#4B5563]">복귀 완료된 기간 합산</p>
        </div>
      </div>

      {/* Leave Records Table */}
      <section className="rounded-[28px] border border-[#111827]/10 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-[#111827]">휴원 이력</h2>
        {allLeaveRecords.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-[#111827]/10 p-10 text-center text-sm text-[#4B5563]">
            <p className="font-medium">휴원 이력이 없습니다.</p>
            <p className="mt-1 text-xs opacity-70">신규 휴원 신청 버튼을 눌러 휴원을 등록하세요.</p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-[20px] border border-[#111827]/10">
            <table className="min-w-full divide-y divide-[#111827]/10 text-sm">
              <thead className="bg-[#F7F4EF]/80 text-left">
                <tr>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">수강 등록</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">시작일</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">복귀 예정일</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">실제 복귀일</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">사유</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">처리자</th>
                  <th className="px-5 py-3.5 font-semibold text-[#111827]">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#111827]/10 bg-white">
                {allLeaveRecords.map((leave) => {
                  const isActive =
                    !leave.returnDate || new Date(leave.returnDate) > today;
                  const ddays =
                    isActive && leave.returnDate
                      ? calcDdays(new Date(leave.returnDate))
                      : null;

                  return (
                    <tr key={leave.id} className="hover:bg-[#F7F4EF]/40 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-[#111827]">
                        {leave.enrollmentLabel}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {formatDate(leave.leaveDate.toISOString())}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {leave.returnDate ? (
                          <span className="flex items-center gap-2">
                            {formatDate(leave.returnDate.toISOString())}
                            {isActive && ddays !== null && (
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  ddays <= 0
                                    ? "bg-red-100 text-red-700"
                                    : ddays <= 7
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {ddays <= 0 ? "D+" + Math.abs(ddays) : `D-${ddays}`}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[#4B5563]/50">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {!isActive && leave.returnDate
                          ? formatDate(leave.returnDate.toISOString())
                          : <span className="text-[#4B5563]/50">-</span>}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {leave.reason ?? <span className="opacity-50">-</span>}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {leave.approvedByName ?? <span className="opacity-50">-</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {isActive ? (
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                            진행 중
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-[#1F4D3A]/20 bg-[#1F4D3A]/10 px-2.5 py-0.5 text-xs font-semibold text-[#1F4D3A]">
                            완료
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
    </div>
  );
}
