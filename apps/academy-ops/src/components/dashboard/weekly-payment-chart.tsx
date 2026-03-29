"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DayData = {
  label: string; // "3/11(화)"
  dateStr: string;
  amount: number;
  count: number;
};

type Props = {
  data: DayData[];
};

function formatAmount(value: number) {
  if (value >= 10000000) return `${(value / 10000000).toFixed(0)}천만`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(0)}백만`;
  if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
  return `${value.toLocaleString()}`;
}

export function WeeklyPaymentChart({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isEmpty = data.every((d) => d.amount === 0);

  return (
    <div ref={containerRef} className="h-48 w-full">
      {isEmpty ? (
        <div className="flex h-full items-center justify-center rounded-[20px] border border-dashed border-ink/10 text-sm text-slate">
          최근 7일 수납 데이터가 없습니다.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barSize={Math.max(12, Math.floor(width / data.length / 2))}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#4B5563" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatAmount}
              tick={{ fontSize: 10, fill: "#9CA3AF" }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              formatter={(value) => [`${Number(value).toLocaleString()}원`, "수납금액"]}
              labelStyle={{ fontSize: 12, color: "#111827" }}
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                fontSize: 12,
              }}
            />
            <Bar
              dataKey="amount"
              fill="#C55A11"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
