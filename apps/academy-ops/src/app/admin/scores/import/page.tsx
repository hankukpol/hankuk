import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import {
  buildExamSubjectOptions,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { listPeriods } from "@/lib/periods/service";
import { ScoreCsvImporter } from "./score-csv-importer";

export const dynamic = "force-dynamic";

export type PeriodOption = {
  id: number;
  name: string;
  isActive: boolean;
  examType: "GONGCHAE" | "GYEONGCHAE";
  sessions: SessionOption[];
  subjectOptions: SubjectOption[];
};

export type SessionOption = {
  id: number;
  examType: string;
  week: number;
  subject: string;
  displaySubjectName: string | null;
  examDate: string;
};

export type SubjectOption = {
  key: string;
  label: string;
};

export default async function ScoreImportPage() {
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

  const periodOptions: PeriodOption[] = [];
  for (const period of periods) {
    const examTypes: Array<"GONGCHAE" | "GYEONGCHAE"> = [];

    if (period.isGongchaeEnabled) examTypes.push("GONGCHAE");
    if (period.isGyeongchaeEnabled) examTypes.push("GYEONGCHAE");

    for (const examType of examTypes) {
      const sessions = period.sessions
        .filter((session) => !session.isCancelled && session.examType === examType)
        .map((session) => ({
          id: session.id,
          examType: session.examType,
          week: session.week,
          subject: session.subject,
          displaySubjectName: session.displaySubjectName ?? null,
          examDate: session.examDate.toISOString(),
        }));

      if (sessions.length > 0) {
        periodOptions.push({
          id: period.id,
          name: `${period.name} (${EXAM_TYPE_LABEL[examType] ?? examType})`,
          isActive: period.isActive,
          examType,
          sessions,
          subjectOptions: buildExamSubjectOptions(subjectCatalog, examType).map((subject) => ({
            key: subject.value,
            label: subject.label,
          })),
        });
      }
    }
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            성적 관리
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">성적 CSV 가져오기</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            여러 과목 점수를 한 번에 CSV 파일로 업로드해 성적을 등록합니다.
            입력 형식은 <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs font-mono">학번,과목1,과목2...</code> 순서를 따릅니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/scores/bulk-import"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            일괄 입력
          </Link>
          <Link
            href="/admin/scores"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 관리
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <ScoreCsvImporter periodOptions={periodOptions} />
      </div>
    </div>
  );
}
