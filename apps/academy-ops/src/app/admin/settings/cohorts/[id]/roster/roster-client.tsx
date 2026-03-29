"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RosterRow, AttendBar } from "./page";

type SortKey = "examNumber" | "name" | "enrolledAt" | "finalFee" | "paidAmount" | "scoreAttendRate";
type SortDir = "asc" | "desc";
type PaymentFilter = "ALL" | "PAID" | "UNPAID" | "PARTIAL";
type AttendanceFilter = "ALL" | "NORMAL" | "WARNING";

type Props = {
  rows: RosterRow[];
  cohortName: string;
  cohortId: string;
};

function downloadCsv(rows: RosterRow[], cohortName: string) {
  const headers = [
    "번호",
    "학번",
    "이름",
    "연락처",
    "등록일",
    "수강료",
    "납부액",
    "납부상태",
    "4주출석률",
    "출석상태",
    "수강상태",
  ];

  const csvRows = rows.map((r) => [
    r.idx,
    r.examNumber,
    r.name,
    r.phone,
    r.enrolledAt,
    r.finalFee,
    r.paidAmount,
    r.paymentStatusLabel,
    r.scoreAttendRate !== null ? `${r.scoreAttendRate}%` : "-",
    r.attendanceStatusLabel,
    r.statusLabel,
  ]);

  const bom = "\uFEFF"; // UTF-8 BOM for Korean characters in Excel
  const csvContent =
    bom +
    [headers, ...csvRows]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? "");
            // Wrap in quotes if contains comma, newline, or quote
            if (s.includes(",") || s.includes("\n") || s.includes('"')) {
              return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
          })
          .join(","),
      )
      .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${cohortName}_수강생명단_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const PAYMENT_FILTER_LABELS: Record<PaymentFilter, string> = {
  ALL: "전체",
  PAID: "완납",
  UNPAID: "미납",
  PARTIAL: "부분납",
};

const SORT_LABELS: Record<SortKey, string> = {
  examNumber: "학번",
  name: "이름",
  enrolledAt: "등록일",
  finalFee: "수강료",
  paidAmount: "납부액",
  scoreAttendRate: "출석률",
};

const ATTEND_DOT_COLOR: Record<string, string> = {
  NORMAL: "bg-[#1F4D3A]",
  LIVE: "bg-sky-500",
  EXCUSED: "bg-amber-400",
  ABSENT: "bg-red-500",
};

const ATTEND_SHORT: Record<string, string> = {
  NORMAL: "출",
  LIVE: "라",
  EXCUSED: "인",
  ABSENT: "결",
};

function AttendanceBars({ bars }: { bars: AttendBar[] }) {
  // Show up to 20 most recent sessions as colored dots
  const recent = bars.slice(-20);
  if (recent.length === 0) {
    return <span className="text-xs text-slate/40">-</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {recent.map((b, i) => (
        <span
          key={i}
          title={`${b.date} ${b.subject} - ${b.attendType === "ABSENT" ? "결석" : b.attendType === "LIVE" ? "라이브" : b.attendType === "EXCUSED" ? "인정" : "출석"}`}
          className={`inline-flex h-4 w-4 items-center justify-center rounded-sm text-[8px] font-bold text-white ${ATTEND_DOT_COLOR[b.attendType] ?? "bg-ink/20"}`}
        >
          {ATTEND_SHORT[b.attendType] ?? "?"}
        </span>
      ))}
    </div>
  );
}

export function RosterClient({ rows, cohortName, cohortId }: Props) {
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("ALL");
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("examNumber");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filteredRows = useMemo(() => {
    let result = [...rows];

    // Search filter
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.examNumber.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.phone.includes(q),
      );
    }

    // Payment filter
    if (paymentFilter !== "ALL") {
      result = result.filter((r) => r.paymentStatus === paymentFilter);
    }

    // Attendance filter
    if (attendanceFilter !== "ALL") {
      result = result.filter((r) => r.attendanceStatus === attendanceFilter);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "examNumber") {
        cmp = a.examNumber.localeCompare(b.examNumber);
      } else if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name, "ko");
      } else if (sortKey === "enrolledAt") {
        cmp = a.enrolledAt.localeCompare(b.enrolledAt);
      } else if (sortKey === "finalFee") {
        cmp = a.finalFee - b.finalFee;
      } else if (sortKey === "paidAmount") {
        cmp = a.paidAmount - b.paidAmount;
      } else if (sortKey === "scoreAttendRate") {
        cmp = (a.scoreAttendRate ?? -1) - (b.scoreAttendRate ?? -1);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [rows, search, paymentFilter, attendanceFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="ml-1 inline h-3 w-3 text-slate/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
        </svg>
      );
    }
    return sortDir === "asc" ? (
      <svg xmlns="http://www.w3.org/2000/svg" className="ml-1 inline h-3 w-3 text-ember" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    ) : (
      <svg xmlns="http://www.w3.org/2000/svg" className="ml-1 inline h-3 w-3 text-ember" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 5v14M19 12l-7 7-7-7" />
      </svg>
    );
  }

  const paymentBadgeClass = (status: RosterRow["paymentStatus"]) => {
    switch (status) {
      case "PAID": return "border-forest/20 bg-forest/10 text-forest";
      case "UNPAID": return "border-red-200 bg-red-50 text-red-700";
      case "PARTIAL": return "border-amber-200 bg-amber-50 text-amber-700";
    }
  };

  const attendanceBadgeClass = (status: RosterRow["attendanceStatus"]) => {
    switch (status) {
      case "NORMAL": return "border-ink/10 bg-mist text-slate";
      case "WARNING": return "border-red-200 bg-red-50 text-red-700";
      case "UNKNOWN": return "border-ink/10 bg-mist text-slate";
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "ACTIVE": return "border-forest/20 bg-forest/10 text-forest";
      case "WAITING": return "border-sky-200 bg-sky-50 text-sky-700";
      case "SUSPENDED": return "border-orange-200 bg-orange-50 text-orange-700";
      case "PENDING": return "border-amber-200 bg-amber-50 text-amber-700";
      case "COMPLETED": return "border-ink/10 bg-mist text-slate";
      default: return "border-ink/10 bg-mist text-slate";
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            placeholder="학번, 이름, 연락처 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[20px] border border-ink/15 bg-white py-2 pl-9 pr-4 text-sm text-ink placeholder-slate outline-none focus:border-ember/50 focus:ring-2 focus:ring-ember/10"
          />
        </div>

        {/* Payment filter */}
        <div className="flex items-center gap-1 rounded-[20px] border border-ink/15 bg-white p-1">
          {(["ALL", "PAID", "UNPAID", "PARTIAL"] as PaymentFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setPaymentFilter(f)}
              className={`rounded-[16px] px-3 py-1 text-xs font-medium transition ${
                paymentFilter === f
                  ? "bg-ember text-white"
                  : "text-slate hover:text-ink"
              }`}
            >
              {PAYMENT_FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Attendance filter */}
        <div className="flex items-center gap-1 rounded-[20px] border border-ink/15 bg-white p-1">
          {(["ALL", "NORMAL", "WARNING"] as AttendanceFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setAttendanceFilter(f)}
              className={`rounded-[16px] px-3 py-1 text-xs font-medium transition ${
                attendanceFilter === f
                  ? "bg-ember text-white"
                  : "text-slate hover:text-ink"
              }`}
            >
              {f === "ALL" ? "전체출결" : f === "NORMAL" ? "정상" : "경고/주의"}
            </button>
          ))}
        </div>

        {/* Sort selector */}
        <div className="flex items-center gap-2 text-xs text-slate">
          <span>정렬:</span>
          <div className="flex items-center gap-1">
            {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => toggleSort(k)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  sortKey === k
                    ? "bg-ink text-white"
                    : "border border-ink/15 text-slate hover:border-ink/40 hover:text-ink"
                }`}
              >
                {label}
                <SortIcon k={k} />
              </button>
            ))}
          </div>
        </div>

        {/* CSV Export */}
        <button
          type="button"
          onClick={() => downloadCsv(filteredRows, cohortName)}
          className="inline-flex items-center gap-1.5 rounded-[20px] border border-forest/20 bg-forest/10 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          CSV 내보내기
        </button>
      </div>

      {/* Result count */}
      <div className="text-sm text-slate">
        {filteredRows.length === rows.length
          ? `전체 ${rows.length}명`
          : `${filteredRows.length}명 / 전체 ${rows.length}명`}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[20px] border border-ink/10 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/10 bg-mist/60">
              <th className="px-3 py-3 text-left font-semibold text-ink text-xs">#</th>
              <th
                className="cursor-pointer px-3 py-3 text-left font-semibold text-ink text-xs hover:text-ember"
                onClick={() => toggleSort("examNumber")}
              >
                학번 <SortIcon k="examNumber" />
              </th>
              <th
                className="cursor-pointer px-3 py-3 text-left font-semibold text-ink text-xs hover:text-ember"
                onClick={() => toggleSort("name")}
              >
                이름 <SortIcon k="name" />
              </th>
              <th className="px-3 py-3 text-left font-semibold text-ink text-xs">연락처</th>
              <th
                className="cursor-pointer px-3 py-3 text-left font-semibold text-ink text-xs hover:text-ember"
                onClick={() => toggleSort("enrolledAt")}
              >
                등록일 <SortIcon k="enrolledAt" />
              </th>
              <th
                className="cursor-pointer px-3 py-3 text-right font-semibold text-ink text-xs hover:text-ember"
                onClick={() => toggleSort("finalFee")}
              >
                수강료 <SortIcon k="finalFee" />
              </th>
              <th
                className="cursor-pointer px-3 py-3 text-right font-semibold text-ink text-xs hover:text-ember"
                onClick={() => toggleSort("paidAmount")}
              >
                납부액 <SortIcon k="paidAmount" />
              </th>
              <th className="px-3 py-3 text-center font-semibold text-ink text-xs">납부상태</th>
              <th className="px-3 py-3 text-left font-semibold text-ink text-xs">4주 출결</th>
              <th
                className="cursor-pointer px-3 py-3 text-center font-semibold text-ink text-xs hover:text-ember"
                onClick={() => toggleSort("scoreAttendRate")}
              >
                출석률 <SortIcon k="scoreAttendRate" />
              </th>
              <th className="px-3 py-3 text-center font-semibold text-ink text-xs">출석상태</th>
              <th className="px-3 py-3 text-center font-semibold text-ink text-xs">수강상태</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-sm text-slate">
                  조건에 해당하는 수강생이 없습니다.
                </td>
              </tr>
            ) : (
              filteredRows.map((row, i) => (
                <tr
                  key={row.enrollmentId}
                  className={`border-b border-ink/5 transition hover:bg-mist/40 ${i % 2 === 0 ? "" : "bg-mist/20"}`}
                >
                  <td className="px-3 py-2.5 text-xs text-slate">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/students/${row.examNumber}`}
                      className="font-mono text-xs font-semibold text-ember hover:underline"
                    >
                      {row.examNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/students/${row.examNumber}`}
                      className="font-medium text-ink hover:text-ember hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate">{row.phone}</td>
                  <td className="px-3 py-2.5 text-xs text-slate">{row.enrolledAt}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-medium text-ink">{row.finalFeeFormatted}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-medium text-ink">{row.paidAmountFormatted}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${paymentBadgeClass(row.paymentStatus)}`}>
                      {row.paymentStatusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <AttendanceBars bars={row.recentAttend} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {row.scoreAttendRate !== null ? (
                      <span
                        className={`font-semibold text-xs ${
                          row.scoreAttendRate >= 80
                            ? "text-[#1F4D3A]"
                            : row.scoreAttendRate >= 60
                            ? "text-amber-700"
                            : "text-red-600"
                        }`}
                      >
                        {row.scoreAttendRate}%
                      </span>
                    ) : (
                      <span className="text-xs text-slate/40">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${attendanceBadgeClass(row.attendanceStatus)}`}>
                      {row.attendanceStatusLabel}
                      {row.absenceCount > 0 && (
                        <span className="ml-0.5 text-[10px]">({row.absenceCount})</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}>
                      {row.statusLabel}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Attendance bar legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate">
        <span className="font-medium">4주 출결 범례:</span>
        {(["NORMAL", "LIVE", "EXCUSED", "ABSENT"] as const).map((type) => (
          <span key={type} className="flex items-center gap-1">
            <span
              className={`inline-flex h-4 w-4 items-center justify-center rounded-sm text-[8px] font-bold text-white ${ATTEND_DOT_COLOR[type]}`}
            >
              {ATTEND_SHORT[type]}
            </span>
            {type === "NORMAL" ? "출석" : type === "LIVE" ? "라이브" : type === "EXCUSED" ? "인정" : "결석"}
          </span>
        ))}
      </div>
    </div>
  );
}
