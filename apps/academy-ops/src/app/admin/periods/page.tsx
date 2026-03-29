import { AdminRole } from "@prisma/client";
import { PeriodManager } from "@/components/periods/period-manager";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { requireAdminContext } from "@/lib/auth";
import {
  buildExamSubjectLabelMap,
  buildFallbackExamSubjectCatalog,
  buildExamSubjectOptions,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { listPeriods } from "@/lib/periods/service";

export const dynamic = "force-dynamic";

export default async function AdminPeriodsPage() {
  const [, scope, periods] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    getAdminAcademyScope(),
    listPeriods(),
  ]);

  const visibleAcademyId = resolveVisibleAcademyId(scope);
  const subjectCatalog =
    visibleAcademyId === null
      ? buildFallbackExamSubjectCatalog()
      : await listExamSubjectCatalogForAcademy(visibleAcademyId, { includeInactive: true });
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-01 Periods
      </div>
      <h1 className="mt-5 text-3xl font-semibold">시험 기간과 회차 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        기간 생성, 활성화, 자동 회차 생성, 개별 회차 추가, 회차 수정과 수강생 등록/해제를 한 화면에서 관리합니다.
      </p>
      <div className="mt-8">
        <PeriodManager
          periods={periods.map((period) => ({
            ...period,
            startDate: period.startDate.toISOString(),
            endDate: period.endDate.toISOString(),
            sessions: period.sessions.map((session) => ({
              ...session,
              displaySubjectName: session.displaySubjectName ?? null,
              examDate: session.examDate.toISOString(),
              isLocked: session.isLocked,
              lockedAt: session.lockedAt?.toISOString() ?? null,
              lockedBy: session.lockedBy ?? null,
            })),
          }))}
          subjectOptionsByExamType={{
            GONGCHAE: buildExamSubjectOptions(subjectCatalog, "GONGCHAE"),
            GYEONGCHAE: buildExamSubjectOptions(subjectCatalog, "GYEONGCHAE"),
          }}
          subjectLabelMap={subjectLabelMap}
        />
      </div>
    </div>
  );
}
