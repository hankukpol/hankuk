import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { applyAcademyScope, getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { requireAdminContext } from "@/lib/auth";
import {
  buildExamSubjectLabelMap,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { listPeriods } from "@/lib/periods/service";
import { getPrisma } from "@/lib/prisma";
import { QuickEntryForm } from "./quick-entry-form";

export const dynamic = "force-dynamic";

export default async function MorningQuickEntryPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const scope = await getAdminAcademyScope();
  const academyId = resolveVisibleAcademyId(scope);
  const prisma = getPrisma();

  const periods = await listPeriods();
  const subjectCatalog =
    academyId === null
      ? buildFallbackExamSubjectCatalog()
      : await listExamSubjectCatalogForAcademy(academyId, { includeInactive: true });
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);

  const sessions = periods
    .flatMap((period) =>
      period.sessions.map((session) => ({
        id: session.id,
        examType: session.examType,
        week: session.week,
        subject: session.subject,
        displaySubjectName: session.displaySubjectName ?? null,
        examDate: session.examDate.toISOString(),
        isCancelled: session.isCancelled,
        isLocked: session.isLocked,
        periodName: period.name,
      })),
    )
    .sort((a, b) => {
      const byDate = new Date(b.examDate).getTime() - new Date(a.examDate).getTime();
      if (byDate !== 0) {
        return byDate;
      }
      return a.id - b.id;
    });

  const students = await prisma.student.findMany({
    where: applyAcademyScope({ isActive: true }, academyId),
    select: { examNumber: true, name: true },
    orderBy: [{ name: "asc" }, { examNumber: "asc" }],
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            아침 모의고사
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">빠른 성적 입력</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            현재 지점의 최근 회차와 재원생 목록을 기준으로 점수를 빠르게 입력합니다. 잠금 회차는 수정할 수 없고,
            빈 점수는 저장되지 않습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/exams/morning"
            className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            수강 현황
          </Link>
          <Link
            href="/admin/exams/morning/scores"
            className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            회차별 성적
          </Link>
          <Link
            href="/admin/scores/input"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 입력
          </Link>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-[20px] border border-amber-200 bg-amber-50 p-4">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p className="text-sm text-amber-800">
          이미 입력된 점수가 있으면 덮어씁니다. 결석은 <strong>결석</strong>으로 저장되며, 잠금된 회차는 이 화면에서
          수정할 수 없습니다.
        </p>
      </div>

      <div className="mt-8">
        <QuickEntryForm sessions={sessions} students={students} subjectLabelMap={subjectLabelMap} />
      </div>
    </div>
  );
}
