import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { ExamSubjectManager } from "./exam-subject-manager";
import { getAcademyById, getAcademyLabel } from "@/lib/academy";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { requireAdminContext } from "@/lib/auth";
import { listExamSubjectsForAcademy } from "@/lib/exam-subjects/service";

export const dynamic = "force-dynamic";

export default async function ExamSubjectsSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const scope = await getAdminAcademyScope();
  const visibleAcademyId = resolveVisibleAcademyId(scope);

  if (visibleAcademyId === null) {
    return (
      <div className="p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
          설정 · 시험 과목
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-ink">시험 과목 설정</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          시험 과목 마스터는 지점별 설정입니다. 전체 보기 상태에서는 저장 대상을 확정할 수 없으므로,
          상단 지점 전환기에서 먼저 지점을 선택해 주세요.
        </p>

        <div className="mt-8 rounded-[28px] border border-dashed border-amber-300 bg-amber-50/70 p-8 text-sm leading-7 text-amber-900">
          <p className="font-semibold">지점 선택이 필요합니다.</p>
          <p className="mt-2">
            슈퍼관리자는 전체 보기 대신 특정 지점을 선택한 뒤 시험 과목 표시명, 약어, 순서, 활성 여부를 관리해야 합니다.
            공통 코드 체계는 유지되고, 지점별 설정만 별도로 저장됩니다.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/admin/settings"
              className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30"
            >
              설정 허브로 이동
            </Link>
            <Link
              href="/admin/scores/sessions"
              className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
            >
              회차 목록 보기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [academy, rows] = await Promise.all([
    getAcademyById(visibleAcademyId),
    listExamSubjectsForAcademy(visibleAcademyId, { includeInactive: true }),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정 · 시험 과목
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">시험 과목 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        현재 지점에서 사용하는 시험 과목 마스터를 관리합니다. 과목 코드 체계는 공통으로 유지하고,
        지점별로 표시명, 약어, 순서, 활성 여부, 만점 기준을 조정합니다.
      </p>

      <div className="mt-8">
        <ExamSubjectManager
          academyLabel={getAcademyLabel(academy)}
          initialRows={rows.map((row) => ({
            id: row.id,
            academyId: row.academyId,
            examType: row.examType,
            code: row.code,
            displayName: row.displayName,
            shortLabel: row.shortLabel,
            displayOrder: row.displayOrder,
            maxScore: row.maxScore,
            isActive: row.isActive,
          }))}
        />
      </div>
    </div>
  );
}
