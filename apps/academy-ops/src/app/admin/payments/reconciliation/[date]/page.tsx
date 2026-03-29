import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatKRW(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CATEGORY_LABEL: Record<string, string> = {
  TUITION: "수강료",
  FACILITY: "시설비",
  TEXTBOOK: "교재",
  MATERIAL: "교구",
  SINGLE_COURSE: "단과",
  PENALTY: "위약금",
  ETC: "기타",
};

const METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "이체",
  POINT: "포인트",
  MIXED: "혼합",
};

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "승인",
  PARTIAL_REFUNDED: "부분환불",
  FULLY_REFUNDED: "전액환불",
  CANCELLED: "취소",
  PENDING: "대기",
};

function parseDateParam(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (isNaN(date.getTime())) return null;
  return date;
}

export default async function ReconciliationDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const { date: dateParam } = await params;
  const dateObj = parseDateParam(dateParam);
  if (!dateObj) notFound();

  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const dayOfWeek = ["일", "월", "화", "수", "목", "금", "토"][dateObj.getDay()];
  const dateLabel = `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;

  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

  const prisma = getPrisma();

  const payments = await prisma.payment.findMany({
    where: {
      status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
      processedAt: { gte: startOfDay, lte: endOfDay },
    },
    include: {
      student: { select: { name: true, examNumber: true } },
      processor: { select: { name: true } },
      items: { select: { itemName: true, amount: true } },
      refunds: {
        where: { status: "COMPLETED" },
        select: { amount: true, refundType: true },
      },
    },
    orderBy: { processedAt: "asc" },
  });

  const refunds = await prisma.refund.findMany({
    where: {
      status: "COMPLETED",
      processedAt: { gte: startOfDay, lte: endOfDay },
    },
    select: {
      id: true,
      amount: true,
      refundType: true,
      processedAt: true,
      payment: {
        select: {
          id: true,
          student: { select: { name: true, examNumber: true } },
        },
      },
    },
    orderBy: { processedAt: "asc" },
  });

  const settlement = await prisma.dailySettlement.findUnique({
    where: { date: new Date(`${dateParam}T00:00:00`) },
  });

  // Aggregates
  const cashTotal = payments
    .filter((p) => p.method === "CASH")
    .reduce((s, p) => s + p.netAmount, 0);
  const cardTotal = payments
    .filter((p) => p.method === "CARD")
    .reduce((s, p) => s + p.netAmount, 0);
  const transferTotal = payments
    .filter((p) => p.method === "TRANSFER")
    .reduce((s, p) => s + p.netAmount, 0);
  const otherTotal = payments
    .filter((p) => !["CASH", "CARD", "TRANSFER"].includes(p.method))
    .reduce((s, p) => s + p.netAmount, 0);
  const paymentTotal = payments.reduce((s, p) => s + p.netAmount, 0);
  const refundTotal = refunds.reduce((s, r) => s + r.amount, 0);
  const netActual = paymentTotal - refundTotal;
  const settlementNet = settlement?.netTotal ?? 0;
  const discrepancy = netActual - settlementNet;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 대사
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{dateLabel} 대사</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            해당 날짜의 수납 내역과 일계표 정산 금액을 상세히 대조합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            prefetch={false}
            href={`/admin/payments/reconciliation?month=${monthStr}`}
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
          >
            ← {year}년 {month}월 대사 목록
          </Link>
          <Link
            prefetch={false}
            href={`/admin/settlements/daily`}
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
          >
            일계표 →
          </Link>
        </div>
      </div>

      {/* Comparison KPIs */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate">수납 합계 (순액)</p>
          <p className="mt-3 text-2xl font-semibold text-ink">{formatKRW(netActual)}</p>
          <div className="mt-3 space-y-1 text-xs text-slate">
            <div className="flex justify-between">
              <span>현금</span><span>{formatKRW(cashTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>카드</span><span>{formatKRW(cardTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>이체</span><span>{formatKRW(transferTotal)}</span>
            </div>
            {otherTotal > 0 && (
              <div className="flex justify-between">
                <span>기타</span><span>{formatKRW(otherTotal)}</span>
              </div>
            )}
            {refundTotal > 0 && (
              <div className="flex justify-between border-t border-ink/10 pt-1 text-red-600">
                <span>환불 차감</span><span>−{formatKRW(refundTotal)}</span>
              </div>
            )}
          </div>
        </article>

        <article
          className={`rounded-[28px] border p-6 shadow-sm ${
            settlement ? "border-forest/20 bg-forest/10" : "border-dashed border-ink/20 bg-mist/50"
          }`}
        >
          <p className="text-sm font-medium text-slate">일계표 정산액</p>
          {settlement ? (
            <>
              <p className="mt-3 text-2xl font-semibold text-forest">
                {formatKRW(settlement.netTotal)}
              </p>
              <div className="mt-3 space-y-1 text-xs text-slate">
                <div className="flex justify-between">
                  <span>현금</span><span>{formatKRW(settlement.cashAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>카드</span><span>{formatKRW(settlement.cardAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>이체</span><span>{formatKRW(settlement.transferAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-ink/10 pt-1">
                  <span>환불 차감</span><span>−{formatKRW(settlement.refundTotal)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-3 text-base text-slate">일계표 정산 기록 없음</p>
          )}
          {settlement?.closedAt && (
            <p className="mt-2 text-xs text-forest">
              마감: {new Date(settlement.closedAt).toLocaleString("ko-KR")}
            </p>
          )}
        </article>

        <article
          className={`rounded-[28px] border p-6 shadow-sm ${
            Math.abs(discrepancy) > 0 && settlement
              ? "border-amber-200 bg-amber-50"
              : "border-ink/10 bg-white"
          }`}
        >
          <p className="text-sm font-medium text-slate">차이</p>
          {settlement ? (
            <>
              <p
                className={`mt-3 text-2xl font-semibold ${
                  Math.abs(discrepancy) === 0
                    ? "text-forest"
                    : discrepancy > 0
                    ? "text-amber-700"
                    : "text-sky-700"
                }`}
              >
                {discrepancy >= 0 ? "+" : ""}
                {formatKRW(discrepancy)}
              </p>
              <p className="mt-2 text-xs text-slate">
                {Math.abs(discrepancy) === 0
                  ? "수납 합계와 정산액이 일치합니다"
                  : discrepancy > 0
                  ? "수납 합계가 정산액보다 많습니다"
                  : "정산액이 수납 합계보다 많습니다"}
              </p>
            </>
          ) : (
            <p className="mt-3 text-base text-slate">정산 미기록 — 대사 불가</p>
          )}
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate">내역 요약</p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate">수납 건수</span>
              <span className="font-semibold">{payments.length}건</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate">환불 건수</span>
              <span className="font-semibold">{refunds.length}건</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate">일계표</span>
              <span className={`font-semibold ${settlement ? "text-forest" : "text-slate"}`}>
                {settlement ? (settlement.closedAt ? "마감 완료" : "미마감") : "없음"}
              </span>
            </div>
          </div>
        </article>
      </section>

      {/* Settlement detail comparison */}
      {settlement && Math.abs(discrepancy) > 0 && (
        <section className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-base font-semibold text-amber-800">차이 분석</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "현금",
                actual: cashTotal - refunds.filter((r) => r.refundType === "CASH").reduce((s, r) => s + r.amount, 0),
                settlement: settlement.cashAmount,
              },
              {
                label: "카드",
                actual: cardTotal,
                settlement: settlement.cardAmount,
              },
              {
                label: "이체",
                actual: transferTotal,
                settlement: settlement.transferAmount,
              },
            ].map((item) => {
              const diff = item.actual - item.settlement;
              return (
                <div key={item.label} className="rounded-2xl border border-amber-200 bg-white p-4">
                  <p className="text-sm font-medium text-slate">{item.label}</p>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-slate">수납</span>
                    <span className="font-semibold">{formatKRW(item.actual)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-slate">정산</span>
                    <span className="font-semibold text-forest">{formatKRW(item.settlement)}</span>
                  </div>
                  {Math.abs(diff) > 0 && (
                    <div className="mt-2 border-t border-amber-100 pt-2 flex justify-between text-sm">
                      <span className="text-slate">차이</span>
                      <span className={`font-bold ${diff > 0 ? "text-amber-700" : "text-sky-700"}`}>
                        {diff >= 0 ? "+" : ""}{formatKRW(diff)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Payment list */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">수납 내역 ({payments.length}건)</h2>
        {payments.length === 0 ? (
          <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
            해당 날짜에 수납 내역이 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-5 py-4 font-semibold">시각</th>
                  <th className="px-5 py-4 font-semibold">학생</th>
                  <th className="px-5 py-4 font-semibold">분류</th>
                  <th className="px-5 py-4 font-semibold">수단</th>
                  <th className="px-5 py-4 text-right font-semibold">수납액</th>
                  <th className="px-5 py-4 font-semibold">상태</th>
                  <th className="px-5 py-4 font-semibold">처리자</th>
                  <th className="px-5 py-4 font-semibold">바로가기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-mist/40">
                    <td className="px-5 py-4 text-slate">
                      {formatTime(p.processedAt)}
                    </td>
                    <td className="px-5 py-4">
                      {p.student ? (
                        <Link
                          prefetch={false}
                          href={`/admin/students/${p.student.examNumber}`}
                          className="font-semibold text-ink hover:text-ember"
                        >
                          {p.student.name}
                        </Link>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                      {p.student?.examNumber && (
                        <p className="text-xs text-slate">{p.student.examNumber}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {CATEGORY_LABEL[p.category] ?? p.category}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      <span className="rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 font-medium">
                        {METHOD_LABEL[p.method] ?? p.method}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold">
                      {formatKRW(p.netAmount)}
                      {p.refunds.length > 0 && (
                        <p className="text-xs font-normal text-red-500">
                          환불 −{formatKRW(p.refunds.reduce((s, r) => s + r.amount, 0))}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          p.status === "APPROVED"
                            ? "border-forest/20 bg-forest/10 text-forest"
                            : p.status === "PARTIAL_REFUNDED"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-ink/10 bg-mist text-slate"
                        }`}
                      >
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate">
                      {p.processor.name}
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        prefetch={false}
                        href={`/admin/payments/${p.id}`}
                        className="rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/20"
                      >
                        상세 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-ink/10 bg-mist/60">
                <tr>
                  <td colSpan={4} className="px-5 py-4 font-semibold">
                    합계
                  </td>
                  <td className="px-5 py-4 text-right font-bold">
                    {formatKRW(paymentTotal)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Refund list */}
      {refunds.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">환불 내역 ({refunds.length}건)</h2>
          <div className="mt-4 overflow-x-auto rounded-[28px] border border-red-100 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-red-50/50 text-left">
                <tr>
                  <th className="px-5 py-4 font-semibold">시각</th>
                  <th className="px-5 py-4 font-semibold">학생</th>
                  <th className="px-5 py-4 font-semibold">환불 유형</th>
                  <th className="px-5 py-4 text-right font-semibold">환불액</th>
                  <th className="px-5 py-4 font-semibold">원 수납 ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {refunds.map((r) => (
                  <tr key={r.id} className="hover:bg-red-50/30">
                    <td className="px-5 py-4 text-slate">{formatTime(r.processedAt)}</td>
                    <td className="px-5 py-4">
                      {r.payment?.student ? (
                        <Link
                          prefetch={false}
                          href={`/admin/students/${r.payment.student.examNumber}`}
                          className="font-semibold text-ink hover:text-ember"
                        >
                          {r.payment.student.name}
                        </Link>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {r.refundType === "CARD_CANCEL"
                        ? "카드 당일 취소"
                        : r.refundType === "CASH"
                        ? "현금 환불"
                        : r.refundType === "TRANSFER"
                        ? "이체 환불"
                        : "부분 환불"}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-red-600">
                      −{formatKRW(r.amount)}
                    </td>
                    <td className="px-5 py-4">
                      {r.payment ? (
                        <Link
                          prefetch={false}
                          href={`/admin/payments/${r.payment.id}`}
                          className="font-mono text-xs text-slate hover:text-ember"
                        >
                          {r.payment.id.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-red-100 bg-red-50/50">
                <tr>
                  <td colSpan={3} className="px-5 py-4 font-semibold text-red-700">
                    환불 합계
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-red-600">
                    −{formatKRW(refundTotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* Settlement record detail */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">일계표 정산 기록</h2>
        {!settlement ? (
          <div className="mt-4 rounded-[28px] border border-dashed border-ink/20 bg-mist/50 px-6 py-12 text-center text-sm text-slate">
            해당 날짜의 일계표 정산 기록이 없습니다.{" "}
            <Link href="/admin/settlements/daily" className="text-ember hover:underline">
              일계표 페이지
            </Link>
            에서 정산을 처리할 수 있습니다.
          </div>
        ) : (
          <div className="mt-4 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate">현금</p>
                <p className="mt-2 text-lg font-semibold">{formatKRW(settlement.cashAmount)}</p>
                {settlement.cashActual !== null && settlement.cashActual !== undefined && (
                  <p className="mt-1 text-xs text-slate">
                    실사: {formatKRW(settlement.cashActual)}
                    {settlement.cashDiff !== null && settlement.cashDiff !== undefined && (
                      <span className={settlement.cashDiff === 0 ? "text-forest ml-2" : "text-amber-700 ml-2"}>
                        ({settlement.cashDiff >= 0 ? "+" : ""}
                        {formatKRW(settlement.cashDiff)})
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate">카드</p>
                <p className="mt-2 text-lg font-semibold">{formatKRW(settlement.cardAmount)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate">이체</p>
                <p className="mt-2 text-lg font-semibold">{formatKRW(settlement.transferAmount)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate">순합계</p>
                <p className="mt-2 text-lg font-semibold text-forest">{formatKRW(settlement.netTotal)}</p>
                <p className="mt-1 text-xs text-slate">환불 −{formatKRW(settlement.refundTotal)}</p>
              </div>
            </div>
            <div className="mt-4 border-t border-ink/10 pt-4 text-xs text-slate">
              {settlement.closedAt ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/10 px-3 py-1 font-medium text-forest">
                  마감 완료: {new Date(settlement.closedAt).toLocaleString("ko-KR")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-medium text-sky-700">
                  미마감 — 일계표에서 마감 처리 필요
                </span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
