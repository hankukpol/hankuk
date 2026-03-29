import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ROLE_LABEL } from "@/lib/constants";
import Link from "next/link";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

type StaffScore = {
  id: string;
  name: string;
  role: string;
  enrollments: number;
  paymentAmount: number;
  paymentCount: number;
  counselingSessions: number;
  totalScore: number;
  tier: "우수" | "정상" | "관찰필요";
  tierColor: string;
  tierBg: string;
};

function scoreTier(score: number, max: number): StaffScore["tier"] {
  if (max === 0) return "관찰필요";
  const ratio = score / max;
  if (ratio >= 0.7) return "우수";
  if (ratio >= 0.3) return "정상";
  return "관찰필요";
}

function tierStyle(tier: StaffScore["tier"]): { color: string; bg: string } {
  switch (tier) {
    case "우수":
      return { color: "text-forest", bg: "bg-forest/10 border-forest/20" };
    case "정상":
      return { color: "text-sky-700", bg: "bg-sky-50 border-sky-200" };
    case "관찰필요":
      return { color: "text-amber-700", bg: "bg-amber-50 border-amber-200" };
  }
}

export default async function StaffKPIPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminContext(AdminRole.DIRECTOR);

  const resolvedParams = searchParams ? await searchParams : {};
  const rawPeriod = typeof resolvedParams.period === "string" ? resolvedParams.period : "month";

  const now = new Date();
  let start: Date;
  let end: Date;
  let periodLabel: string;

  if (rawPeriod === "quarter") {
    // Last 3 months
    start = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    periodLabel = "최근 3개월";
  } else if (rawPeriod === "week") {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    weekAgo.setHours(0, 0, 0, 0);
    start = weekAgo;
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    periodLabel = "최근 7일";
  } else {
    // This month (default)
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    periodLabel = `${now.getMonth() + 1}월`;
  }

  const db = getPrisma();

  const [staffList, enrollmentsByStaff, paymentsByStaff, counselingByStaff] =
    await Promise.all([
      db.adminUser.findMany({
        where: { isActive: true },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      }),
      db.courseEnrollment.groupBy({
        by: ["staffId"],
        where: {
          createdAt: { gte: start, lte: end },
          status: { notIn: ["PENDING"] },
        },
        _count: { id: true },
      }),
      db.payment.groupBy({
        by: ["processedBy"],
        where: {
          processedAt: { gte: start, lte: end },
          status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
        },
        _count: { id: true },
        _sum: { netAmount: true },
      }),
      db.counselingRecord.groupBy({
        by: ["counselorName"],
        where: { counseledAt: { gte: start, lte: end } },
        _count: { id: true },
      }),
    ]);

  // Build counselorName → staff ID mapping
  const staffByName = new Map<string, string>();
  for (const s of staffList) {
    staffByName.set(s.name, s.id);
  }

  // Aggregate per-staff data
  const staffMap = new Map<
    string,
    {
      name: string;
      role: string;
      enrollments: number;
      paymentAmount: number;
      paymentCount: number;
      counselingSessions: number;
    }
  >();

  for (const s of staffList) {
    staffMap.set(s.id, {
      name: s.name,
      role: s.role,
      enrollments: 0,
      paymentAmount: 0,
      paymentCount: 0,
      counselingSessions: 0,
    });
  }

  for (const e of enrollmentsByStaff) {
    const entry = staffMap.get(e.staffId);
    if (entry) entry.enrollments = e._count.id;
  }

  for (const p of paymentsByStaff) {
    const entry = staffMap.get(p.processedBy);
    if (entry) {
      entry.paymentAmount = p._sum.netAmount ?? 0;
      entry.paymentCount = p._count.id;
    }
  }

  for (const c of counselingByStaff) {
    // Match counselorName to staff ID
    const staffId = staffByName.get(c.counselorName);
    if (staffId) {
      const entry = staffMap.get(staffId);
      if (entry) entry.counselingSessions = c._count.id;
    }
  }

  // Compute scores — weighted composite:
  // enrollments weight 40, paymentAmount weight 40 (normalized per 100만), counseling weight 20
  const rawRows = Array.from(staffMap.entries()).map(([id, v]) => ({
    id,
    ...v,
    totalScore:
      v.enrollments * 40 +
      Math.round((v.paymentAmount / 1_000_000) * 40) +
      v.counselingSessions * 20,
  }));

  const maxScore = Math.max(...rawRows.map((r) => r.totalScore), 1);

  const rows: StaffScore[] = rawRows
    .filter(
      (r) =>
        r.enrollments > 0 || r.paymentCount > 0 || r.counselingSessions > 0
    )
    .map((r) => {
      const tier = scoreTier(r.totalScore, maxScore);
      const { color, bg } = tierStyle(tier);
      return {
        ...r,
        tier,
        tierColor: color,
        tierBg: bg,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  // Top performers
  const topEnrollment = [...rows].sort((a, b) => b.enrollments - a.enrollments)[0];
  const topPayment = [...rows].sort((a, b) => b.paymentAmount - a.paymentAmount)[0];
  const topCounseling = [...rows].sort((a, b) => b.counselingSessions - a.counselingSessions)[0];

  const tierCounts = {
    우수: rows.filter((r) => r.tier === "우수").length,
    정상: rows.filter((r) => r.tier === "정상").length,
    관찰필요: rows.filter((r) => r.tier === "관찰필요").length,
  };

  const totalEnrollments = rows.reduce((s, r) => s + r.enrollments, 0);
  const totalPaymentAmount = rows.reduce((s, r) => s + r.paymentAmount, 0);
  const totalCounseling = rows.reduce((s, r) => s + r.counselingSessions, 0);

  const PERIODS = [
    { value: "week", label: "최근 7일" },
    { value: "month", label: "이번달" },
    { value: "quarter", label: "최근 3개월" },
  ];

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "분석", href: "/admin/analytics" },
          { label: "직원 KPI 성과" },
        ]}
      />

      <div className="mt-2">
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          인사 분석
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">직원 KPI 성과 대시보드</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
          직원별 수강 등록, 수납, 상담 실적을 종합 점수로 평가하고 성과 등급을 부여합니다.
        </p>
      </div>

      {/* Period Selector */}
      <div className="mt-6 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={`/admin/analytics/staff-performance?period=${p.value}`}
            className={`inline-flex items-center rounded-full border px-4 py-2 text-xs font-semibold transition ${
              rawPeriod === p.value
                ? "border-forest bg-forest text-white"
                : "border-ink/20 bg-white text-slate hover:border-forest/40 hover:text-forest"
            }`}
          >
            {p.label}
          </Link>
        ))}
        <span className="ml-auto flex items-center text-xs text-slate">
          기간: <strong className="ml-1 text-ink">{periodLabel}</strong>
        </span>
      </div>

      {/* Top Performer Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {topEnrollment && (
          <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-forest">
              수강등록 최다
            </p>
            <p className="mt-3 text-xl font-bold text-ink">{topEnrollment.name}</p>
            <p className="mt-1 text-sm text-slate">
              {ROLE_LABEL[topEnrollment.role as keyof typeof ROLE_LABEL] ?? topEnrollment.role}
            </p>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-3xl font-bold text-forest">{topEnrollment.enrollments}</span>
              <span className="mb-1 text-sm text-slate">건</span>
            </div>
          </div>
        )}
        {topPayment && (
          <div className="rounded-[20px] border border-ember/20 bg-ember/5 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ember">
              결제 수납 최다
            </p>
            <p className="mt-3 text-xl font-bold text-ink">{topPayment.name}</p>
            <p className="mt-1 text-sm text-slate">
              {ROLE_LABEL[topPayment.role as keyof typeof ROLE_LABEL] ?? topPayment.role}
            </p>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-3xl font-bold text-ember">
                {topPayment.paymentAmount >= 1_000_000
                  ? `${(topPayment.paymentAmount / 1_000_000).toFixed(1)}백만`
                  : `${topPayment.paymentAmount.toLocaleString()}`}
              </span>
              <span className="mb-1 text-sm text-slate">원</span>
            </div>
            <p className="mt-1 text-xs text-slate">{topPayment.paymentCount}건 처리</p>
          </div>
        )}
        {topCounseling && (
          <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
              상담 최다
            </p>
            <p className="mt-3 text-xl font-bold text-ink">{topCounseling.name}</p>
            <p className="mt-1 text-sm text-slate">
              {ROLE_LABEL[topCounseling.role as keyof typeof ROLE_LABEL] ?? topCounseling.role}
            </p>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-3xl font-bold text-sky-700">
                {topCounseling.counselingSessions}
              </span>
              <span className="mb-1 text-sm text-slate">건</span>
            </div>
          </div>
        )}
      </div>

      {/* KPI Summary */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">활동 직원</p>
          <p className="mt-2 text-3xl font-bold text-ink">{rows.length}</p>
        </div>
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-semibold text-forest">우수</p>
          <p className="mt-2 text-3xl font-bold text-forest">{tierCounts.우수}</p>
          <p className="mt-1 text-xs text-slate">종합 상위 70%+</p>
        </div>
        <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-semibold text-sky-700">정상</p>
          <p className="mt-2 text-3xl font-bold text-sky-700">{tierCounts.정상}</p>
          <p className="mt-1 text-xs text-slate">종합 30~70%</p>
        </div>
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold text-amber-700">관찰필요</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{tierCounts.관찰필요}</p>
          <p className="mt-1 text-xs text-slate">종합 하위 30%</p>
        </div>
      </div>

      {/* Scorecard Table */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">직원별 KPI 스코어카드</h2>
            <p className="mt-1 text-xs text-slate">
              {periodLabel} 기준 — 종합 점수 순 정렬 (등록×40 + 수납액×40 + 상담×20)
            </p>
          </div>
          <Link
            href="/admin/dashboard/staff-performance"
            className="inline-flex items-center gap-1 rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-slate transition hover:text-ink"
          >
            실시간 현황 →
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 py-12 text-center text-sm text-slate">
            선택한 기간에 활동 기록이 없습니다.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  <th className="pb-3 pr-2 w-6 text-center">#</th>
                  <th className="pb-3 pr-4">직원명</th>
                  <th className="pb-3 pr-4">역할</th>
                  <th className="pb-3 pr-4 text-right">수강 등록</th>
                  <th className="pb-3 pr-4 text-right">수납 금액</th>
                  <th className="pb-3 pr-4 text-right">수납 건수</th>
                  <th className="pb-3 pr-4 text-right">상담 건수</th>
                  <th className="pb-3 text-center">등급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {rows.map((row, i) => (
                  <tr key={row.id} className={`${row.tier === "우수" ? "bg-forest/5" : "hover:bg-mist/50"}`}>
                    <td className="py-3 pr-2 text-center text-xs text-slate">{i + 1}</td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/staff-settlements/${row.id}`}
                        className="font-medium text-ink hover:text-ember hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate">
                      {row.role
                        ? (ROLE_LABEL[row.role as keyof typeof ROLE_LABEL] ?? row.role)
                        : "-"}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {row.enrollments > 0 ? (
                        <span className="font-semibold text-forest">{row.enrollments}건</span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {row.paymentAmount > 0 ? (
                        <span className="font-semibold text-ember">
                          {row.paymentAmount.toLocaleString()}원
                        </span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right text-xs text-slate">
                      {row.paymentCount > 0 ? `${row.paymentCount}건` : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {row.counselingSessions > 0 ? (
                        <span className="font-semibold text-sky-700">{row.counselingSessions}건</span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${row.tierBg} ${row.tierColor}`}
                      >
                        {row.tier}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/20 bg-mist/40 text-xs font-semibold text-slate">
                  <td className="py-3 pr-2" />
                  <td className="py-3 pr-4 text-ink">합계</td>
                  <td className="py-3 pr-4" />
                  <td className="py-3 pr-4 text-right text-forest">{totalEnrollments}건</td>
                  <td className="py-3 pr-4 text-right text-ember">
                    {totalPaymentAmount.toLocaleString()}원
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {rows.reduce((s, r) => s + r.paymentCount, 0)}건
                  </td>
                  <td className="py-3 pr-4 text-right text-sky-700">{totalCounseling}건</td>
                  <td className="py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* 안내 */}
      <div className="mt-4 rounded-[20px] border border-ink/10 bg-mist/60 px-5 py-4 text-xs leading-6 text-slate">
        <strong className="text-ink">등급 기준:</strong>{" "}
        종합 점수 (수강등록×40 + 수납금액×40 + 상담×20) 기준으로{" "}
        <span className="text-forest font-semibold">우수</span> (상위 70%+),{" "}
        <span className="text-sky-700 font-semibold">정상</span> (30~70%),{" "}
        <span className="text-amber-700 font-semibold">관찰필요</span> (하위 30%) 로 구분됩니다.
        <br />
        <strong className="text-ink">상담 집계:</strong> CounselingRecord.counselorName 이름 기준으로 직원과 매칭됩니다. 이름이 일치하지 않으면 집계에서 제외될 수 있습니다.
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/analytics"
          className="inline-flex items-center rounded-full border border-ink/20 bg-white px-4 py-2 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
        >
          분석 허브로
        </Link>
        <Link
          href="/admin/dashboard/staff-performance"
          className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10"
        >
          실시간 실적 현황
        </Link>
        <Link
          href="/admin/dashboard/staff-workload"
          className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-xs font-semibold text-ember transition hover:bg-ember/10"
        >
          직원 부하 현황
        </Link>
      </div>
    </div>
  );
}
