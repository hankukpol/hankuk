import { AdminRole, PassType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import Link from "next/link";
import { GraduateManager } from "./graduate-manager";

export const dynamic = "force-dynamic";

export type GraduateRow = {
  id: string;
  examNumber: string;
  examName: string;
  passType: PassType;
  writtenPassDate: string | null;
  finalPassDate: string | null;
  appointedDate: string | null;
  enrolledMonths: number | null;
  testimony: string | null;
  isPublic: boolean;
  note: string | null;
  createdAt: string;
  student: { name: string; generation: number | null; examType: string };
  staff: { name: string };
  scoreSnapshots: Array<{ snapshotType: PassType; overallAverage: number | null; totalEnrolledMonths: number }>;
};

export default async function GraduatesPage() {
  await requireAdminContext(AdminRole.VIEWER);

  const records = await getPrisma().graduateRecord.findMany({
    include: {
      student: { select: { name: true, generation: true, examType: true } },
      staff: { select: { name: true } },
      scoreSnapshots: { select: { snapshotType: true, overallAverage: true, totalEnrolledMonths: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const rows: GraduateRow[] = records.map((r) => ({
    ...r,
    writtenPassDate: r.writtenPassDate?.toISOString() ?? null,
    finalPassDate: r.finalPassDate?.toISOString() ?? null,
    appointedDate: r.appointedDate?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  // 연도별 합격 현황 요약
  const currentYear = new Date().getFullYear();

  function countByTypeAndYear(type: PassType, year: number) {
    return rows.filter((r) => {
      if (r.passType !== type) return false;
      const date = r.finalPassDate ?? r.writtenPassDate ?? r.appointedDate;
      return date?.startsWith(String(year));
    }).length;
  }

  const kpiData = [
    {
      type: "WRITTEN_PASS" as PassType,
      label: "필기합격",
      color: "bg-sky-50 text-sky-700 border-sky-200",
      count: countByTypeAndYear("WRITTEN_PASS", currentYear),
    },
    {
      type: "FINAL_PASS" as PassType,
      label: "최종합격",
      color: "bg-forest/10 text-forest border-forest/20",
      count: countByTypeAndYear("FINAL_PASS", currentYear),
    },
    {
      type: "APPOINTED" as PassType,
      label: "임용",
      color: "bg-amber-50 text-amber-700 border-amber-200",
      count: countByTypeAndYear("APPOINTED", currentYear),
    },
  ];

  const totalPassCount = rows.filter((r) => ["WRITTEN_PASS", "FINAL_PASS", "APPOINTED"].includes(r.passType)).length;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
        합격자 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">합격자 현황</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        필기합격·최종합격 기록을 관리하고 합격자 성적 데이터를 보관합니다.
      </p>

      {/* 관련 페이지 링크 */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/graduates/stats"
          className="inline-flex items-center gap-1.5 rounded-[28px] border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100"
        >
          합격자 통계
        </Link>
        <Link
          href="/admin/graduates/benchmark"
          className="inline-flex items-center gap-1.5 rounded-[28px] border border-ink/20 px-4 py-2 text-xs font-semibold text-slate transition-colors hover:border-forest hover:text-forest"
        >
          합격자 벤치마크
        </Link>
        <Link
          href="/admin/graduates/written-pass"
          className="inline-flex items-center gap-1.5 rounded-[28px] border border-ink/20 px-4 py-2 text-xs font-semibold text-slate transition-colors hover:border-forest hover:text-forest"
        >
          필기합격 관리
        </Link>
      </div>

      {/* KPI 카드 */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpiData.map(({ type, label, color, count }) => (
          <div key={type} className={`rounded-[20px] border p-5 ${color}`}>
            <p className="text-xs font-semibold">{currentYear}년 {label}</p>
            <p className="mt-1 text-3xl font-bold">
              {count}
              <span className="text-sm font-normal ml-1">명</span>
            </p>
          </div>
        ))}
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold text-slate">전체 합격자</p>
          <p className="mt-1 text-3xl font-bold">
            {totalPassCount}
            <span className="text-sm font-normal ml-1 text-slate">명</span>
          </p>
        </div>
      </div>

      <div className="mt-8">
        <GraduateManager initialRecords={rows} />
      </div>
    </div>
  );
}
