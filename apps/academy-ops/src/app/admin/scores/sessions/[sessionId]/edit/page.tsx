import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import {
  buildExamSubjectLabelMap,
  buildExamSubjectOptions,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import { getPrisma } from "@/lib/prisma";
import {
  applyScoreSessionAcademyScope,
  resolveVisibleScoreSessionAcademyId,
} from "@/lib/scores/session-admin";
import { getScoreSubjectLabel } from "@/lib/scores/subject-filter";
import { SessionEditForm } from "./session-edit-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ sessionId: string }> };

function formatDate(date: Date) {
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
}

export default async function SessionEditPage({ params }: PageProps) {
  const { sessionId } = await params;
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const id = Number(sessionId);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const academyId = await resolveVisibleScoreSessionAcademyId();
  const session = await getPrisma().examSession.findFirst({
    where: applyScoreSessionAcademyScope({ id }, academyId),
    include: { period: { select: { name: true } } },
  });

  if (!session) notFound();

  const subjectCatalog =
    academyId === null
      ? buildFallbackExamSubjectCatalog()
      : await listExamSubjectCatalogForAcademy(academyId, { includeInactive: true });
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);
  const subjectOptions = buildExamSubjectOptions(subjectCatalog, session.examType);

  const examTypeLabel = EXAM_TYPE_LABEL[session.examType] ?? session.examType;
  const subjectLabel = getScoreSubjectLabel(
    session.subject,
    session.displaySubjectName,
    subjectLabelMap,
  );

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        성적 관리
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate">
        <Link href="/admin/scores" className="transition hover:text-ember">
          성적 허브
        </Link>
        <span className="text-ink/30">/</span>
        <Link href={`/admin/scores/sessions/${session.id}`} className="transition hover:text-ember">
          {examTypeLabel} · {formatDate(session.examDate)}
        </Link>
        <span className="text-ink/30">/</span>
        <span className="text-ink">회차 수정</span>
      </div>

      <h1 className="mt-4 text-2xl font-semibold text-ink sm:text-3xl">회차 수정</h1>
      <p className="mt-1 text-sm text-slate">
        {session.period.name} · {session.week}주차 · {subjectLabel} · {examTypeLabel}
      </p>

      <div className="mt-6 rounded-[28px] border border-ink/10 bg-mist p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">현재 값</p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm md:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-medium text-slate">시험 날짜</dt>
            <dd className="mt-0.5 text-ink">{formatDate(session.examDate)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate">과목</dt>
            <dd className="mt-0.5 text-ink">{subjectLabel}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate">직렬</dt>
            <dd className="mt-0.5 text-ink">{examTypeLabel}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate">상태</dt>
            <dd className="mt-0.5">
              {session.isCancelled ? (
                <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                  취소됨{session.cancelReason ? ` · ${session.cancelReason}` : ""}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-2 py-0.5 text-xs font-semibold text-forest">
                  정상
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-8">
        <SessionEditForm
          session={{
            id: session.id,
            examType: session.examType,
            subject: session.subject,
            displaySubjectName: session.displaySubjectName ?? null,
            examDate: session.examDate.toISOString(),
            isCancelled: session.isCancelled,
            cancelReason: session.cancelReason ?? null,
          }}
          subjectOptions={subjectOptions}
        />
      </div>
    </div>
  );
}
