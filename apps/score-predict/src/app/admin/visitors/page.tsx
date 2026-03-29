"use client";

import { useCallback, useEffect, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";

interface DailyRow {
  date: string;
  visitors: number;
  newUsers: number;
  submissions: number;
}

interface VisitorStatsResponse {
  today: {
    visitors: number;
    newUsers: number;
    submissions: number;
  };
  totals: {
    uniqueVisitors: number;
    users: number;
  };
  daily: DailyRow[];
  error?: string;
}

const DAYS_OPTIONS = [7, 14, 30] as const;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export default function AdminVisitorsPage() {
  const { enabled: visitorsEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("visitors");
  const [data, setData] = useState<VisitorStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [days, setDays] = useState<7 | 14 | 30>(14);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/admin/visitors?days=${days}`, {
        cache: "no-store",
      });
      const json = (await response.json()) as VisitorStatsResponse;
      if (!response.ok) {
        throw new Error(json.error ?? "방문자 통계 조회에 실패했습니다.");
      }
      setData(json);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "방문자 통계 조회에 실패했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!visitorsEnabled) {
      setIsLoading(false);
      setErrorMessage("");
      return;
    }

    void loadStats();
  }, [isFeatureLoading, loadStats, visitorsEnabled]);

  if (isFeatureLoading || (visitorsEnabled && isLoading && !data)) {
    return (
      <p className="text-sm text-slate-600">방문자 통계 페이지를 불러오는 중입니다...</p>
    );
  }

  if (!visitorsEnabled) {
    return <AdminFeatureDisabledState feature="visitors" />;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">방문자 통계</h1>
          <p className="mt-1 text-sm text-slate-600">
            로그인한 사용자의 일별 방문 횟수를 집계합니다. 하루 1회 기준으로 중복은
            제거합니다.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadStats()} disabled={isLoading}>
          {isLoading ? "불러오는 중..." : "새로고침"}
        </Button>
      </header>

      {errorMessage ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      {data ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="오늘 방문자" value={data.today.visitors} unit="명" color="blue" />
          <SummaryCard
            label="오늘 신규 가입"
            value={data.today.newUsers}
            unit="명"
            color="emerald"
          />
          <SummaryCard
            label="오늘 답안 제출"
            value={data.today.submissions}
            unit="건"
            color="amber"
          />
          <SummaryCard
            label="누적 가입자"
            value={data.totals.users}
            unit="명"
            color="slate"
          />
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">일별 추이</h2>
          <div className="flex gap-1 rounded-md bg-slate-100 p-1">
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  days === d
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {d}일
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-slate-500">불러오는 중...</p>
        ) : data && data.daily.length > 0 ? (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.daily.map((row) => ({ ...row, date: formatDate(row.date) }))}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  dy={6}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => {
                    const seriesName = typeof name === "string" ? name : "";
                    const label =
                      seriesName === "visitors"
                        ? "방문자"
                        : seriesName === "newUsers"
                          ? "신규 가입"
                          : "제출";
                    const unit = seriesName === "submissions" ? "건" : "명";
                    return [`${Number(value ?? 0).toLocaleString("ko-KR")}${unit}`, label];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                  formatter={(value) =>
                    value === "visitors"
                      ? "방문자"
                      : value === "newUsers"
                        ? "신규 가입"
                        : "제출"
                  }
                />
                <Bar dataKey="visitors" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="newUsers" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="submissions" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">표시할 데이터가 없습니다.</p>
        )}
      </section>

      {data && data.daily.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">날짜</th>
                  <th className="px-4 py-3 text-right">방문자</th>
                  <th className="px-4 py-3 text-right">신규 가입</th>
                  <th className="px-4 py-3 text-right">답안 제출</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.daily
                  .slice()
                  .reverse()
                  .map((row) => {
                    const isToday = row.date === new Date().toISOString().slice(0, 10);
                    return (
                      <tr key={row.date} className={isToday ? "bg-blue-50" : "bg-white"}>
                        <td
                          className={`px-4 py-3 font-medium ${
                            isToday ? "text-blue-700" : "text-slate-700"
                          }`}
                        >
                          {row.date} {isToday ? "(오늘)" : ""}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-blue-600">
                          {row.visitors.toLocaleString("ko-KR")}명
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-600">
                          {row.newUsers.toLocaleString("ko-KR")}명
                        </td>
                        <td className="px-4 py-3 text-right text-amber-600">
                          {row.submissions.toLocaleString("ko-KR")}건
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: "blue" | "emerald" | "amber" | "slate";
}) {
  const colorMap = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  const numColor = {
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    slate: "text-slate-800",
  };

  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className={`mt-2 text-3xl font-black ${numColor[color]}`}>
        {value.toLocaleString("ko-KR")}
        <span className="ml-1 text-base font-semibold">{unit}</span>
      </p>
    </div>
  );
}
