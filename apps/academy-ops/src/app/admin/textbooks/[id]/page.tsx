import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { InlineStockAdjust } from "@/components/textbooks/inline-stock-adjust";

export const dynamic = "force-dynamic";

const SUBJECT_LABELS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  POLICE_SCIENCE: "경찰학",
  CUMULATIVE: "종합",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function TextbookDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const textbookId = Number(id);
  if (!Number.isInteger(textbookId) || textbookId <= 0) notFound();

  const prisma = getPrisma();

  const textbook = await prisma.textbook.findUnique({ where: { id: textbookId } });
  if (!textbook) notFound();

  const now = new Date();
  // Last 6 months for monthly breakdown
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [totalAgg, recentSales, monthlySales] = await prisma.$transaction([
    prisma.textbookSale.aggregate({
      where: { textbookId },
      _count: { id: true },
      _sum: { quantity: true, totalPrice: true },
    }),
    prisma.textbookSale.findMany({
      where: { textbookId },
      include: {
        staff: { select: { name: true } },
      },
      orderBy: { soldAt: "desc" },
      take: 20,
    }),
    prisma.textbookSale.findMany({
      where: { textbookId, soldAt: { gte: sixMonthsAgo } },
      select: { soldAt: true, quantity: true, totalPrice: true },
      orderBy: { soldAt: "asc" },
    }),
  ]);

  // Fetch student names for exam numbers present in recent sales
  const examNumbers = recentSales
    .map((s) => s.examNumber)
    .filter((n): n is string => n !== null);

  const uniqueExamNumbers = [...new Set(examNumbers)];

  const students =
    uniqueExamNumbers.length > 0
      ? await prisma.student.findMany({
          where: { examNumber: { in: uniqueExamNumbers } },
          select: { examNumber: true, name: true },
        })
      : [];

  const studentNameMap = new Map(students.map((s) => [s.examNumber, s.name]));

  const totalSaleCount = totalAgg._count.id;
  const totalSaleQty = totalAgg._sum.quantity ?? 0;
  const totalSaleAmount = totalAgg._sum.totalPrice ?? 0;

  // Build monthly breakdown for last 6 months
  type MonthStat = { label: string; qty: number; amount: number; count: number };
  const monthlyMap = new Map<string, MonthStat>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, {
      label: `${d.getMonth() + 1}월`,
      qty: 0,
      amount: 0,
      count: 0,
    });
  }
  for (const sale of monthlySales) {
    const d = new Date(sale.soldAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = monthlyMap.get(key);
    if (entry) {
      entry.qty += sale.quantity;
      entry.amount += sale.totalPrice;
      entry.count += 1;
    }
  }
  const monthlyStats = Array.from(monthlyMap.values());
  const maxMonthlyQty = Math.max(...monthlyStats.map((m) => m.qty), 1);
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthStat = monthlyMap.get(thisMonthKey)!;

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate">
        <Link
          href="/admin/textbooks"
          className="transition hover:text-ink"
        >
          교재 관리
        </Link>
        <span>/</span>
        <span className="text-ink">{textbook.title}</span>
      </nav>

      {/* Header */}
      <div className="mt-6 flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            교재 상세
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-ink">{textbook.title}</h1>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate">
            {textbook.author && <span>저자: {textbook.author}</span>}
            {textbook.publisher && <span>출판사: {textbook.publisher}</span>}
            {textbook.subject && (
              <span>과목: {SUBJECT_LABELS[textbook.subject] ?? textbook.subject}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/admin/textbooks/${textbookId}/edit`}
            className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
          >
            수정
          </Link>
          <Link
            href="/admin/textbooks"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            ← 목록으로
          </Link>
        </div>
      </div>

      {/* Info card */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
        <h2 className="text-base font-semibold text-ink">교재 정보</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-slate">과목</dt>
            <dd className="mt-1 text-sm text-ink">
              {textbook.subject
                ? (SUBJECT_LABELS[textbook.subject] ?? textbook.subject)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate">출판사</dt>
            <dd className="mt-1 text-sm text-ink">{textbook.publisher ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate">저자</dt>
            <dd className="mt-1 text-sm text-ink">{textbook.author ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate">판매가</dt>
            <dd className="mt-1 text-sm font-semibold text-ember">
              {textbook.price.toLocaleString()}원
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate">재고</dt>
            <dd className="mt-1">
              <InlineStockAdjust
                textbookId={textbookId}
                textbookTitle={textbook.title}
                currentStock={textbook.stock}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate">활성 여부</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  textbook.isActive
                    ? "bg-forest/10 text-forest"
                    : "bg-ink/5 text-slate"
                }`}
              >
                {textbook.isActive ? "판매 중" : "판매 중단"}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Sales summary card */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
          <p className="text-xs font-medium text-slate">총 판매 건수</p>
          <p className="mt-2 text-3xl font-bold text-ink">{totalSaleCount}건</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
          <p className="text-xs font-medium text-slate">총 판매 수량</p>
          <p className="mt-2 text-3xl font-bold text-ink">{totalSaleQty}권</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
          <p className="text-xs font-medium text-slate">총 판매 금액</p>
          <p className="mt-2 text-3xl font-bold text-ember">
            {totalSaleAmount.toLocaleString()}원
          </p>
        </div>
      </div>

      {/* Monthly sales breakdown */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              Monthly Sales
            </p>
            <h2 className="mt-1 text-base font-semibold text-ink">월별 판매 현황 (최근 6개월)</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-[16px] border border-ember/20 bg-ember/5 px-4 py-2 text-center">
              <p className="text-[10px] text-slate">이번 달 판매</p>
              <p className="mt-0.5 text-lg font-bold text-ember">
                {thisMonthStat.qty}권
              </p>
              <p className="text-[10px] text-slate">
                {thisMonthStat.amount.toLocaleString()}원
              </p>
            </div>
          </div>
        </div>

        {/* Bar chart */}
        <div className="mt-5">
          <div className="flex h-32 items-end gap-2">
            {monthlyStats.map((m) => {
              const heightPct = maxMonthlyQty > 0 ? Math.max(4, Math.round((m.qty / maxMonthlyQty) * 100)) : 4;
              const isThisMonth = m.label === `${now.getMonth() + 1}월`;
              return (
                <div key={m.label} className="group relative flex flex-1 flex-col items-center justify-end">
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 hidden w-28 rounded-xl border border-ink/10 bg-white p-2 text-center text-xs shadow-md group-hover:block z-10">
                    <p className="font-semibold text-ink">{m.label}</p>
                    <p className="text-slate">{m.qty}권 / {m.count}건</p>
                    <p className="font-semibold text-ember">{m.amount.toLocaleString()}원</p>
                  </div>
                  <div
                    className={`w-full rounded-t-lg transition-all ${
                      isThisMonth ? "bg-ember" : "bg-forest/40 hover:bg-forest/60"
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                  <p className={`mt-1.5 text-center text-[10px] font-medium ${isThisMonth ? "text-ember" : "text-slate"}`}>
                    {m.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Monthly table */}
        <div className="mt-4 overflow-hidden rounded-[20px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/8 text-sm">
            <thead className="bg-mist/60">
              <tr>
                {["월", "판매 건수", "판매 수량", "판매 금액"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {monthlyStats.map((m) => {
                const isThisMonth = m.label === `${now.getMonth() + 1}월`;
                return (
                  <tr key={m.label} className={isThisMonth ? "bg-ember/5" : "hover:bg-mist/30"}>
                    <td className={`px-4 py-2.5 text-sm font-semibold ${isThisMonth ? "text-ember" : "text-ink"}`}>
                      {m.label}
                      {isThisMonth && (
                        <span className="ml-1.5 text-[10px] font-normal text-slate">(이번 달)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-ink">
                      {m.count > 0 ? `${m.count}건` : <span className="text-slate/40">—</span>}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-ink">
                      {m.qty > 0 ? `${m.qty}권` : <span className="text-slate/40">—</span>}
                    </td>
                    <td className={`px-4 py-2.5 tabular-nums font-semibold ${m.amount > 0 ? "text-ember" : "text-slate/40"}`}>
                      {m.amount > 0 ? `${m.amount.toLocaleString()}원` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent sales table */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">최근 판매 내역</h2>
          <Link
            href={`/admin/textbooks/${textbookId}/sales`}
            className="text-sm font-medium text-ember transition hover:text-ember/80"
          >
            전체 판매 이력 보기 →
          </Link>
        </div>
        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <table className="min-w-full divide-y divide-ink/8 text-sm">
            <thead>
              <tr className="bg-mist/50">
                {["판매일", "학번", "이름", "수량", "금액", "판매자"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {recentSales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate">
                    판매 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                recentSales.map((s) => (
                  <tr key={s.id} className="transition hover:bg-mist/30">
                    <td className="px-4 py-3 tabular-nums text-slate">
                      {new Date(s.soldAt).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {s.examNumber ? (
                        <Link
                          href={`/admin/students/${s.examNumber}`}
                          className="font-medium text-ember hover:underline"
                        >
                          {s.examNumber}
                        </Link>
                      ) : (
                        <span className="text-slate/60">외부</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {s.examNumber
                        ? (studentNameMap.get(s.examNumber) ?? "—")
                        : <span className="text-slate/60">외부 구매</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink">
                      {s.quantity}권
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-ink">
                      {s.totalPrice.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 text-slate">{s.staff.name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
