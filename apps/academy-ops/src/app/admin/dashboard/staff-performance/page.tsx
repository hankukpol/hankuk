import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ROLE_LABEL } from "@/lib/constants";
import Link from "next/link";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

type Period = "today" | "week" | "month";

function getPeriodRange(period: Period): { start: Date; end: Date; label: string } {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  if (period === "today") {
    return { start: todayStart, end: todayEnd, label: "오늘" };
  }
  if (period === "week") {
    const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start: weekAgo, end: todayEnd, label: "최근 7일" };
  }
  // month
  const monthAgo = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start: monthAgo, end: todayEnd, label: "최근 30일" };
}

type StaffPerformanceRow = {
  id: string;
  name: string;
  role: string;
  payments: number;
  paymentNet: number;
  enrollments: number;
  prospects: number;
  totalActivity: number;
};

export default async function StaffPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const sp = await searchParams;
  const rawPeriod = sp.period ?? "week";
  const period: Period =
    rawPeriod === "today" ? "today" : rawPeriod === "month" ? "month" : "week";

  const { start, end, label } = getPeriodRange(period);

  const db = getPrisma();

  const [paymentsByStaff, enrollmentsByStaff, prospectsByStaff, staffList] = await Promise.all([
    db.payment.groupBy({
      by: ["processedBy"],
      where: { processedAt: { gte: start, lte: end } },
      _count: { id: true },
      _sum: { netAmount: true },
    }),
    db.courseEnrollment.groupBy({
      by: ["staffId"],
      where: { createdAt: { gte: start, lte: end } },
      _count: { id: true },
    }),
    db.consultationProspect.groupBy({
      by: ["staffId"],
      where: { visitedAt: { gte: start, lte: end } },
      _count: { id: true },
    }),
    db.adminUser.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Build per-staff map
  const staffMap = new Map<
    string,
    { name: string; role: string; payments: number; paymentNet: number; enrollments: number; prospects: number }
  >();
  for (const s of staffList) {
    staffMap.set(s.id, {
      name: s.name,
      role: s.role,
      payments: 0,
      paymentNet: 0,
      enrollments: 0,
      prospects: 0,
    });
  }

  for (const p of paymentsByStaff) {
    const entry = staffMap.get(p.processedBy);
    if (entry) {
      entry.payments = p._count.id;
      entry.paymentNet = p._sum.netAmount ?? 0;
    } else {
      staffMap.set(p.processedBy, {
        name: `(알 수 없음 ${p.processedBy.slice(0, 6)})`,
        role: "",
        payments: p._count.id,
        paymentNet: p._sum.netAmount ?? 0,
        enrollments: 0,
        prospects: 0,
      });
    }
  }

  for (const e of enrollmentsByStaff) {
    const entry = staffMap.get(e.staffId);
    if (entry) {
      entry.enrollments = e._count.id;
    } else {
      staffMap.set(e.staffId, {
        name: `(알 수 없음 ${e.staffId.slice(0, 6)})`,
        role: "",
        payments: 0,
        paymentNet: 0,
        enrollments: e._count.id,
        prospects: 0,
      });
    }
  }

  for (const pr of prospectsByStaff) {
    const entry = staffMap.get(pr.staffId);
    if (entry) {
      entry.prospects = pr._count.id;
    } else {
      staffMap.set(pr.staffId, {
        name: `(알 수 없음 ${pr.staffId.slice(0, 6)})`,
        role: "",
        payments: 0,
        paymentNet: 0,
        enrollments: 0,
        prospects: pr._count.id,
      });
    }
  }

  const rows: StaffPerformanceRow[] = Array.from(staffMap.entries())
    .map(([id, v]) => ({
      id,
      ...v,
      totalActivity: v.payments + v.enrollments + v.prospects,
    }))
    .filter((r) => r.totalActivity > 0)
    .sort((a, b) => b.totalActivity - a.totalActivity);

  const PERIODS: { value: Period; label: string }[] = [
    { value: "today", label: "오늘" },
    { value: "week", label: "최근 7일" },
    { value: "month", label: "최근 30일" },
  ];

  const totalPayments = rows.reduce((s, r) => s + r.payments, 0);
  const totalPaymentNet = rows.reduce((s, r) => s + r.paymentNet, 0);
  const totalEnrollments = rows.reduce((s, r) => s + r.enrollments, 0);
  const totalProspects = rows.reduce((s, r) => s + r.prospects, 0);

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "대시보드", href: "/admin" },
          { label: "직원 실적 현황" },
        ]}
      />

      <div className="mt-2">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          직원 실적
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">직원 실적 현황</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
          기간별 직원의 수납 처리, 수강 등록, 상담 방문자 관리 실적을 확인합니다.
        </p>
      </div>

      {/* Quick link to workload */}
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/admin/dashboard/staff-workload"
          className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/20"
        >
          직원 부하 현황 →
        </Link>
      </div>

      {/* 기간 선택 */}
      <div className="mt-6 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={`/admin/dashboard/staff-performance?period=${p.value}`}
            className={`inline-flex items-center rounded-full border px-4 py-2 text-xs font-semibold transition ${
              period === p.value
                ? "border-forest bg-forest text-white"
                : "border-ink/20 bg-white text-slate hover:border-forest/40 hover:text-forest"
            }`}
          >
            {p.label}
          </Link>
        ))}
        <span className="ml-auto inline-flex items-center text-xs text-slate">
          기간: <strong className="ml-1 text-ink">{label}</strong>
        </span>
      </div>

      {/* 요약 KPI */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">활동 직원</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {rows.length}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
        </div>
        <div className="rounded-[20px] border border-ember/20 bg-ember/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">수납 처리</p>
          <p className="mt-2 text-3xl font-bold text-ember">
            {totalPayments}
            <span className="ml-1 text-sm font-normal text-slate">건</span>
          </p>
          <p className="mt-1 text-xs text-slate">
            {totalPaymentNet > 0 ? `${totalPaymentNet.toLocaleString()}원` : "-"}
          </p>
        </div>
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">수강 등록</p>
          <p className="mt-2 text-3xl font-bold text-forest">
            {totalEnrollments}
            <span className="ml-1 text-sm font-normal text-slate">건</span>
          </p>
        </div>
        <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">상담 방문자</p>
          <p className="mt-2 text-3xl font-bold text-sky-700">
            {totalProspects}
            <span className="ml-1 text-sm font-normal text-slate">건</span>
          </p>
        </div>
      </div>

      {/* 직원별 실적 테이블 */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">직원별 실적</h2>
            <p className="mt-1 text-xs text-slate">
              {label} 기준 — 총 활동 건수 순으로 정렬
            </p>
          </div>
          <span className="inline-flex rounded-full border border-ink/10 bg-ink/5 px-3 py-1 text-xs text-slate">
            엑셀 내보내기 준비 중
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 px-5 py-12 text-center text-sm text-slate">
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
                  <th className="pb-3 pr-4 text-right">수납 처리</th>
                  <th className="pb-3 pr-4 text-right">수납 금액</th>
                  <th className="pb-3 pr-4 text-right">수강 등록</th>
                  <th className="pb-3 pr-4 text-right">상담 방문자</th>
                  <th className="pb-3 text-right">총 활동</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {rows.map((row, i) => (
                  <tr key={row.id} className="hover:bg-mist/50">
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
                      {row.payments > 0 ? (
                        <span className="font-semibold text-ember">{row.payments}건</span>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right text-xs text-slate">
                      {row.paymentNet > 0 ? `${row.paymentNet.toLocaleString()}원` : "-"}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {row.enrollments > 0 ? (
                        <span className="font-semibold text-forest">{row.enrollments}건</span>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {row.prospects > 0 ? (
                        <span className="font-semibold text-sky-600">{row.prospects}건</span>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          i === 0
                            ? "bg-amber-100 text-amber-700"
                            : "bg-ink/5 text-ink"
                        }`}
                      >
                        {row.totalActivity}
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
                  <td className="py-3 pr-4 text-right text-ember">{totalPayments}건</td>
                  <td className="py-3 pr-4 text-right">
                    {totalPaymentNet > 0 ? `${totalPaymentNet.toLocaleString()}원` : "-"}
                  </td>
                  <td className="py-3 pr-4 text-right text-forest">{totalEnrollments}건</td>
                  <td className="py-3 pr-4 text-right text-sky-600">{totalProspects}건</td>
                  <td className="py-3 text-right text-ink">
                    {totalPayments + totalEnrollments + totalProspects}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* 안내 */}
      <div className="mt-4 rounded-[20px] border border-ink/10 bg-mist/60 px-5 py-4 text-xs leading-6 text-slate">
        <strong className="text-ink">참고:</strong> 수납 처리는 Payment.processedBy 기준, 수강 등록은 CourseEnrollment.staffId 기준,
        상담 방문자는 ConsultationProspect.staffId 기준으로 집계됩니다.
        활동이 없는 직원은 표시되지 않습니다.
      </div>

      <div className="mt-6 flex gap-3">
        <Link
          href="/admin"
          className="inline-flex items-center rounded-full border border-ink/20 bg-white px-4 py-2 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
        >
          대시보드로 돌아가기
        </Link>
        <Link
          href="/admin/payments"
          className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-xs font-semibold text-ember transition hover:bg-ember/10"
        >
          수납 목록 보기
        </Link>
        <Link
          href="/admin/enrollments"
          className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10"
        >
          수강 목록 보기
        </Link>
      </div>
    </div>
  );
}
