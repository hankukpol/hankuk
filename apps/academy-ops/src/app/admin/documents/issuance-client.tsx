"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

export type IssuanceRow = {
  id: string;
  examNumber: string;
  studentName: string;
  docType: string;
  issuedAt: string; // ISO string
  issuedByName: string | null;
  note: string | null;
};

export type EnrollmentRow = {
  id: string;
  examNumber: string;
  studentName: string;
  courseName: string;
  courseType: string;
  status: string;
  startDate: string;
  endDate: string | null;
  updatedAt: string;
};

export type IssuanceStats = {
  issuedToday: number;
  issuedThisMonth: number;
  issuedTotal: number;
};

type Props = {
  issuances: IssuanceRow[];
  enrollments: EnrollmentRow[];
  stats: IssuanceStats;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPE_LABEL: Record<string, string> = {
  ENROLLMENT_CERT: "수강확인서",
  TAX_CERT: "교육비납입증명서",
  SCORE_REPORT: "성적확인서",
  ATTENDANCE_CERT: "출결확인서",
  CUSTOM: "기타 서류",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "수강 중",
  COMPLETED: "수료",
  SUSPENDED: "휴원",
  WAITING: "대기",
  PENDING: "대기",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-forest/10 text-forest border-forest/20",
  COMPLETED: "bg-sky-50 text-sky-700 border-sky-200",
  SUSPENDED: "bg-amber-50 text-amber-700 border-amber-200",
  WAITING: "bg-ink/5 text-slate border-ink/10",
  PENDING: "bg-ink/5 text-slate border-ink/10",
  WITHDRAWN: "bg-red-50 text-red-600 border-red-200",
  CANCELLED: "bg-ink/5 text-slate border-ink/10",
};

const DOC_TYPE_COLOR: Record<string, string> = {
  ENROLLMENT_CERT: "bg-forest/10 text-forest border-forest/20",
  TAX_CERT: "bg-violet-50 text-violet-700 border-violet-200",
  SCORE_REPORT: "bg-sky-50 text-sky-700 border-sky-200",
  ATTENDANCE_CERT: "bg-amber-50 text-amber-700 border-amber-200",
  CUSTOM: "bg-ink/5 text-slate border-ink/10",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateShort(isoStr: string): string {
  const d = new Date(isoStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function IssuanceClient({ issuances, enrollments, stats }: Props) {
  const [activeTab, setActiveTab] = useState<"issuances" | "enrollments">("enrollments");
  const [searchQuery, setSearchQuery] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Filter issuances
  const filteredIssuances = useMemo(() => {
    return issuances.filter((row) => {
      if (
        searchQuery &&
        !row.examNumber.includes(searchQuery) &&
        !row.studentName.includes(searchQuery)
      ) {
        return false;
      }
      if (docTypeFilter !== "ALL" && row.docType !== docTypeFilter) return false;
      if (dateFrom && row.issuedAt < dateFrom) return false;
      if (dateTo && row.issuedAt > dateTo + "T23:59:59") return false;
      return true;
    });
  }, [issuances, searchQuery, docTypeFilter, dateFrom, dateTo]);

  // Filter enrollments
  const filteredEnrollments = useMemo(() => {
    return enrollments.filter((row) => {
      if (
        searchQuery &&
        !row.examNumber.includes(searchQuery) &&
        !row.studentName.includes(searchQuery) &&
        !row.courseName.includes(searchQuery)
      ) {
        return false;
      }
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      return true;
    });
  }, [enrollments, searchQuery, statusFilter]);

  return (
    <div>
      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            오늘 발급
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">{stats.issuedToday}</p>
          <p className="mt-1 text-xs text-slate">서류 발급 건수</p>
        </div>
        <div className="rounded-[24px] border border-forest/20 bg-forest/5 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest">
            이번 달 발급
          </p>
          <p className="mt-3 text-3xl font-bold text-forest">{stats.issuedThisMonth}</p>
          <p className="mt-1 text-xs text-forest/70">월간 발급 건수</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            누적 발급
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">{stats.issuedTotal}</p>
          <p className="mt-1 text-xs text-slate">전체 발급 이력</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-8 flex gap-1 rounded-2xl border border-ink/10 bg-mist/60 p-1 w-fit">
        <button
          onClick={() => setActiveTab("enrollments")}
          className={`rounded-[14px] px-5 py-2.5 text-sm font-medium transition ${
            activeTab === "enrollments"
              ? "bg-white text-ink shadow-sm"
              : "text-slate hover:text-ink"
          }`}
        >
          수강 내역 (증명서 발급)
        </button>
        <button
          onClick={() => setActiveTab("issuances")}
          className={`rounded-[14px] px-5 py-2.5 text-sm font-medium transition ${
            activeTab === "issuances"
              ? "bg-white text-ink shadow-sm"
              : "text-slate hover:text-ink"
          }`}
        >
          발급 이력 ({issuances.length})
        </button>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="학번 또는 이름 검색..."
          className="rounded-2xl border border-ink/15 px-4 py-2 text-sm text-ink outline-none placeholder:text-slate/40 focus:border-forest focus:ring-1 focus:ring-forest/20 transition min-w-[200px]"
        />

        {activeTab === "issuances" && (
          <>
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value)}
              className="rounded-2xl border border-ink/15 px-4 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-1 focus:ring-forest/20 transition"
            >
              <option value="ALL">모든 서류</option>
              {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-2xl border border-ink/15 px-4 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-1 focus:ring-forest/20 transition"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-2xl border border-ink/15 px-4 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-1 focus:ring-forest/20 transition"
            />
          </>
        )}

        {activeTab === "enrollments" && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-ink/15 px-4 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-1 focus:ring-forest/20 transition"
          >
            <option value="ALL">모든 상태</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}

        {(searchQuery || docTypeFilter !== "ALL" || statusFilter !== "ALL" || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setSearchQuery("");
              setDocTypeFilter("ALL");
              setStatusFilter("ALL");
              setDateFrom("");
              setDateTo("");
            }}
            className="rounded-2xl border border-ink/15 px-4 py-2 text-xs text-slate transition hover:border-red-200 hover:text-red-600"
          >
            필터 초기화
          </button>
        )}
      </div>

      {/* Enrollment Table */}
      {activeTab === "enrollments" && (
        <div className="mt-4 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
          {filteredEnrollments.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate">
              수강 내역이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60">
                    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      학생
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      강좌
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate hidden sm:table-cell">
                      상태
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate hidden md:table-cell">
                      수강기간
                    </th>
                    <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      증명서 출력
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {filteredEnrollments.map((enr) => (
                    <tr key={enr.id} className="hover:bg-mist/30 transition">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/students/${enr.examNumber}`}
                          className="font-medium text-ink hover:text-forest transition"
                        >
                          {enr.studentName}
                        </Link>
                        <p className="text-xs text-slate font-mono">{enr.examNumber}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-ink">{enr.courseName}</p>
                        <p className="text-xs text-slate">
                          {enr.courseType === "COMPREHENSIVE" ? "종합반" : "특강·단과"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            STATUS_COLOR[enr.status] ?? "bg-ink/5 text-slate border-ink/10"
                          }`}
                        >
                          {STATUS_LABEL[enr.status] ?? enr.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell text-xs text-slate">
                        {new Date(enr.startDate).toLocaleDateString("ko-KR")}
                        {enr.endDate
                          ? ` ~ ${new Date(enr.endDate).toLocaleDateString("ko-KR")}`
                          : ""}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <Link
                            href={`/admin/students/${enr.examNumber}/documents?type=enrollment`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-forest/20 bg-forest/5 px-3 py-1 text-xs font-medium text-forest hover:bg-forest/10 transition"
                          >
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                              />
                            </svg>
                            수강확인서
                          </Link>
                          <Link
                            href={`/admin/enrollments/${enr.id}/certificate`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 transition"
                          >
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                              />
                            </svg>
                            등록확인서
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-ink/5 px-5 py-3 text-xs text-slate">
                {filteredEnrollments.length.toLocaleString()}건 표시
              </div>
            </div>
          )}
        </div>
      )}

      {/* Issuance History Table */}
      {activeTab === "issuances" && (
        <div className="mt-4 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
          {filteredIssuances.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate">
              {issuances.length === 0
                ? "발급 이력이 없습니다. 학생 문서 페이지에서 발급 기록 버튼을 눌러 기록하세요."
                : "검색 조건에 맞는 발급 이력이 없습니다."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60">
                    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      학생
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      문서 유형
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate hidden sm:table-cell">
                      발급자
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate hidden md:table-cell">
                      발급일시
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate hidden lg:table-cell">
                      메모
                    </th>
                    <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      재발급
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {filteredIssuances.map((iss) => (
                    <tr key={iss.id} className="hover:bg-mist/30 transition">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/students/${iss.examNumber}`}
                          className="font-medium text-ink hover:text-forest transition"
                        >
                          {iss.studentName}
                        </Link>
                        <p className="text-xs text-slate font-mono">{iss.examNumber}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            DOC_TYPE_COLOR[iss.docType] ?? "bg-ink/5 text-slate border-ink/10"
                          }`}
                        >
                          {DOC_TYPE_LABEL[iss.docType] ?? iss.docType}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell text-xs text-slate">
                        {iss.issuedByName ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell text-xs text-slate">
                        {formatDateShort(iss.issuedAt)}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell text-xs text-slate">
                        {iss.note ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/admin/students/${iss.examNumber}/documents?type=${iss.docType.toLowerCase()}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-ink/15 px-3 py-1 text-xs font-medium text-slate hover:border-forest/30 hover:text-forest transition"
                        >
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                          재발급
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-ink/5 px-5 py-3 text-xs text-slate">
                {filteredIssuances.length.toLocaleString()}건 표시 (전체{" "}
                {issuances.length.toLocaleString()}건)
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
