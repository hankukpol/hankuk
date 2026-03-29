import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { ScoreInputWorkbench } from "@/components/scores/score-input-workbench";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { requireAdminContext } from "@/lib/auth";
import {
  buildExamSubjectLabelMap,
  buildExamSubjectOptions,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { filterSessionsByEnabledExamTypes } from "@/lib/periods/exam-types";
import { listPeriods } from "@/lib/periods/service";

export const dynamic = "force-dynamic";

export default async function AdminScoreInputPage() {
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            F-03 Score Input
          </div>
          <h1 className="mt-5 text-3xl font-semibold">성적 입력</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            오프라인 XLS, 온라인 HTML-XLS, 직접 붙여넣기 세 가지 입력 방식을 같은 회차 선택 흐름으로 통합했습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/scores/bulk-import"
            className="inline-flex items-center rounded-full border border-ember/30 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
          >
            CSV 일괄 입력
          </Link>
          <Link
            href="/admin/periods"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            시험 기간 관리
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <ScoreInputWorkbench
          periods={periods.map((period) => ({
            id: period.id,
            name: period.name,
            isActive: period.isActive,
            sessions: filterSessionsByEnabledExamTypes(period, period.sessions).map((session) => ({
              id: session.id,
              examType: session.examType,
              week: session.week,
              subject: session.subject,
              displaySubjectName: session.displaySubjectName ?? null,
              examDate: session.examDate.toISOString(),
              isCancelled: session.isCancelled,
              cancelReason: session.cancelReason ?? null,
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
