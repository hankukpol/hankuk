import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SUBJECT_LABELS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  POLICE_SCIENCE: "경찰학",
  CUMULATIVE: "종합",
};

const PAYMENT_NOTE_PATTERN = /결제:\s*(현금|카드|계좌이체|포인트)/;

type PageProps = { params: Promise<{ id: string }> };

export default async function TextbookSalesHistoryPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const textbookId = Number(id);
  if (!Number.isInteger(textbookId) || textbookId <= 0) notFound();

  const prisma = getPrisma();

  const textbook = await prisma.textbook.findUnique({ where: { id: textbookId } });
  if (!textbook) notFound();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [sales, monthlyAgg, totalAgg] = await prisma.$transaction([
    prisma.textbookSale.findMany({
      where: { textbookId },
      include: {
        staff: { select: { name: true } },
      },
      orderBy: { soldAt: "desc" },
      take: 200,
    }),
    prisma.textbookSale.aggregate({
      where: { textbookId, soldAt: { gte: monthStart, lte: monthEnd } },
      _count: { id: true },
      _sum: { quantity: true, totalPrice: true },
    }),
    prisma.textbookSale.aggregate({
      where: { textbookId },
      _count: { id: true },
      _sum: { quantity: true, totalPrice: true },
    }),
  ]);

  const monthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  function extractPaymentMethod(note: string | null): string {
    if (!note) return "현금";
    const match = note.match(PAYMENT_NOTE_PATTERN);
    return match ? match[1] : "현금";
  }

  function extractNote(note: string | null): string | null {
    if (!note) return null;
    return note.replace(PAYMENT_NOTE_PATTERN, "").replace(/\s*\|\s*$/, "").replace(/^\s*\|\s*/, "").trim() || null;
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Back */}
      <Link
        href="/admin/textbooks"
        className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ink"
      >
        ← 교재 판매 현황
      </Link>

      <div className="mt-4 inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        교재 판매 이력
      </div>

      {/* Header */}
      <h1 className="mt-4 text-3xl font-semibold text-ink">{textbook.title}</h1>
      <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate">
        {textbook.author && <span>저자: {textbook.author}</span>}
        {textbook.publisher && <span>출판사: {textbook.publisher}</span>}
        {textbook.subject && (
          <span>과목: {SUBJECT_LABELS[textbook.subject] ?? textbook.subject}</span>
        )}
        <span>판매가: {textbook.price.toLocaleString()}원</span>
        <span
          className={`font-medium ${
            textbook.stock === 0
              ? "text-red-600"
              : textbook.stock <= 5
              ? "text-amber-600"
              : "text-forest"
          }`}
        >
          현재 재고: {textbook.stock}개
        </span>
      </div>

      {/* KPI */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">{monthLabel} 판매 건수</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {monthlyAgg._count.id}건
          </p>
          <p className="mt-1 text-xs text-slate">{monthlyAgg._sum.quantity ?? 0}권</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">{monthLabel} 판매액</p>
          <p className="mt-2 text-3xl font-bold text-ember">
            {(monthlyAgg._sum.totalPrice ?? 0).toLocaleString()}원
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">누적 판매 건수</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {totalAgg._count.id}건
          </p>
          <p className="mt-1 text-xs text-slate">{totalAgg._sum.quantity ?? 0}권</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">누적 판매액</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {(totalAgg._sum.totalPrice ?? 0).toLocaleString()}원
          </p>
        </div>
      </div>

      {/* Sales table */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">판매 이력 (최근 200건)</h2>
        </div>
        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
          <table className="min-w-full divide-y divide-ink/8 text-sm">
            <thead>
              <tr className="bg-mist/50">
                {["판매 일시", "수험번호", "수량", "단가", "합계", "결제", "메모", "처리자"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate">
                    판매 이력이 없습니다.
                  </td>
                </tr>
              ) : null}
              {sales.map((s) => {
                const paymentMethod = extractPaymentMethod(s.note);
                const cleanNote = extractNote(s.note);
                return (
                  <tr key={s.id} className="transition hover:bg-mist/30">
                    <td className="px-4 py-3 tabular-nums text-slate">
                      <div>
                        {new Date(s.soldAt).toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </div>
                      <div className="text-xs text-slate/70">
                        {new Date(s.soldAt).toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
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
                        <span className="text-slate">외부 구매</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink">
                      {s.quantity}권
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate">
                      {s.unitPrice.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-ink">
                      {s.totalPrice.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          paymentMethod === "현금"
                            ? "bg-amber-50 text-amber-700"
                            : paymentMethod === "카드"
                            ? "bg-sky-50 text-sky-700"
                            : paymentMethod === "계좌이체"
                            ? "bg-forest/10 text-forest"
                            : "bg-purple-50 text-purple-700"
                        }`}
                      >
                        {paymentMethod}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {cleanNote ?? <span className="text-ink/30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate">{s.staff.name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
