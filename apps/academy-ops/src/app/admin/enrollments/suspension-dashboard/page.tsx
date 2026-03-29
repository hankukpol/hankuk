import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { RestoreButton } from "./restore-button";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null | undefined): string {
  if (!date) return "-";
  return date
    .toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/\. /g, "-")
    .replace(/\.$/, "");
}

function getDaysSince(date: Date): number {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default async function SuspensionDashboardPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // KPI queries (parallel)
  const [
    suspendedCount,
    thisMonthLeaveCount,
    longTermSuspendedCount,
    thisMonthReturnedCount,
    suspendedEnrollments,
  ] = await Promise.all([
    // 현재 휴원 중 (SUSPENDED enrollment count)
    prisma.courseEnrollment.count({
      where: { status: "SUSPENDED" },
    }),

    // 이번 달 휴원 신청 (LeaveRecord created this month)
    prisma.leaveRecord.count({
      where: {
        createdAt: { gte: startOfMonth, lte: endOfMonth },
      },
    }),

    // 1개월 이상 휴원 (leaveDate > 30 days ago and still SUSPENDED)
    prisma.leaveRecord.count({
      where: {
        leaveDate: { lte: thirtyDaysAgo },
        enrollment: { status: "SUSPENDED" },
        returnDate: null,
      },
    }),

    // 이번 달 복교 (LeaveRecord with returnDate this month)
    prisma.leaveRecord.count({
      where: {
        returnDate: { gte: startOfMonth, lte: endOfMonth },
      },
    }),

    // Table of suspended enrollments with latest LeaveRecord
    prisma.courseEnrollment.findMany({
      where: { status: "SUSPENDED" },
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
          },
        },
        cohort: { select: { name: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
        leaveRecords: {
          orderBy: { leaveDate: "desc" },
          take: 1,
        },
        staff: {
          select: { name: true },
        },
      },
      orderBy: [
        {
          leaveRecords: {
            _count: "desc",
          },
        },
        { updatedAt: "desc" },
      ],
    }),
  ]);

  // Sort by latest leaveDate desc
  const sortedEnrollments = [...suspendedEnrollments].sort((a, b) => {
    const aDate = a.leaveRecords[0]?.leaveDate ?? new Date(0);
    const bDate = b.leaveRecords[0]?.leaveDate ?? new Date(0);
    return bDate.getTime() - aDate.getTime();
  });

  const kpiCards = [
    {
      label: "현재 휴원 중",
      count: suspendedCount,
      unit: "명",
      color: "text-amber-700",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-100",
      dotColor: "bg-amber-500",
    },
    {
      label: "이번 달 휴원 신청",
      count: thisMonthLeaveCount,
      unit: "건",
      color: "text-slate",
      bgColor: "bg-mist",
      borderColor: "border-ink/10",
      dotColor: "bg-slate",
    },
    {
      label: "1개월 이상 휴원",
      count: longTermSuspendedCount,
      unit: "명",
      color: "text-red-700",
      bgColor: "bg-red-50",
      borderColor: "border-red-100",
      dotColor: "bg-red-500",
    },
    {
      label: "이번 달 복교",
      count: thisMonthReturnedCount,
      unit: "명",
      color: "text-forest",
      bgColor: "bg-forest/5",
      borderColor: "border-forest/20",
      dotColor: "bg-forest",
    },
  ];

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">휴원 현황</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        현재 휴원 중인 수강생 목록과 복교 처리를 관리합니다.
      </p>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border ${card.borderColor} ${card.bgColor} p-6`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${card.dotColor}`} />
              <span className="text-sm font-medium text-slate">{card.label}</span>
            </div>
            <p className={`mt-3 text-4xl font-bold ${card.color}`}>
              {card.count.toLocaleString()}
              <span className="ml-1 text-base font-medium">{card.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white overflow-hidden shadow-sm">
        {sortedEnrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate">
            <svg
              className="mb-4 h-12 w-12 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium">현재 휴원 중인 수강생이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    학번
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    이름
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    수강 과정
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    휴원일
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    예정 복교일
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    경과일
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    휴원 사유
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    담당
                  </th>
                  <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    액션
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedEnrollments.map((enrollment, idx) => {
                  const latestLeave = enrollment.leaveRecords[0] ?? null;
                  const leaveDate = latestLeave?.leaveDate ?? null;
                  const returnDate = latestLeave?.returnDate ?? null;
                  const reason = latestLeave?.reason ?? null;
                  const daysSince = leaveDate ? getDaysSince(leaveDate) : null;
                  const isLongTerm = daysSince !== null && daysSince >= 30;
                  const isAlt = idx % 2 === 1;

                  const courseName =
                    enrollment.specialLecture?.name ??
                    enrollment.product?.name ??
                    enrollment.cohort?.name ??
                    "-";

                  return (
                    <tr
                      key={enrollment.id}
                      className={`border-b border-ink/5 transition-colors hover:bg-forest/5 ${
                        isAlt ? "bg-mist/50" : "bg-white"
                      }`}
                    >
                      <td className="px-5 py-4 font-mono text-xs text-slate">
                        <Link
                          href={`/admin/students/${enrollment.student.examNumber}`}
                          className="hover:text-ember hover:underline"
                        >
                          {enrollment.student.examNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/students/${enrollment.student.examNumber}`}
                          className="font-semibold text-ink hover:text-ember hover:underline"
                        >
                          {enrollment.student.name}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/enrollments/${enrollment.id}`}
                          className="text-ink hover:text-ember hover:underline"
                        >
                          {courseName}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate">
                        {formatDate(leaveDate)}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate">
                        {returnDate ? (
                          formatDate(returnDate)
                        ) : (
                          <span className="text-xs text-ink/40">미정</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {daysSince !== null ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              isLongTerm
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {daysSince}일
                          </span>
                        ) : (
                          <span className="text-xs text-ink/40">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate">
                        {reason ? (
                          <span className="max-w-[160px] truncate block" title={reason}>
                            {reason}
                          </span>
                        ) : (
                          <span className="text-xs text-ink/40">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate">
                        {enrollment.staff?.name ?? "-"}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <RestoreButton
                          examNumber={enrollment.student.examNumber}
                          studentName={enrollment.student.name}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {sortedEnrollments.length > 0 && (
          <div className="border-t border-ink/10 px-5 py-3 text-xs text-slate bg-mist/30">
            총{" "}
            <span className="font-semibold text-ink">
              {sortedEnrollments.length}
            </span>
            건 표시 중 &nbsp;·&nbsp; 휴원일 기준 최신순
          </div>
        )}
      </div>
    </div>
  );
}
