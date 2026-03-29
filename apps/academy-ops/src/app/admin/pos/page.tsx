import { AdminRole, PaymentMethod } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PosPayment = {
  id: string;
  netAmount: number;
  method: PaymentMethod;
  note: string | null;
  createdAt: Date;
  examNumber: string | null;
  student: { name: string; examNumber: string } | null;
  items: { itemName: string; amount: number }[];
};

function fmt(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default async function PosPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const tomorrowStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
  );

  const rawPayments = await getPrisma().payment.findMany({
    where: {
      category: "SINGLE_COURSE",
      createdAt: { gte: todayStart, lt: tomorrowStart },
    },
    select: {
      id: true,
      netAmount: true,
      method: true,
      note: true,
      createdAt: true,
      examNumber: true,
      student: { select: { name: true, examNumber: true } },
      items: { select: { itemName: true, amount: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const todayPayments = rawPayments as PosPayment[];

  const totalCount = todayPayments.length;
  const totalAmount = todayPayments.reduce((s, p) => s + p.netAmount, 0);
  const cashCount = todayPayments.filter((p) => p.method === "CASH").length;
  const cardCount = todayPayments.filter((p) => p.method === "CARD").length;
  const transferCount = todayPayments.filter((p) => p.method === "TRANSFER").length;

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        결제
      </div>

      {/* Header row */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">단과 빠른 결제 (POS)</h1>
          <p className="mt-2 text-sm leading-7 text-slate">
            단과 특강 즉석 결제를 처리합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/settlements/daily?date=${now.toISOString().slice(0, 10)}`}
            className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-5 py-3 text-sm font-medium text-slate transition hover:border-ink/40 hover:bg-mist"
          >
            일계표 보기
          </Link>
          <Link
            href="/admin/pos/new"
            className="inline-flex items-center gap-2 rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            + 새 결제
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">오늘 결제 건수</p>
          <p className="mt-2 text-3xl font-bold text-ink tabular-nums">
            {totalCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">오늘 단과 매출</p>
          <p className="mt-2 text-3xl font-bold text-ember tabular-nums">
            {totalAmount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">원</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">현금</p>
          <p className="mt-2 text-3xl font-bold text-ink tabular-nums">
            {cashCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-medium text-slate">카드 / 이체</p>
          <p className="mt-2 text-3xl font-bold text-ink tabular-nums">
            {cardCount.toLocaleString()} / {transferCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>
      </div>

      {/* Today's transactions table */}
      <div className="mt-8">
        <h2 className="text-base font-semibold text-ink">오늘 결제 내역</h2>

        {todayPayments.length === 0 ? (
          <div className="mt-4 rounded-[24px] border border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
            오늘 처리된 단과 결제가 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-[24px] border border-ink/10 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60">
                    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold text-slate">
                      시각
                    </th>
                    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold text-slate">
                      학생
                    </th>
                    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold text-slate">
                      상품
                    </th>
                    <th className="whitespace-nowrap px-5 py-3 text-right text-xs font-semibold text-slate">
                      금액
                    </th>
                    <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold text-slate">
                      결제수단
                    </th>
                    <th className="whitespace-nowrap px-5 py-3 text-center text-xs font-semibold text-slate">
                      영수증
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {todayPayments.map((p) => {
                    const timeStr = p.createdAt.toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    });
                    const itemDisplay =
                      p.items.length > 0
                        ? p.items.map((i) => i.itemName).join(", ")
                        : (p.note ?? "단과");
                    return (
                      <tr key={p.id} className="transition-colors hover:bg-mist/30">
                        <td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-slate">
                          {timeStr}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          {p.student ? (
                            <Link
                              href={`/admin/students/${p.student.examNumber}`}
                              className="font-medium text-ink transition-colors hover:text-ember"
                            >
                              {p.student.name}
                              <span className="ml-1.5 text-xs text-slate">
                                {p.student.examNumber}
                              </span>
                            </Link>
                          ) : (
                            <span className="text-slate">비회원</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-slate">{itemDisplay}</td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-right font-semibold tabular-nums text-ink">
                          {fmt(p.netAmount)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                              p.method === "CASH"
                                ? "border-forest/30 bg-forest/10 text-forest"
                                : p.method === "CARD"
                                  ? "border-ember/30 bg-ember/10 text-ember"
                                  : "border-sky-200 bg-sky-50 text-sky-800"
                            }`}
                          >
                            {PAYMENT_METHOD_LABEL[p.method]}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <Link
                            href={`/admin/payments/${p.id}/receipt`}
                            target="_blank"
                            className="text-xs font-medium text-ember hover:underline"
                          >
                            영수증
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer summary */}
            <div className="border-t border-ink/10 bg-mist/40 px-5 py-3 text-right text-sm">
              <span className="text-slate">합계 </span>
              <span className="font-bold tabular-nums text-ink">{fmt(totalAmount)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
