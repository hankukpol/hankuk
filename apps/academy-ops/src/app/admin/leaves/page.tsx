import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { formatDate } from "@/lib/format";
import { ReturnButton } from "./return-button";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    status?: string;
    cohortId?: string;
    month?: string;
  }>;
};

export default async function LeavesPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);
  const sp = await searchParams;

  const statusFilter = sp.status ?? ""; // "" = 전체, "ACTIVE" = 휴원 중, "COMPLETED" = 복귀 완료
  const cohortIdFilter = sp.cohortId ?? "";
  const monthFilter = sp.month ?? ""; // "YYYY-MM"

  const prisma = getPrisma();

  // Load all cohorts for filter dropdown
  const cohorts = await prisma.cohort.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { startDate: "desc" },
  });

  // Build leave record query
  const now = new Date();

  // We query leave records via enrollments
  const leaveRecords = await prisma.leaveRecord.findMany({
    include: {
      enrollment: {
        include: {
          cohort: { select: { id: true, name: true } },
          product: { select: { name: true } },
          specialLecture: { select: { name: true } },
          student: { select: { examNumber: true, name: true, phone: true } },
        },
      },
    },
    orderBy: { leaveDate: "desc" },
  });

  // Load approver names
  const approvedByIds = new Set<string>();
  for (const lr of leaveRecords) {
    if (lr.approvedBy) approvedByIds.add(lr.approvedBy);
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

  // Classify leave records
  type LeaveRow = {
    id: string;
    examNumber: string;
    studentName: string;
    phone: string | null;
    cohortName: string;
    cohortId: string | null;
    leaveDate: Date;
    returnDate: Date | null;
    reason: string | null;
    approvedByName: string | null;
    isActive: boolean; // true = currently on leave
  };

  const rows: LeaveRow[] = leaveRecords.map((lr) => {
    const enrollment = lr.enrollment;
    const cohortName =
      enrollment.cohort?.name ??
      enrollment.product?.name ??
      enrollment.specialLecture?.name ??
      "수강 등록";
    const isActive = !lr.returnDate || new Date(lr.returnDate) > now;
    return {
      id: lr.id,
      examNumber: enrollment.student.examNumber,
      studentName: enrollment.student.name,
      phone: enrollment.student.phone ?? null,
      cohortName,
      cohortId: enrollment.cohort?.id ?? null,
      leaveDate: lr.leaveDate,
      returnDate: lr.returnDate ?? null,
      reason: lr.reason ?? null,
      approvedByName: lr.approvedBy ? (adminMap[lr.approvedBy] ?? null) : null,
      isActive,
    };
  });

  // Apply filters
  let filtered = rows;

  if (statusFilter === "ACTIVE") {
    filtered = filtered.filter((r) => r.isActive);
  } else if (statusFilter === "COMPLETED") {
    filtered = filtered.filter((r) => !r.isActive);
  }

  if (cohortIdFilter) {
    filtered = filtered.filter((r) => r.cohortId === cohortIdFilter);
  }

  if (monthFilter) {
    const [y, m] = monthFilter.split("-").map(Number);
    if (y && m) {
      const monthStart = new Date(y, m - 1, 1);
      const monthEnd = new Date(y, m, 1);
      filtered = filtered.filter(
        (r) => r.leaveDate >= monthStart && r.leaveDate < monthEnd,
      );
    }
  }

  // KPI counts (unfiltered for summary, but filter only by cohort/month if set)
  const activeRows = rows.filter((r) => r.isActive);
  const currentMonth = new Date();
  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const nextMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  const thisMonthLeaves = rows.filter(
    (r) => r.leaveDate >= monthStart && r.leaveDate < nextMonthStart,
  );
  const thisMonthReturns = rows.filter(
    (r) =>
      r.returnDate &&
      new Date(r.returnDate) >= monthStart &&
      new Date(r.returnDate) < nextMonthStart,
  );

  // Average leave duration (completed records only)
  const completedRows = rows.filter((r) => !r.isActive && r.returnDate);
  const avgLeaveDays =
    completedRows.length > 0
      ? Math.round(
          completedRows.reduce((sum, r) => {
            const days = Math.ceil(
              (new Date(r.returnDate!).getTime() - r.leaveDate.getTime()) /
                (1000 * 60 * 60 * 24),
            );
            return sum + days;
          }, 0) / completedRows.length,
        )
      : null;

  const activeFiltered = filtered.filter((r) => r.isActive);
  const completedFiltered = filtered.filter((r) => !r.isActive);

  // Build filter URL helpers
  function buildUrl(params: Record<string, string>) {
    const base: Record<string, string> = {};
    if (statusFilter) base.status = statusFilter;
    if (cohortIdFilter) base.cohortId = cohortIdFilter;
    if (monthFilter) base.month = monthFilter;
    const merged = { ...base, ...params };
    const qs = Object.entries(merged)
      .filter(([, v]) => v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    return `/admin/leaves${qs ? "?" + qs : ""}`;
  }

  // Generate month options (last 12 months)
  const monthOptions: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    monthOptions.push({ value: val, label });
  }

  return (
    <div className="min-h-screen bg-[#F7F4EF] p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수강관리", href: "/admin/enrollments" },
          { label: "휴원 관리" },
        ]}
      />

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            휴원 관리
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-ink">휴원 관리</h1>
          <p className="mt-1 text-sm text-slate">전체 학생의 휴원 신청 및 복귀 현황을 관리합니다.</p>
        </div>
      </div>

      {/* KPI */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">현재 휴원 중</p>
          <p className="mt-2 text-2xl font-bold text-amber-600">{activeRows.length}명</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">이번달 신규 휴원</p>
          <p className="mt-2 text-2xl font-bold text-ink">{thisMonthLeaves.length}건</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">이번달 복귀</p>
          <p className="mt-2 text-2xl font-bold text-forest">{thisMonthReturns.length}건</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">평균 휴원 기간</p>
          <p className="mt-2 text-2xl font-bold text-slate">
            {avgLeaveDays !== null ? `${avgLeaveDays}일` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">완료 건 기준</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Status filter */}
        <div className="flex gap-1.5 rounded-xl border border-ink/10 bg-white p-1">
          {[
            { value: "", label: "전체" },
            { value: "ACTIVE", label: "휴원 중" },
            { value: "COMPLETED", label: "복귀 완료" },
          ].map((opt) => (
            <Link
              key={opt.value}
              href={buildUrl({ status: opt.value })}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === opt.value
                  ? "bg-ember text-white"
                  : "text-slate hover:text-ink"
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        {/* Cohort filter */}
        <form method="GET" action="/admin/leaves" className="flex items-center gap-2">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {monthFilter && <input type="hidden" name="month" value={monthFilter} />}
          <select
            name="cohortId"
            defaultValue={cohortIdFilter}
            onChange={(e) => {
              if (typeof window !== "undefined") {
                (e.target.form as HTMLFormElement)?.submit();
              }
            }}
            className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ember/30"
          >
            <option value="">전체 수강반</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Month filter */}
          <select
            name="month"
            defaultValue={monthFilter}
            className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ember/30"
          >
            <option value="">전체 기간</option>
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="rounded-xl bg-ember px-4 py-2 text-sm font-medium text-white hover:bg-ember/90"
          >
            적용
          </button>

          {(cohortIdFilter || monthFilter) && (
            <Link
              href={statusFilter ? `/admin/leaves?status=${statusFilter}` : "/admin/leaves"}
              className="rounded-xl border border-ink/10 px-4 py-2 text-sm text-slate hover:text-ink"
            >
              초기화
            </Link>
          )}
        </form>
      </div>

      <div className="space-y-8">
        {/* Currently on leave */}
        {(statusFilter === "" || statusFilter === "ACTIVE") && (
          <section className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
              <h2 className="text-base font-semibold text-ink">
                현재 휴원 중인 학생
                <span className="ml-2 text-sm font-normal text-amber-600">
                  {activeFiltered.length}명
                </span>
              </h2>
            </div>
            {activeFiltered.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate">현재 휴원 중인 학생이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-5 py-3.5 font-semibold">학번</th>
                      <th className="px-5 py-3.5 font-semibold">이름</th>
                      <th className="px-5 py-3.5 font-semibold">연락처</th>
                      <th className="px-5 py-3.5 font-semibold">수강반</th>
                      <th className="px-5 py-3.5 font-semibold">휴원 시작일</th>
                      <th className="px-5 py-3.5 font-semibold">복귀 예정일</th>
                      <th className="px-5 py-3.5 font-semibold">D-day</th>
                      <th className="px-5 py-3.5 font-semibold">경과일</th>
                      <th className="px-5 py-3.5 font-semibold">사유</th>
                      <th className="px-5 py-3.5 font-semibold">승인자</th>
                      <th className="px-5 py-3.5 font-semibold">복귀</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10 bg-white">
                    {activeFiltered.map((row) => {
                      const elapsed = Math.ceil(
                        (now.getTime() - row.leaveDate.getTime()) / (1000 * 60 * 60 * 24),
                      );
                      // D-day: days until expected return (positive = days remaining, negative = overdue)
                      let ddayBadge = <span className="text-slate text-xs">—</span>;
                      if (row.returnDate) {
                        const returnMs = new Date(row.returnDate).setHours(0, 0, 0, 0);
                        const todayMs = new Date(now).setHours(0, 0, 0, 0);
                        const dday = Math.ceil((returnMs - todayMs) / (1000 * 60 * 60 * 24));
                        if (dday === 0) {
                          ddayBadge = (
                            <span className="inline-flex rounded-full border border-forest/30 bg-forest/10 px-2.5 py-0.5 text-xs font-bold text-forest">
                              D-day
                            </span>
                          );
                        } else if (dday > 0) {
                          ddayBadge = (
                            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                              D-{dday}
                            </span>
                          );
                        } else {
                          ddayBadge = (
                            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                              D+{Math.abs(dday)}
                            </span>
                          );
                        }
                      }
                      return (
                        <tr key={row.id} className="hover:bg-mist/30 transition-colors">
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/admin/students/${row.examNumber}`}
                              className="font-mono text-xs text-ember hover:underline"
                            >
                              {row.examNumber}
                            </Link>
                          </td>
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/admin/students/${row.examNumber}/leave`}
                              className="font-medium text-ink hover:text-ember transition-colors"
                            >
                              {row.studentName}
                            </Link>
                          </td>
                          <td className="px-5 py-3.5 text-slate">{row.phone ?? "—"}</td>
                          <td className="px-5 py-3.5 text-slate">{row.cohortName}</td>
                          <td className="px-5 py-3.5">{formatDate(row.leaveDate)}</td>
                          <td className="px-5 py-3.5 text-slate">
                            {row.returnDate ? formatDate(row.returnDate) : "미정"}
                          </td>
                          <td className="px-5 py-3.5">{ddayBadge}</td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                              {elapsed}일
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate max-w-[180px] truncate">
                            {row.reason ?? "—"}
                          </td>
                          <td className="px-5 py-3.5 text-slate">{row.approvedByName ?? "—"}</td>
                          <td className="px-5 py-3.5">
                            <ReturnButton leaveId={row.id} studentName={row.studentName} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Completed leaves */}
        {(statusFilter === "" || statusFilter === "COMPLETED") && (
          <section className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
              <h2 className="text-base font-semibold text-ink">
                완료된 휴원 내역
                <span className="ml-2 text-sm font-normal text-slate">
                  {completedFiltered.length}건
                </span>
              </h2>
            </div>
            {completedFiltered.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate">
                {statusFilter === "COMPLETED" && monthFilter
                  ? "해당 기간에 복귀 완료된 내역이 없습니다."
                  : "완료된 휴원 내역이 없습니다."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-5 py-3.5 font-semibold">학번</th>
                      <th className="px-5 py-3.5 font-semibold">이름</th>
                      <th className="px-5 py-3.5 font-semibold">수강반</th>
                      <th className="px-5 py-3.5 font-semibold">휴원기간</th>
                      <th className="px-5 py-3.5 font-semibold">기간(일)</th>
                      <th className="px-5 py-3.5 font-semibold">사유</th>
                      <th className="px-5 py-3.5 font-semibold">처리 담당자</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10 bg-white">
                    {completedFiltered.map((row) => {
                      const days = row.returnDate
                        ? Math.ceil(
                            (new Date(row.returnDate).getTime() - row.leaveDate.getTime()) /
                              (1000 * 60 * 60 * 24),
                          )
                        : null;
                      return (
                        <tr key={row.id} className="hover:bg-mist/30 transition-colors">
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/admin/students/${row.examNumber}`}
                              className="font-mono text-xs text-ember hover:underline"
                            >
                              {row.examNumber}
                            </Link>
                          </td>
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/admin/students/${row.examNumber}/leave`}
                              className="font-medium text-ink hover:text-ember transition-colors"
                            >
                              {row.studentName}
                            </Link>
                          </td>
                          <td className="px-5 py-3.5 text-slate">{row.cohortName}</td>
                          <td className="px-5 py-3.5 text-slate">
                            {formatDate(row.leaveDate)}
                            {row.returnDate ? ` ~ ${formatDate(row.returnDate)}` : ""}
                          </td>
                          <td className="px-5 py-3.5">
                            {days !== null ? (
                              <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                                {days}일
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-slate max-w-[180px] truncate">
                            {row.reason ?? "—"}
                          </td>
                          <td className="px-5 py-3.5 text-slate">{row.approvedByName ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
