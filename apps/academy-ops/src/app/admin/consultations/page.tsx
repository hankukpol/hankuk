import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── helpers ──────────────────────────────────────────────────────────────────

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.0%";
  return ((numerator / denominator) * 100).toFixed(1) + "%";
}

function parseDateParam(raw: string | string[] | undefined): string | undefined {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function readStringParam(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string {
  const v = sp?.[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

// ─── types ────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function ConsultationsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const sp = searchParams ? await searchParams : {};

  const dateFrom = parseDateParam(sp.from);
  const dateTo = parseDateParam(sp.to);
  const staffFilter = readStringParam(sp, "staff");
  const pageParam = Number(readStringParam(sp, "page") || "1");
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const PAGE_SIZE = 20;

  const prisma = getPrisma();
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // ─── Build where clause ─────────────────────────────────────────────────────

  const whereBase = {
    ...(dateFrom || dateTo
      ? {
          counseledAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
          },
        }
      : {}),
    ...(staffFilter ? { counselorName: { contains: staffFilter } } : {}),
  };

  // ─── Stats bar queries (this month) ─────────────────────────────────────────

  const [
    thisMonthCount,
    totalCount,
    allRecords,
    staffGroups,
    enrolledStudentsThisMonth,
  ] = await Promise.all([
    // 이번달 상담 건수
    prisma.counselingRecord.count({
      where: { counseledAt: { gte: thisMonthStart } },
    }),

    // total for pagination
    prisma.counselingRecord.count({ where: whereBase }),

    // paginated records
    prisma.counselingRecord.findMany({
      where: whereBase,
      orderBy: { counseledAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        examNumber: true,
        counselorName: true,
        content: true,
        recommendation: true,
        nextSchedule: true,
        counseledAt: true,
        createdAt: true,
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
          },
        },
      },
    }),

    // counselor list for filter
    prisma.counselingRecord.groupBy({
      by: ["counselorName"],
      _count: { counselorName: true },
      orderBy: { _count: { counselorName: "desc" } },
    }),

    // students with counseling records AND enrollments this month (for conversion)
    prisma.student.findMany({
      where: {
        counselingRecords: { some: { counseledAt: { gte: thisMonthStart } } },
        courseEnrollments: { some: { createdAt: { gte: thisMonthStart } } },
      },
      select: { examNumber: true },
    }),
  ]);

  // New visits this month = unique students first seen this month
  const thisMonthCounseledStudents = await prisma.counselingRecord
    .findMany({
      where: { counseledAt: { gte: thisMonthStart } },
      select: { examNumber: true },
      distinct: ["examNumber"],
    })
    .then((rows) => rows.length);

  // Phone counseling approximation (records with "전화" in content or recommendation)
  const phoneCount = await prisma.counselingRecord.count({
    where: {
      counseledAt: { gte: thisMonthStart },
      OR: [
        { content: { contains: "전화" } },
        { recommendation: { contains: "전화" } },
      ],
    },
  });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const conversionRate = pct(enrolledStudentsThisMonth.length, thisMonthCounseledStudents);

  // ─── CSV export ─────────────────────────────────────────────────────────────
  // (handled via link to a dedicated export endpoint or inline)

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/admin" className="transition hover:text-ink">
          홈
        </Link>
        <span>/</span>
        <span className="text-ink">상담 관리</span>
      </nav>

      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        상담 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">상담 방문 목록</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            면담 기록 전체 목록을 조회하고 신규 상담을 등록합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/consultations/new"
            className="inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            + 신규 상담 등록
          </Link>
          <Link
            href="/admin/analytics/consultation"
            className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/10 px-5 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/20"
          >
            분석 대시보드 →
          </Link>
        </div>
      </div>

      {/* Stats bar */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            이번달 상담 건수
          </p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {thisMonthCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            신규 방문 학생
          </p>
          <p className="mt-2 text-3xl font-semibold text-ink">
            {thisMonthCounseledStudents.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">명 (고유)</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            전화 상담
          </p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">
            {phoneCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건 (이번달)</p>
        </div>

        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            전환율 (수강등록)
          </p>
          <p className="mt-2 text-3xl font-semibold text-ember">
            {conversionRate}
          </p>
          <p className="mt-1 text-xs text-slate">
            {enrolledStudentsThisMonth.length} / {thisMonthCounseledStudents}명
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <form
        method="GET"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-[24px] border border-ink/10 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">시작일</label>
          <input
            type="date"
            name="from"
            defaultValue={dateFrom ?? ""}
            className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm focus:border-forest/40 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">종료일</label>
          <input
            type="date"
            name="to"
            defaultValue={dateTo ?? ""}
            className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm focus:border-forest/40 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate">담당직원</label>
          <select
            name="staff"
            defaultValue={staffFilter}
            className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm focus:border-forest/40 focus:outline-none"
          >
            <option value="">전체</option>
            {staffGroups.map((g) => (
              <option key={g.counselorName} value={g.counselorName}>
                {g.counselorName} ({g._count.counselorName}건)
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest"
        >
          검색
        </button>
        <Link
          href="/admin/consultations"
          className="rounded-full border border-ink/10 px-5 py-2 text-sm font-semibold text-slate transition hover:border-ink/30"
        >
          초기화
        </Link>

        {/* CSV export */}
        <div className="ml-auto">
          <Link
            href={`/api/consultations/export?${new URLSearchParams({
              ...(dateFrom ? { from: dateFrom } : {}),
              ...(dateTo ? { to: dateTo } : {}),
              ...(staffFilter ? { staff: staffFilter } : {}),
            }).toString()}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition hover:border-forest/40 hover:text-forest"
          >
            CSV 내보내기
          </Link>
        </div>
      </form>

      {/* Table */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">
            상담 기록
            <span className="ml-2 text-sm font-normal text-slate">
              총 {totalCount.toLocaleString()}건
            </span>
          </h2>
          <p className="text-xs text-slate">
            {page} / {totalPages || 1} 페이지
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-mist/60 text-left">
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                  일시
                </th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                  학생명
                </th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                  상담유형
                </th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                  담당직원
                </th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                  다음 예정
                </th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                  비고 (상담내용 요약)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {allRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm text-slate"
                  >
                    조건에 맞는 상담 기록이 없습니다.
                  </td>
                </tr>
              ) : (
                allRecords.map((record) => {
                  const counseledDate = new Date(record.counseledAt);
                  const dateLabel = counseledDate.toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  });
                  const timeLabel = counseledDate.toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  // Infer counseling type from content keywords
                  let counselType = "대면";
                  if (record.content.includes("전화")) counselType = "전화";
                  else if (record.content.includes("온라인") || record.content.includes("화상")) counselType = "온라인";
                  else if (record.content.includes("재방문")) counselType = "재방문";

                  const contentPreview =
                    record.content.length > 50
                      ? record.content.slice(0, 50) + "..."
                      : record.content;

                  return (
                    <tr
                      key={record.id}
                      className="transition-colors hover:bg-mist/40"
                    >
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-slate">
                        <span className="font-medium text-ink">{dateLabel}</span>
                        <br />
                        <span className="text-slate">{timeLabel}</span>
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/students/${record.student.examNumber}`}
                          className="font-semibold text-ink transition hover:text-ember"
                        >
                          {record.student.name}
                        </Link>
                        <br />
                        <span className="text-xs text-slate">
                          {record.student.examNumber}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            counselType === "전화"
                              ? "bg-blue-50 text-blue-700"
                              : counselType === "온라인"
                              ? "bg-violet-50 text-violet-700"
                              : counselType === "재방문"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-forest/10 text-forest"
                          }`}
                        >
                          {counselType}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-ink">
                        {record.counselorName}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate">
                        {record.nextSchedule
                          ? new Date(record.nextSchedule).toLocaleDateString(
                              "ko-KR",
                              { month: "2-digit", day: "2-digit" },
                            )
                          : "—"}
                      </td>
                      <td className="max-w-xs px-5 py-3">
                        <Link
                          href={`/admin/counseling/${record.id}`}
                          className="block text-xs text-slate transition hover:text-ink"
                        >
                          {contentPreview}
                        </Link>
                        {record.recommendation ? (
                          <span className="mt-1 block text-xs text-forest">
                            권고: {record.recommendation.slice(0, 30)}
                            {record.recommendation.length > 30 ? "..." : ""}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-ink/10 px-6 py-4">
            <p className="text-xs text-slate">
              {(page - 1) * PAGE_SIZE + 1} –{" "}
              {Math.min(page * PAGE_SIZE, totalCount)} / {totalCount}건
            </p>
            <div className="flex gap-1">
              {page > 1 && (
                <Link
                  href={`?${new URLSearchParams({
                    ...(dateFrom ? { from: dateFrom } : {}),
                    ...(dateTo ? { to: dateTo } : {}),
                    ...(staffFilter ? { staff: staffFilter } : {}),
                    page: String(page - 1),
                  }).toString()}`}
                  className="rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist"
                >
                  ← 이전
                </Link>
              )}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, page - 2) + i;
                if (p > totalPages) return null;
                return (
                  <Link
                    key={p}
                    href={`?${new URLSearchParams({
                      ...(dateFrom ? { from: dateFrom } : {}),
                      ...(dateTo ? { to: dateTo } : {}),
                      ...(staffFilter ? { staff: staffFilter } : {}),
                      page: String(p),
                    }).toString()}`}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      p === page
                        ? "border-forest/30 bg-forest/10 font-semibold text-forest"
                        : "border-ink/10 text-slate hover:bg-mist"
                    }`}
                  >
                    {p}
                  </Link>
                );
              })}
              {page < totalPages && (
                <Link
                  href={`?${new URLSearchParams({
                    ...(dateFrom ? { from: dateFrom } : {}),
                    ...(dateTo ? { to: dateTo } : {}),
                    ...(staffFilter ? { staff: staffFilter } : {}),
                    page: String(page + 1),
                  }).toString()}`}
                  className="rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist"
                >
                  다음 →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/counseling"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          면담 지원 허브 →
        </Link>
        <Link
          href="/admin/analytics/consultation"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          상담 분석 대시보드 →
        </Link>
        <Link
          href="/admin/counseling/conversion-stats"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          전환율 분석 →
        </Link>
      </div>
    </div>
  );
}
