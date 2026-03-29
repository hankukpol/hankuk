"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InstallmentDashboardRow = {
  id: string;
  paymentId: string;
  seq: number;
  amount: number;
  dueDate: string; // ISO
  paidAt: string | null; // ISO or null
  examNumber: string | null;
  studentName: string | null;
  cohortName: string | null;
  daysOverdue: number; // 0 = not overdue, positive = overdue days
};

export type InstallmentDashboardStats = {
  totalOutstanding: number; // sum of all unpaid amounts
  overdueCount: number;
  upcomingWeekCount: number; // due in next 7 days
  collectionRate: number; // paidCount / totalCount * 100
};

export type InstallmentClientProps = {
  rows: InstallmentDashboardRow[];
  stats: InstallmentDashboardStats;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRW(n: number): string {
  return "₩" + n.toLocaleString("ko-KR");
}

function toDateDisplay(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, ".");
}

type TabFilter = "all" | "overdue" | "upcoming" | "paid";

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
      <p className="text-xs font-medium uppercase tracking-widest text-slate">{label}</p>
      <p className={["mt-2 text-2xl font-bold tabular-nums", accent ?? "text-ink"].join(" ")}>
        {value}
      </p>
      <p className="mt-1 text-xs text-slate">{sub}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function InstallmentClient({ rows, stats }: InstallmentClientProps) {
  const [activeTab, setActiveTab] = useState<TabFilter>("all");

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekLater = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  function classifyRow(row: InstallmentDashboardRow): TabFilter {
    if (row.paidAt !== null) return "paid";
    const due = new Date(row.dueDate);
    if (due < todayStart) return "overdue";
    if (due <= weekLater) return "upcoming";
    return "upcoming";
  }

  const filtered =
    activeTab === "all"
      ? rows
      : rows.filter((r) => classifyRow(r) === activeTab);

  const tabs: { value: TabFilter; label: string; count: number }[] = [
    { value: "all", label: "전체", count: rows.length },
    { value: "overdue", label: "연체", count: rows.filter((r) => classifyRow(r) === "overdue").length },
    { value: "upcoming", label: "이번주 예정", count: rows.filter((r) => classifyRow(r) === "upcoming").length },
    { value: "paid", label: "납부완료", count: rows.filter((r) => classifyRow(r) === "paid").length },
  ];

  function overdueDays(row: InstallmentDashboardRow): number {
    if (row.paidAt !== null) return 0;
    const due = new Date(row.dueDate);
    if (due >= todayStart) return 0;
    return Math.floor((todayStart.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  }

  function rowBg(row: InstallmentDashboardRow): string {
    const tab = classifyRow(row);
    if (tab === "overdue") return "bg-red-50";
    return "";
  }

  function statusBadge(row: InstallmentDashboardRow): { label: string; cls: string } {
    const tab = classifyRow(row);
    if (tab === "paid") return { label: "납부완료", cls: "border-forest/30 bg-forest/10 text-forest" };
    if (tab === "overdue") return { label: "연체", cls: "border-red-200 bg-red-50 text-red-700" };
    return { label: "예정", cls: "border-amber-200 bg-amber-50 text-amber-700" };
  }

  return (
    <div className="space-y-8">
      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="총 미납"
          value={formatKRW(stats.totalOutstanding)}
          sub="납부 완료 제외 전체 잔액"
          accent="text-ember"
        />
        <KpiCard
          label="연체 건수"
          value={`${stats.overdueCount.toLocaleString()}건`}
          sub="납기일 초과 미납"
          accent={stats.overdueCount > 0 ? "text-red-600" : undefined}
        />
        <KpiCard
          label="이번주 예정"
          value={`${stats.upcomingWeekCount.toLocaleString()}건`}
          sub="7일 이내 납부 예정"
          accent="text-amber-700"
        />
        <KpiCard
          label="수납율"
          value={`${stats.collectionRate.toFixed(1)}%`}
          sub="전체 회차 기준"
          accent={stats.collectionRate >= 80 ? "text-forest" : undefined}
        />
      </div>

      {/* ── Filter Tabs ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-ember bg-ember text-white"
                  : "border-ink/20 bg-white text-ink hover:border-ember/40 hover:text-ember",
              ].join(" ")}
            >
              {tab.label}
              <span
                className={[
                  "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                  isActive
                    ? "bg-white/30 text-white"
                    : tab.value === "overdue"
                      ? "bg-red-50 text-red-700"
                      : "bg-mist text-slate",
                ].join(" ")}
              >
                {tab.count.toLocaleString()}
              </span>
            </button>
          );
        })}
        <span className="ml-auto text-sm text-slate">
          {filtered.length.toLocaleString()}건 /{" "}
          <span className="font-semibold text-ember">
            {formatKRW(
              filtered
                .filter((r) => r.paidAt === null)
                .reduce((s, r) => s + r.amount, 0),
            )}
          </span>
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-4xl text-forest">&#10003;</p>
            <p className="mt-4 text-lg font-medium text-ink">
              {activeTab === "overdue"
                ? "연체 항목이 없습니다"
                : activeTab === "upcoming"
                  ? "이번주 예정된 분납이 없습니다"
                  : activeTab === "paid"
                    ? "납부 완료 항목이 없습니다"
                    : "분납 내역이 없습니다"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  {[
                    "학번",
                    "이름",
                    "기수",
                    "납기일",
                    "금액",
                    "연체일",
                    "상태",
                    "납부 처리",
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {filtered.map((row) => {
                  const days = overdueDays(row);
                  const badge = statusBadge(row);
                  return (
                    <tr
                      key={row.id}
                      className={[
                        "transition-colors hover:bg-mist/60",
                        rowBg(row),
                        classifyRow(row) === "overdue"
                          ? "border-l-4 border-l-red-400"
                          : classifyRow(row) === "upcoming"
                            ? "border-l-4 border-l-amber-300"
                            : "border-l-4 border-l-forest/40",
                      ].join(" ")}
                    >
                      {/* 학번 */}
                      <td className="px-5 py-4">
                        {row.examNumber ? (
                          <Link
                            href={`/admin/students/${row.examNumber}`}
                            className="font-mono text-xs font-medium text-forest hover:underline"
                          >
                            {row.examNumber}
                          </Link>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>

                      {/* 이름 */}
                      <td className="px-5 py-4">
                        {row.examNumber ? (
                          <Link
                            href={`/admin/students/${row.examNumber}`}
                            className="font-medium text-ink hover:text-forest hover:underline"
                          >
                            {row.studentName ?? "—"}
                          </Link>
                        ) : (
                          <span className="text-slate">{row.studentName ?? "—"}</span>
                        )}
                      </td>

                      {/* 기수 */}
                      <td className="px-5 py-4 text-sm text-slate">{row.cohortName ?? "—"}</td>

                      {/* 납기일 */}
                      <td className="px-5 py-4 font-mono text-xs text-ink">
                        {toDateDisplay(row.dueDate)}
                        {row.paidAt && (
                          <p className="mt-0.5 text-xs text-forest">
                            납부: {toDateDisplay(row.paidAt)}
                          </p>
                        )}
                      </td>

                      {/* 금액 */}
                      <td className="px-5 py-4 font-mono text-sm font-semibold text-ink tabular-nums">
                        {formatKRW(row.amount)}
                      </td>

                      {/* 연체일 */}
                      <td className="px-5 py-4">
                        {days > 0 ? (
                          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-red-700">
                            +{days}일
                          </span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>

                      {/* 상태 */}
                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                            badge.cls,
                          ].join(" ")}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* 납부 처리 */}
                      <td className="px-5 py-4">
                        {row.paidAt === null ? (
                          <Link
                            href={`/admin/payments/${row.paymentId}`}
                            className="inline-flex items-center rounded-lg border border-ember/30 bg-ember/5 px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:bg-ember/10 whitespace-nowrap"
                          >
                            수납 처리
                          </Link>
                        ) : (
                          <span className="text-xs text-slate">완납</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/80">
                  <td colSpan={4} className="px-5 py-3 text-xs font-semibold text-slate">
                    합계 ({filtered.filter((r) => r.paidAt === null).length.toLocaleString()}건 미납)
                  </td>
                  <td className="px-5 py-3 font-mono text-sm font-semibold text-ember tabular-nums">
                    {formatKRW(
                      filtered
                        .filter((r) => r.paidAt === null)
                        .reduce((s, r) => s + r.amount, 0),
                    )}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
