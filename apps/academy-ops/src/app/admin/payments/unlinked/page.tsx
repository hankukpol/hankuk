import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  UnlinkedPaymentsClient,
  type UnlinkedPaymentRow,
} from "./unlinked-payments-client";

export const dynamic = "force-dynamic";

export default async function UnlinkedPaymentsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  // Fetch payments where examNumber IS NULL and paymentLinkId IS NOT NULL
  const payments = await prisma.payment.findMany({
    where: {
      examNumber: null,
      paymentLinkId: { not: null },
    },
    include: {
      paymentLink: { select: { id: true, title: true, token: true } },
      items: { select: { itemName: true }, take: 3 },
    },
    orderBy: { processedAt: "desc" },
    take: 500,
  });

  const totalCount = payments.length;
  const totalAmount = payments.reduce((s, p) => s + p.netAmount, 0);

  const rows: UnlinkedPaymentRow[] = payments.map((p) => ({
    id: p.id,
    processedAt: p.processedAt.toISOString(),
    netAmount: p.netAmount,
    method: p.method,
    status: p.status,
    linkTitle: p.paymentLink?.title ?? null,
    linkToken: p.paymentLink?.token ?? null,
    paymentLinkId: p.paymentLinkId ?? null,
    itemSummary:
      p.items.length > 0
        ? p.items.map((i) => i.itemName).join(", ")
        : "—",
    note: p.note,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">미연결 결제</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            결제 링크를 통해 수납됐지만 아직 학생 계정에 연결되지 않은 결제 건입니다.{" "}
            <span className="font-semibold text-ink">&quot;학생 연결&quot;</span> 버튼으로 학번 검색 후 연결할 수
            있습니다.
          </p>
        </div>

        {/* Quick links */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/payments/links"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
          >
            결제 링크 관리 →
          </Link>
          <Link
            href="/admin/payments"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
          >
            전체 수납 이력 →
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div
          className={[
            "rounded-[28px] border p-6 shadow-sm",
            totalCount > 0
              ? "border-amber-200 bg-amber-50"
              : "border-ink/10 bg-white",
          ].join(" ")}
        >
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            미연결 건수
          </p>
          <p
            className={[
              "mt-2 text-3xl font-semibold",
              totalCount > 0 ? "text-amber-800" : "text-ink",
            ].join(" ")}
          >
            {totalCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>

        <div
          className={[
            "rounded-[28px] border p-6 shadow-sm",
            totalAmount > 0
              ? "border-ember/20 bg-ember/5"
              : "border-ink/10 bg-white",
          ].join(" ")}
        >
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            미연결 총액
          </p>
          <p
            className={[
              "mt-2 text-2xl font-semibold tabular-nums",
              totalAmount > 0 ? "text-ember" : "text-ink",
            ].join(" ")}
          >
            {totalAmount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">원</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            처리 방법
          </p>
          <p className="mt-2 text-sm font-medium text-ink">
            학생 검색 후 연결
          </p>
          <p className="mt-1 text-xs text-slate">
            이름 또는 학번으로 검색
          </p>
        </div>
      </div>

      {/* Client list */}
      <div className="mt-8">
        <UnlinkedPaymentsClient
          initialRows={rows}
          totalCount={totalCount}
          totalAmount={totalAmount}
        />
      </div>

      <p className="mt-4 text-xs text-slate/70">
        * 최대 500건의 미연결 결제를 조회합니다. 최신 결제 순으로 정렬됩니다.
      </p>
    </div>
  );
}
