"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { EXAM_CATEGORY_LABEL, ENROLLMENT_STATUS_COLOR, ENROLLMENT_STATUS_LABEL } from "@/lib/constants";
import type { CohortAnalyticsData } from "@/lib/analytics/cohort-analytics";

type EnrollmentStatus =
  | "PENDING"
  | "ACTIVE"
  | "WAITING"
  | "SUSPENDED"
  | "COMPLETED"
  | "WITHDRAWN"
  | "CANCELLED";

type EnrollmentItem = {
  id: string;
  examNumber: string;
  status: EnrollmentStatus;
  finalFee: number;
  discountAmount: number;
  createdAt: string;
  studentName: string | null;
  studentPhone: string | null;
  staffName: string | null;
  waitlistOrder: number | null;
};

type CohortData = {
  id: string;
  name: string;
  examCategory: string;
  startDate: string;
  endDate: string;
  targetExamYear: number | null;
  isActive: boolean;
  maxCapacity: number | null;
  activeCount: number;
  waitlistCount: number;
  availableSeats: number | null;
  capacityPercent: number | null;
  enrollments: EnrollmentItem[];
};

type Props = {
  cohort: CohortData;
  analyticsData?: CohortAnalyticsData | null;
};

type TabKey = "ACTIVE" | "WAITING" | "WITHDRAWN" | "ANALYTICS";

const ENROLLMENT_TAB_CONFIG: { key: Exclude<TabKey, "ANALYTICS">; label: string; statuses: EnrollmentStatus[] }[] = [
  { key: "ACTIVE", label: "재원", statuses: ["PENDING", "ACTIVE", "SUSPENDED"] },
  { key: "WAITING", label: "대기", statuses: ["WAITING"] },
  { key: "WITHDRAWN", label: "퇴원·완료·취소", statuses: ["WITHDRAWN", "COMPLETED", "CANCELLED"] },
];

export function CohortDetailClient({ cohort: initialCohort, analyticsData }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [cohort, setCohort] = useState<CohortData>(initialCohort);
  const rawTab = searchParams.get("tab")?.toUpperCase();
  const activeTab: TabKey =
    rawTab === "ANALYTICS" ? "ANALYTICS" :
    rawTab === "WAITING" ? "WAITING" :
    rawTab === "WITHDRAWN" ? "WITHDRAWN" :
    "ACTIVE";
  const [isEditingEndDate, setIsEditingEndDate] = useState<boolean>(false);
  const [endDateInput, setEndDateInput] = useState<string>(initialCohort.endDate.slice(0, 10));
  const [isSaving, startSaving] = useTransition();

  const setActiveTab = useCallback((tab: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "ACTIVE") {
      params.delete("tab");
    } else {
      params.set("tab", tab.toLowerCase());
    }
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  const currentEnrollmentTabConfig = ENROLLMENT_TAB_CONFIG.find((t) => t.key === activeTab);
  const filteredEnrollments = currentEnrollmentTabConfig
    ? cohort.enrollments.filter((e) => currentEnrollmentTabConfig.statuses.includes(e.status))
    : [];

  const tabCounts: Record<Exclude<TabKey, "ANALYTICS">, number> = {
    ACTIVE: cohort.enrollments.filter((e) =>
      ["PENDING", "ACTIVE", "SUSPENDED"].includes(e.status),
    ).length,
    WAITING: cohort.enrollments.filter((e) => e.status === "WAITING").length,
    WITHDRAWN: cohort.enrollments.filter((e) =>
      ["WITHDRAWN", "COMPLETED", "CANCELLED"].includes(e.status),
    ).length,
  };

  function handleSaveEndDate() {
    if (!endDateInput) return;
    startSaving(async () => {
      try {
        const res = await fetch(`/api/settings/cohorts/${cohort.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endDate: endDateInput }),
          cache: "no-store",
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "수정 실패");
        setCohort((prev) => ({
          ...prev,
          endDate: new Date(endDateInput).toISOString(),
        }));
        setIsEditingEndDate(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "수정 실패");
      }
    });
  }

  const examCategoryLabel =
    EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ??
    cohort.examCategory;

  const isFull = cohort.maxCapacity != null && cohort.availableSeats === 0;
  const isNearFull =
    cohort.capacityPercent !== null && cohort.capacityPercent >= 80 && !isFull;

  return (
    <>
      {/* Cohort info card */}
      <div className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate">수험유형</p>
          <p className="mt-1 text-sm font-semibold text-ink">{examCategoryLabel}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate">기간</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-sm font-semibold text-ink">
              {cohort.startDate.slice(0, 10)} ~{" "}
              {isEditingEndDate ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="date"
                    value={endDateInput}
                    onChange={(e) => setEndDateInput(e.target.value)}
                    className="rounded border border-forest/40 px-1.5 py-0.5 text-sm text-ink focus:border-forest focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveEndDate}
                    disabled={isSaving}
                    className="rounded bg-forest px-2 py-0.5 text-xs font-medium text-white hover:bg-forest/90 disabled:opacity-50"
                  >
                    {isSaving ? "..." : "저장"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingEndDate(false);
                      setEndDateInput(cohort.endDate.slice(0, 10));
                    }}
                    className="rounded border border-ink/10 px-2 py-0.5 text-xs text-slate hover:bg-mist"
                  >
                    취소
                  </button>
                </span>
              ) : (
                <span>
                  {cohort.endDate.slice(0, 10)}{" "}
                  <button
                    type="button"
                    onClick={() => setIsEditingEndDate(true)}
                    className="ml-1 text-xs text-slate underline hover:text-forest"
                  >
                    수정
                  </button>
                </span>
              )}
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate">목표시험연도</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {cohort.targetExamYear != null ? `${cohort.targetExamYear}년` : "-"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate">상태</p>
          <p className="mt-1">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                cohort.isActive ? "bg-forest/10 text-forest" : "bg-slate/10 text-slate"
              }`}
            >
              {cohort.isActive ? "활성" : "비활성"}
            </span>
          </p>
        </div>
      </div>

      {/* Capacity bar */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">정원 현황</h2>
          <span className={`text-sm font-medium ${isFull ? "text-red-600" : isNearFull ? "text-amber-600" : "text-slate"}`}>
            {cohort.maxCapacity != null
              ? `${cohort.activeCount} / ${cohort.maxCapacity}명${
                  cohort.availableSeats != null
                    ? ` · 여석 ${cohort.availableSeats}명`
                    : ""
                }`
              : `${cohort.activeCount}명 (무제한)`}
          </span>
        </div>
        {cohort.capacityPercent !== null ? (
          <div className="mt-3">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  isFull ? "bg-red-500" : isNearFull ? "bg-amber-500" : "bg-forest"
                }`}
                style={{ width: `${cohort.capacityPercent}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate">{cohort.capacityPercent}% 사용 중</p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate">정원 제한 없음</p>
        )}
        {cohort.waitlistCount > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              대기자 {cohort.waitlistCount}명
            </span>
            <Link
              href={`/admin/cohorts/waitlist?cohortId=${cohort.id}`}
              className="text-xs text-forest underline hover:text-forest/80"
            >
              대기자 관리 &rarr;
            </Link>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-8">
        <div className="flex gap-1 rounded-[20px] border border-ink/10 bg-white p-1.5 w-fit flex-wrap">
          {ENROLLMENT_TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "bg-forest text-white shadow-sm"
                  : "text-slate hover:bg-mist hover:text-ink"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                  activeTab === tab.key
                    ? "bg-white/20 text-white"
                    : "bg-ink/10 text-slate"
                }`}
              >
                {tabCounts[tab.key]}
              </span>
            </button>
          ))}
          {/* Analytics tab */}
          <button
            type="button"
            onClick={() => setActiveTab("ANALYTICS")}
            className={`flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-medium transition ${
              activeTab === "ANALYTICS"
                ? "bg-ember text-white shadow-sm"
                : "text-slate hover:bg-mist hover:text-ink"
            }`}
          >
            분석
          </button>
        </div>

        {/* Tab panels */}
        <div className="mt-4">
          {activeTab === "ANALYTICS" ? (
            <AnalyticsPanel data={analyticsData ?? null} cohortId={cohort.id} />
          ) : filteredEnrollments.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-10 text-center text-sm text-slate">
              {activeTab === "ACTIVE"
                ? "재원 중인 수강생이 없습니다."
                : activeTab === "WAITING"
                  ? "대기자가 없습니다."
                  : "퇴원·완료·취소된 수강생이 없습니다."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
              <table className="min-w-full divide-y divide-ink/5 text-sm">
                <thead>
                  <tr>
                    {activeTab === "WAITING"
                      ? ["순번", "이름", "학번", "연락처", "수강료", "대기 등록일", "액션"].map((h) => (
                          <th key={h} className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap">
                            {h}
                          </th>
                        ))
                      : ["#", "이름", "학번", "연락처", "수강료", "상태", "등록일", "담당자", "바로가기"].map((h) => (
                          <th key={h} className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {activeTab === "WAITING"
                    ? filteredEnrollments.map((e) => (
                        <tr key={e.id} className="transition hover:bg-mist/20">
                          <td className="px-4 py-3 tabular-nums text-slate">{e.waitlistOrder ?? "-"}</td>
                          <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                            <Link href={`/admin/students/${e.examNumber}`} className="hover:text-forest hover:underline">
                              {e.studentName ?? "-"}
                            </Link>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate">{e.examNumber}</td>
                          <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">{e.studentPhone ?? "-"}</td>
                          <td className="px-4 py-3 tabular-nums text-slate whitespace-nowrap">{e.finalFee.toLocaleString()}원</td>
                          <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">{e.createdAt.slice(0, 10)}</td>
                          <td className="px-4 py-3">
                            <WaitlistPromoteInline enrollmentId={e.id} />
                          </td>
                        </tr>
                      ))
                    : filteredEnrollments.map((e, i) => (
                        <tr key={e.id} className="transition hover:bg-mist/20">
                          <td className="px-4 py-3 text-xs text-slate tabular-nums">{i + 1}</td>
                          <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                            <Link href={`/admin/students/${e.examNumber}`} className="hover:text-forest hover:underline">
                              {e.studentName ?? "-"}
                            </Link>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate">{e.examNumber}</td>
                          <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">{e.studentPhone ?? "-"}</td>
                          <td className="px-4 py-3 tabular-nums text-slate whitespace-nowrap">
                            {e.finalFee.toLocaleString()}원
                            {e.discountAmount > 0 && (
                              <span className="ml-1 text-xs text-slate">(-{e.discountAmount.toLocaleString()})</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[e.status]}`}>
                              {ENROLLMENT_STATUS_LABEL[e.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                            {e.createdAt.slice(0, 10)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                            {e.staffName ?? "-"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/admin/enrollments/${e.id}`}
                                className="rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                              >
                                수강 상세
                              </Link>
                              <Link
                                href={`/admin/students/${e.examNumber}`}
                                className="rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                              >
                                학생 정보
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function WaitlistPromoteInline({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handlePromote() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/enrollments/${enrollmentId}/promote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "수강 확정 실패");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "수강 확정 실패");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handlePromote}
      disabled={isPending}
      className="inline-flex items-center rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white transition hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? "처리 중..." : "수강 확정"}
    </button>
  );
}

// ─────────────────────────────────────────────
// Analytics Panel
// ─────────────────────────────────────────────

type SortKey = "avgScore" | "attendanceRate" | "name";
type SortDir = "asc" | "desc";

function AnalyticsPanel({
  data,
  cohortId,
}: {
  data: CohortAnalyticsData | null;
  cohortId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sortKey, setSortKey] = useState<SortKey>("avgScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // When analytics tab is first shown with no data, trigger navigation to load it
  if (!data) {
    return (
      <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-12 text-center">
        <p className="text-sm text-slate">분석 데이터를 불러오는 중...</p>
        <AnalyticsLoader cohortId={cohortId} />
      </div>
    );
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortedStudents = [...data.students].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "avgScore") {
      if (a.avgScore === null && b.avgScore === null) cmp = 0;
      else if (a.avgScore === null) cmp = 1;
      else if (b.avgScore === null) cmp = -1;
      else cmp = a.avgScore - b.avgScore;
    } else if (sortKey === "attendanceRate") {
      cmp = a.attendanceRate - b.attendanceRate;
    } else {
      cmp = a.name.localeCompare(b.name, "ko-KR");
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const maxDistCount = Math.max(1, ...data.scoreDistribution.map((d) => d.count));

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="ml-0.5 text-slate/40">↕</span>;
    return <span className="ml-0.5 text-forest">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  function scoreColor(avg: number | null): string {
    if (avg === null) return "text-slate";
    if (avg >= 80) return "text-[#1F4D3A] font-semibold"; // forest
    if (avg >= 60) return "text-ink";
    return "text-[#C55A11] font-semibold"; // ember
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">총 등록</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{data.totalEnrolled}<span className="ml-1 text-sm font-normal text-slate">명</span></p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">활성 수강생</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{data.activeCount}<span className="ml-1 text-sm font-normal text-slate">명</span></p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">평균 성적</p>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${data.avgScore === null ? "text-slate" : data.avgScore >= 80 ? "text-[#1F4D3A]" : data.avgScore >= 60 ? "text-ink" : "text-[#C55A11]"}`}>
            {data.avgScore !== null ? data.avgScore.toFixed(1) : "-"}
            {data.avgScore !== null && <span className="ml-1 text-sm font-normal text-slate">점</span>}
          </p>
          {data.passRate > 0 && (
            <p className="mt-1 text-xs text-slate">합격선(80점↑) {data.passRate}%</p>
          )}
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">출석률</p>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${data.attendanceRate >= 80 ? "text-[#1F4D3A]" : data.attendanceRate >= 60 ? "text-ink" : "text-[#C55A11]"}`}>
            {data.attendanceRate.toFixed(1)}<span className="ml-0.5 text-sm font-normal text-slate">%</span>
          </p>
        </div>
      </div>

      {/* Score Distribution */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h3 className="text-base font-semibold text-ink">점수 분포</h3>
        <p className="mt-0.5 text-xs text-slate">수강생 평균 점수 기준</p>
        <div className="mt-5 space-y-3">
          {data.scoreDistribution.map((item) => (
            <div key={item.range} className="flex items-center gap-3">
              <span className="w-14 text-right text-xs tabular-nums text-slate">{item.range}</span>
              <div className="flex-1 h-5 rounded-full bg-ink/5 overflow-hidden">
                <div
                  className="h-5 rounded-full bg-forest/70 transition-all"
                  style={{ width: `${item.count === 0 ? 0 : Math.max(2, (item.count / maxDistCount) * 100)}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs tabular-nums text-slate font-medium">{item.count}명</span>
            </div>
          ))}
        </div>
        {data.totalEnrolled === 0 && (
          <p className="mt-4 text-center text-xs text-slate">등록된 수강생이 없습니다.</p>
        )}
        {data.totalEnrolled > 0 && data.scoreDistribution.every((d) => d.count === 0) && (
          <p className="mt-4 text-center text-xs text-slate">이 기수 기간 내 성적 데이터가 없습니다.</p>
        )}
      </div>

      {/* Student Performance Table */}
      <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-ink/5">
          <h3 className="text-base font-semibold text-ink">수강생 성적 현황</h3>
          <p className="mt-0.5 text-xs text-slate">기수 기간 내 응시한 성적 기준</p>
        </div>
        {sortedStudents.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate">수강생이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr>
                  <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap">#</th>
                  <th
                    className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap cursor-pointer hover:text-ink select-none"
                    onClick={() => handleSort("name")}
                  >
                    이름 <SortIcon k="name" />
                  </th>
                  <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap">학번</th>
                  <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap">상태</th>
                  <th
                    className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap cursor-pointer hover:text-ink select-none"
                    onClick={() => handleSort("avgScore")}
                  >
                    평균점수 <SortIcon k="avgScore" />
                  </th>
                  <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap">응시횟수</th>
                  <th
                    className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap cursor-pointer hover:text-ink select-none"
                    onClick={() => handleSort("attendanceRate")}
                  >
                    출석률 <SortIcon k="attendanceRate" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {sortedStudents.map((s, i) => (
                  <tr key={s.examNumber} className="transition hover:bg-mist/20">
                    <td className="px-4 py-3 text-xs text-slate tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                      <Link href={`/admin/students/${s.examNumber}`} className="hover:text-forest hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate text-xs">{s.examNumber}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.enrollmentStatus} />
                    </td>
                    <td className={`px-4 py-3 tabular-nums text-sm ${scoreColor(s.avgScore)}`}>
                      {s.avgScore !== null ? `${s.avgScore.toFixed(1)}점` : "-"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate text-xs">{s.attendedCount}회</td>
                    <td className={`px-4 py-3 tabular-nums text-sm ${s.sessionCount === 0 ? "text-slate" : s.attendanceRate >= 80 ? "text-[#1F4D3A]" : s.attendanceRate >= 60 ? "text-ink" : "text-[#C55A11]"}`}>
                      {s.sessionCount === 0 ? "-" : `${s.attendanceRate.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-forest/10 text-forest border-forest/20",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    SUSPENDED: "bg-slate/10 text-slate border-slate/20",
    COMPLETED: "bg-ink/10 text-ink border-ink/20",
    WITHDRAWN: "bg-red-50 text-red-600 border-red-200",
    CANCELLED: "bg-ink/5 text-slate border-ink/10",
    WAITING: "bg-amber-50 text-amber-700 border-amber-200",
  };
  const labelMap: Record<string, string> = {
    ACTIVE: "재원",
    PENDING: "대기중",
    SUSPENDED: "휴원",
    COMPLETED: "수료",
    WITHDRAWN: "퇴원",
    CANCELLED: "취소",
    WAITING: "대기",
  };
  const cls = map[status] ?? "bg-slate/10 text-slate border-slate/20";
  const label = labelMap[status] ?? status;
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function AnalyticsLoader({ cohortId }: { cohortId: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // Trigger a navigation to ?tab=analytics so the server fetches the data
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("tab", "analytics");
    router.replace(`${pathname}?${params.toString()}`);
  }, [router, pathname]);

  return null;
}
