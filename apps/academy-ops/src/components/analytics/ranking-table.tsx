"use client";

import { useState } from "react";
import { StudentType } from "@prisma/client";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { StudentResultDrawer } from "@/components/analytics/student-result-drawer";
import { RankingRow, StudentResultProfile } from "@/lib/analytics/service";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  formatRank,
  formatScore,
} from "@/lib/analytics/presentation";
import { STUDENT_TYPE_LABEL } from "@/lib/constants";

type RankingTableProps = {
  rows: RankingRow[];
  view: "overall" | "new";
};

type SortKey = "rank" | "examNumber" | "name" | "average" | "participationRate";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 text-ink/25">↕</span>;
  return <span className="ml-1 text-forest">{dir === "asc" ? "↑" : "↓"}</span>;
}

export function RankingTable({ rows, view }: RankingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [selectedProfile, setSelectedProfile] = useState<StudentResultProfile | null>(null);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDir("asc");
  }

  function openProfile(profile: StudentResultProfile) {
    setSelectedProfile({
      ...profile,
      summary: { ...profile.summary },
      subjects: [...profile.subjects],
      recentEntries: [...profile.recentEntries],
    });
  }

  function closeProfile() {
    setSelectedProfile(null);
  }

  const sorted = [...rows].sort((left, right) => {
    const leftRank = view === "new" ? left.newRank : left.overallRank;
    const rightRank = view === "new" ? right.newRank : right.overallRank;

    let comparison = 0;
    switch (sortKey) {
      case "rank":
        if (leftRank == null && rightRank == null) comparison = 0;
        else if (leftRank == null) comparison = 1;
        else if (rightRank == null) comparison = -1;
        else comparison = leftRank - rightRank;
        break;
      case "examNumber":
        comparison = left.examNumber.localeCompare(right.examNumber);
        break;
      case "name":
        comparison = left.name.localeCompare(right.name, "ko");
        break;
      case "average":
        if (left.average == null && right.average == null) comparison = 0;
        else if (left.average == null) comparison = 1;
        else if (right.average == null) comparison = -1;
        else comparison = left.average - right.average;
        break;
      case "participationRate":
        comparison = left.participationRate - right.participationRate;
        break;
    }

    return sortDir === "asc" ? comparison : -comparison;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function Th({ label, sort }: { label: string; sort: SortKey }) {
    return (
      <th className="px-4 py-3">
        <button
          type="button"
          onClick={() => handleSort(sort)}
          className="flex items-center font-semibold hover:text-forest"
        >
          {label}
          <SortIcon active={sortKey === sort} dir={sortDir} />
        </button>
      </th>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
        <PaginationControls
          totalCount={sorted.length}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
          itemLabel="명"
        />
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead className="bg-mist/80 text-left">
            <tr>
              <Th label="석차" sort="rank" />
              <Th label="수험번호" sort="examNumber" />
              <Th label="이름" sort="name" />
              <th className="px-4 py-3 font-semibold">구분</th>
              <th className="px-4 py-3 font-semibold">상태</th>
              <Th label="평균" sort="average" />
              <Th label="참여율" sort="participationRate" />
              <th className="px-4 py-3 font-semibold">개근</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate">
                  집계된 성적이 없습니다.
                </td>
              </tr>
            ) : null}
            {pagedRows.map((row) => {
              const rank = view === "new" ? row.newRank : row.overallRank;

              return (
                <tr key={row.examNumber} className={!row.isActive ? "bg-slate-50/70 text-slate" : ""}>
                  <td className="px-4 py-3 font-semibold">{formatRank(rank)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openProfile(row.profile)}
                      className="font-semibold underline-offset-4 transition hover:text-forest hover:underline"
                    >
                      {row.examNumber}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openProfile(row.profile)}
                      className="font-semibold underline-offset-4 transition hover:text-forest hover:underline"
                    >
                      {row.name}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {STUDENT_TYPE_LABEL[row.studentType as StudentType]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[row.currentStatus]}`}
                    >
                      {STATUS_LABEL[row.currentStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3">{formatScore(row.average)}</td>
                  <td className="px-4 py-3">{row.participationRate.toFixed(1)}%</td>
                  <td className="px-4 py-3">{row.perfectAttendance ? "개근" : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedProfile ? (
        <StudentResultDrawer
          profile={selectedProfile}
          onClose={closeProfile}
        />
      ) : null}
    </>
  );
}
