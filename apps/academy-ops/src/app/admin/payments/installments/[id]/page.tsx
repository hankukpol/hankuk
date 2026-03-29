import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PayButton } from "./pay-button";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

export default async function InstallmentDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;

  const installment = await getPrisma().installment.findUnique({
    where: { id },
    include: {
      payment: {
        include: {
          student: { select: { name: true, phone: true, examNumber: true } },
          items: { orderBy: { id: "asc" } },
          installments: { orderBy: { seq: "asc" } },
          processor: { select: { name: true } },
        },
      },
    },
  });

  if (!installment) notFound();

  const { payment } = installment;
  const siblings = payment.installments;
  const totalInstallments = siblings.length;
  const paidCount = siblings.filter((s) => s.paidAt !== null).length;
  const firstItemName = payment.items[0]?.itemName ?? "수납 항목";

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/payments/installments" className="transition hover:text-ink">
          할부 관리
        </Link>
        <span className="text-slate/40">/</span>
        <Link
          href={`/admin/payments/${payment.id}`}
          className="transition hover:text-ink"
        >
          수납 #{payment.id.slice(-6)}
        </Link>
        <span className="text-slate/40">/</span>
        <span className="text-ink">{installment.seq}회차</span>
      </nav>

      {/* Header badge */}
      <div className="mt-5 inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        분납 상세
      </div>

      {/* Title row */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">
            {payment.student?.name ?? "비회원"}
            <span className="ml-3 text-xl font-normal text-slate">
              {installment.seq}회차 / {formatKRW(installment.amount)}
            </span>
          </h1>
          {payment.examNumber ? (
            <p className="mt-1 text-sm text-slate">
              학번:{" "}
              <Link
                href={`/admin/students/${payment.examNumber}`}
                className="text-forest hover:underline"
              >
                {payment.examNumber}
              </Link>
              {payment.student?.phone ? ` · ${payment.student.phone}` : ""}
            </p>
          ) : null}
        </div>
        <Link
          href="/admin/payments/installments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; 할부 관리로
        </Link>
      </div>

      {/* Payment summary card */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold text-ink">원 수납 정보</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate">수납 항목</p>
            <p className="mt-1 text-sm font-semibold text-ink">{firstItemName}</p>
            {payment.items.length > 1 && (
              <p className="text-xs text-slate">외 {payment.items.length - 1}건</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate">총 수납액</p>
            <p className="mt-1 text-sm font-semibold text-ink">{formatKRW(payment.netAmount)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate">수납일</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {formatDate(payment.processedAt)}
            </p>
            <p className="text-xs text-slate">{payment.processor.name}</p>
          </div>
        </div>
        {payment.note ? (
          <p className="mt-4 rounded-[12px] bg-mist/60 px-4 py-2 text-xs text-slate">
            메모: {payment.note}
          </p>
        ) : null}

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-slate">
            <span>{totalInstallments}회 분납 계획</span>
            <span className="text-forest font-semibold">{paidCount} / {totalInstallments} 완납</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-forest transition-all"
              style={{ width: totalInstallments > 0 ? `${(paidCount / totalInstallments) * 100}%` : "0%" }}
            />
          </div>
        </div>
      </div>

      {/* Installment schedule table */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="px-6 pt-5 pb-4">
          <h2 className="text-base font-semibold text-ink">분할납부 계획</h2>
          <p className="mt-1 text-xs text-slate">
            전체 {totalInstallments}회차 납부 일정. 현재 보고 있는 회차가 강조 표시됩니다.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-t border-ink/5 bg-mist/50">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  회차
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  납부 예정일
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate">
                  금액
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  납부일
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  상태
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {siblings.map((sib) => {
                const isCurrent = sib.id === id;
                const isPaid = sib.paidAt !== null;
                const now = new Date();
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const isOverdue = !isPaid && sib.dueDate < todayStart;

                return (
                  <tr
                    key={sib.id}
                    className={[
                      "transition-colors",
                      isCurrent
                        ? "bg-ember/5 ring-1 ring-inset ring-ember/20"
                        : "hover:bg-mist/30",
                    ].join(" ")}
                  >
                    <td className="px-6 py-4">
                      <span
                        className={[
                          "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                          isCurrent
                            ? "bg-ember text-white"
                            : isPaid
                              ? "bg-forest/10 text-forest"
                              : "bg-ink/5 text-ink",
                        ].join(" ")}
                      >
                        {sib.seq}
                      </span>
                      {isCurrent && (
                        <span className="ml-2 text-xs font-semibold text-ember">현재</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-ink">
                      {formatDate(sib.dueDate)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-semibold text-ink tabular-nums">
                      {formatKRW(sib.amount)}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">
                      {isPaid ? (
                        <span className="text-forest">{formatDate(sib.paidAt!)}</span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isPaid ? (
                        <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                          납부완료
                        </span>
                      ) : isOverdue ? (
                        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                          연체
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                          미납
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action section */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-base font-semibold text-ink">납부 처리</h2>
        <p className="mt-1 text-xs text-slate">
          {installment.seq}회차 ({formatKRW(installment.amount)}) — 예정일: {formatDate(installment.dueDate)}
        </p>
        <div className="mt-4">
          <PayButton
            installmentId={id}
            amount={installment.amount}
            isPaid={installment.paidAt !== null}
            paidAt={installment.paidAt?.toISOString() ?? null}
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/payments/installments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; 할부 관리
        </Link>
        <Link
          href={`/admin/payments/${payment.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/5 px-5 py-2.5 text-sm font-medium text-ember transition hover:bg-ember/10"
        >
          원 수납 상세 보기
        </Link>
      </div>
    </div>
  );
}
