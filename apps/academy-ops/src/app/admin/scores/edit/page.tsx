import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { ScoreEditPanel } from "@/components/scores/score-edit-panel";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { requireAdminContext } from "@/lib/auth";
import {
  buildExamSubjectLabelMap,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { filterSessionsByEnabledExamTypes } from "@/lib/periods/exam-types";
import { listPeriods } from "@/lib/periods/service";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams: Promise<SearchParams>;
};

function readSearchParam(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  if (Array.isArray(value)) {
    const first = value[0]?.trim();
    return first ? first : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  return null;
}

export default async function AdminScoreEditPage({ searchParams }: PageProps) {
  const [, scope] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    getAdminAcademyScope(),
  ]);

  const [periods, sp] = await Promise.all([listPeriods(), searchParams]);
  const visibleAcademyId = resolveVisibleAcademyId(scope);
  const subjectCatalog =
    visibleAcademyId === null
      ? buildFallbackExamSubjectCatalog()
      : await listExamSubjectCatalogForAcademy(visibleAcademyId, { includeInactive: true });
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);
  const sessionIdParam = readSearchParam(sp, "sessionId");
  const examNumberParam = readSearchParam(sp, "examNumber");
  const parsedSessionId = sessionIdParam ? Number(sessionIdParam) : null;
  const initialSessionId =
    parsedSessionId !== null && Number.isInteger(parsedSessionId) && parsedSessionId > 0
      ? parsedSessionId
      : null;
  const initialExamNumber = examNumberParam;

  let isPreSelectedLocked = false;
  let lockedSessionLabel: string | null = null;

  if (initialSessionId) {
    const selectedSession = periods
      .flatMap((period) => filterSessionsByEnabledExamTypes(period, period.sessions))
      .find((session) => session.id === initialSessionId);

    if (selectedSession?.isLocked) {
      isPreSelectedLocked = true;
      const dateStr = selectedSession.examDate.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      });
      const subjectName = selectedSession.displaySubjectName?.trim() || selectedSession.subject;
      lockedSessionLabel = `${dateStr} · ${selectedSession.week}주차 · ${subjectName}`;
    }
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            F-03b Score Edit
          </div>
          <h1 className="mt-5 text-3xl font-semibold">성적 수정</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            회차를 먼저 선택해 성적을 불러오고, 필요하면 학생 상세 링크로 수험번호 맥락을 확인한 뒤 수정하세요.
          </p>
        </div>
        <Link
          href="/admin/scores/input"
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          성적 입력 화면
        </Link>
      </div>

      {isPreSelectedLocked && (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-[20px] border border-amber-300 bg-amber-50 px-6 py-4 shadow-sm">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">선택한 회차가 잠금 상태입니다.</p>
              {lockedSessionLabel && <p className="mt-0.5 text-xs text-amber-700">{lockedSessionLabel}</p>}
              <p className="mt-1 text-xs text-amber-700">
                성적을 수정하려면 먼저 잠금을 해제해 주세요. 잠금 상태에서는 조회만 가능합니다.
              </p>
            </div>
          </div>
          <Link
            href="/admin/scores/sessions"
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            회차 목록에서 잠금 해제
          </Link>
        </div>
      )}

      <div className="mt-8">
        <ScoreEditPanel
          initialSessionId={initialSessionId}
          initialExamNumber={initialExamNumber}
          subjectLabelMap={subjectLabelMap}
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
              isLocked: session.isLocked,
              lockedAt: session.lockedAt?.toISOString() ?? null,
              lockedBy: session.lockedBy ?? null,
            })),
          }))}
        />
      </div>
    </div>
  );
}
