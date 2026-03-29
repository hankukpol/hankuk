import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
// Mon-Sat display order: 1,2,3,4,5,6
const WEEKDAY_DISPLAY: { dayOfWeek: number; label: string }[] = [
  { dayOfWeek: 1, label: "월" },
  { dayOfWeek: 2, label: "화" },
  { dayOfWeek: 3, label: "수" },
  { dayOfWeek: 4, label: "목" },
  { dayOfWeek: 5, label: "금" },
  { dayOfWeek: 6, label: "토" },
];

export default async function CohortSchedulePage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;

  const cohort = await getPrisma().cohort.findUnique({
    where: { id },
    include: {
      lectureSchedules: {
        where: { isActive: true },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      },
    },
  });

  if (!cohort) notFound();

  const examCategoryLabel =
    EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ??
    cohort.examCategory;

  // Group schedules by dayOfWeek
  const schedulesByDay = new Map<number, typeof cohort.lectureSchedules>();
  for (const schedule of cohort.lectureSchedules) {
    const existing = schedulesByDay.get(schedule.dayOfWeek) ?? [];
    existing.push(schedule);
    schedulesByDay.set(schedule.dayOfWeek, existing);
  }

  const hasSchedules = cohort.lectureSchedules.length > 0;

  // Collect all unique subjects for display
  const uniqueSubjects = Array.from(
    new Set(cohort.lectureSchedules.map((s) => s.subjectName)),
  );

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate">
        <Link
          href="/admin/settings/cohorts"
          className="transition hover:text-ink"
        >
          기수 목록
        </Link>
        <span className="text-slate/40">/</span>
        <Link
          href={`/admin/settings/cohorts/${id}`}
          className="transition hover:text-ink"
        >
          {cohort.name}
        </Link>
        <span className="text-slate/40">/</span>
        <span className="text-ink">수업 일정</span>
      </div>

      {/* Header */}
      <div className="mt-4 inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        기수 · 수업 일정
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">{cohort.name}</h1>
          <p className="mt-1 text-sm text-slate">
            {examCategoryLabel} &middot; {formatDate(cohort.startDate)} ~{" "}
            {formatDate(cohort.endDate)}
          </p>
        </div>
        <Link
          href={`/admin/settings/cohorts/${id}`}
          className="inline-flex items-center gap-1.5 rounded-[20px] border border-ink/20 px-4 py-2 text-sm text-slate transition hover:border-ink/40"
        >
          &larr; 기수 상세로
        </Link>
      </div>

      {/* Cohort info card */}
      <div className="mt-6 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate">수험유형</p>
          <p className="mt-1 text-sm font-semibold text-ink">{examCategoryLabel}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate">기간</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {formatDate(cohort.startDate)} ~ {formatDate(cohort.endDate)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate">개설 과목 수</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {uniqueSubjects.length > 0
              ? `${uniqueSubjects.length}개 과목`
              : "-"}
          </p>
        </div>
      </div>

      {hasSchedules ? (
        <>
          {/* Weekly grid */}
          <div className="mt-8">
            <h2 className="text-base font-semibold text-ink">주간 수업 일정</h2>
            <p className="mt-1 text-xs text-slate">
              반복 강의 기준 (실제 날짜별 세션은 아래 목록 참조)
            </p>

            {/* Grid: Mon–Sat columns */}
            <div className="mt-4 overflow-x-auto">
              <div className="grid min-w-[640px] grid-cols-6 gap-2">
                {WEEKDAY_DISPLAY.map(({ dayOfWeek, label }) => {
                  const daySchedules = schedulesByDay.get(dayOfWeek) ?? [];
                  return (
                    <div key={dayOfWeek} className="rounded-[20px] border border-ink/10 bg-white">
                      <div
                        className={`rounded-t-[20px] px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide ${
                          dayOfWeek === 6
                            ? "bg-sky-50 text-sky-700"
                            : "bg-mist text-slate"
                        }`}
                      >
                        {label}
                      </div>
                      <div className="space-y-1.5 p-2">
                        {daySchedules.length === 0 ? (
                          <p className="py-4 text-center text-xs text-slate/40">-</p>
                        ) : (
                          daySchedules.map((schedule) => (
                            <div
                              key={schedule.id}
                              className="rounded-[12px] border border-forest/20 bg-forest/5 px-2 py-1.5"
                            >
                              <p className="text-xs font-semibold text-forest">
                                {schedule.subjectName}
                              </p>
                              <p className="mt-0.5 text-xs tabular-nums text-slate">
                                {schedule.startTime} ~ {schedule.endTime}
                              </p>
                              {schedule.instructorName && (
                                <p className="mt-0.5 text-xs text-slate/70">
                                  {schedule.instructorName}
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Schedule list table */}
          <div className="mt-8">
            <h2 className="text-base font-semibold text-ink">강의 스케줄 목록</h2>
            <div className="mt-3 overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
              <table className="min-w-full divide-y divide-ink/5 text-sm">
                <thead>
                  <tr>
                    {["#", "과목명", "강사", "요일", "시간", "상태"].map((h) => (
                      <th
                        key={h}
                        className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {cohort.lectureSchedules.map((schedule, idx) => (
                    <tr key={schedule.id} className="transition hover:bg-mist/20">
                      <td className="px-4 py-3 text-xs text-slate tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                        {schedule.subjectName}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate whitespace-nowrap">
                        {schedule.instructorName ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate whitespace-nowrap">
                        {DAY_LABELS[schedule.dayOfWeek] ?? schedule.dayOfWeek}요일
                      </td>
                      <td className="px-4 py-3 tabular-nums text-sm text-slate whitespace-nowrap">
                        {schedule.startTime} ~ {schedule.endTime}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            schedule.isActive
                              ? "border-forest/30 bg-forest/10 text-forest"
                              : "border-ink/20 bg-ink/5 text-slate"
                          }`}
                        >
                          {schedule.isActive ? "활성" : "비활성"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Empty state */
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-mist">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-ink">
            등록된 수업 일정이 없습니다
          </p>
          <p className="mt-1 text-xs text-slate">
            수업 일정은 강좌 관리에서 확인할 수 있습니다
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/admin/settings/cohorts"
              className="rounded-full border border-ink/20 px-4 py-2 text-sm text-slate transition hover:border-ink/40 hover:text-ink"
            >
              기수 목록
            </Link>
            <Link
              href={`/admin/settings/cohorts/${id}`}
              className="rounded-full border border-forest bg-forest px-4 py-2 text-sm font-medium text-white transition hover:bg-forest/90"
            >
              기수 상세로 돌아가기
            </Link>
          </div>
        </div>
      )}

      {/* Weekly grid legend (always show if data exists) */}
      {hasSchedules && (
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-forest/20 bg-forest/5" />
            강의
          </span>
          <span className="text-slate/40">|</span>
          <span>* 일정 변경은 출결 관리 &gt; 강의 세션에서 처리합니다</span>
        </div>
      )}
    </div>
  );
}
