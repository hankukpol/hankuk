"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { StudentCountTrendPoint } from "@/lib/services/super-admin-overview.service";

type ChartDatum = {
  weekLabel: string;
  [divisionSlug: string]: string | number;
};

type DivisionMeta = {
  slug: string;
  name: string;
  color: string;
};

export function SuperAdminStudentTrendChart() {
  const [data, setData] = useState<ChartDatum[]>([]);
  const [divisionMetas, setDivisionMetas] = useState<DivisionMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/super-admin/student-trend?weeks=8");
        if (!res.ok) return;
        const json = (await res.json()) as { trend: StudentCountTrendPoint[] };

        if (cancelled) return;

        // 지점 메타 추출 (첫 데이터 포인트 기준)
        const metas: DivisionMeta[] =
          json.trend[0]?.divisions.map((d) => ({
            slug: d.slug,
            name: d.name,
            color: d.color,
          })) ?? [];

        // recharts용 flat 데이터 변환
        const chartData: ChartDatum[] = json.trend.map((point) => {
          const datum: ChartDatum = { weekLabel: point.weekLabel };
          for (const div of point.divisions) {
            datum[div.slug] = div.activeCount;
          }
          return datum;
        });

        setDivisionMetas(metas);
        setData(chartData);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[10px] bg-slate-50">
        <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (data.length === 0 || divisionMetas.length === 0) {
    return null;
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="weekLabel"
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              fontSize: 13,
              border: "1px solid rgba(0,0,0,0.05)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
            formatter={(value, name) => {
              const meta = divisionMetas.find((m) => m.slug === String(name));
              return [`${value}명`, meta?.name ?? String(name)];
            }}
          />
          <Legend
            formatter={(value: string) => {
              const meta = divisionMetas.find((m) => m.slug === value);
              return meta?.name ?? value;
            }}
            wrapperStyle={{ fontSize: 13 }}
          />
          {divisionMetas.map((meta) => (
            <Line
              key={meta.slug}
              type="monotone"
              dataKey={meta.slug}
              stroke={meta.color}
              strokeWidth={2.5}
              dot={{ r: 4, strokeWidth: 2 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
