"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PointType } from "@prisma/client";
import type { HistoryLogRow } from "./page";

const POINT_TYPE_COLOR: Record<PointType, string> = {
  PERFECT_ATTENDANCE: "border-forest/30 bg-forest/10 text-forest",
  SCORE_EXCELLENCE: "border-sky-200 bg-sky-50 text-sky-700",
  ESSAY_EXCELLENCE: "border-amber-200 bg-amber-50 text-amber-700",
  MANUAL: "border-ember/30 bg-ember/10 text-ember",
  USE_PAYMENT: "border-red-200 bg-red-50 text-red-700",
  USE_RENTAL: "border-red-200 bg-red-50 text-red-700",
  ADJUST: "border-slate/20 bg-slate/10 text-slate",
  EXPIRE: "border-ink/20 bg-ink/5 text-slate",
  REFUND_CANCEL: "border-purple-200 bg-purple-50 text-purple-700",
};

const POINT_TYPE_VALUES: PointType[] = [
  "PERFECT_ATTENDANCE",
  "SCORE_EXCELLENCE",
  "ESSAY_EXCELLENCE",
  "MANUAL",
  "USE_PAYMENT",
  "USE_RENTAL",
  "ADJUST",
  "EXPIRE",
  "REFUND_CANCEL",
];

type Filters = {
  q: string;
  type: string;
  month: string;
};

export function PointsHistory({
  initialLogs,
  filters: initialFilters,
  pointTypeLabelMap,
}: {
  initialLogs: HistoryLogRow[];
  filters: Filters;
  pointTypeLabelMap: Record<PointType, string>;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [, startTransition] = useTransition();

  function buildUrl(overrides: Partial<Filters>) {
    const params = new URLSearchParams();
    const merged = { ...filters, ...overrides };

    if (merged.q) {
      params.set("q", merged.q);
    }
    if (merged.type) {
      params.set("type", merged.type);
    }
    if (merged.month) {
      params.set("month", merged.month);
    }

    const query = params.toString();
    return `/admin/points/history${query ? `?${query}` : ""}`;
  }

  function applyFilters(overrides: Partial<Filters>) {
    startTransition(() => {
      router.push(buildUrl(overrides));
    });
  }

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    applyFilters({});
  }

  function handleTypeChip(value: string) {
    const nextType = filters.type === value ? "" : value;
    setFilters((current) => ({ ...current, type: nextType }));
    applyFilters({ type: nextType });
  }

  function handleClearAll() {
    const cleared = { q: "", type: "", month: "" };
    setFilters(cleared);
    startTransition(() => {
      router.push("/admin/points/history");
    });
  }

  const hasFilters = Boolean(filters.q || filters.type || filters.month);

  return (
    <>
      <div className="mt-10 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">필터</h2>
          {hasFilters ? (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs font-medium text-slate hover:text-ember transition-colors"
            >
              필터 초기화
            </button>
          ) : null}
        </div>

        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-slate">유형</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleTypeChip("")}
              className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
                !filters.type
                  ? "border-ink/30 bg-ink text-white"
                  : "border-ink/10 bg-white text-slate hover:bg-mist"
              }`}
            >
              전체
            </button>
            {POINT_TYPE_VALUES.map((pointType) => (
              <button
                key={pointType}
                type="button"
                onClick={() => handleTypeChip(pointType)}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
                  filters.type === pointType
                    ? `${POINT_TYPE_COLOR[pointType]} font-semibold`
                    : "border-ink/10 bg-white text-slate hover:bg-mist"
                }`}
              >
                {pointTypeLabelMap[pointType]}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSearch} className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-2 block text-xs font-medium text-slate">월</label>
            <input
              type="month"
              value={filters.month}
              onChange={(event) =>
                setFilters((current) => ({ ...current, month: event.target.value }))
              }
              className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/40"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-slate">검색어(학번 / 이름)</label>
            <input
              type="text"
              value={filters.q}
              onChange={(event) =>
                setFilters((current) => ({ ...current, q: event.target.value }))
              }
              placeholder="학번 또는 이름 입력"
              className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/40"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-full bg-ink py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
            >
              조회
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <p className="text-sm font-semibold text-ink">
            조회 결과 <span className="text-forest">{initialLogs.length.toLocaleString()}</span>건
            {initialLogs.length === 200 ? (
              <span className="ml-2 text-xs font-normal text-slate">(최대 200건)</span>
            ) : null}
          </p>
        </div>

        {initialLogs.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            조건에 맞는 포인트 이력이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">포인트 전체 이력 조회 결과</caption>
              <thead>
                <tr className="border-b border-ink/8 bg-mist/40 text-left">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    지급일시
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    학번
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    이름
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    유형
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    사유
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    포인트
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    지급자
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {initialLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-mist/40 transition-colors">
                    <td className="px-6 py-3 whitespace-nowrap text-xs text-slate">
                      {new Date(log.grantedAt).toLocaleString("ko-KR", {
                        year: "2-digit",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/admin/students/${log.examNumber}`}
                        className="font-mono text-xs text-slate hover:text-forest transition-colors"
                      >
                        {log.examNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/admin/students/${log.examNumber}`}
                        className="font-medium text-ink hover:text-forest transition-colors"
                      >
                        {log.studentName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          POINT_TYPE_COLOR[log.type] ?? "border-ink/10 bg-ink/5 text-slate"
                        }`}
                      >
                        {pointTypeLabelMap[log.type] ?? log.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-xs text-slate">
                      {log.reason.length > 40 ? `${log.reason.slice(0, 40)}…` : log.reason}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <span
                        className={`font-bold tabular-nums ${
                          log.amount >= 0 ? "text-forest" : "text-ember"
                        }`}
                      >
                        {log.amount >= 0 ? "+" : ""}
                        {log.amount.toLocaleString()}P
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate">
                      {log.grantedBy ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
