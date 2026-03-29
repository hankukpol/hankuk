"use client";

import { useState } from "react";
import { STUDENT_TYPE_LABEL } from "@/lib/constants";
import type { SubjectStudentRankingRow } from "@/lib/analytics/analysis";

type SortKey = "rank" | "examNumber" | "name" | "average" | "highest" | "lowest" | "sessionCount" | "attendanceRate";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 30;

export function SubjectRankingTable({ rows }: { rows: SubjectStudentRankingRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "examNumber" || key === "name" ? "asc" : "desc");
    }
    setPage(0);
  }

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "rank") {
      cmp = (a.rank ?? 9999) - (b.rank ?? 9999);
    } else if (sortKey === "examNumber") {
      cmp = a.examNumber.localeCompare(b.examNumber);
    } else if (sortKey === "name") {
      cmp = a.name.localeCompare(b.name, "ko");
    } else if (sortKey === "average") {
      cmp = (a.average ?? -1) - (b.average ?? -1);
    } else if (sortKey === "highest") {
      cmp = (a.highest ?? -1) - (b.highest ?? -1);
    } else if (sortKey === "lowest") {
      cmp = (a.lowest ?? -1) - (b.lowest ?? -1);
    } else if (sortKey === "sessionCount") {
      cmp = a.sessionCount - b.sessionCount;
    } else if (sortKey === "attendanceRate") {
      cmp = a.attendanceRate - b.attendanceRate;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function Th({ col, label }: { col: SortKey; label: string }) {
    return (
      <th
        className="px-4 py-3 font-semibold cursor-pointer select-none whitespace-nowrap hover:text-ember transition-colors"
        onClick={() => handleSort(col)}
      >
        {label}
        <SortIcon col={col} />
      </th>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate">
        해당 과목의 성적 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-[24px] border border-ink/10">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead className="bg-mist/80 text-left">
            <tr>
              <Th col="rank" label="석차" />
              <Th col="examNumber" label="수험번호" />
              <Th col="name" label="이름" />
              <th className="px-4 py-3 font-semibold whitespace-nowrap">구분</th>
              <Th col="average" label="평균" />
              <Th col="highest" label="최고점" />
              <Th col="lowest" label="최저점" />
              <Th col="sessionCount" label="응시횟수" />
              <Th col="attendanceRate" label="참여율" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {paged.map((row) => (
              <tr
                key={row.examNumber}
                className={!row.isActive ? "opacity-40" : ""}
              >
                <td className="px-4 py-3 font-semibold tabular-nums">
                  {row.rank !== null ? `${row.rank}위` : "-"}
                </td>
                <td className="px-4 py-3 tabular-nums">{row.examNumber}</td>
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.studentType === "NEW"
                        ? "bg-forest/10 text-forest"
                        : "bg-slate/10 text-slate"
                    }`}
                  >
                    {STUDENT_TYPE_LABEL[row.studentType]}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums font-semibold">
                  {row.average !== null ? row.average.toFixed(1) : "-"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.highest !== null ? row.highest.toFixed(1) : "-"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.lowest !== null ? row.lowest.toFixed(1) : "-"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.sessionCount} / {row.totalSessions}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.attendanceRate.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-xl border border-ink/10 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-mist"
          >
            이전
          </button>
          <span className="text-sm text-slate">
            {page + 1} / {totalPages} 페이지 ({rows.length}명)
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="rounded-xl border border-ink/10 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-mist"
          >
            다음
          </button>
        </div>
      )}
      <p className="mt-2 text-center text-xs text-slate">총 {rows.length}명</p>
    </div>
  );
}
