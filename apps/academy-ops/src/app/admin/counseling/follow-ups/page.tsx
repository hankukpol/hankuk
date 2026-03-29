import Link from "next/link";
import { AdminRole, ProspectStage } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { FollowUpActions } from "./follow-up-actions";

export const dynamic = "force-dynamic";

type SearchParams = {
  counselorId?: string | string[];
  status?: string | string[];
  days?: string | string[];
};

function readParam(sp: SearchParams, key: keyof SearchParams): string {
  const v = sp[key];
  if (!v) return "";
  return Array.isArray(v) ? v[0] : v;
}

function diffDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function formatRelative(date: Date, now: Date): string {
  const d = diffDays(date, now);
  if (d === 0) return "오늘";
  if (d === 1) return "1일 전";
  return `${d}일 전`;
}

const STAGE_LABELS: Record<ProspectStage, string> = {
  INQUIRY: "문의",
  VISITING: "내방상담",
  DECIDING: "검토중",
  REGISTERED: "등록완료",
  DROPPED: "이탈",
};

const STAGE_BADGE_CLASS: Record<ProspectStage, string> = {
  INQUIRY: "border-slate-200 bg-slate-50 text-slate-600",
  VISITING: "border-blue-200 bg-blue-50 text-blue-700",
  DECIDING: "border-amber-200 bg-amber-50 text-amber-700",
  REGISTERED: "border-forest/20 bg-forest/10 text-forest",
  DROPPED: "border-red-200 bg-red-50 text-red-600",
};

const NEXT_STAGE: Partial<Record<ProspectStage, ProspectStage>> = {
  INQUIRY: "VISITING",
  VISITING: "DECIDING",
  DECIDING: "REGISTERED",
};

type PageProps = {
  searchParams?: SearchParams;
};

export default async function CounselingFollowUpsPage({ searchParams }: PageProps) {
  const sp = searchParams ?? {};
  await requireAdminContext(AdminRole.COUNSELOR);

  const counselorId = readParam(sp, "counselorId");
  const statusFilter = readParam(sp, "status");
  const daysFilter = parseInt(readParam(sp, "days") || "0", 10);

  const prisma = getPrisma();
  const now = new Date();

  // Active stages only (not REGISTERED or DROPPED)
  const activeStages: ProspectStage[] = ["INQUIRY", "VISITING", "DECIDING"];
  const stageFilter: ProspectStage[] =
    statusFilter && activeStages.includes(statusFilter as ProspectStage)
      ? [statusFilter as ProspectStage]
      : activeStages;

  const cutoff =
    daysFilter > 0
      ? new Date(now.getTime() - daysFilter * 24 * 60 * 60 * 1000)
      : null;

  const [prospects, staffList] = await Promise.all([
    prisma.consultationProspect.findMany({
      where: {
        stage: { in: stageFilter },
        ...(counselorId ? { staffId: counselorId } : {}),
        ...(cutoff ? { updatedAt: { lte: cutoff } } : {}),
      },
      orderBy: { updatedAt: "asc" }, // oldest first = needs most attention
      include: {
        staff: { select: { id: true, name: true } },
      },
    }),
    prisma.adminUser.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // KPI calculations
  const totalNeedingFollowUp = prospects.length;
  const longContact7Days = prospects.filter(
    (p) => diffDays(p.updatedAt, now) >= 7,
  ).length;
  const todayContact = prospects.filter(
    (p) => diffDays(p.updatedAt, now) === 0,
  ).length;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        상담 팔로업
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">상담 팔로업 현황</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate">
            문의·내방·검토 단계에 머물러 있는 예비 원생을 오래된 순으로 표시합니다.
            등록 완료 또는 이탈 처리된 항목은 제외됩니다.
          </p>
        </div>
        <Link
          href="/admin/counseling"
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          ← 면담 허브
        </Link>
      </div>

      {/* KPI row */}
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <article
          className={`rounded-[28px] border p-6 ${
            totalNeedingFollowUp > 0
              ? "border-amber-200 bg-amber-50"
              : "border-ink/10 bg-white"
          }`}
        >
          <p className="text-sm text-slate">팔로업 필요</p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              totalNeedingFollowUp > 0 ? "text-amber-700" : ""
            }`}
          >
            {totalNeedingFollowUp}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">등록·이탈 전 단계 전체</p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">오늘 연락 예정</p>
          <p className="mt-3 text-3xl font-semibold">
            {todayContact}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">오늘 업데이트된 항목 수</p>
        </article>

        <article
          className={`rounded-[28px] border p-6 ${
            longContact7Days > 0
              ? "border-red-200 bg-red-50"
              : "border-ink/10 bg-white"
          }`}
        >
          <p className="text-sm text-slate">장기 미연락 (7일+)</p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              longContact7Days > 0 ? "text-red-600" : ""
            }`}
          >
            {longContact7Days}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">7일 이상 변동 없는 항목</p>
        </article>
      </section>

      {/* Filters */}
      <form className="mt-6 flex flex-wrap items-end gap-4 rounded-[28px] border border-ink/10 bg-white p-5">
        {/* Counselor filter */}
        <div className="flex-1 min-w-[160px]">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate">
            담당자
          </label>
          <select
            name="counselorId"
            defaultValue={counselorId}
            className="w-full rounded-2xl border border-ink/10 bg-mist px-3 py-2 text-sm"
          >
            <option value="">전체</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div className="flex-1 min-w-[160px]">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate">
            단계
          </label>
          <select
            name="status"
            defaultValue={statusFilter}
            className="w-full rounded-2xl border border-ink/10 bg-mist px-3 py-2 text-sm"
          >
            <option value="">전체</option>
            <option value="INQUIRY">문의</option>
            <option value="VISITING">내방상담</option>
            <option value="DECIDING">검토중</option>
          </select>
        </div>

        {/* Days filter */}
        <div className="flex-1 min-w-[160px]">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate">
            미연락 기간
          </label>
          <select
            name="days"
            defaultValue={daysFilter > 0 ? String(daysFilter) : ""}
            className="w-full rounded-2xl border border-ink/10 bg-mist px-3 py-2 text-sm"
          >
            <option value="">전체</option>
            <option value="3">3일 이상</option>
            <option value="7">7일 이상</option>
            <option value="14">14일 이상</option>
            <option value="30">30일 이상</option>
          </select>
        </div>

        <button
          type="submit"
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest"
        >
          필터 적용
        </button>
        <Link
          href="/admin/counseling/follow-ups"
          className="rounded-full border border-ink/10 px-5 py-2 text-sm font-semibold text-slate transition hover:border-ink/30"
        >
          초기화
        </Link>
      </form>

      {/* List */}
      {prospects.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-sm text-slate">
          팔로업이 필요한 상담 방문자가 없습니다.
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10 bg-white">
          {/* Table header */}
          <div className="hidden border-b border-ink/10 bg-mist/60 px-6 py-3 sm:grid sm:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] sm:gap-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate">이름</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate">단계</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate">마지막 연락</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate">담당자</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate">연락처</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate">조치</span>
          </div>

          <div className="divide-y divide-ink/10">
            {prospects.map((p) => {
              const daysSince = diffDays(p.updatedAt, now);
              const isLong = daysSince >= 7;
              const nextStage = NEXT_STAGE[p.stage];

              return (
                <div
                  key={p.id}
                  className={`grid gap-4 px-6 py-4 transition sm:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] sm:items-center ${
                    isLong ? "bg-red-50/30" : ""
                  }`}
                >
                  {/* Name */}
                  <div>
                    <p className="font-semibold text-ink">{p.name}</p>
                    {p.note && (
                      <p className="mt-0.5 truncate text-xs text-slate" title={p.note}>
                        {p.note.length > 40 ? p.note.slice(0, 40) + "…" : p.note}
                      </p>
                    )}
                  </div>

                  {/* Stage badge */}
                  <div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        STAGE_BADGE_CLASS[p.stage]
                      }`}
                    >
                      {STAGE_LABELS[p.stage]}
                    </span>
                  </div>

                  {/* Last contact */}
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        isLong ? "text-red-600" : "text-ink"
                      }`}
                    >
                      {formatRelative(p.updatedAt, now)}
                    </p>
                    <p className="text-xs text-slate">
                      {p.updatedAt.toLocaleDateString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </p>
                  </div>

                  {/* Counselor */}
                  <div>
                    {p.staff?.name ? (
                      <p className="text-sm text-ink">{p.staff.name}</p>
                    ) : (
                      <p className="text-sm text-slate">-</p>
                    )}
                  </div>

                  {/* Phone */}
                  <div>
                    {p.phone ? (
                      <p className="text-sm text-ink">{p.phone}</p>
                    ) : (
                      <p className="text-sm text-slate/50">없음</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {nextStage && (
                      <FollowUpActions
                        prospectId={p.id}
                        prospectName={p.name}
                        currentStage={p.stage}
                        nextStage={nextStage}
                        nextStageLabel={STAGE_LABELS[nextStage]}
                      />
                    )}
                    <FollowUpActions
                      prospectId={p.id}
                      prospectName={p.name}
                      currentStage={p.stage}
                      nextStage="DROPPED"
                      nextStageLabel="이탈 처리"
                      variant="danger"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
