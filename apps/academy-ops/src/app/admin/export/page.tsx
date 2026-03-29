import { AdminRole } from "@prisma/client";
import { ExportPanel } from "@/components/export/export-panel";
import { WeeklyReportGeneratePanel } from "@/components/export/weekly-report-archive-panel";
import { PaymentExportPanel } from "@/components/export/payment-export-panel";
import { AttendanceExportPanel } from "@/components/export/attendance-export-panel";
import { StudentEnrollmentExportPanel } from "@/components/export/student-enrollment-export-panel";
import { requireAdminContext } from "@/lib/auth";
import { getActiveWeeklyReportSurfaceState } from "@/lib/export/weekly-report-archive";
import { listPeriods } from "@/lib/periods/service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminExportPage() {
  const prisma = getPrisma();
  const [context, periods, cohorts] = await Promise.all([
    requireAdminContext(AdminRole.VIEWER),
    listPeriods(),
    prisma.cohort.findMany({
      orderBy: [{ startDate: "desc" }],
      select: { id: true, name: true },
    }),
  ]);
  const canGenerateWeeklyReport = context.adminUser.role !== AdminRole.VIEWER;
  const weeklyReportSurface = canGenerateWeeklyReport
    ? await getActiveWeeklyReportSurfaceState()
    : null;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-17 Export
      </div>
      <h1 className="mt-5 text-3xl font-semibold">데이터 내보내기</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강생 명단과 성적 원본 데이터를 CSV 또는 xlsx로 바로 내려받을 수 있습니다. CSV는 UTF-8 BOM으로 내려가며, 교사용 주간 리포트는 이 페이지에서 실제 포함 범위를 확인한 뒤 수동 생성할 수 있습니다.
      </p>

      <div className="mt-8 space-y-8">
        {canGenerateWeeklyReport && weeklyReportSurface ? (
          <WeeklyReportGeneratePanel surface={weeklyReportSurface} />
        ) : null}
        <ExportPanel
          periods={periods.map((period) => ({
            id: period.id,
            name: period.name,
            isActive: period.isActive,
          }))}
        />
        <StudentEnrollmentExportPanel cohorts={cohorts} />
        <PaymentExportPanel />
        <AttendanceExportPanel />
      </div>
    </div>
  );
}
