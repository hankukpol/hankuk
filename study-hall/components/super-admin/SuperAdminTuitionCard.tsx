"use client";

import { Banknote, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import type { TuitionStatusSummary } from "@/lib/services/super-admin-overview.service";

const krw = new Intl.NumberFormat("ko-KR");

function ProgressBar({ rate, color }: { rate: number; color?: string }) {
  const clampedRate = Math.min(Math.max(rate, 0), 100);
  const barColor =
    color ?? (clampedRate >= 90 ? "#16a34a" : clampedRate >= 70 ? "#d97706" : "#dc2626");
  const trackColor =
    clampedRate >= 90 ? "#dcfce7" : clampedRate >= 70 ? "#fef3c7" : "#fee2e2";

  return (
    <div className="h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: trackColor }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clampedRate}%`, backgroundColor: barColor }}
      />
    </div>
  );
}

export function SuperAdminTuitionCard() {
  const [data, setData] = useState<TuitionStatusSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/super-admin/tuition-status");
        if (!res.ok) return;
        const json = (await res.json()) as { status: TuitionStatusSummary };
        if (!cancelled) setData(json.status);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-[10px] bg-slate-50">
        <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-5">
      {/* 전체 요약 */}
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-emerald-100 text-emerald-600">
            <Banknote className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">이번 달 수납률</p>
            <p className="text-3xl font-extrabold tabular-nums text-slate-900">
              {data.collectionRate}
              <span className="ml-1 text-base font-semibold text-slate-400">%</span>
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap gap-6 text-sm text-slate-600">
          <div>
            <span className="text-slate-400">예상 수납액</span>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
              ₩{krw.format(data.totalExpected)}
            </p>
          </div>
          <div>
            <span className="text-slate-400">실제 수납액</span>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700">
              ₩{krw.format(data.totalCollected)}
            </p>
          </div>
          <div>
            <span className="text-slate-400">미납 학생</span>
            <p
              className={`mt-0.5 text-lg font-bold tabular-nums ${
                data.unpaidCount > 0 ? "text-red-600" : "text-slate-900"
              }`}
            >
              {data.unpaidCount}명
            </p>
          </div>
        </div>
      </div>

      {/* 전체 프로그레스 바 */}
      <ProgressBar rate={data.collectionRate} />

      {/* 지점별 상세 */}
      {data.divisions.length > 0 && (
        <div className="space-y-3">
          {data.divisions.map((div) => (
            <div key={div.slug} className="rounded-[10px] border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: div.color }}
                  />
                  <span className="text-sm font-bold text-slate-900">{div.name}</span>
                  <span className="text-xs text-slate-400">({div.activeStudentCount}명)</span>
                </div>
                <div className="flex items-center gap-4 text-sm tabular-nums">
                  <span className="text-slate-500">
                    ₩{krw.format(div.collected)} / ₩{krw.format(div.expected)}
                  </span>
                  <span
                    className={`font-bold ${
                      div.collectionRate >= 90
                        ? "text-green-700"
                        : div.collectionRate >= 70
                          ? "text-amber-700"
                          : "text-red-700"
                    }`}
                  >
                    {div.collectionRate}%
                  </span>
                  {div.unpaidCount > 0 && (
                    <span className="rounded-[10px] border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                      미납 {div.unpaidCount}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2.5">
                <ProgressBar rate={div.collectionRate} color={div.color} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
