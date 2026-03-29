import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

const SUBJECT_LABELS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형소법",
  CRIMINAL_LAW: "형법",
  POLICE_SCIENCE: "경찰학",
  CUMULATIVE: "종합",
};

type PerTextbookStats = {
  id: number;
  title: string;
  subject: string | null;
  price: number;
  totalQuantity: number;
  totalRevenue: number;
  saleCount: number;
  avgPrice: number;
};

export default async function TextbookSalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const params = await searchParams;
  const monthParam = params.month ?? null; // "YYYY-MM"

  const db = getPrisma();

  // Parse month filter
  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [year, month] = monthParam.split("-").map(Number);
    dateFrom = new Date(year, month - 1, 1);
    dateTo = new Date(year, month, 1);
  }

  // Also compute last month boundaries for comparison
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const whereFilter = dateFrom && dateTo ? { soldAt: { gte: dateFrom, lt: dateTo } } : undefined;

  // Fetch all sales (with textbook info) for the selected period
  const allSales = await db.textbookSale.findMany({
    where: whereFilter,
    include: {
      textbook: {
        select: { id: true, title: true, subject: true, price: true },
      },
    },
    orderBy: { soldAt: "desc" },
  });

  // Fetch this month and last month sales for comparison (only when no filter or filter is this month)
  const [thisMonthSales, lastMonthSales] = await Promise.all([
    db.textbookSale.aggregate({
      where: { soldAt: { gte: thisMonthStart, lt: nextMonthStart } },
      _sum: { totalPrice: true, quantity: true },
      _count: { id: true },
    }),
    db.textbookSale.aggregate({
      where: { soldAt: { gte: lastMonthStart, lt: thisMonthStart } },
      _sum: { totalPrice: true, quantity: true },
      _count: { id: true },
    }),
  ]);

  // Overall totals for selected period
  const totalRevenue = allSales.reduce((sum, s) => sum + s.totalPrice, 0);
  const totalQuantity = allSales.reduce((sum, s) => sum + s.quantity, 0);
  const totalCount = allSales.length;

  // Per-textbook aggregation
  const perTextbook = new Map<number, PerTextbookStats>();
  for (const sale of allSales) {
    const tb = sale.textbook;
    const existing = perTextbook.get(tb.id);
    if (existing) {
      existing.totalQuantity += sale.quantity;
      existing.totalRevenue += sale.totalPrice;
      existing.saleCount += 1;
    } else {
      perTextbook.set(tb.id, {
        id: tb.id,
        title: tb.title,
        subject: tb.subject,
        price: tb.price,
        totalQuantity: sale.quantity,
        totalRevenue: sale.totalPrice,
        saleCount: 1,
        avgPrice: 0,
      });
    }
  }

  const perTextbookList: PerTextbookStats[] = Array.from(perTextbook.values()).map((t) => ({
    ...t,
    avgPrice: t.totalQuantity > 0 ? Math.round(t.totalRevenue / t.totalQuantity) : 0,
  }));

  // Sort by revenue descending
  perTextbookList.sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Top 5
  const top5 = perTextbookList.slice(0, 5);

  // Month options: last 12 months
  const monthOptions: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  const thisMonthRevenue = thisMonthSales._sum.totalPrice ?? 0;
  const lastMonthRevenue = lastMonthSales._sum.totalPrice ?? 0;
  const revenueChange =
    lastMonthRevenue > 0
      ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : null;

  const thisMonthQty = thisMonthSales._sum.quantity ?? 0;
  const lastMonthQty = lastMonthSales._sum.quantity ?? 0;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "설정", href: "/admin/settings" },
          { label: "교재 관리", href: "/admin/settings/textbooks" },
          { label: "교재 매출 현황" },
        ]}
      />

      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        교재 관리
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">교재 매출 현황</h1>
          <p className="mt-2 text-sm text-slate">
            교재별 판매 수량 및 매출을 조회합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate">내보내기:</span>
          <a
            href={(() => {
              if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
                const [y, m] = monthParam.split("-").map(Number);
                const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
                const lastDay = new Date(y, m, 0).getDate();
                const endDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
                return `/api/export/textbooks?startDate=${startDate}&endDate=${endDate}`;
              }
              // No month filter: export current month
              const n = new Date();
              const y = n.getFullYear();
              const m = n.getMonth() + 1;
              const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
              const lastDay = new Date(y, m, 0).getDate();
              const endDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
              return `/api/export/textbooks?startDate=${startDate}&endDate=${endDate}`;
            })()}
            className="rounded-full border border-forest/30 bg-forest/10 px-4 py-2 text-xs font-medium text-forest transition hover:bg-forest/20"
          >
            CSV 내보내기
          </a>
          <Link
            href="/admin/settings/textbooks"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            ← 목록으로
          </Link>
        </div>
      </div>

      {/* Month selector */}
      <div className="mt-6 flex items-center gap-3">
        <span className="text-sm text-slate">기간:</span>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/settings/textbooks/sales"
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              !monthParam
                ? "border-forest/40 bg-forest/10 text-forest"
                : "border-ink/15 text-ink hover:border-ink/30"
            }`}
          >
            전체
          </Link>
          {monthOptions.map((m) => (
            <Link
              key={m}
              href={`/admin/settings/textbooks/sales?month=${m}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                monthParam === m
                  ? "border-forest/40 bg-forest/10 text-forest"
                  : "border-ink/15 text-ink hover:border-ink/30"
              }`}
            >
              {m.replace("-", "년 ")}월
            </Link>
          ))}
        </div>
      </div>

      {/* This month vs last month comparison (always visible) */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">이번 달 매출</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            {thisMonthRevenue.toLocaleString()}원
          </p>
          {revenueChange !== null && (
            <p
              className={`mt-1 text-xs font-medium ${revenueChange >= 0 ? "text-forest" : "text-red-600"}`}
            >
              전월 대비 {revenueChange >= 0 ? "+" : ""}
              {revenueChange}%
            </p>
          )}
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">지난 달 매출</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            {lastMonthRevenue.toLocaleString()}원
          </p>
          <p className="mt-1 text-xs text-slate">
            {lastMonthQty}권 판매
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">이번 달 판매 수량</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            {thisMonthQty}권
          </p>
          <p className="mt-1 text-xs text-slate">
            {thisMonthSales._count.id}건 거래
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">지난 달 판매 수량</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            {lastMonthQty}권
          </p>
          <p className="mt-1 text-xs text-slate">
            {lastMonthSales._count.id}건 거래
          </p>
        </div>
      </div>

      {/* Selected period totals */}
      {monthParam && (
        <div className="mt-4 rounded-[28px] border border-ember/20 bg-ember/5 p-5">
          <p className="text-xs font-medium text-ember">
            {monthParam.replace("-", "년 ")}월 집계
          </p>
          <div className="mt-3 grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate">총 매출</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-ink">
                {totalRevenue.toLocaleString()}원
              </p>
            </div>
            <div>
              <p className="text-xs text-slate">총 판매 수량</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-ink">{totalQuantity}권</p>
            </div>
            <div>
              <p className="text-xs text-slate">거래 건수</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-ink">{totalCount}건</p>
            </div>
          </div>
        </div>
      )}

      {/* Top 5 selling textbooks */}
      {top5.length > 0 && (
        <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">
            인기 교재 Top 5
            {monthParam && (
              <span className="ml-2 text-sm font-normal text-slate">
                ({monthParam.replace("-", "년 ")}월)
              </span>
            )}
          </h2>
          <div className="space-y-3">
            {top5.map((t, idx) => {
              const maxRevenue = top5[0].totalRevenue;
              const barWidth = maxRevenue > 0 ? (t.totalRevenue / maxRevenue) * 100 : 0;
              return (
                <div key={t.id}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-center text-xs font-bold text-slate">
                        {idx + 1}
                      </span>
                      <Link
                        href={`/admin/settings/textbooks/${t.id}`}
                        className="font-medium text-ink transition hover:text-ember"
                      >
                        {t.title}
                      </Link>
                      {t.subject && (
                        <span className="rounded-full bg-mist px-2 py-0.5 text-xs text-slate">
                          {SUBJECT_LABELS[t.subject] ?? t.subject}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate">
                      <span>{t.totalQuantity}권</span>
                      <span className="font-semibold text-ink tabular-nums">
                        {t.totalRevenue.toLocaleString()}원
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-mist">
                    <div
                      className="h-full rounded-full bg-ember/60"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-textbook breakdown table */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">
            교재별 매출 현황
            {monthParam ? (
              <span className="ml-2 text-sm font-normal text-slate">
                ({monthParam.replace("-", "년 ")}월)
              </span>
            ) : (
              <span className="ml-2 text-sm font-normal text-slate">(전체 기간)</span>
            )}
          </h2>
          <p className="text-xs text-slate">{perTextbookList.length}종</p>
        </div>

        {perTextbookList.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate">
            {monthParam
              ? "해당 기간에 판매 내역이 없습니다."
              : "판매 내역이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr>
                  {[
                    "교재명",
                    "과목",
                    "정가",
                    "총 판매 수량",
                    "거래 건수",
                    "평균 단가",
                    "총 매출",
                    "상세",
                  ].map((h) => (
                    <th
                      key={h}
                      className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {perTextbookList.map((t) => (
                  <tr key={t.id} className="hover:bg-mist/30">
                    <td className="px-4 py-3 font-medium text-ink">
                      <Link
                        href={`/admin/settings/textbooks/${t.id}`}
                        className="transition hover:text-ember"
                      >
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate">
                      {t.subject
                        ? (SUBJECT_LABELS[t.subject] ?? t.subject)
                        : "일반"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate">
                      {t.price.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-ink">
                      {t.totalQuantity}권
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate">
                      {t.saleCount}건
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate">
                      {t.avgPrice.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-ember">
                      {t.totalRevenue.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/settings/textbooks/${t.id}`}
                        className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-medium transition hover:border-ember/30 hover:text-ember"
                      >
                        상세
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/10 bg-mist/50">
                  <td className="px-4 py-3 text-xs font-semibold text-ink" colSpan={3}>
                    합계
                  </td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-ink">
                    {totalQuantity}권
                  </td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-ink">
                    {totalCount}건
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 tabular-nums font-bold text-ember">
                    {totalRevenue.toLocaleString()}원
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
