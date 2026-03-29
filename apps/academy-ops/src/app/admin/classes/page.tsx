import Link from "next/link";
import { AdminRole, ExamCategory } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type StatusFilter = "all" | "active" | "upcoming" | "ended";

function getStr(val: string | string[] | undefined): string {
  return typeof val === "string" ? val : "";
}

export default async function ClassesBrowserPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);

  const sp = searchParams ? await searchParams : {};
  const searchQuery = getStr(sp.q).toLowerCase();
  const statusFilter = (getStr(sp.status) || "all") as StatusFilter;
  const categoryFilter = getStr(sp.category) as ExamCategory | "";

  const now = new Date();

  const rawCohorts = await getPrisma().cohort.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    include: {
      enrollments: {
        select: { status: true },
      },
      lectureSchedules: {
        where: { isActive: true },
        select: { instructorName: true, subjectName: true },
        take: 10,
      },
    },
  });

  // Derive computed fields
  const cohorts = rawCohorts.map(({ enrollments, lectureSchedules, ...cohort }) => {
    const enrolledCount = enrollments.filter(
      (e) => e.status === "ACTIVE" || e.status === "PENDING",
    ).length;
    const activeCount = enrollments.filter((e) => e.status === "ACTIVE").length;
    const waitlistCount = enrollments.filter((e) => e.status === "WAITING").length;

    const startDate = cohort.startDate;
    const endDate = cohort.endDate;
    const isUpcoming = startDate > now;
    const isEnded = !cohort.isActive && endDate < now;
    const isActive = cohort.isActive && !isUpcoming;

    // Unique non-null instructor names
    const instructorNames = Array.from(
      new Set(
        lectureSchedules
          .map((s) => s.instructorName)
          .filter((n): n is string => !!n),
      ),
    );

    return {
      id: cohort.id,
      name: cohort.name,
      examCategory: cohort.examCategory,
      targetExamYear: cohort.targetExamYear,
      startDate,
      endDate,
      maxCapacity: cohort.maxCapacity,
      isActive: cohort.isActive,
      enrolledCount,
      activeCount,
      waitlistCount,
      isUpcoming,
      isEnded,
      isActiveNow: isActive,
      instructorNames,
    };
  });

  // Apply filters
  const filtered = cohorts.filter((c) => {
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && c.isActiveNow) ||
      (statusFilter === "upcoming" && c.isUpcoming) ||
      (statusFilter === "ended" && c.isEnded);

    const matchCategory =
      !categoryFilter || c.examCategory === categoryFilter;

    const matchSearch =
      !searchQuery ||
      c.name.toLowerCase().includes(searchQuery) ||
      c.instructorNames.some((n) => n.toLowerCase().includes(searchQuery));

    return matchStatus && matchCategory && matchSearch;
  });

  // Summary stats (all cohorts, unfiltered)
  const totalCohorts = cohorts.length;
  const activeCohorts = cohorts.filter((c) => c.isActiveNow).length;
  const totalStudents = cohorts
    .filter((c) => c.isActiveNow)
    .reduce((sum, c) => sum + c.enrolledCount, 0);

  const CATEGORY_OPTIONS: { value: ExamCategory | ""; label: string }[] = [
    { value: "", label: "전체 유형" },
    { value: "GONGCHAE", label: EXAM_CATEGORY_LABEL.GONGCHAE },
    { value: "GYEONGCHAE", label: EXAM_CATEGORY_LABEL.GYEONGCHAE },
    { value: "SOGANG", label: EXAM_CATEGORY_LABEL.SOGANG },
    { value: "CUSTOM", label: EXAM_CATEGORY_LABEL.CUSTOM },
  ];

  const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "전체 상태" },
    { value: "active", label: "진행 중" },
    { value: "upcoming", label: "예정" },
    { value: "ended", label: "종료" },
  ];

  function buildUrl(updates: Record<string, string>) {
    const merged = {
      q: searchQuery,
      status: statusFilter,
      category: categoryFilter,
      ...updates,
    };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.status && merged.status !== "all") params.set("status", merged.status);
    if (merged.category) params.set("category", merged.category);
    const qs = params.toString();
    return `/admin/classes${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            수강반 조회
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-ink">수강반 조회</h1>
          <p className="mt-1 text-sm text-slate">
            전체 기수를 검색하고 수강생 현황을 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/cohorts"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            기수 현황 대시보드
          </Link>
          <Link
            href="/admin/settings/cohorts/new"
            className="inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            새 기수 등록
          </Link>
        </div>
      </div>

      {/* Summary KPI */}
      <div className="mt-8 grid grid-cols-3 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">총 운영반</p>
          <p className="mt-2 text-3xl font-semibold text-ink tabular-nums">{totalCohorts}</p>
          <p className="mt-1 text-xs text-slate">전체 기수 수</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">진행 중</p>
          <p className="mt-2 text-3xl font-semibold text-forest tabular-nums">{activeCohorts}</p>
          <p className="mt-1 text-xs text-slate">현재 운영 중인 기수</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">수강생 수</p>
          <p className="mt-2 text-3xl font-semibold text-ember tabular-nums">
            {totalStudents.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">진행 중 기수 재원생 합계</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {/* Search */}
        <form method="get" className="flex items-center gap-2">
          {/* preserve other filters */}
          {statusFilter !== "all" && (
            <input type="hidden" name="status" value={statusFilter} />
          )}
          {categoryFilter && (
            <input type="hidden" name="category" value={categoryFilter} />
          )}
          <div className="flex items-center gap-2 rounded-full border border-ink/15 bg-white px-4 py-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              name="q"
              defaultValue={searchQuery}
              placeholder="기수명 / 강사명 검색"
              className="w-44 bg-transparent text-sm text-ink placeholder-slate/60 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-full bg-forest px-4 py-2 text-sm font-medium text-white transition hover:bg-forest/90"
          >
            검색
          </button>
        </form>

        {/* Status filter */}
        <div className="flex overflow-hidden rounded-full border border-ink/15 bg-white">
          {STATUS_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={buildUrl({ status: opt.value })}
              className={`px-4 py-2 text-sm font-medium transition ${
                statusFilter === opt.value
                  ? "bg-forest text-white"
                  : "text-slate hover:bg-mist"
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex overflow-hidden rounded-full border border-ink/15 bg-white">
          {CATEGORY_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={buildUrl({ category: opt.value })}
              className={`px-4 py-2 text-sm font-medium transition ${
                categoryFilter === opt.value
                  ? "bg-forest text-white"
                  : "text-slate hover:bg-mist"
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Result count */}
      <p className="mt-4 text-sm text-slate">
        검색 결과 <span className="font-semibold text-ink">{filtered.length}</span>개
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white px-8 py-16 text-center">
          <p className="text-base font-medium text-slate">조건에 맞는 수강반이 없습니다.</p>
          <p className="mt-1 text-sm text-slate/70">검색 조건을 변경해 보세요.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/60">
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">기수명</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">유형</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">시작일</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">종료일</th>
                  <th className="px-5 py-3.5 text-center font-semibold text-ink">수강생</th>
                  <th className="px-5 py-3.5 text-center font-semibold text-ink">대기</th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">강사</th>
                  <th className="px-5 py-3.5 text-center font-semibold text-ink">상태</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((cohort, idx) => {
                  const isLast = idx === filtered.length - 1;
                  const statusBadge = cohort.isUpcoming
                    ? { label: "예정", cls: "border-sky-200 bg-sky-50 text-sky-800" }
                    : cohort.isEnded
                      ? { label: "종료", cls: "border-ink/20 bg-ink/5 text-slate" }
                      : cohort.isActiveNow
                        ? { label: "진행 중", cls: "border-forest/30 bg-forest/10 text-forest" }
                        : { label: "비활성", cls: "border-ink/20 bg-ink/5 text-slate" };

                  const capacityText =
                    cohort.maxCapacity != null
                      ? `${cohort.enrolledCount} / ${cohort.maxCapacity}`
                      : `${cohort.enrolledCount}`;

                  const capPercent =
                    cohort.maxCapacity && cohort.maxCapacity > 0
                      ? Math.min(100, Math.round((cohort.enrolledCount / cohort.maxCapacity) * 100))
                      : null;

                  const instructorText =
                    cohort.instructorNames.length > 0
                      ? cohort.instructorNames.join(", ")
                      : "—";

                  return (
                    <tr
                      key={cohort.id}
                      className={`${!isLast ? "border-b border-ink/10" : ""} transition hover:bg-mist/40`}
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/settings/cohorts/${cohort.id}`}
                          className="font-semibold text-ink hover:text-forest transition"
                        >
                          {cohort.name}
                        </Link>
                        {cohort.targetExamYear && (
                          <span className="ml-2 text-xs text-slate">
                            {cohort.targetExamYear}년 목표
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center rounded-full border border-ink/15 bg-mist px-2.5 py-0.5 text-xs font-medium text-ink">
                          {EXAM_CATEGORY_LABEL[cohort.examCategory]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate tabular-nums">
                        {formatDate(cohort.startDate)}
                      </td>
                      <td className="px-5 py-4 text-slate tabular-nums">
                        {formatDate(cohort.endDate)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="font-semibold text-ink tabular-nums">
                          {capacityText}
                        </span>
                        {capPercent !== null && (
                          <div className="mx-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-ink/10">
                            <div
                              className={`h-full rounded-full ${
                                capPercent >= 90
                                  ? "bg-ember"
                                  : capPercent >= 70
                                    ? "bg-amber-400"
                                    : "bg-forest"
                              }`}
                              style={{ width: `${capPercent}%` }}
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center tabular-nums text-slate">
                        {cohort.waitlistCount > 0 ? (
                          <span className="font-medium text-amber-600">{cohort.waitlistCount}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate">
                        <span className="line-clamp-1 max-w-[140px]" title={instructorText}>
                          {instructorText}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge.cls}`}
                        >
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/admin/settings/cohorts/${cohort.id}`}
                          className="inline-flex items-center gap-1 rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-slate transition hover:border-forest/30 hover:text-forest"
                        >
                          상세 →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
