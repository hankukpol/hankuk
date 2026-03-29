"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { BarComparisonChart } from "@/components/analytics/charts";
import { fetchJson } from "@/lib/client/fetch-json";
import { SCORE_SOURCE_LABEL } from "@/lib/constants";
import type { ScoreSourceStats } from "@/lib/scores/stats";

type PeriodOption = {
  id: number;
  name: string;
  isActive: boolean;
};

type ScoreSourceStatsPanelProps = {
  periods: PeriodOption[];
  initialPeriodId: number | null;
  initialStats: ScoreSourceStats | null;
};

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function ScoreSourceStatsPanel({
  periods,
  initialPeriodId,
  initialStats,
}: ScoreSourceStatsPanelProps) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(initialPeriodId);
  const [stats, setStats] = useState<ScoreSourceStats | null>(initialStats);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);

  const chartData = useMemo(
    () =>
      (stats?.bySourceType ?? []).map((row) => ({
        label: SCORE_SOURCE_LABEL[row.sourceType],
        percentage: row.percentage,
      })),
    [stats],
  );
  const unattributedUpdatedCount = useMemo(() => {
    if (!stats) {
      return 0;
    }

    return Math.max(
      stats.updatedScoreCount -
        stats.bySourceType.reduce((sum, row) => sum + row.updatedCount, 0),
      0,
    );
  }, [stats]);
  const unattributedDeletedCount = useMemo(() => {
    if (!stats) {
      return 0;
    }

    return Math.max(
      stats.deletedScoreCount -
        stats.bySourceType.reduce((sum, row) => sum + row.deletedCount, 0),
      0,
    );
  }, [stats]);

  function handlePeriodChange(nextPeriodId: number) {
    setSelectedPeriodId(nextPeriodId);
    setErrorMessage(null);
    setStats(null);

    startTransition(async () => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      try {
        const next = await fetchJson<ScoreSourceStats>(
          `/api/scores/stats?periodId=${nextPeriodId}`,
          { method: "GET" },
          {
            defaultError: "Failed to load score source stats.",
          },
        );

        if (requestId !== requestIdRef.current) {
          return;
        }

        setStats(next);
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load score source stats.",
        );
      }
    });
  }

  return (
    <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">Score Input Source Stats</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
            Compare score input volume by source type for each exam period and review edit/delete ratios derived from audit logs.
          </p>
        </div>
        {periods.length > 0 ? (
          <div className="min-w-[240px]">
            <label className="mb-2 block text-sm font-medium text-ink">Exam period</label>
            <select
              value={selectedPeriodId ?? ""}
              onChange={(event) => handlePeriodChange(Number(event.target.value))}
              disabled={isPending}
              className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                  {period.isActive ? " (Active)" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {periods.length === 0 ? (
        <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 px-4 py-6 text-sm text-slate">
          No exam periods are available for aggregation.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-6 rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {isPending && !stats ? (
        <div className="mt-6 rounded-[24px] border border-ink/10 bg-mist px-4 py-6 text-sm text-slate">
          Loading score source stats...
        </div>
      ) : null}

      {stats ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[24px] border border-ink/10 bg-mist px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                Total score rows
              </p>
              <p className="mt-2 text-2xl font-semibold text-ink">{stats.totalScores.toLocaleString("ko-KR")}</p>
              <p className="mt-1 text-sm text-slate">Current score table rows in the selected period</p>
            </div>
            <div className="rounded-[24px] border border-ink/10 bg-mist px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                Edit rate
              </p>
              <p className="mt-2 text-2xl font-semibold text-ink">{formatPercent(stats.editRate)}</p>
              <p className="mt-1 text-sm text-slate">Edited score rows: {stats.updatedScoreCount.toLocaleString("ko-KR")}</p>
            </div>
            <div className="rounded-[24px] border border-ink/10 bg-mist px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                Delete rate
              </p>
              <p className="mt-2 text-2xl font-semibold text-ink">{formatPercent(stats.deleteRate)}</p>
              <p className="mt-1 text-sm text-slate">Deleted score rows: {stats.deletedScoreCount.toLocaleString("ko-KR")}</p>
            </div>
          </div>

          {stats.totalScores > 0 ? (
            <div className="rounded-[28px] border border-ink/10 bg-mist p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Source type ratio</p>
                  <p className="mt-1 text-xs leading-6 text-slate">
                    {`${stats.periodName} score distribution grouped by sourceType.`}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-[24px] bg-white p-4">
                <BarComparisonChart
                  data={chartData}
                  xKey="label"
                  yDomain={[0, 100]}
                  bars={[{ dataKey: "percentage", color: "#0F766E", name: "Ratio (%)" }]}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-ink/10 px-4 py-6 text-sm text-slate">
              No score rows are available in the selected period.
            </div>
          )}

          {unattributedUpdatedCount > 0 || unattributedDeletedCount > 0 ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              {`Some audit rows could not be attributed to a source type. Unattributed edits: ${unattributedUpdatedCount.toLocaleString("ko-KR")}, unattributed deletes: ${unattributedDeletedCount.toLocaleString("ko-KR")}.`}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-[28px] border border-ink/10">
            <table className="min-w-full text-sm">
              <thead className="bg-mist text-left text-slate">
                <tr>
                  <th className="px-4 py-3 font-semibold">Source type</th>
                  <th className="px-4 py-3 font-semibold">Count</th>
                  <th className="px-4 py-3 font-semibold">Ratio</th>
                  <th className="px-4 py-3 font-semibold">Edited</th>
                  <th className="px-4 py-3 font-semibold">Edit rate</th>
                  <th className="px-4 py-3 font-semibold">Deleted</th>
                  <th className="px-4 py-3 font-semibold">Delete rate</th>
                </tr>
              </thead>
              <tbody>
                {stats.bySourceType.map((row) => (
                  <tr key={row.sourceType} className="border-t border-ink/10">
                    <td className="px-4 py-3 font-medium text-ink">
                      {SCORE_SOURCE_LABEL[row.sourceType]}
                    </td>
                    <td className="px-4 py-3 text-slate">{row.count.toLocaleString("ko-KR")}</td>
                    <td className="px-4 py-3 text-slate">{formatPercent(row.percentage)}</td>
                    <td className="px-4 py-3 text-slate">{row.updatedCount.toLocaleString("ko-KR")}</td>
                    <td className="px-4 py-3 text-slate">{formatPercent(row.editRate)}</td>
                    <td className="px-4 py-3 text-slate">{row.deletedCount.toLocaleString("ko-KR")}</td>
                    <td className="px-4 py-3 text-slate">{formatPercent(row.deleteRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
