"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgingBracket = "current" | "overdue31" | "overdue61" | "overdue90plus";

export type AgingRow = {
  installmentId: string;
  paymentId: string;
  enrollmentId: string | null;
  examNumber: string | null;
  studentName: string | null;
  mobile: string | null;
  courseName: string;
  dueDate: string; // "YYYY.MM.DD"
  daysOverdue: number;
  amount: number;
  lastPaidAt: string | null; // "YYYY.MM.DD" or null
  bracket: AgingBracket;
};

export type BracketSummary = {
  label: string;
  shortLabel: string;
  bracket: AgingBracket;
  amount: number;
  count: number;
  studentCount: number;
  color: string;
  barColor: string;
  textColor: string;
  borderColor: string;
  bgColor: string;
};

export type AgingReportClientProps = {
  rows: AgingRow[];
  brackets: BracketSummary[];
  totalAmount: number;
  totalStudents: number;
  avgDaysOverdue: number;
  severe90PlusStudents: number;
  baseDate: string; // "YYYY-MM-DD"
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRW(n: number): string {
  return "₩" + n.toLocaleString("ko-KR");
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

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
      <p className={["mt-2 text-2xl font-bold", accent ?? "text-ink"].join(" ")}>{value}</p>
      <p className="mt-1 text-xs text-slate">{sub}</p>
    </div>
  );
}

// ─── Bar chart row ────────────────────────────────────────────────────────────

function BarRow({
  bracket,
  totalAmount,
}: {
  bracket: BracketSummary;
  totalAmount: number;
}) {
  const barWidth = pct(bracket.amount, totalAmount);

  return (
    <div className="flex items-center gap-4 py-3">
      {/* Label */}
      <div className="w-20 shrink-0 text-right text-xs font-semibold text-slate">
        {bracket.shortLabel}
      </div>

      {/* Bar */}
      <div className="flex-1">
        <div className="relative h-7 overflow-hidden rounded-full bg-ink/5">
          <div
            className={["h-full rounded-full transition-all duration-500", bracket.barColor].join(" ")}
            style={{ width: `${Math.max(barWidth, barWidth > 0 ? 2 : 0)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="w-52 shrink-0">
        <span className={["text-sm font-semibold tabular-nums", bracket.textColor].join(" ")}>
          {formatKRW(bracket.amount)}
        </span>
        <span className="ml-2 text-xs text-slate">
          ({pct(bracket.amount, totalAmount)}%) · {bracket.count}건 · {bracket.studentCount}명
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type ActiveFilter = "all" | AgingBracket;

export function AgingReportClient({
  rows,
  brackets,
  totalAmount,
  totalStudents,
  avgDaysOverdue,
  severe90PlusStudents,
  baseDate,
}: AgingReportClientProps) {
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

  const filtered =
    activeFilter === "all" ? rows : rows.filter((r) => r.bracket === activeFilter);

  const filterTabs: { value: ActiveFilter; label: string; count: number }[] = [
    { value: "all", label: "전체", count: rows.length },
    ...brackets.map((b) => ({ value: b.bracket as ActiveFilter, label: b.shortLabel, count: b.count })),
  ];

  function bracketBadgeClass(bracket: AgingBracket): string {
    switch (bracket) {
      case "overdue90plus":
        return "border-red-200 bg-red-50 text-red-700";
      case "overdue61":
        return "border-orange-200 bg-orange-50 text-orange-700";
      case "overdue31":
        return "border-amber-200 bg-amber-50 text-amber-700";
      case "current":
        return "border-yellow-200 bg-yellow-50 text-yellow-700";
    }
  }

  function bracketLabel(bracket: AgingBracket): string {
    switch (bracket) {
      case "overdue90plus":
        return "90일↑";
      case "overdue61":
        return "61-90일";
      case "overdue31":
        return "31-60일";
      case "current":
        return "0-30일";
    }
  }

  function rowBorderClass(bracket: AgingBracket): string {
    switch (bracket) {
      case "overdue90plus":
        return "border-l-4 border-l-red-400";
      case "overdue61":
        return "border-l-4 border-l-orange-400";
      case "overdue31":
        return "border-l-4 border-l-amber-400";
      case "current":
        return "border-l-4 border-l-yellow-400";
    }
  }

  return (
    <div className="space-y-8">
      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="총 미납금"
          value={formatKRW(totalAmount)}
          sub="미납·연체 분납 합계"
          accent="text-ember"
        />
        <KpiCard
          label="미납 학생 수"
          value={`${totalStudents.toLocaleString()}명`}
          sub="중복 없는 학생 수"
        />
        <KpiCard
          label="평균 연체일"
          value={`${avgDaysOverdue.toFixed(1)}일`}
          sub="0일 미만 기준 (연체 기간)"
        />
        <KpiCard
          label="90일↑ 심각"
          value={`${severe90PlusStudents.toLocaleString()}명`}
          sub="즉시 조치 필요"
          accent={severe90PlusStudents > 0 ? "text-red-600" : undefined}
        />
      </div>

      {/* ── Aging distribution chart ───────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel">
        <h2 className="text-base font-semibold text-ink">연령 분포</h2>
        <p className="mt-1 text-xs text-slate">기준일 {baseDate} · 분납 납기일 기준 경과일수</p>

        <div className="mt-6 space-y-1 divide-y divide-ink/5">
          {brackets.map((b) => (
            <BarRow key={b.bracket} bracket={b} totalAmount={totalAmount} />
          ))}
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-3">
          {brackets.map((b) => (
            <button
              key={b.bracket}
              type="button"
              onClick={() => setActiveFilter(activeFilter === b.bracket ? "all" : b.bracket)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activeFilter === b.bracket
                  ? [b.borderColor, b.bgColor, b.textColor].join(" ")
                  : "border-ink/20 bg-white text-slate hover:border-ink/40",
              ].join(" ")}
            >
              <span
                className={["inline-block h-2 w-2 rounded-full", b.barColor].join(" ")}
              />
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Detail table ───────────────────────────────────────────────────── */}
      <div>
        {/* Filter tabs */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {filterTabs.map((tab) => {
            const isActive = activeFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveFilter(tab.value)}
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
                    isActive ? "bg-white/30 text-white" : "bg-mist text-slate",
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
              {formatKRW(filtered.reduce((s, r) => s + r.amount, 0))}
            </span>
          </span>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-sm">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="text-4xl text-forest">✓</div>
              <p className="mt-4 text-lg font-medium text-ink">해당 항목이 없습니다</p>
              <p className="mt-2 text-sm text-slate">선택한 기간에 해당하는 미납 건이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist">
                    {[
                      "학번",
                      "이름",
                      "연락처",
                      "강좌",
                      "납기일",
                      "연체일",
                      "미납금",
                      "마지막 납부",
                      "구간",
                      "액션",
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
                  {filtered.map((row) => (
                    <tr
                      key={row.installmentId}
                      className={[
                        rowBorderClass(row.bracket),
                        "transition-colors hover:bg-mist/60",
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

                      {/* 연락처 */}
                      <td className="px-5 py-4 font-mono text-xs text-slate">
                        {row.mobile ?? "—"}
                      </td>

                      {/* 강좌 */}
                      <td className="px-5 py-4 text-ink">{row.courseName}</td>

                      {/* 납기일 */}
                      <td className="px-5 py-4 font-mono text-xs text-ink">{row.dueDate}</td>

                      {/* 연체일 */}
                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold",
                            bracketBadgeClass(row.bracket),
                          ].join(" ")}
                        >
                          {row.daysOverdue}일
                        </span>
                      </td>

                      {/* 미납금 */}
                      <td className="px-5 py-4 font-mono text-sm font-semibold text-ink tabular-nums">
                        {formatKRW(row.amount)}
                      </td>

                      {/* 마지막 납부 */}
                      <td className="px-5 py-4 font-mono text-xs text-slate">
                        {row.lastPaidAt ?? "—"}
                      </td>

                      {/* 구간 */}
                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                            bracketBadgeClass(row.bracket),
                          ].join(" ")}
                        >
                          {bracketLabel(row.bracket)}
                        </span>
                      </td>

                      {/* 액션 */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {/* 상담 */}
                          {row.examNumber && (
                            <Link
                              href={`/admin/students/${row.examNumber}?tab=counseling`}
                              className="inline-flex items-center rounded-lg border border-forest/30 bg-forest/5 px-3 py-1.5 text-xs font-medium text-forest transition-colors hover:border-forest hover:bg-forest hover:text-white"
                            >
                              상담
                            </Link>
                          )}
                          {/* 알림 */}
                          {row.examNumber && (
                            <Link
                              href={`/admin/notifications/send?examNumber=${row.examNumber}`}
                              className="inline-flex items-center rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:border-amber-400 hover:bg-amber-100"
                            >
                              알림
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Footer */}
                <tfoot>
                  <tr className="border-t-2 border-ink/10 bg-mist/80">
                    <td colSpan={6} className="px-5 py-3 text-xs font-semibold text-slate">
                      합계 ({filtered.length.toLocaleString()}건)
                    </td>
                    <td className="px-5 py-3 text-left font-mono text-sm font-semibold text-ember tabular-nums">
                      {formatKRW(filtered.reduce((s, r) => s + r.amount, 0))}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
