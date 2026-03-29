"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DropoutContactCopyActions } from "@/components/dropout/contact-copy-actions";
import { PaginationControls } from "@/components/ui/pagination-controls";
import type { DropoutMonitorRow } from "@/lib/analytics/service";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  STATUS_ROW_CLASS,
} from "@/lib/analytics/presentation";
import { STUDENT_TYPE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

type DropoutMonitorTableProps = {
  rows: DropoutMonitorRow[];
};

function formatWeekLabel(weekKey: string) {
  const parts = weekKey.split("-");

  if (parts.length !== 3) {
    return weekKey;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const date = Number(parts[2]);

  if ([year, month, date].some((value) => Number.isNaN(value))) {
    return weekKey;
  }

  const start = new Date(year, month - 1, date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return `${start.getMonth() + 1}/${start.getDate()}~${end.getMonth() + 1}/${end.getDate()}`;
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}.${month}`;
}

function renderHistoryBlocks(
  values: Record<string, number>,
  formatKey: (key: string) => string,
  emptyLabel: string,
) {
  const entries = Object.entries(values)
    .filter(([, value]) => value > 0)
    .sort(([left], [right]) => right.localeCompare(left));

  if (entries.length === 0) {
    return <span className="text-slate">{emptyLabel}</span>;
  }

  return (
    <div className="flex min-w-[280px] flex-wrap gap-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-xl border border-ink/10 bg-mist/70 px-2.5 py-2">
          <div className="text-[11px] leading-4 text-slate">{formatKey(key)}</div>
          <div className="mt-1 text-xs font-semibold text-ink">{value}회 결시</div>
        </div>
      ))}
    </div>
  );
}

export function DropoutMonitorTable({ rows }: DropoutMonitorTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (left, right) =>
          right.currentWeekAbsenceCount - left.currentWeekAbsenceCount ||
          right.currentMonthAbsenceCount - left.currentMonthAbsenceCount ||
          left.examNumber.localeCompare(right.examNumber),
      ),
    [rows],
  );

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="mt-8 space-y-3">
      <DropoutContactCopyActions rows={sortedRows} />
      <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
        <PaginationControls
          totalCount={sortedRows.length}
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
              <th className="px-4 py-3 font-semibold">수험번호</th>
              <th className="px-4 py-3 font-semibold">이름</th>
              <th className="px-4 py-3 font-semibold">구분</th>
              <th className="px-4 py-3 font-semibold">현재 상태</th>
              <th className="px-4 py-3 font-semibold">연락처</th>
              <th className="px-4 py-3 font-semibold">이번 주 결시</th>
              <th className="px-4 py-3 font-semibold">이번 달 결시</th>
              <th className="px-4 py-3 font-semibold">주차별 이력</th>
              <th className="px-4 py-3 font-semibold">월별 이력</th>
              <th className="px-4 py-3 font-semibold">복귀 가능일</th>
              <th className="px-4 py-3 font-semibold">정정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {pagedRows.map((row) => (
              <tr
                key={row.examNumber}
                className={`${STATUS_ROW_CLASS[row.status]} align-top ${!row.isActive ? "text-slate" : ""}`}
              >
                <td className="px-4 py-3 font-semibold">{row.examNumber}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{row.name}</div>
                  {!row.isActive ? <div className="mt-1 text-xs text-slate">비활성</div> : null}
                </td>
                <td className="px-4 py-3">{STUDENT_TYPE_LABEL[row.studentType]}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[row.status]}`}
                  >
                    {STATUS_LABEL[row.status]}
                  </span>
                </td>
                <td className="min-w-[160px] px-4 py-3">{row.phone?.trim() || "-"}</td>
                <td className="px-4 py-3">
                  <span className="font-semibold">{row.currentWeekAbsenceCount}</span>회
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold">{row.currentMonthAbsenceCount}</span>회
                </td>
                <td className="px-4 py-3">
                  {renderHistoryBlocks(row.weekAbsences, formatWeekLabel, "결시 이력 없음")}
                </td>
                <td className="px-4 py-3">
                  {renderHistoryBlocks(row.monthAbsences, formatMonthLabel, "월 결시 없음")}
                </td>
                <td className="px-4 py-3">{row.recoveryDate ? formatDate(row.recoveryDate) : "-"}</td>
                <td className="px-4 py-3">
                  <Link
                    prefetch={false}
                    href={`/admin/students/${row.examNumber}/history`}
                    className="inline-flex rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                  >
                    이력/정정
                  </Link>
                </td>
              </tr>
            ))}
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate">
                  해당 조건의 학생이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
