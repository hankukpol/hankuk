"use client";

import Link from "next/link";
import { useState } from "react";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

type CohortItem = {
  id: string;
  name: string;
  examCategory: string;
  startDate: string;
  endDate: string;
  maxCapacity: number | null;
  isActive: boolean;
  targetExamYear: number | null;
  activeCount: number;
  waitlistCount: number;
  newThisMonth: number;
  availableSeats: number | null;
  capacityPercent: number | null;
};

type Props = {
  cohorts: CohortItem[];
};

type FilterStatus = "ALL" | "ACTIVE" | "INACTIVE";

export function CohortOverviewClient({ cohorts }: Props) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL");
  const [search, setSearch] = useState<string>("");

  const filtered = cohorts.filter((c) => {
    const matchStatus =
      filterStatus === "ALL" ||
      (filterStatus === "ACTIVE" && c.isActive) ||
      (filterStatus === "INACTIVE" && !c.isActive);
    const matchSearch =
      !search || c.name.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const filterButtons: { value: FilterStatus; label: string }[] = [
    { value: "ALL", label: "전체" },
    { value: "ACTIVE", label: "활성" },
    { value: "INACTIVE", label: "비활성" },
  ];

  return (
    <div className="mt-8">
      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-ink/10 bg-white p-1">
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              type="button"
              onClick={() => setFilterStatus(btn.value)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                filterStatus === btn.value
                  ? "bg-forest text-white"
                  : "text-slate hover:text-ink"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="기수명 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 rounded-full border border-ink/10 bg-white px-4 text-sm text-ink placeholder:text-slate/60 focus:border-forest/40 focus:outline-none"
        />
        <span className="ml-auto text-xs text-slate">
          {filtered.length}개 기수
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-16 text-center text-sm text-slate">
          {search ? `"${search}"에 해당하는 기수가 없습니다.` : "기수가 없습니다."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((cohort) => (
            <CohortCard key={cohort.id} cohort={cohort} />
          ))}
        </div>
      )}
    </div>
  );
}

function CohortCard({ cohort }: { cohort: CohortItem }) {
  const isFull = cohort.maxCapacity != null && cohort.availableSeats === 0;
  const isNearFull =
    cohort.capacityPercent !== null && cohort.capacityPercent >= 80 && !isFull;

  function formatDateShort(iso: string) {
    return iso.slice(0, 10).replace(/-/g, ".");
  }

  const endDate = new Date(cohort.endDate);
  const now = new Date();
  const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isEndingSoon = cohort.isActive && diffDays <= 14;

  return (
    <div
      className={`relative flex flex-col rounded-[28px] border bg-white p-6 transition hover:shadow-md ${
        cohort.isActive ? "border-ink/10" : "border-ink/5 opacity-60"
      }`}
    >
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
            cohort.isActive ? "bg-forest/10 text-forest" : "bg-slate/10 text-slate"
          }`}
        >
          {cohort.isActive ? "활성" : "비활성"}
        </span>
        <span className="inline-flex rounded-full bg-mist px-2 py-0.5 text-xs font-medium text-slate">
          {EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ?? cohort.examCategory}
        </span>
        {cohort.targetExamYear && (
          <span className="ml-auto text-xs text-slate">{cohort.targetExamYear}년 시험</span>
        )}
      </div>

      {/* Name */}
      <Link
        href={`/admin/cohorts/${cohort.id}`}
        className="mt-3 block text-base font-semibold text-ink leading-tight transition hover:text-ember hover:underline"
      >
        {cohort.name}
      </Link>

      {/* Period */}
      <p className="mt-1 text-xs text-slate">
        {formatDateShort(cohort.startDate)} ~ {formatDateShort(cohort.endDate)}
      </p>

      {/* Stats grid */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-mist/60 p-2.5 text-center">
          <p className="text-lg font-semibold text-ink tabular-nums">{cohort.activeCount}</p>
          <p className="text-[10px] text-slate">재원</p>
        </div>
        <div className={`rounded-xl p-2.5 text-center ${cohort.waitlistCount > 0 ? "bg-amber-50" : "bg-mist/60"}`}>
          <p className={`text-lg font-semibold tabular-nums ${cohort.waitlistCount > 0 ? "text-amber-600" : "text-ink"}`}>
            {cohort.waitlistCount}
          </p>
          <p className="text-[10px] text-slate">대기</p>
        </div>
        <div className="rounded-xl bg-mist/60 p-2.5 text-center">
          <p className="text-lg font-semibold text-ember tabular-nums">{cohort.newThisMonth}</p>
          <p className="text-[10px] text-slate">이달 신규</p>
        </div>
      </div>

      {/* Capacity bar */}
      {cohort.maxCapacity != null && cohort.capacityPercent !== null ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate">정원 현황</span>
            <span className={isFull ? "font-semibold text-red-600" : isNearFull ? "font-semibold text-amber-600" : "text-slate"}>
              {cohort.activeCount} / {cohort.maxCapacity}명
              {isFull ? " (마감)" : cohort.availableSeats != null ? ` · 여석 ${cohort.availableSeats}` : ""}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
            <div
              className={`h-1.5 rounded-full transition-all ${
                isFull
                  ? "bg-red-500"
                  : isNearFull
                    ? "bg-amber-500"
                    : "bg-forest"
              }`}
              style={{ width: `${cohort.capacityPercent}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate">정원 제한 없음</p>
      )}

      {/* Ending soon badge */}
      {isEndingSoon && (
        <div className="mt-4 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-700">
            {diffDays <= 0 ? "종료일 경과" : `D-${diffDays} 종료 임박`} — 수료 처리 필요
          </span>
          <Link
            href={`/admin/settings/cohorts/${cohort.id}/graduation`}
            className="ml-2 rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-white transition hover:bg-amber-600"
          >
            처리 &rarr;
          </Link>
        </div>
      )}

      {/* Action */}
      <div className="mt-5 flex items-center justify-between">
        <div className="flex gap-2">
          {cohort.waitlistCount > 0 && (
            <Link
              href={`/admin/cohorts/waitlist?cohortId=${cohort.id}`}
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
            >
              대기자 {cohort.waitlistCount}명
            </Link>
          )}
        </div>
        <Link
          href={`/admin/cohorts/${cohort.id}`}
          className="rounded-full border border-ink/10 px-3.5 py-1.5 text-xs font-medium text-ink transition hover:border-ink/30 hover:bg-mist"
        >
          상세 &rarr;
        </Link>
      </div>
    </div>
  );
}
