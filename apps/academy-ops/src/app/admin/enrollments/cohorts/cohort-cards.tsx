"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExamCategory } from "@prisma/client";

export interface CohortCardData {
  id: string;
  name: string;
  examCategory: ExamCategory;
  startDate: Date;
  endDate: Date;
  maxCapacity: number | null;
  isActive: boolean;
  activeCount: number;
  waitingCount: number;
}

interface CohortCardsProps {
  cohorts: CohortCardData[];
  examCategoryFilter: string;
  showInactive: boolean;
  totalActive: number;
  totalStudents: number;
  totalWaiting: number;
  hasInactiveCohorts: boolean;
}

function getDaysRemaining(endDate: Date): number {
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function DaysRemainingBadge({ endDate }: { endDate: Date }) {
  const days = getDaysRemaining(endDate);

  if (days < 0) {
    return <span className="text-xs font-semibold text-red-600">종료됨</span>;
  }
  if (days < 7) {
    return (
      <span className="text-xs font-semibold text-ember">
        D-{days}
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="text-xs font-semibold text-amber-600">
        D-{days}
      </span>
    );
  }
  return (
    <span className="text-xs text-slate">
      D-{days}
    </span>
  );
}

function ProgressBar({
  enrolled,
  capacity,
}: {
  enrolled: number;
  capacity: number | null;
}) {
  if (capacity === null || capacity === 0) {
    return (
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
        <div className="h-full w-full bg-forest/40" />
      </div>
    );
  }

  const pct = Math.min(Math.round((enrolled / capacity) * 100), 100);
  let barColor = "bg-forest";
  if (pct >= 100) barColor = "bg-red-600";
  else if (pct >= 90) barColor = "bg-ember";
  else if (pct >= 70) barColor = "bg-amber-500";

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
      <div
        className={`h-full transition-all duration-300 ${barColor}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ExamCategoryBadge({ category }: { category: ExamCategory }) {
  if (category === "GONGCHAE") {
    return (
      <span className="inline-flex items-center rounded-full border border-forest/30 bg-forest/10 px-2 py-0.5 text-[11px] font-semibold text-forest">
        공채
      </span>
    );
  }
  if (category === "GYEONGCHAE") {
    return (
      <span className="inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
        경채
      </span>
    );
  }
  if (category === "SOGANG") {
    return (
      <span className="inline-flex items-center rounded-full border border-purple-300 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
        소강
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-ink/20 bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink">
      기타
    </span>
  );
}

function CohortCard({ cohort }: { cohort: CohortCardData }) {
  const enrolled = cohort.activeCount;
  const capacity = cohort.maxCapacity;
  const pct =
    capacity && capacity > 0 ? Math.round((enrolled / capacity) * 100) : null;

  const startDateStr = new Date(cohort.startDate).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const endDateStr = new Date(cohort.endDate).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <div className="rounded-[24px] border border-ink/10 bg-white p-5 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ExamCategoryBadge category={cohort.examCategory} />
          {!cohort.isActive && (
            <span className="inline-flex items-center rounded-full border border-ink/20 bg-ink/5 px-2 py-0.5 text-[11px] font-medium text-slate">
              비활성
            </span>
          )}
          <span className="text-sm font-semibold text-ink">{cohort.name}</span>
        </div>
        <DaysRemainingBadge endDate={cohort.endDate} />
      </div>

      {/* Capacity */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate">수강 인원</span>
          <span className="font-semibold text-ink">
            {enrolled}
            {capacity !== null ? (
              <> / <span className="text-slate">{capacity}명</span></>
            ) : (
              <span className="text-slate"> 명 (무제한)</span>
            )}
            {pct !== null && (
              <span className="ml-2 text-xs text-slate">{pct}%</span>
            )}
          </span>
        </div>
        <ProgressBar enrolled={enrolled} capacity={capacity} />
        {cohort.waitingCount > 0 && (
          <p className="text-xs text-amber-600">
            대기: {cohort.waitingCount}명
          </p>
        )}
      </div>

      {/* Date range */}
      <p className="text-xs text-slate">
        {startDateStr} ~ {endDateStr}
      </p>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Link
          href={`/admin/enrollments?cohortId=${cohort.id}`}
          className="flex-1 rounded-xl border border-ink/15 py-2 text-center text-xs font-medium text-ink hover:bg-ink/5 transition-colors"
        >
          수강 목록 →
        </Link>
        <Link
          href={`/admin/enrollments/new?cohortId=${cohort.id}`}
          className="flex-1 rounded-xl bg-ember py-2 text-center text-xs font-semibold text-white hover:bg-ember/90 transition-colors"
        >
          + 수강 등록
        </Link>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="rounded-[24px] border border-ink/10 bg-white p-5 flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wider text-slate">{label}</p>
      <p className="text-3xl font-bold text-ink">{value}</p>
      {sub && <p className="text-xs text-slate">{sub}</p>}
    </div>
  );
}

export function CohortCards({
  cohorts,
  examCategoryFilter,
  showInactive,
  totalActive,
  totalStudents,
  totalWaiting,
  hasInactiveCohorts,
}: CohortCardsProps) {
  const searchParams = useSearchParams();

  function buildHref(params: Record<string, string | undefined>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === "") {
        sp.delete(k);
      } else {
        sp.set(k, v);
      }
    }
    return `?${sp.toString()}`;
  }

  const filterOptions: { label: string; value: string }[] = [
    { label: "전체", value: "" },
    { label: "공채", value: "GONGCHAE" },
    { label: "경채", value: "GYEONGCHAE" },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="활성 기수" value={totalActive} sub="개 기수 운영 중" />
        <KpiCard label="총 수강생" value={totalStudents} sub="ACTIVE 기준" />
        <KpiCard label="총 대기자" value={totalWaiting} sub="WAITING 기준" />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-2xl border border-ink/10 bg-white p-1.5 w-fit">
        {filterOptions.map((opt) => {
          const isActive = examCategoryFilter === opt.value;
          return (
            <Link
              key={opt.value}
              href={buildHref({ examType: opt.value || undefined, showInactive: showInactive ? "1" : undefined })}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-ink text-white"
                  : "text-slate hover:bg-ink/5"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      {/* Cards grid */}
      {cohorts.length === 0 ? (
        <div className="rounded-[24px] border border-ink/10 bg-white p-12 text-center">
          <p className="text-base font-medium text-ink">활성화된 기수가 없습니다.</p>
          <p className="mt-2 text-sm text-slate">먼저 기수를 등록해 주세요.</p>
          <Link
            href="/admin/settings/cohorts"
            className="mt-4 inline-flex items-center gap-1 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white hover:bg-ember/90"
          >
            기수 관리 →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cohorts.map((cohort) => (
            <CohortCard key={cohort.id} cohort={cohort} />
          ))}
        </div>
      )}

      {/* Show inactive toggle */}
      {hasInactiveCohorts && (
        <div className="flex justify-center">
          <Link
            href={buildHref({
              examType: examCategoryFilter || undefined,
              showInactive: showInactive ? undefined : "1",
            })}
            className="rounded-xl border border-ink/15 px-5 py-2.5 text-sm font-medium text-slate hover:bg-ink/5 transition-colors"
          >
            {showInactive ? "비활성 기수 숨기기" : "비활성 기수 포함하여 보기"}
          </Link>
        </div>
      )}
    </div>
  );
}
