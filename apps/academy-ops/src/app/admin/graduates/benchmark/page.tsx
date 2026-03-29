import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getGraduateBenchmarkData } from "@/lib/analytics/graduate-benchmark";
import { BenchmarkClient } from "./benchmark-client";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

export default async function GraduateBenchmarkPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const data = await getGraduateBenchmarkData();

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "판정 관리", href: "/admin/graduates" },
          { label: "합격자 관리", href: "/admin/graduates" },
          { label: "합격자 벤치마크" },
        ]}
      />

      <div className="mt-2">
        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
          합격자 분석
        </div>
        <h1 className="mt-4 text-3xl font-semibold">합격자 벤치마크</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
          전체 합격자 데이터를 집계하여 수강 기간 분포, 월별 합격 추이, 과목별 평균 성적을 분석합니다.
        </p>
      </div>

      <div className="mt-8">
        <BenchmarkClient data={data} />
      </div>
    </div>
  );
}
