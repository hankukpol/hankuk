import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { TextbookSalesManagerFull } from "./textbook-sales-manager";

export const dynamic = "force-dynamic";

export type TextbookWithStats = {
  id: number;
  title: string;
  author: string | null;
  publisher: string | null;
  price: number;
  stock: number;
  subject: string | null;
  isActive: boolean;
  monthSaleCount: number;
  monthSaleQty: number;
  monthSaleAmount: number;
  totalSaleQty: number;
  totalSaleAmount: number;
};

export type RecentSaleRow = {
  id: number;
  soldAt: string;
  textbookId: number;
  textbookTitle: string;
  examNumber: string | null;
  staffName: string;
  quantity: number;
  totalPrice: number;
  note: string | null;
};

export default async function TextbookSalesPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [textbooks, monthlySales, allTimeSales, recentSalesRaw] = await prisma.$transaction([
    prisma.textbook.findMany({
      orderBy: [{ subject: "asc" }, { title: "asc" }],
    }),
    prisma.textbookSale.groupBy({
      by: ["textbookId"],
      where: { soldAt: { gte: monthStart, lte: monthEnd } },
      _count: { _all: true },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { textbookId: "asc" },
    }),
    prisma.textbookSale.groupBy({
      by: ["textbookId"],
      _sum: { quantity: true, totalPrice: true },
      orderBy: { textbookId: "asc" },
    }),
    prisma.textbookSale.findMany({
      orderBy: { soldAt: "desc" },
      take: 20,
      include: {
        textbook: { select: { title: true } },
        staff: { select: { name: true } },
      },
    }),
  ]);

  const monthlyMap = new Map(
    monthlySales.map((s) => [
      s.textbookId,
      {
        count: (s._count as { _all?: number } | undefined)?._all ?? 0,
        qty: s._sum?.quantity ?? 0,
        amount: s._sum?.totalPrice ?? 0,
      },
    ]),
  );

  const allTimeMap = new Map(
    allTimeSales.map((s) => [
      s.textbookId,
      {
        qty: s._sum?.quantity ?? 0,
        amount: s._sum?.totalPrice ?? 0,
      },
    ]),
  );

  const textbooksWithStats: TextbookWithStats[] = textbooks.map((t) => {
    const monthly = monthlyMap.get(t.id);
    const allTime = allTimeMap.get(t.id);
    return {
      id: t.id,
      title: t.title,
      author: t.author,
      publisher: t.publisher,
      price: t.price,
      stock: t.stock,
      subject: t.subject,
      isActive: t.isActive,
      monthSaleCount: monthly?.count ?? 0,
      monthSaleQty: monthly?.qty ?? 0,
      monthSaleAmount: monthly?.amount ?? 0,
      totalSaleQty: allTime?.qty ?? 0,
      totalSaleAmount: allTime?.amount ?? 0,
    };
  });

  // KPI
  const totalCount = textbooks.length;
  const activeCount = textbooks.filter((t) => t.isActive).length;
  const monthSaleTotal = monthlySales.reduce((s, r) => s + ((r._count as { _all?: number } | undefined)?._all ?? 0), 0);
  const monthAmountTotal = monthlySales.reduce((s, r) => s + (r._sum?.totalPrice ?? 0), 0);
  const lowStockCount = textbooks.filter((t) => t.stock <= 5 && t.isActive).length;
  const totalStock = textbooks.reduce((s, t) => s + t.stock, 0);
  const outOfStockCount = textbooks.filter((t) => t.stock === 0 && t.isActive).length;

  const yearLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  const recentSales: RecentSaleRow[] = recentSalesRaw.map((s) => ({
    id: s.id,
    soldAt: s.soldAt.toISOString(),
    textbookId: s.textbookId,
    textbookTitle: s.textbook.title,
    examNumber: s.examNumber,
    staffName: s.staff.name,
    quantity: s.quantity,
    totalPrice: s.totalPrice,
    note: s.note,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            교재 판매 관리
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-ink">교재 판매 현황</h1>
          <p className="mt-2 text-sm text-slate">
            교재 재고·판매 통계를 확인하고 현장 판매를 등록합니다.
          </p>
        </div>
        <Link
          href="/admin/settings/textbooks"
          className="mt-1 flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          교재 등록·관리 →
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">총 교재 수</p>
          <p className="mt-2 text-3xl font-bold text-ink">{totalCount}종</p>
          <p className="mt-1 text-xs text-slate">활성 {activeCount}종</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">{yearLabel} 판매 건수</p>
          <p className="mt-2 text-3xl font-bold text-ink">{monthSaleTotal}건</p>
          <p className="mt-1 text-xs text-slate">
            {monthlySales.reduce((s, r) => s + (r._sum?.quantity ?? 0), 0)}권
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">{yearLabel} 판매액</p>
          <p className="mt-2 text-3xl font-bold text-ember">
            {monthAmountTotal.toLocaleString()}원
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">재고 부족 (5권 이하)</p>
          <p className={`mt-2 text-3xl font-bold ${lowStockCount > 0 ? "text-red-600" : "text-forest"}`}>
            {lowStockCount}종
          </p>
          <p className="mt-1 text-xs text-slate">즉시 발주 필요</p>
        </div>
      </div>

      {/* ── 재고 현황 요약 바 ── */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              Inventory Summary
            </p>
            <h2 className="mt-1 text-base font-semibold text-ink">재고 현황</h2>
          </div>
          {lowStockCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              재고 부족 {lowStockCount}종 — 즉시 발주 필요
            </span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3">
            <p className="text-xs text-slate">총 교재 종류</p>
            <p className="mt-1.5 text-xl font-bold text-ink">
              {totalCount}종
              <span className="ml-1.5 text-xs font-normal text-slate">활성 {activeCount}종</span>
            </p>
          </div>
          <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3">
            <p className="text-xs text-slate">총 재고</p>
            <p className="mt-1.5 text-xl font-bold text-ink">{totalStock.toLocaleString()}권</p>
          </div>
          <div
            className={`rounded-[20px] border px-4 py-3 ${
              lowStockCount > 0 ? "border-amber-200 bg-amber-50" : "border-ink/10 bg-mist"
            }`}
          >
            <p className="text-xs text-slate">재고 부족 (5권 이하)</p>
            <p
              className={`mt-1.5 text-xl font-bold ${lowStockCount > 0 ? "text-amber-700" : "text-forest"}`}
            >
              {lowStockCount}종
            </p>
          </div>
          <div
            className={`rounded-[20px] border px-4 py-3 ${
              outOfStockCount > 0 ? "border-red-200 bg-red-50" : "border-ink/10 bg-mist"
            }`}
          >
            <p className="text-xs text-slate">품절 (0권)</p>
            <p
              className={`mt-1.5 text-xl font-bold ${outOfStockCount > 0 ? "text-red-700" : "text-forest"}`}
            >
              {outOfStockCount}종
            </p>
          </div>
        </div>

        {/* Per-textbook stock bar visualization (top items only) */}
        {textbooks.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-slate">교재별 재고 현황</p>
            {textbooks
              .filter((t) => t.isActive)
              .sort((a, b) => a.stock - b.stock)
              .slice(0, 8)
              .map((t) => {
                const maxStock = Math.max(...textbooks.filter((x) => x.isActive).map((x) => x.stock), 1);
                const pct = Math.min(100, Math.round((t.stock / maxStock) * 100));
                return (
                  <div key={t.id} className="flex items-center gap-3">
                    <div className="w-32 min-w-0 truncate text-xs text-ink sm:w-40">{t.title}</div>
                    <div className="flex flex-1 items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/8">
                        <div
                          className={`h-full rounded-full transition-all ${
                            t.stock === 0
                              ? "bg-red-400"
                              : t.stock <= 5
                              ? "bg-amber-400"
                              : "bg-forest"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span
                        className={`w-12 text-right text-xs font-semibold tabular-nums ${
                          t.stock === 0
                            ? "text-red-600"
                            : t.stock <= 5
                            ? "text-amber-600"
                            : "text-ink"
                        }`}
                      >
                        {t.stock}권
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <div className="mt-8">
        <TextbookSalesManagerFull
          textbooks={textbooksWithStats}
          yearLabel={yearLabel}
          recentSales={recentSales}
        />
      </div>
    </div>
  );
}
