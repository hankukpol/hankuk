"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EnrollmentStatus, ExamType, StudentStatus } from "@prisma/client";
import { ENROLLMENT_STATUS_LABEL, EXAM_TYPE_LABEL } from "@/lib/constants";

type PeriodOption = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isGongchaeEnabled: boolean;
  isGyeongchaeEnabled: boolean;
  enrollmentCount: number;
};

type EnrollmentData = {
  id: string;
  label: string;
  status: EnrollmentStatus;
};

type StudentData = {
  examNumber: string;
  name: string;
  mobile: string | null;
  examType: ExamType;
  onlineId: string | null;
  isActive: boolean;
  currentStatus: StudentStatus;
  registeredAt: string | null;
  generation: number | null;
  className: string | null;
  isOnline: boolean;
  enrollments: EnrollmentData[];
};

type Subscription = {
  enrolledAt: string;
  student: StudentData;
};

type Stats = {
  total: number;
  gongchae: number;
  gyeongchae: number;
  online: number;
};

type SortKey = "examNumber" | "name" | "examType" | "enrolledAt";

const STATUS_LABEL: Record<StudentStatus, string> = {
  NORMAL: "재원",
  WARNING_1: "1차 경고",
  WARNING_2: "2차 경고",
  DROPOUT: "중도탈락",
};

const STATUS_COLOR: Record<StudentStatus, string> = {
  NORMAL: "border-forest/30 bg-forest/10 text-forest",
  WARNING_1: "border-amber-200 bg-amber-50 text-amber-800",
  WARNING_2: "border-orange-200 bg-orange-50 text-orange-700",
  DROPOUT: "border-red-200 bg-red-50 text-red-700",
};

function formatDate(iso: string) {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

function formatPeriodRange(start: string, end: string) {
  const format = (value: string) => {
    const date = new Date(value);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  };

  return `${format(start)} ~ ${format(end)}`;
}

function KpiCard({
  label,
  value,
  sub,
  active,
  onClick,
}: {
  label: string;
  value: number;
  sub?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-[24px] border px-5 py-4 text-left transition ${
        active
          ? "border-ember/40 bg-ember/10"
          : "border-ink/10 bg-white hover:border-ember/30 hover:bg-ember/5"
      }`}
    >
      <span className="text-xs font-medium text-slate">{label}</span>
      <span className={`text-2xl font-bold ${active ? "text-ember" : "text-ink"}`}>{value}</span>
      {sub && <span className="text-xs text-slate">{sub}</span>}
    </button>
  );
}

export function MorningExamManager({ periods }: { periods: PeriodOption[] }) {
  const defaultPeriod = periods.find((period) => period.isActive) ?? periods[0];

  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(defaultPeriod?.id ?? 0);
  const [examTypeFilter, setExamTypeFilter] = useState<ExamType | "ALL" | "ONLINE">("ALL");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("examNumber");
  const [sortAsc, setSortAsc] = useState(true);

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, gongchae: 0, gyeongchae: 0, online: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limit = 100;

  const fetchData = useCallback(
    async (periodId: number, nextPage: number) => {
      if (!periodId) return;

      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          periodId: String(periodId),
          page: String(nextPage),
          limit: String(limit),
        });

        const apiExamType =
          examTypeFilter === "GONGCHAE" || examTypeFilter === "GYEONGCHAE" ? examTypeFilter : undefined;
        if (apiExamType) params.set("examType", apiExamType);
        if (query.trim()) params.set("query", query.trim());

        const res = await fetch(`/api/exams/morning/subscriptions?${params.toString()}`);
        const payload = (await res.json()) as {
          data?: {
            subscriptions?: Subscription[];
            total?: number;
            stats?: Stats;
          };
          error?: string;
        };

        if (!res.ok) {
          throw new Error(payload.error ?? "조회에 실패했습니다.");
        }

        setSubscriptions(payload.data?.subscriptions ?? []);
        setTotal(payload.data?.total ?? 0);
        setStats(payload.data?.stats ?? { total: 0, gongchae: 0, gyeongchae: 0, online: 0 });
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    },
    [examTypeFilter, query],
  );

  useEffect(() => {
    setPage(1);
  }, [selectedPeriodId, examTypeFilter, query]);

  useEffect(() => {
    void fetchData(selectedPeriodId, page);
  }, [selectedPeriodId, page, fetchData]);

  const filtered = subscriptions.filter((subscription) => {
    if (examTypeFilter === "ONLINE") {
      return subscription.student.isOnline;
    }
    return true;
  });

  const sorted = useMemo(() => {
    return [...filtered].sort((left, right) => {
      let compare = 0;
      if (sortKey === "examNumber") compare = left.student.examNumber.localeCompare(right.student.examNumber);
      if (sortKey === "name") compare = left.student.name.localeCompare(right.student.name, "ko");
      if (sortKey === "examType") compare = left.student.examType.localeCompare(right.student.examType);
      if (sortKey === "enrolledAt") compare = left.enrolledAt.localeCompare(right.enrolledAt);
      return sortAsc ? compare : -compare;
    });
  }, [filtered, sortAsc, sortKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((current) => !current);
      return;
    }

    setSortKey(key);
    setSortAsc(true);
  }

  function SortIcon({ value }: { value: SortKey }) {
    if (sortKey !== value) return <span className="ml-1 text-ink/20">↕</span>;
    return <span className="ml-1 text-ember">{sortAsc ? "↑" : "↓"}</span>;
  }

  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/admin/exams/morning/enroll"
          className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          + 수강생 등록
        </Link>
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-ink">시험 기간 선택</span>
          <select
            value={selectedPeriodId}
            onChange={(event) => setSelectedPeriodId(Number(event.target.value))}
            className="rounded-xl border border-ink/15 bg-mist px-4 py-2 text-sm font-medium text-ink focus:border-forest focus:outline-none"
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
                {period.isActive ? " [현재]" : ""}
              </option>
            ))}
          </select>
          {selectedPeriod && <span className="text-xs text-slate">{formatPeriodRange(selectedPeriod.startDate, selectedPeriod.endDate)}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="총 수강생" value={stats.total} active={examTypeFilter === "ALL"} onClick={() => setExamTypeFilter("ALL")} />
        <KpiCard label="공채" value={stats.gongchae} sub="경찰 공통과목" active={examTypeFilter === "GONGCHAE"} onClick={() => setExamTypeFilter("GONGCHAE")} />
        <KpiCard label="경채" value={stats.gyeongchae} sub="경찰 전공과목" active={examTypeFilter === "GYEONGCHAE"} onClick={() => setExamTypeFilter("GYEONGCHAE")} />
        <KpiCard label="온라인" value={stats.online} sub="온라인 ID 보유" active={examTypeFilter === "ONLINE"} onClick={() => setExamTypeFilter("ONLINE")} />
      </div>

      <div className="rounded-[28px] border border-ink/10 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="이름 또는 학번 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-xl border border-ink/15 bg-mist py-2 pl-9 pr-4 text-sm focus:border-forest focus:outline-none"
            />
          </div>

          <select
            value={examTypeFilter}
            onChange={(event) => setExamTypeFilter(event.target.value as ExamType | "ALL" | "ONLINE")}
            className="rounded-xl border border-ink/15 bg-mist px-4 py-2 text-sm font-medium text-ink focus:border-forest focus:outline-none"
          >
            <option value="ALL">전체 수강유형</option>
            <option value="GONGCHAE">공채</option>
            <option value="GYEONGCHAE">경채</option>
            <option value="ONLINE">온라인</option>
          </select>

          <select
            value={`${sortKey}-${sortAsc ? "asc" : "desc"}`}
            onChange={(event) => {
              const [nextSortKey, nextDirection] = event.target.value.split("-") as [SortKey, "asc" | "desc"];
              setSortKey(nextSortKey);
              setSortAsc(nextDirection === "asc");
            }}
            className="rounded-xl border border-ink/15 bg-mist px-4 py-2 text-sm font-medium text-ink focus:border-forest focus:outline-none"
          >
            <option value="examNumber-asc">학번 오름차순</option>
            <option value="examNumber-desc">학번 내림차순</option>
            <option value="name-asc">이름 가나다순</option>
            <option value="enrolledAt-desc">등록일 최신순</option>
            <option value="enrolledAt-asc">등록일 오래된순</option>
          </select>

          {(query || examTypeFilter !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setExamTypeFilter("ALL");
              }}
              className="rounded-xl border border-ink/15 bg-mist px-4 py-2 text-sm text-slate transition hover:border-ember/30 hover:text-ember"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate">
            <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-forest border-t-transparent" />
            불러오는 중...
          </div>
        ) : error ? (
          <div className="py-20 text-center text-red-600">{error}</div>
        ) : sorted.length === 0 ? (
          <div className="py-20 text-center text-slate">
            {query || examTypeFilter !== "ALL" ? "검색 결과가 없습니다." : "이 기간에는 등록된 수강생이 없습니다."}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist">
                    <th className="cursor-pointer select-none px-4 py-3 text-left font-semibold text-ink/60 transition hover:text-ink" onClick={() => toggleSort("examNumber")}>
                      학번<SortIcon value="examNumber" />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 text-left font-semibold text-ink/60 transition hover:text-ink" onClick={() => toggleSort("name")}>
                      이름<SortIcon value="name" />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-ink/60">연락처</th>
                    <th className="px-4 py-3 text-left font-semibold text-ink/60">수강내역</th>
                    <th className="cursor-pointer select-none px-4 py-3 text-left font-semibold text-ink/60 transition hover:text-ink" onClick={() => toggleSort("examType")}>
                      수강유형<SortIcon value="examType" />
                    </th>
                    <th className="cursor-pointer select-none px-4 py-3 text-left font-semibold text-ink/60 transition hover:text-ink" onClick={() => toggleSort("enrolledAt")}>
                      등록일<SortIcon value="enrolledAt" />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-ink/60">상태</th>
                    <th className="px-4 py-3 text-right font-semibold text-ink/60">성적 보기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {sorted.map((subscription) => {
                    const student = subscription.student;
                    return (
                      <tr key={student.examNumber} className="transition hover:bg-mist/60">
                        <td className="px-4 py-3">
                          <Link href={`/admin/students/${student.examNumber}`} className="font-mono text-sm font-semibold text-forest hover:underline">
                            {student.examNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/admin/students/${student.examNumber}`} className="font-semibold text-ink hover:text-forest hover:underline">
                            {student.name}
                          </Link>
                          {student.isOnline && (
                            <span className="ml-2 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                              온라인
                            </span>
                          )}
                          {student.className && <span className="ml-1 text-xs text-slate">({student.className})</span>}
                        </td>
                        <td className="px-4 py-3 text-slate">{student.mobile ?? <span className="text-ink/25">-</span>}</td>
                        <td className="px-4 py-3">
                          {student.enrollments.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {student.enrollments.slice(0, 2).map((enrollment) => (
                                <span
                                  key={enrollment.id}
                                  className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-[11px] font-medium text-ink"
                                >
                                  {enrollment.label} · {ENROLLMENT_STATUS_LABEL[enrollment.status]}
                                </span>
                              ))}
                              {student.enrollments.length > 2 && (
                                <span className="inline-flex items-center rounded-full border border-ink/10 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate">
                                  외 {student.enrollments.length - 2}건
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-ink/25">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${student.examType === "GONGCHAE" ? "border-forest/30 bg-forest/10 text-forest" : "border-ember/30 bg-ember/10 text-ember"}`}>
                            {EXAM_TYPE_LABEL[student.examType]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate">{formatDate(subscription.enrolledAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[student.currentStatus]}`}>
                            {STATUS_LABEL[student.currentStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/admin/students/${student.examNumber}/score-trend`} className="text-sm font-semibold text-ember hover:underline">
                            성적 추이
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-ink/10 px-4 py-4 text-sm text-slate">
              <span>
                {page} / {totalPages} 페이지
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-xl border border-ink/15 px-3 py-1.5 transition disabled:opacity-40"
                >
                  이전
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  className="rounded-xl border border-ink/15 px-3 py-1.5 transition disabled:opacity-40"
                >
                  다음
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
