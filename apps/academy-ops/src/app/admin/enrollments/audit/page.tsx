import type { Metadata } from "next";
import Link from "next/link";
import { AdminRole, EnrollmentChangeType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "수강 상태 변경 감사 로그",
};

// ─── Label maps ────────────────────────────────────────────────────────────────

const CHANGE_TYPE_LABEL: Record<EnrollmentChangeType, string> = {
  STATUS_CHANGE: "상태 변경",
  CLASS_CHANGE: "반/기수 변경",
  INSTRUCTOR_CHANGE: "강사 변경",
  FEE_ADJUSTMENT: "수강료 조정",
  NOTE_UPDATE: "메모 업데이트",
};

const CHANGE_TYPE_COLOR: Record<EnrollmentChangeType, string> = {
  STATUS_CHANGE: "border-amber-200 bg-amber-50 text-amber-700",
  CLASS_CHANGE: "border-sky-200 bg-sky-50 text-sky-700",
  INSTRUCTOR_CHANGE: "border-purple-200 bg-purple-50 text-purple-700",
  FEE_ADJUSTMENT: "border-ember/20 bg-ember/10 text-ember",
  NOTE_UPDATE: "border-ink/10 bg-mist text-slate",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\. /g, "-")
    .replace(/\.$/, "");
}

function formatDateTime(date: Date): string {
  const d = formatDate(date);
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${d} ${h}:${m}`;
}

function getDefaultMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    options.push({ value: val, label });
  }
  return options;
}

function formatJsonValue(val: unknown): string {
  if (val === null || val === undefined) return "-";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object") {
    // Try to pick a useful summary key
    const obj = val as Record<string, unknown>;
    if (obj.status) return String(obj.status);
    if (obj.name) return String(obj.name);
    if (obj.value) return String(obj.value);
    return JSON.stringify(val);
  }
  return String(val);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EnrollmentAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; staffId?: string; changeType?: string }>;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const sp = await searchParams;

  const monthParam = sp.month ?? getDefaultMonth();
  const staffIdParam = sp.staffId ?? "";
  const changeTypeParam = sp.changeType ?? "";

  // Parse month filter → date range
  const [yearStr, monthStr] = monthParam.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const prisma = getPrisma();

  // Fetch all staff (for filter dropdown)
  const staffList = await prisma.adminUser.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Fetch enrollment histories with filters
  const histories = await prisma.enrollmentHistory.findMany({
    where: {
      changedAt: { gte: startOfMonth, lte: endOfMonth },
      ...(staffIdParam ? { changedBy: staffIdParam } : {}),
      ...(changeTypeParam
        ? { changeType: changeTypeParam as EnrollmentChangeType }
        : {}),
    },
    include: {
      enrollment: {
        select: {
          id: true,
          examNumber: true,
          status: true,
          student: { select: { name: true } },
          cohort: { select: { name: true } },
          specialLecture: { select: { name: true } },
          product: { select: { name: true } },
        },
      },
      admin: { select: { id: true, name: true } },
    },
    orderBy: { changedAt: "desc" },
    take: 200,
  });

  // Also fetch LeaveRecord data for the same period (휴원 기록)
  const leaveRecords = await prisma.leaveRecord.findMany({
    where: {
      createdAt: { gte: startOfMonth, lte: endOfMonth },
    },
    include: {
      enrollment: {
        select: {
          id: true,
          examNumber: true,
          student: { select: { name: true } },
          cohort: { select: { name: true } },
          specialLecture: { select: { name: true } },
          product: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // KPI counts
  const statusChangeCount = histories.filter(
    (h) => h.changeType === EnrollmentChangeType.STATUS_CHANGE,
  ).length;
  const classChangeCount = histories.filter(
    (h) => h.changeType === EnrollmentChangeType.CLASS_CHANGE,
  ).length;

  const monthOptions = buildMonthOptions();

  return (
    <div className="p-8 sm:p-10">
      {/* ── Header ── */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        감사 로그
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">수강 상태 변경 감사 로그</h1>
          <p className="mt-4 max-w-2xl text-sm leading-8 text-slate">
            수강 등록의 상태 변경 이력을 월별·담당자별로 조회합니다. 수강 상태
            변경, 반/기수 이동, 수강료 조정 등의 변경 내역을 추적합니다.
          </p>
        </div>
        <Link
          href="/admin/enrollments"
          className="shrink-0 inline-flex items-center rounded-xl border border-ink/10 px-4 py-2.5 text-sm font-semibold text-slate hover:border-ink/30 hover:text-ink transition-colors"
        >
          ← 수강 목록
        </Link>
      </div>

      {/* ── KPI cards ── */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[24px] border border-ink/10 bg-white p-4 shadow-panel">
          <p className="text-sm text-slate">전체 변경 건수</p>
          <p className="mt-3 text-3xl font-bold text-ink">{histories.length}건</p>
        </article>
        <article className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-slate">상태 변경</p>
          <p className="mt-3 text-3xl font-bold text-amber-700">
            {statusChangeCount}건
          </p>
        </article>
        <article className="rounded-[24px] border border-sky-200 bg-sky-50 p-4">
          <p className="text-sm text-slate">반/기수 변경</p>
          <p className="mt-3 text-3xl font-bold text-sky-700">{classChangeCount}건</p>
        </article>
        <article className="rounded-[24px] border border-ink/10 bg-white p-4 shadow-panel">
          <p className="text-sm text-slate">휴원 기록</p>
          <p className="mt-3 text-3xl font-bold text-orange-600">
            {leaveRecords.length}건
          </p>
        </article>
      </div>

      {/* ── Filters ── */}
      <form method="GET" className="mt-8 flex flex-wrap items-end gap-3">
        {/* Month */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="month-filter"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate"
          >
            기간
          </label>
          <select
            id="month-filter"
            name="month"
            defaultValue={monthParam}
            className="rounded-xl border border-ink/10 bg-white px-4 py-2 text-sm text-ink outline-none focus:border-forest/40 focus:ring-1 focus:ring-forest/20"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Staff */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="staff-filter"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate"
          >
            담당자
          </label>
          <select
            id="staff-filter"
            name="staffId"
            defaultValue={staffIdParam}
            className="rounded-xl border border-ink/10 bg-white px-4 py-2 text-sm text-ink outline-none focus:border-forest/40 focus:ring-1 focus:ring-forest/20"
          >
            <option value="">전체</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Change type */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="type-filter"
            className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate"
          >
            변경 유형
          </label>
          <select
            id="type-filter"
            name="changeType"
            defaultValue={changeTypeParam}
            className="rounded-xl border border-ink/10 bg-white px-4 py-2 text-sm text-ink outline-none focus:border-forest/40 focus:ring-1 focus:ring-forest/20"
          >
            <option value="">전체</option>
            {Object.entries(CHANGE_TYPE_LABEL).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-xl border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/20"
        >
          조회
        </button>

        {(staffIdParam || changeTypeParam || monthParam !== getDefaultMonth()) && (
          <Link
            href="/admin/enrollments/audit"
            className="rounded-xl border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
          >
            초기화
          </Link>
        )}
      </form>

      {/* ── Enrollment History Table ── */}
      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-ink/10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              Enrollment History
            </p>
            <h2 className="mt-1 text-xl font-semibold">수강 변경 이력</h2>
          </div>
          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
            {histories.length}건
          </span>
        </div>

        {histories.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-ink">해당 기간에 변경 이력이 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              필터 조건을 변경하거나 다른 기간을 선택해 보세요.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/60 text-left">
                <tr>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    일시
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    학생명
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    수강반
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    변경 유형
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    변경 전
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    변경 후
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    담당자
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    사유
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {histories.map((h) => {
                  const courseName =
                    h.enrollment.cohort?.name ??
                    h.enrollment.specialLecture?.name ??
                    h.enrollment.product?.name ??
                    "-";
                  return (
                    <tr key={h.id} className="hover:bg-mist/40 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap tabular-nums text-slate">
                        {formatDateTime(new Date(h.changedAt))}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <Link
                          href={`/admin/students/${h.enrollment.examNumber}`}
                          className="font-semibold text-ink hover:text-forest transition-colors"
                        >
                          {h.enrollment.student.name}
                        </Link>
                        <p className="text-[11px] text-slate tabular-nums">
                          {h.enrollment.examNumber}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-slate">
                        <Link
                          href={`/admin/enrollments/${h.enrollment.id}`}
                          className="hover:text-ink transition-colors"
                        >
                          {courseName}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${CHANGE_TYPE_COLOR[h.changeType]}`}
                        >
                          {CHANGE_TYPE_LABEL[h.changeType]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate max-w-[150px] truncate">
                        {formatJsonValue(h.prevValue)}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-ink max-w-[150px] truncate">
                        {formatJsonValue(h.newValue)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-slate">
                        {h.admin.name}
                      </td>
                      <td className="px-5 py-3.5 text-slate max-w-[200px] truncate">
                        {h.reason ?? "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Leave Records section ── */}
      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-ink/10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              Leave Records
            </p>
            <h2 className="mt-1 text-xl font-semibold">휴원 기록</h2>
          </div>
          <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
            {leaveRecords.length}건
          </span>
        </div>

        {leaveRecords.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-slate">해당 기간에 휴원 기록이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/60 text-left">
                <tr>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    휴원일
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    학생명
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    수강반
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    복귀 예정일
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    사유
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-ink whitespace-nowrap">
                    상태
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {leaveRecords.map((lr) => {
                  const courseName =
                    lr.enrollment.cohort?.name ??
                    lr.enrollment.specialLecture?.name ??
                    lr.enrollment.product?.name ??
                    "-";
                  const isReturned = lr.returnDate !== null;
                  return (
                    <tr key={lr.id} className="hover:bg-mist/40 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap tabular-nums text-slate">
                        {formatDate(new Date(lr.leaveDate))}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <Link
                          href={`/admin/students/${lr.enrollment.examNumber}`}
                          className="font-semibold text-ink hover:text-forest transition-colors"
                        >
                          {lr.enrollment.student.name}
                        </Link>
                        <p className="text-[11px] text-slate tabular-nums">
                          {lr.enrollment.examNumber}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-slate">
                        <Link
                          href={`/admin/enrollments/${lr.enrollment.id}`}
                          className="hover:text-ink transition-colors"
                        >
                          {courseName}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap tabular-nums text-slate">
                        {lr.returnDate ? formatDate(new Date(lr.returnDate)) : "-"}
                      </td>
                      <td className="px-5 py-3.5 text-slate max-w-[200px] truncate">
                        {lr.reason ?? "-"}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {isReturned ? (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-1 text-[11px] font-semibold text-forest">
                            복귀 완료
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
                            휴원 중
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
