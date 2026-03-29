import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { ForecastClient } from "./forecast-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(
  searchParams: PageProps["searchParams"],
  key: string,
): string | undefined {
  const v = searchParams?.[key];
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

export default async function ScoreForecastPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const examTypeParam = readParam(searchParams, "examType") ?? "ALL";
  const weeksParam = readParam(searchParams, "weeks") ?? "12";
  const modeParam = readParam(searchParams, "mode") ?? "declining";

  const examTypeOptions = [
    { value: "ALL", label: "전체 직렬" },
    { value: "GONGCHAE", label: "공채" },
    { value: "GYEONGCHAE", label: "경채" },
  ];

  const weeksOptions = [
    { value: "8", label: "최근 8주" },
    { value: "12", label: "최근 12주" },
    { value: "24", label: "최근 24주" },
  ];

  const modeOptions = [
    { value: "declining", label: "하락 중인 학생" },
    { value: "improving", label: "향상 중인 학생" },
    { value: "all", label: "전체" },
  ];

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        Score Forecast
      </div>
      <h1 className="mt-5 text-3xl font-semibold">성적 예측 분석</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        선형 회귀를 통해 학생의 성적 추이를 분석하고 향후 4회차 점수를 예측합니다.
      </p>

      {/* Filter Form */}
      <form
        method="get"
        className="mt-8 flex flex-wrap gap-4 rounded-[28px] border border-ink/10 bg-mist p-6"
      >
        <div className="min-w-[160px] flex-1">
          <label className="mb-2 block text-sm font-medium">시험 직렬</label>
          <select
            name="examType"
            defaultValue={examTypeParam}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {examTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-2 block text-sm font-medium">조회 기간</label>
          <select
            name="weeks"
            defaultValue={weeksParam}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {weeksOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-2 block text-sm font-medium">표시 모드</label>
          <select
            name="mode"
            defaultValue={modeParam}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {modeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
          {(examTypeParam !== "ALL" || weeksParam !== "12" || modeParam !== "declining") && (
            <Link
              href="/admin/analytics/score-forecast"
              className="inline-flex items-center rounded-full border border-ink/20 px-5 py-3 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
            >
              초기화
            </Link>
          )}
        </div>
      </form>

      {/* Client component loads data via API */}
      <div className="mt-8">
        <ForecastClient
          examType={examTypeParam}
          weeks={weeksParam}
          mode={modeParam}
        />
      </div>

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/analytics"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          ← 분석 허브
        </Link>
        <Link
          href="/admin/analytics/subject-weakness"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          취약 과목 분석 →
        </Link>
        <Link
          href="/admin/analytics/engagement"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          참여도 대시보드 →
        </Link>
      </div>
    </div>
  );
}
