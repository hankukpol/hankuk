import Link from "next/link";
import {
  ACADEMY_TYPE_LABEL,
  getSuperDashboardStats,
  type SuperDashboardPreset,
} from "@/lib/super-admin";
import { SwitchAcademyAction } from "../switch-academy-action";

type DashboardPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

type PresetOption = {
  value: SuperDashboardPreset;
  label: string;
};

const PRESET_OPTIONS: PresetOption[] = [
  { value: "today", label: "오늘" },
  { value: "thisWeek", label: "이번 주" },
  { value: "thisMonth", label: "이번 달" },
];

function readParam(
  searchParams: DashboardPageProps["searchParams"],
  key: string,
) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildExportHref(stats: Awaited<ReturnType<typeof getSuperDashboardStats>>) {
  const params = new URLSearchParams();

  if (stats.filter.preset === "custom") {
    params.set("preset", "custom");
    params.set("from", stats.filter.fromDateValue);
    params.set("to", stats.filter.toDateValue);
  } else {
    params.set("preset", stats.filter.preset);
  }

  return `/api/super/stats/export?${params.toString()}`;
}

function formatWon(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function renderAttendanceRate(rate: number | null) {
  if (rate === null) {
    return "기록 없음";
  }

  return `${rate.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export default async function SuperDashboardPage({ searchParams }: DashboardPageProps) {
  const stats = await getSuperDashboardStats({
    preset: readParam(searchParams, "preset") ?? null,
    from: readParam(searchParams, "from") ?? null,
    to: readParam(searchParams, "to") ?? null,
    month: readParam(searchParams, "month") ?? null,
  });

  const exportHref = buildExportHref(stats);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">전 지점 통합 KPI</h2>
            <p className="mt-2 text-sm leading-7 text-slate">
              {stats.filter.helperText}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              조회 범위: {stats.filter.rangeLabel}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={exportHref}
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:border-ember hover:text-ember"
            >
              CSV 내보내기
            </Link>
          </div>
        </div>

        <form className="mt-6 space-y-4" action="/admin/super/dashboard">
          <div className="flex flex-wrap gap-2">
            {PRESET_OPTIONS.map((option) => {
              const active = stats.filter.preset === option.value && option.value !== "custom";
              return (
                <button
                  key={option.value}
                  type="submit"
                  name="preset"
                  value={option.value}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? "border border-ember bg-ember/10 text-ember"
                      : "border border-ink/10 text-ink hover:border-ember hover:text-ember"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}

            <Link
              href="/admin/super/dashboard?preset=thisMonth"
              className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
            >
              초기화
            </Link>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                시작일
              </label>
              <input
                type="date"
                name="from"
                defaultValue={stats.filter.fromDateValue}
                className="rounded-2xl border border-ink/15 px-4 py-2 text-sm outline-none focus:border-ember"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                종료일
              </label>
              <input
                type="date"
                name="to"
                defaultValue={stats.filter.toDateValue}
                className="rounded-2xl border border-ink/15 px-4 py-2 text-sm outline-none focus:border-ember"
              />
            </div>
            <button
              type="submit"
              name="preset"
              value="custom"
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                stats.filter.preset === "custom"
                  ? "border border-ember bg-ember/10 text-ember"
                  : "border border-ink/10 text-ink hover:border-ember hover:text-ember"
              }`}
            >
              직접 설정 적용
            </button>
          </div>
        </form>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <SummaryCard
            label="운영 지점"
            value={`${stats.totals.activeAcademyCount.toLocaleString("ko-KR")} / ${stats.totals.academyCount.toLocaleString("ko-KR")}`}
            description="활성 지점 / 전체 지점"
          />
          <SummaryCard label="활성 학생" value={stats.totals.activeStudentCount.toLocaleString("ko-KR")} description="현재 운영 중인 학생 합계" />
          <SummaryCard label="기간 신규" value={stats.totals.newStudentCount.toLocaleString("ko-KR")} description="선택 기간 신규 등록 학생" />
          <SummaryCard label="기간 수납" value={formatWon(stats.totals.monthlyRevenue)} description="승인 기준 순수 수납 합계" />
          <SummaryCard label="미납 학생" value={stats.totals.unpaidStudentCount.toLocaleString("ko-KR")} description="납기 경과 분할 납부 기준" />
          <SummaryCard label="평균 출석률" value={renderAttendanceRate(stats.totals.attendanceRate)} description="지점별 출석률 평균" />
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div>
          <h2 className="text-xl font-semibold text-ink">지점별 상세 비교</h2>
          <p className="mt-2 text-sm leading-7 text-slate">
            특정 지점으로 바로 전환해 해당 지점 설정이나 운영 화면으로 이동할 수 있습니다.
          </p>
        </div>

        <div className="mt-6 overflow-hidden rounded-[24px] border border-ink/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-mist text-slate">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">지점</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">유형</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em]">전체 학생</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em]">활성 학생</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em]">기간 신규</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em]">기간 수납</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em]">미납 학생</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em]">출석률</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em]">상태</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em]">바로가기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {stats.academies.map((academy) => (
                  <tr key={academy.academyId}>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-ink">{academy.academyName}</p>
                      <p className="mt-1 text-xs text-slate">{academy.academyCode}</p>
                    </td>
                    <td className="px-4 py-4 text-slate">{ACADEMY_TYPE_LABEL[academy.academyType]}</td>
                    <td className="px-4 py-4 text-right text-ink">{academy.studentCount.toLocaleString("ko-KR")}</td>
                    <td className="px-4 py-4 text-right text-ink">{academy.activeStudentCount.toLocaleString("ko-KR")}</td>
                    <td className="px-4 py-4 text-right text-ink">{academy.newStudentCount.toLocaleString("ko-KR")}</td>
                    <td className="px-4 py-4 text-right text-ink">{formatWon(academy.monthlyRevenue)}</td>
                    <td className="px-4 py-4 text-right text-ink">{academy.unpaidStudentCount.toLocaleString("ko-KR")}</td>
                    <td className="px-4 py-4 text-right text-ink">{renderAttendanceRate(academy.attendanceRate)}</td>
                    <td className="px-4 py-4 text-center">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          academy.isActive
                            ? "border-forest/20 bg-forest/10 text-forest"
                            : "border-ink/10 bg-ink/5 text-slate"
                        }`}
                      >
                        {academy.isActive ? "운영 중" : "비활성"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <SwitchAcademyAction academyId={academy.academyId} href="/admin" label="운영 화면" />
                        <SwitchAcademyAction academyId={academy.academyId} href="/admin/settings/academy" label="지점 설정" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <section className="rounded-[24px] border border-ink/10 bg-mist/60 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-sm text-slate">{description}</p>
    </section>
  );
}

