import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
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

export default async function TextbookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) notFound();

  const prisma = getPrisma();

  const textbook = await prisma.textbook.findUnique({
    where: { id: numericId },
    include: {
      sales: {
        orderBy: { soldAt: "desc" },
        take: 50,
        include: {
          staff: { select: { name: true } },
        },
      },
    },
  });

  if (!textbook) notFound();

  // Fetch payment items whose itemName matches textbook title (TEXTBOOK category payments)
  const paymentItems = await prisma.paymentItem.findMany({
    where: {
      itemName: { contains: textbook.title, mode: "insensitive" },
      itemType: "TEXTBOOK",
    },
    orderBy: { id: "desc" },
    take: 30,
    include: {
      payment: {
        select: {
          id: true,
          examNumber: true,
          processedAt: true,
          netAmount: true,
          student: { select: { name: true } },
        },
      },
    },
  });

  const totalSalesCount = textbook.sales.reduce((sum, s) => sum + s.quantity, 0);
  const totalSalesRevenue = textbook.sales.reduce((sum, s) => sum + s.totalPrice, 0);

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "설정", href: "/admin/settings" },
          { label: "교재 관리", href: "/admin/settings/textbooks" },
          { label: textbook.title },
        ]}
      />

      {/* Badge */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        교재 상세
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">{textbook.title}</h1>
          <p className="mt-1 text-sm text-slate">교재 ID: #{textbook.id}</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/settings/textbooks"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            ← 목록으로
          </Link>
        </div>
      </div>

      {/* Info Grid */}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {/* Basic Info Card */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">기본 정보</h2>
          <dl className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-sm text-slate">교재명</dt>
              <dd className="text-right text-sm font-medium text-ink">{textbook.title}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-sm text-slate">저자</dt>
              <dd className="text-right text-sm text-ink">{textbook.author ?? "-"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-sm text-slate">출판사</dt>
              <dd className="text-right text-sm text-ink">{textbook.publisher ?? "-"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-sm text-slate">관련 과목</dt>
              <dd className="text-right text-sm text-ink">
                {textbook.subject
                  ? (SUBJECT_LABELS[textbook.subject] ?? textbook.subject)
                  : "일반"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-sm text-slate">판매가</dt>
              <dd className="text-right text-sm font-semibold text-ink">
                {textbook.price.toLocaleString()}원
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-sm text-slate">현재 재고</dt>
              <dd className="text-right text-sm font-semibold">
                <span className={textbook.stock === 0 ? "text-red-600" : "text-ink"}>
                  {textbook.stock}개
                </span>
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-sm text-slate">상태</dt>
              <dd className="text-right">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    textbook.isActive
                      ? "bg-green-50 text-green-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {textbook.isActive ? "활성 (판매 중)" : "비활성 (판매 중단)"}
                </span>
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-sm text-slate">등록일</dt>
              <dd className="text-right text-sm text-slate">
                {textbook.createdAt.toLocaleDateString("ko-KR")}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-sm text-slate">최종 수정일</dt>
              <dd className="text-right text-sm text-slate">
                {textbook.updatedAt.toLocaleDateString("ko-KR")}
              </dd>
            </div>
          </dl>
        </div>

        {/* Sales Summary Card */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">판매 통계</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-forest/20 bg-forest/5 p-4 text-center">
              <p className="text-xs text-slate">총 판매 수량</p>
              <p className="mt-1 text-2xl font-bold text-forest">{totalSalesCount}권</p>
            </div>
            <div className="rounded-2xl border border-ember/20 bg-ember/5 p-4 text-center">
              <p className="text-xs text-slate">총 판매 금액</p>
              <p className="mt-1 text-2xl font-bold text-ember">
                {totalSalesRevenue.toLocaleString()}원
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-ink/5 bg-mist/50 p-4 text-center">
            <p className="text-xs text-slate">총 판매 건수</p>
            <p className="mt-1 text-xl font-semibold text-ink">{textbook.sales.length}건</p>
          </div>
        </div>
      </div>

      {/* Sales History */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">
            판매 내역
            <span className="ml-2 text-sm font-normal text-slate">
              (최근 50건)
            </span>
          </h2>
        </div>
        {textbook.sales.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate">
            판매 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead>
                <tr>
                  {["판매일", "학번", "수량", "단가", "합계", "처리직원", "비고"].map(
                    (header) => (
                      <th
                        key={header}
                        className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {textbook.sales.map((sale) => (
                  <tr key={sale.id} className="transition hover:bg-mist/30">
                    <td className="px-4 py-3 text-slate">
                      {sale.soldAt.toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3">
                      {sale.examNumber ? (
                        <Link
                          href={`/admin/students/${sale.examNumber}`}
                          className="font-mono text-xs text-ember hover:underline"
                        >
                          {sale.examNumber}
                        </Link>
                      ) : (
                        <span className="text-slate">외부 구매</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink">{sale.quantity}권</td>
                    <td className="px-4 py-3 tabular-nums text-slate">
                      {sale.unitPrice.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-ink">
                      {sale.totalPrice.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 text-slate">{sale.staff.name}</td>
                    <td className="px-4 py-3 text-slate">{sale.note ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Items (TEXTBOOK category) */}
      {paymentItems.length > 0 && (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white">
          <div className="border-b border-ink/10 px-6 py-4">
            <h2 className="text-base font-semibold text-ink">
              수납 연결 내역
              <span className="ml-2 text-sm font-normal text-slate">
                (교재 항목이 포함된 수납)
              </span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead>
                <tr>
                  {["수납일", "학번", "학생명", "항목명", "금액", "수납 상세"].map(
                    (header) => (
                      <th
                        key={header}
                        className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {paymentItems.map((item) => (
                  <tr key={item.id} className="transition hover:bg-mist/30">
                    <td className="px-4 py-3 text-slate">
                      {item.payment.processedAt.toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3">
                      {item.payment.examNumber ? (
                        <Link
                          href={`/admin/students/${item.payment.examNumber}`}
                          className="font-mono text-xs text-ember hover:underline"
                        >
                          {item.payment.examNumber}
                        </Link>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {item.payment.student?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-ink">{item.itemName}</td>
                    <td className="px-4 py-3 tabular-nums font-medium text-ink">
                      {item.amount.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/payments/${item.payment.id}`}
                        className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-medium transition hover:border-ember/30 hover:text-ember"
                      >
                        상세 보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
