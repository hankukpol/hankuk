import Link from "next/link";
import { AdminRole, ProspectStage } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ProspectManager } from "./prospect-manager";

export const dynamic = "force-dynamic";

export type ProspectRow = {
  id: string;
  name: string;
  phone: string | null;
  examType: string | null;
  source: string;
  stage: string;
  note: string | null;
  staffId: string;
  enrollmentId: string | null;
  visitedAt: string;
  createdAt: string;
  updatedAt: string;
  staff: { name: string } | null;
};

interface PageProps {
  searchParams: { month?: string };
}

export default async function ProspectsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  // Determine month filter: default to current month
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const selectedMonth = searchParams.month ?? defaultMonth;

  // Parse month range for KPI
  const [yearStr, monthStr] = selectedMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-based
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);

  // Load all prospects for the selected month (for KPI) + all for list
  const [allProspects, monthProspects] = await Promise.all([
    getPrisma().consultationProspect.findMany({
      orderBy: { visitedAt: "desc" },
      include: { staff: { select: { name: true } } },
    }),
    getPrisma().consultationProspect.findMany({
      where: {
        visitedAt: { gte: monthStart, lt: monthEnd },
      },
      select: { stage: true },
    }),
  ]);

  const rows: ProspectRow[] = allProspects.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone ?? null,
    examType: p.examType ?? null,
    source: p.source,
    stage: p.stage,
    note: p.note ?? null,
    staffId: p.staffId,
    enrollmentId: p.enrollmentId ?? null,
    visitedAt: p.visitedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    staff: p.staff,
  }));

  // KPI: based on selected month's visitedAt
  const monthTotal = monthProspects.length;
  const monthRegistered = monthProspects.filter((p) => p.stage === ProspectStage.REGISTERED).length;
  const conversionRate = monthTotal > 0 ? Math.round((monthRegistered / monthTotal) * 100) : 0;

  // "대기 상담": INQUIRY + VISITING + DECIDING (not yet converted or dropped)
  const pendingStages: string[] = [
    ProspectStage.INQUIRY,
    ProspectStage.VISITING,
    ProspectStage.DECIDING,
  ];
  const pendingCount = allProspects.filter((p) => pendingStages.includes(p.stage)).length;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold">상담 방문자</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/prospects/stats"
            className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/10 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/20"
          >
            전환 통계 보기 →
          </Link>
          <Link
            href="/admin/counseling/conversion-stats"
            className="inline-flex items-center gap-1.5 rounded-full border border-ember/20 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/20"
          >
            전환율 분석 대시보드 →
          </Link>
        </div>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        미등록 예비 원생의 상담 기록을 관리합니다. 등록 완료 후 수강 연결은 수강 등록 메뉴에서 처리하세요.
      </p>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* 이번달 상담 건수 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold text-slate">이번달 상담</p>
          <p className="mt-3 text-3xl font-bold">
            {monthTotal}
            <span className="ml-1 text-sm font-normal text-slate">건</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">{selectedMonth} 방문 기준</p>
        </div>

        {/* 전환율 */}
        <div className="rounded-[28px] border border-forest/20 bg-forest/10 p-5 shadow-panel">
          <p className="text-xs font-semibold text-forest">전환율</p>
          <p className="mt-3 text-3xl font-bold text-forest">
            {conversionRate}
            <span className="ml-1 text-sm font-normal text-slate">%</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">등록 / 이번달 상담</p>
        </div>

        {/* 이번달 등록전환 */}
        <div className="rounded-[28px] border border-ember/20 bg-ember/10 p-5 shadow-panel">
          <p className="text-xs font-semibold text-ember">이번달 등록전환</p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {monthRegistered}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">REGISTERED 전환 수</p>
        </div>

        {/* 대기 상담 */}
        <div className="rounded-[28px] border border-ink/10 bg-mist p-5 shadow-panel">
          <p className="text-xs font-semibold text-slate">대기 상담</p>
          <p className="mt-3 text-3xl font-bold">
            {pendingCount}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1.5 text-xs text-slate">문의·내방·검토 중</p>
        </div>
      </div>

      <div className="mt-8">
        <ProspectManager
          initialProspects={rows}
          initialMonth={selectedMonth}
        />
      </div>
    </div>
  );
}
