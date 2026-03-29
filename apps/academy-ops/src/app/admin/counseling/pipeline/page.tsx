import Link from "next/link";
import { AdminRole, ProspectStage, ProspectSource } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<ProspectStage, string> = {
  INQUIRY: "초기문의",
  VISITING: "방문상담",
  DECIDING: "검토중",
  REGISTERED: "등록완료",
  DROPPED: "이탈",
};

const STAGE_ORDER: ProspectStage[] = [
  "INQUIRY",
  "VISITING",
  "DECIDING",
  "REGISTERED",
  "DROPPED",
];

const STAGE_COLOR: Record<
  ProspectStage,
  { border: string; bg: string; badge: string; text: string }
> = {
  INQUIRY: {
    border: "border-sky-200",
    bg: "bg-sky-50/60",
    badge: "bg-sky-100 text-sky-700 border-sky-200",
    text: "text-sky-800",
  },
  VISITING: {
    border: "border-amber-200",
    bg: "bg-amber-50/60",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    text: "text-amber-800",
  },
  DECIDING: {
    border: "border-purple-200",
    bg: "bg-purple-50/60",
    badge: "bg-purple-100 text-purple-700 border-purple-200",
    text: "text-purple-800",
  },
  REGISTERED: {
    border: "border-forest/30",
    bg: "bg-forest/5",
    badge: "bg-forest/10 text-forest border-forest/20",
    text: "text-forest",
  },
  DROPPED: {
    border: "border-red-200",
    bg: "bg-red-50/40",
    badge: "bg-red-100 text-red-700 border-red-200",
    text: "text-red-700",
  },
};

const SOURCE_LABEL: Record<ProspectSource, string> = {
  WALK_IN: "내방",
  PHONE: "전화",
  SNS: "SNS",
  REFERRAL: "추천",
  OTHER: "기타",
};

function formatDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function daysSince(d: Date): number {
  const now = Date.now();
  return Math.floor((now - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function CounselingPipelinePage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prospects = await getPrisma().consultationProspect.findMany({
    orderBy: { visitedAt: "desc" },
    include: {
      staff: { select: { name: true } },
    },
  });

  // Group by stage
  const grouped: Record<ProspectStage, typeof prospects> = {
    INQUIRY: [],
    VISITING: [],
    DECIDING: [],
    REGISTERED: [],
    DROPPED: [],
  };
  for (const p of prospects) {
    grouped[p.stage].push(p);
  }

  // Funnel conversion metrics (INQUIRY → VISITING → DECIDING → REGISTERED)
  const funnelStages: ProspectStage[] = ["INQUIRY", "VISITING", "DECIDING", "REGISTERED"];
  const total = prospects.filter((p) => p.stage !== "DROPPED").length;

  // Avg days in stage: approximate by looking at visitedAt relative to now for current occupants
  // We only have visitedAt (entry date into the system), so we compute avg days from visitedAt to now
  const avgDaysPerStage: Record<string, number | null> = {};
  for (const stage of STAGE_ORDER) {
    const group = grouped[stage];
    if (group.length === 0) {
      avgDaysPerStage[stage] = null;
    } else {
      const totalDays = group.reduce((sum, p) => sum + daysSince(p.visitedAt), 0);
      avgDaysPerStage[stage] = Math.round(totalDays / group.length);
    }
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        상담 파이프라인
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">상담 전환 파이프라인</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            예비 원생이 초기 문의부터 등록 완료까지 어느 단계에 있는지 한눈에 파악합니다.
          </p>
        </div>
        <Link
          prefetch={false}
          href="/admin/counseling/prospects"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-forest/30 hover:text-forest"
        >
          ← 방문자 목록
        </Link>
      </div>

      {/* Summary KPIs */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {STAGE_ORDER.map((stage) => {
          const color = STAGE_COLOR[stage];
          const count = grouped[stage].length;
          const prevIdx = funnelStages.indexOf(stage) - 1;
          const prevStage = prevIdx >= 0 ? funnelStages[prevIdx] : null;
          const prevCount = prevStage
            ? grouped[prevStage].length + count
            : null;
          const convRate =
            prevCount && prevCount > 0
              ? Math.round((count / prevCount) * 100)
              : null;

          return (
            <article
              key={stage}
              className={`rounded-[28px] border ${color.border} ${color.bg} p-5`}
            >
              <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${color.text}`}>
                {STAGE_LABEL[stage]}
              </p>
              <p className="mt-3 text-3xl font-semibold">
                {count}
                <span className="ml-1 text-base font-normal text-slate">명</span>
              </p>
              {convRate !== null ? (
                <p className="mt-2 text-xs text-slate">
                  이전 단계 대비{" "}
                  <span className="font-semibold text-ink">{convRate}%</span> 전환
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate">전체 {total}명 중</p>
              )}
              {avgDaysPerStage[stage] !== null ? (
                <p className="mt-1 text-xs text-slate">
                  평균{" "}
                  <span className="font-semibold text-ink">
                    {avgDaysPerStage[stage]}일
                  </span>{" "}
                  경과
                </p>
              ) : null}
            </article>
          );
        })}
      </section>

      {/* Funnel bar visualization */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold">전환 퍼널</h2>
        <div className="mt-5 space-y-3">
          {funnelStages.map((stage, idx) => {
            const count = grouped[stage].length;
            const maxCount = grouped[funnelStages[0]].length || 1;
            const widthPct = Math.max(8, Math.round((count / Math.max(maxCount, 1)) * 100));
            const color = STAGE_COLOR[stage];
            const prevStage = idx > 0 ? funnelStages[idx - 1] : null;
            const prevCount = prevStage
              ? grouped[prevStage].length + count
              : null;
            const convRate =
              prevCount && prevCount > 0
                ? Math.round((count / prevCount) * 100)
                : null;

            return (
              <div key={stage} className="flex items-center gap-4">
                <span className={`w-20 shrink-0 text-right text-sm font-semibold ${color.text}`}>
                  {STAGE_LABEL[stage]}
                </span>
                <div className="flex flex-1 items-center gap-3">
                  <div
                    className={`h-8 rounded-full border ${color.border} ${color.bg} transition-all`}
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="w-10 text-sm font-semibold text-ink">{count}명</span>
                  {convRate !== null ? (
                    <span className="text-xs text-slate">({convRate}%)</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pipeline columns */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">단계별 현황</h2>
        <p className="mt-1 text-sm text-slate">
          각 단계의 예비 원생 목록입니다. 상세 수정은 방문자 목록에서 처리하세요.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {STAGE_ORDER.map((stage) => {
            const color = STAGE_COLOR[stage];
            const cards = grouped[stage];

            return (
              <div key={stage} className="flex flex-col gap-3">
                {/* Column header */}
                <div
                  className={`flex items-center justify-between rounded-[20px] border ${color.border} ${color.bg} px-4 py-3`}
                >
                  <span className={`text-sm font-semibold ${color.text}`}>
                    {STAGE_LABEL[stage]}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${color.badge}`}
                  >
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                {cards.length === 0 ? (
                  <div className="rounded-[20px] border border-dashed border-ink/10 px-4 py-6 text-center text-xs text-slate">
                    없음
                  </div>
                ) : (
                  cards.map((prospect) => {
                    const days = daysSince(prospect.visitedAt);
                    return (
                      <div
                        key={prospect.id}
                        className="rounded-[20px] border border-ink/10 bg-white p-4 shadow-sm"
                      >
                        <p className="font-semibold text-ink">{prospect.name}</p>
                        {prospect.phone ? (
                          <p className="mt-1 text-xs text-slate">{prospect.phone}</p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${color.badge}`}
                          >
                            {SOURCE_LABEL[prospect.source]}
                          </span>
                          {prospect.examType ? (
                            <span className="rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[10px] font-medium text-slate">
                              {prospect.examType === "GONGCHAE" ? "공채" : "경채"}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[10px] text-slate">
                          <span>{formatDate(prospect.visitedAt)} 방문</span>
                          <span>{days}일 경과</span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate">
                          담당: {prospect.staff.name}
                        </p>
                        {prospect.note ? (
                          <p className="mt-2 line-clamp-2 rounded-xl bg-mist px-3 py-2 text-[10px] text-slate">
                            {prospect.note}
                          </p>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
