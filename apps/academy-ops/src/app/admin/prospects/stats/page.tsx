import Link from "next/link";
import { AdminRole, ProspectStage, ProspectSource } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STAGE_LABELS: Record<ProspectStage, string> = {
  INQUIRY: "문의",
  VISITING: "내방상담",
  DECIDING: "검토중",
  REGISTERED: "등록완료",
  DROPPED: "이탈",
};

const SOURCE_LABELS: Record<ProspectSource, string> = {
  WALK_IN: "내방",
  PHONE: "전화",
  SNS: "SNS",
  REFERRAL: "추천",
  OTHER: "기타",
};

const STAGE_FLOW: ProspectStage[] = [
  ProspectStage.INQUIRY,
  ProspectStage.VISITING,
  ProspectStage.DECIDING,
  ProspectStage.REGISTERED,
];

const STAGE_BAR_COLORS: Record<ProspectStage, string> = {
  INQUIRY: "bg-sky-400",
  VISITING: "bg-amber-400",
  DECIDING: "bg-orange-400",
  REGISTERED: "bg-forest",
  DROPPED: "bg-slate-300",
};

const STAGE_TEXT_COLORS: Record<ProspectStage, string> = {
  INQUIRY: "text-sky-700",
  VISITING: "text-amber-700",
  DECIDING: "text-orange-700",
  REGISTERED: "text-forest",
  DROPPED: "text-slate-500",
};

function buildMonthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let delta = -11; delta <= 0; delta++) {
    const d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    opts.push({ value, label });
  }
  return opts.reverse();
}

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function ProspectsStatsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const sp = await searchParams;
  const period = sp.period ?? "all";

  const prisma = getPrisma();
  const now = new Date();

  // Compute date range for filter
  let dateFilter: { gte: Date; lt: Date } | undefined;
  if (period !== "all") {
    const [yearStr, monthStr] = period.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    dateFilter = {
      gte: new Date(year, month, 1),
      lt: new Date(year, month + 1, 1),
    };
  }

  const where = dateFilter ? { visitedAt: dateFilter } : {};

  // Load all prospects for the period
  const prospects = await prisma.consultationProspect.findMany({
    where,
    select: {
      stage: true,
      source: true,
      staffId: true,
      staff: { select: { name: true } },
    },
  });

  const total = prospects.length;

  // Stage counts
  const stageCounts = (Object.keys(STAGE_LABELS) as ProspectStage[]).reduce(
    (acc, s) => {
      acc[s] = prospects.filter((p) => p.stage === s).length;
      return acc;
    },
    {} as Record<ProspectStage, number>,
  );

  const registered = stageCounts[ProspectStage.REGISTERED];
  const dropped = stageCounts[ProspectStage.DROPPED];
  const pending =
    stageCounts[ProspectStage.INQUIRY] +
    stageCounts[ProspectStage.VISITING] +
    stageCounts[ProspectStage.DECIDING];
  const conversionRate = total > 0 ? Math.round((registered / total) * 100) : 0;
  const dropRate = total > 0 ? Math.round((dropped / total) * 100) : 0;

  // Source breakdown
  const sourceCounts = (Object.keys(SOURCE_LABELS) as ProspectSource[]).reduce(
    (acc, s) => {
      acc[s] = prospects.filter((p) => p.source === s).length;
      return acc;
    },
    {} as Record<ProspectSource, number>,
  );

  // Counselor breakdown: { staffId -> { name, counts by stage } }
  type CounselorStat = {
    name: string;
    total: number;
    registered: number;
    dropped: number;
    pending: number;
    conversionRate: number;
  };
  const counselorMap = new Map<string, { name: string; stageCounts: Record<string, number> }>();
  for (const p of prospects) {
    const existing = counselorMap.get(p.staffId);
    if (existing) {
      existing.stageCounts[p.stage] = (existing.stageCounts[p.stage] ?? 0) + 1;
    } else {
      counselorMap.set(p.staffId, {
        name: p.staff?.name ?? "알 수 없음",
        stageCounts: { [p.stage]: 1 },
      });
    }
  }
  const counselorStats: CounselorStat[] = Array.from(counselorMap.values())
    .map((c) => {
      const t = Object.values(c.stageCounts).reduce((s, v) => s + v, 0);
      const reg = c.stageCounts[ProspectStage.REGISTERED] ?? 0;
      const drop = c.stageCounts[ProspectStage.DROPPED] ?? 0;
      return {
        name: c.name,
        total: t,
        registered: reg,
        dropped: drop,
        pending: t - reg - drop,
        conversionRate: t > 0 ? Math.round((reg / t) * 100) : 0,
      };
    })
    .sort((a, b) => b.conversionRate - a.conversionRate);

  // Max count for bar scaling
  const maxStageCount = Math.max(...STAGE_FLOW.map((s) => stageCounts[s]), 1);

  const monthOptions = buildMonthOptions();

  // Current month label
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate">
        <Link href="/admin/prospects" className="transition hover:text-ember">
          상담 방문자
        </Link>
        <span>/</span>
        <span className="text-ink">전환 통계</span>
      </nav>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            수강 관리
          </div>
          <h1 className="mt-4 text-3xl font-semibold">상담 전환 통계</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            상담 방문자 파이프라인의 단계별 전환율과 상담사별 성과를 확인합니다.
          </p>
        </div>
        <Link
          href="/admin/prospects"
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          ← 목록으로
        </Link>
      </div>

      {/* Period filter */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-ink">기간</span>
        <a
          href="?period=all"
          className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium transition ${
            period === "all"
              ? "border-ink/40 bg-ink text-white"
              : "border-ink/10 bg-white text-slate hover:border-ink/20"
          }`}
        >
          전체
        </a>
        <a
          href={`?period=${currentMonth}`}
          className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium transition ${
            period === currentMonth
              ? "border-ink/40 bg-ink text-white"
              : "border-ink/10 bg-white text-slate hover:border-ink/20"
          }`}
        >
          이번 달
        </a>
        <select
          defaultValue={period !== "all" && period !== currentMonth ? period : ""}
          onChange={(e) => {
            if (e.target.value) window.location.href = `?period=${e.target.value}`;
          }}
          className="rounded-2xl border border-ink/20 px-3 py-2 text-sm outline-none focus:border-forest"
        >
          <option value="">월별 선택...</option>
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* KPI summary cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold text-slate">총 상담</p>
          <p className="mt-3 text-3xl font-bold">
            {total}
            <span className="ml-1 text-sm font-normal text-slate">건</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">
            {period === "all" ? "전체 기간" : period + " 방문 기준"}
          </p>
        </div>

        <div className="rounded-[28px] border border-forest/20 bg-forest/10 p-5 shadow-panel">
          <p className="text-xs font-semibold text-forest">전환율</p>
          <p className="mt-3 text-3xl font-bold text-forest">
            {conversionRate}
            <span className="ml-1 text-sm font-normal text-slate">%</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">등록 / 총 상담</p>
        </div>

        <div className="rounded-[28px] border border-ember/20 bg-ember/10 p-5 shadow-panel">
          <p className="text-xs font-semibold text-ember">등록 전환</p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {registered}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">등록완료 단계</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-mist p-5 shadow-panel">
          <p className="text-xs font-semibold text-slate">대기 상담</p>
          <p className="mt-3 text-3xl font-bold">
            {pending}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">문의·내방·검토 중</p>
        </div>
      </div>

      {/* Conversion Funnel (CSS bars) */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">전환 파이프라인</h2>
            <p className="mt-0.5 text-xs text-slate">단계별 인원 수 및 전환율</p>
          </div>
          {total > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs">
              <span className="text-slate">이탈률</span>
              <span className="font-bold text-red-700">{dropRate}%</span>
              <span className="text-slate">({dropped}명)</span>
            </div>
          )}
        </div>

        {total === 0 ? (
          <p className="mt-6 text-center text-sm text-slate">해당 기간에 상담 방문자가 없습니다.</p>
        ) : (
          <div className="mt-6 space-y-3">
            {STAGE_FLOW.map((stage, idx) => {
              const count = stageCounts[stage];
              const barPct = Math.round((count / maxStageCount) * 100);
              const prevStage = idx > 0 ? STAGE_FLOW[idx - 1] : null;
              const prevCount = prevStage ? stageCounts[prevStage] : total;
              const stepRate =
                prevCount > 0 ? Math.round((count / prevCount) * 100) : null;

              return (
                <div key={stage} className="flex items-center gap-4">
                  {/* Label */}
                  <div className="w-20 shrink-0 text-right">
                    <span className={`text-xs font-semibold ${STAGE_TEXT_COLORS[stage]}`}>
                      {STAGE_LABELS[stage]}
                    </span>
                  </div>

                  {/* Bar */}
                  <div className="flex flex-1 items-center gap-2">
                    <div className="flex-1">
                      <div
                        className={`h-6 rounded-full transition-all duration-500 ${STAGE_BAR_COLORS[stage]}`}
                        style={{ width: `${Math.max(barPct, count > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums text-ink">
                      {count}명
                    </span>
                  </div>

                  {/* Step conversion rate */}
                  <div className="w-16 shrink-0 text-right">
                    {stepRate !== null && idx > 0 ? (
                      <span
                        className={`text-xs font-medium ${
                          stepRate >= 70
                            ? "text-forest"
                            : stepRate >= 40
                              ? "text-amber-600"
                              : "text-red-500"
                        }`}
                      >
                        {stepRate}%
                      </span>
                    ) : (
                      <span className="text-xs text-slate/40">기준</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-right text-xs text-slate/50">
          오른쪽 수치: 이전 단계 대비 전환율
        </p>
      </div>

      {/* Source Breakdown */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-base font-semibold">유입 경로별 현황</h2>
          <p className="mt-0.5 text-xs text-slate">어떤 경로로 방문자가 유입되었는지 확인합니다.</p>
          {total === 0 ? (
            <p className="mt-6 text-sm text-slate">데이터 없음</p>
          ) : (
            <div className="mt-5 space-y-3">
              {(Object.keys(SOURCE_LABELS) as ProspectSource[])
                .filter((s) => sourceCounts[s] > 0)
                .sort((a, b) => sourceCounts[b] - sourceCounts[a])
                .map((source) => {
                  const count = sourceCounts[source];
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={source} className="flex items-center gap-3">
                      <div className="w-16 shrink-0 text-right text-xs font-medium text-slate">
                        {SOURCE_LABELS[source]}
                      </div>
                      <div className="flex flex-1 items-center gap-2">
                        <div className="flex-1">
                          <div
                            className="h-5 rounded-full bg-ember/60 transition-all duration-500"
                            style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-ink">
                          {count}
                        </span>
                      </div>
                      <div className="w-12 shrink-0 text-right">
                        <span className="text-xs text-slate">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Stage distribution summary */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-base font-semibold">단계별 요약</h2>
          <p className="mt-0.5 text-xs text-slate">현재 각 단계에 있는 방문자 수입니다.</p>
          {total === 0 ? (
            <p className="mt-6 text-sm text-slate">데이터 없음</p>
          ) : (
            <div className="mt-5 space-y-2">
              {(Object.keys(STAGE_LABELS) as ProspectStage[]).map((stage) => {
                const count = stageCounts[stage];
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                const bgColors: Record<ProspectStage, string> = {
                  INQUIRY: "bg-sky-50 border-sky-200",
                  VISITING: "bg-amber-50 border-amber-200",
                  DECIDING: "bg-orange-50 border-orange-200",
                  REGISTERED: "bg-forest/10 border-forest/20",
                  DROPPED: "bg-slate-50 border-slate-200",
                };
                return (
                  <div
                    key={stage}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${bgColors[stage]}`}
                  >
                    <span className={`text-sm font-semibold ${STAGE_TEXT_COLORS[stage]}`}>
                      {STAGE_LABELS[stage]}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold tabular-nums text-ink">{count}명</span>
                      <span className="w-10 text-right text-xs text-slate">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Counselor Performance Table */}
      {counselorStats.length > 0 && (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="border-b border-ink/10 px-6 py-5">
            <h2 className="text-base font-semibold">상담사별 성과</h2>
            <p className="mt-0.5 text-xs text-slate">
              담당 상담사별 상담 건수 및 전환율을 비교합니다.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead>
                <tr>
                  {["담당 상담사", "총 상담", "등록 완료", "대기 중", "이탈", "전환율"].map(
                    (header) => (
                      <th
                        key={header}
                        className="bg-mist/50 px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {counselorStats.map((c) => (
                  <tr key={c.name} className="transition hover:bg-mist/20">
                    <td className="px-5 py-4 font-semibold text-ink">{c.name}</td>
                    <td className="px-5 py-4 tabular-nums text-ink">{c.total}건</td>
                    <td className="px-5 py-4 tabular-nums font-semibold text-forest">
                      {c.registered}명
                    </td>
                    <td className="px-5 py-4 tabular-nums text-slate">{c.pending}명</td>
                    <td className="px-5 py-4 tabular-nums text-red-600">{c.dropped}명</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {/* Mini bar */}
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-ink/10">
                          <div
                            className="h-full rounded-full bg-forest transition-all duration-500"
                            style={{ width: `${c.conversionRate}%` }}
                          />
                        </div>
                        <span
                          className={`text-sm font-bold tabular-nums ${
                            c.conversionRate >= 70
                              ? "text-forest"
                              : c.conversionRate >= 40
                                ? "text-amber-600"
                                : "text-red-500"
                          }`}
                        >
                          {c.conversionRate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {counselorStats.length > 0 && (
            <div className="border-t border-ink/10 px-5 py-3 text-xs text-slate">
              총 {counselorStats.length}명의 상담사
            </div>
          )}
        </div>
      )}

      {/* Bottom nav */}
      <div className="mt-8 flex gap-3">
        <Link
          href="/admin/prospects"
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          ← 상담 방문자 목록
        </Link>
      </div>
    </div>
  );
}
