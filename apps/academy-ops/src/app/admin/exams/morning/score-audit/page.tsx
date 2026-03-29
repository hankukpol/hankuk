import Link from "next/link";
import { AdminRole, Subject } from "@prisma/client";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { requireAdminContext } from "@/lib/auth";
import {
  buildExamSubjectLabelMap,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";
import { getScoreSubjectLabel, type ScoreSubjectLabelMap } from "@/lib/scores/subject-filter";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ScoreAction = (typeof SCORE_ACTIONS)[number];

type AuditRow = {
  id: number;
  action: string;
  targetId: string;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  createdAt: Date;
  admin: { id: string; name: string; email: string };
};

const SCORE_ACTIONS = [
  "SCORE_CREATE",
  "SCORE_UPDATE",
  "SCORE_DELETE",
  "SCORE_BULK_UPDATE",
  "SCORE_BULK_CREATE",
] as const;

const SCORE_ACTION_LABEL: Record<ScoreAction, string> = {
  SCORE_CREATE: "성적 생성",
  SCORE_UPDATE: "성적 수정",
  SCORE_DELETE: "성적 삭제",
  SCORE_BULK_UPDATE: "일괄 수정",
  SCORE_BULK_CREATE: "일괄 생성",
};

function formatDate(value: Date) {
  return `${value.getFullYear()}.${String(value.getMonth() + 1).padStart(2, "0")}.${String(value.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value: Date) {
  return `${formatDate(value)} ${value.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })}`;
}

function toInputDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getScoreValue(json: unknown) {
  if (json === null || json === undefined) {
    return "-";
  }

  if (typeof json === "object" && json !== null) {
    const objectValue = json as Record<string, unknown>;
    const score = objectValue.finalScore ?? objectValue.rawScore ?? objectValue.score ?? objectValue.oxScore ?? null;
    if (score !== null && score !== undefined) {
      return String(score);
    }
    return JSON.stringify(json).slice(0, 40);
  }

  return String(json);
}

function getSubjectLabelFromJson(
  json: unknown,
  subjectLabelMap: ScoreSubjectLabelMap,
) {
  if (json === null || json === undefined || typeof json !== "object") {
    return "-";
  }

  const objectValue = json as Record<string, unknown>;
  const displaySubjectName = objectValue.displaySubjectName;
  if (typeof displaySubjectName === "string" && displaySubjectName.trim()) {
    return displaySubjectName.trim();
  }

  const subject = objectValue.subject;
  if (typeof subject === "string") {
    return getScoreSubjectLabel(subject as Subject, typeof displaySubjectName === "string" ? displaySubjectName : null, subjectLabelMap);
  }

  return "-";
}

function getNoteFromJson(json: unknown) {
  if (json === null || json === undefined || typeof json !== "object") {
    return "";
  }

  const objectValue = json as Record<string, unknown>;
  return typeof objectValue.note === "string" ? objectValue.note : "";
}

function getExamNumberFromJson(targetId: string, json: unknown) {
  if (typeof json === "object" && json !== null) {
    const objectValue = json as Record<string, unknown>;
    if (typeof objectValue.examNumber === "string" && objectValue.examNumber.trim()) {
      return objectValue.examNumber.trim();
    }
  }

  return targetId;
}

export default async function ScoreAuditPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const scope = await getAdminAcademyScope();
  const academyId = resolveVisibleAcademyId(scope);
  const prisma = getPrisma();
  const subjectCatalog =
    academyId === null
      ? buildFallbackExamSubjectCatalog()
      : await listExamSubjectCatalogForAcademy(academyId, { includeInactive: true });
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);
  const resolvedParams = searchParams ? await searchParams : {};

  const fromParam = Array.isArray(resolvedParams.from) ? resolvedParams.from[0] : resolvedParams.from;
  const toParam = Array.isArray(resolvedParams.to) ? resolvedParams.to[0] : resolvedParams.to;
  const examNumberParam = Array.isArray(resolvedParams.examNumber)
    ? resolvedParams.examNumber[0]
    : resolvedParams.examNumber;
  const actionParam = Array.isArray(resolvedParams.action) ? resolvedParams.action[0] : resolvedParams.action;

  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const fromDate = fromParam ? new Date(`${fromParam}T00:00:00`) : defaultFrom;
  const toDate = toParam ? new Date(`${toParam}T23:59:59`) : new Date(now);
  toDate.setHours(23, 59, 59, 999);

  let auditLogs: AuditRow[] = [];
  let dbError: string | null = null;
  let truncated = false;

  try {
    const rawLogs = await prisma.auditLog.findMany({
      where: {
        action: actionParam ? actionParam : { in: [...SCORE_ACTIONS] },
        createdAt: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        action: true,
        targetId: true,
        before: true,
        after: true,
        ipAddress: true,
        createdAt: true,
        admin: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 400,
    });

    let scopedLogs = rawLogs;
    if (academyId !== null) {
      const examNumbers = Array.from(
        new Set(
          rawLogs
            .map((log) => getExamNumberFromJson(log.targetId, log.after ?? log.before))
            .filter((value) => value && !logIdLike(value)),
        ),
      );

      const visibleStudents = examNumbers.length
        ? await prisma.student.findMany({
            where: { academyId, examNumber: { in: examNumbers } },
            select: { examNumber: true },
          })
        : [];
      const visibleExamNumbers = new Set(visibleStudents.map((student) => student.examNumber));

      scopedLogs = rawLogs.filter((log) => {
        const examNumber = getExamNumberFromJson(log.targetId, log.after ?? log.before);
        return visibleExamNumbers.has(examNumber);
      });
    }

    const filteredLogs = examNumberParam
      ? scopedLogs.filter((log) =>
          getExamNumberFromJson(log.targetId, log.after ?? log.before).includes(examNumberParam),
        )
      : scopedLogs;

    truncated = filteredLogs.length > 200;
    auditLogs = filteredLogs.slice(0, 200);
  } catch (error) {
    dbError = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const todayCount = auditLogs.filter((log) => log.createdAt >= todayStart).length;
  const weekLogs = auditLogs.filter((log) => log.createdAt >= weekStart);
  const weekCount = weekLogs.length;

  const editorCount = new Map<string, { name: string; count: number }>();
  for (const log of weekLogs) {
    const current = editorCount.get(log.admin.id) ?? { name: log.admin.name, count: 0 };
    current.count += 1;
    editorCount.set(log.admin.id, current);
  }
  const topEditor = [...editorCount.values()].sort((a, b) => b.count - a.count)[0] ?? null;

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            아침 모의고사
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">성적 수정 이력</h1>
          <p className="mt-4 max-w-2xl text-sm leading-8 text-slate">
            현재 지점에서 발생한 성적 입력, 수정, 삭제 이력을 조회합니다. 관리자 권한은 `MANAGER` 이상에서만 접근할 수
            있습니다.
          </p>
        </div>
      </div>

      <form method="get" className="mt-8">
        <div className="flex flex-wrap items-end gap-4 rounded-[28px] border border-ink/10 bg-mist p-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">시작 날짜</label>
            <input
              type="date"
              name="from"
              defaultValue={toInputDate(fromDate)}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">종료 날짜</label>
            <input
              type="date"
              name="to"
              defaultValue={toInputDate(toDate)}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">학번</label>
            <input
              type="text"
              name="examNumber"
              defaultValue={examNumberParam ?? ""}
              placeholder="학번 검색"
              className="w-32 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">작업 유형</label>
            <select
              name="action"
              defaultValue={actionParam ?? ""}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="">전체</option>
              {SCORE_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {SCORE_ACTION_LABEL[action]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      {dbError ? (
        <div className="mt-8 rounded-[28px] border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="text-base font-semibold text-amber-700">감사 로그를 불러오지 못했습니다.</p>
          <p className="mt-2 text-sm text-amber-600">감사 로그 테이블 상태나 최근 마이그레이션 여부를 확인해 주세요.</p>
          <p className="mt-4 rounded-xl bg-white p-3 font-mono text-xs text-amber-800">{dbError}</p>
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">오늘 수정 건수</p>
              <p className="mt-3 text-3xl font-bold text-ink">{todayCount}</p>
              <p className="mt-1 text-xs text-slate">오늘 발생한 성적 변경 기록</p>
            </div>
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">최근 7일 건수</p>
              <p className="mt-3 text-3xl font-bold text-forest">{weekCount}</p>
              <p className="mt-1 text-xs text-slate">최신 일주일 기준</p>
            </div>
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">주요 작업자</p>
              {topEditor ? (
                <>
                  <p className="mt-3 text-xl font-bold text-ember">{topEditor.name}</p>
                  <p className="mt-1 text-xs text-slate">최근 7일 {topEditor.count}건 처리</p>
                </>
              ) : (
                <p className="mt-3 text-3xl font-bold text-ink/25">-</p>
              )}
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="border-b border-ink/10 px-6 py-4">
              <h2 className="text-base font-semibold text-ink">성적 수정 이력</h2>
              <p className="text-xs text-slate">
                {formatDate(fromDate)} ~ {formatDate(toDate)} · {auditLogs.length}건{truncated ? " (최대 200건 표시)" : ""}
              </p>
            </div>

            {auditLogs.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-semibold text-slate">표시할 이력이 없습니다.</p>
                <p className="mt-2 text-xs text-slate">선택한 기간과 조건에 맞는 성적 변경 기록이 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-mist">
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">일시</th>
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">담당자</th>
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">학번</th>
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">과목</th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">이전 점수</th>
                      <th className="px-4 py-3 text-right font-semibold text-ink/60">변경 점수</th>
                      <th className="px-4 py-3 text-left font-semibold text-ink/60">메모</th>
                      <th className="px-4 py-3 text-center font-semibold text-ink/60">유형</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {auditLogs.map((log) => {
                      const examNumber = getExamNumberFromJson(log.targetId, log.after ?? log.before);
                      const subjectAfter = getSubjectLabelFromJson(log.after, subjectLabelMap);
                      const subjectBefore = getSubjectLabelFromJson(log.before, subjectLabelMap);
                      const subject = subjectAfter !== "-" ? subjectAfter : subjectBefore;
                      const oldScore = getScoreValue(log.before);
                      const newScore = getScoreValue(log.after);
                      const note = getNoteFromJson(log.after) || getNoteFromJson(log.before);
                      const actionLabel = SCORE_ACTION_LABEL[log.action as ScoreAction] ?? log.action;
                      const isUpdate = log.action === "SCORE_UPDATE" || log.action === "SCORE_BULK_UPDATE";

                      return (
                        <tr key={log.id} className="hover:bg-mist/60">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate">{formatDateTime(log.createdAt)}</td>
                          <td className="px-4 py-3 text-ink">{log.admin.name}</td>
                          <td className="px-4 py-3">
                            <Link href={`/admin/students/${examNumber}`} className="font-mono text-forest hover:underline">
                              {examNumber}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-ink">{subject}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate">{isUpdate ? oldScore : "-"}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-ink">{newScore}</td>
                          <td className="max-w-xs truncate px-4 py-3 text-xs text-slate">{note || "-"}</td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={
                                log.action === "SCORE_DELETE"
                                  ? "inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700"
                                  : log.action === "SCORE_CREATE" || log.action === "SCORE_BULK_CREATE"
                                    ? "inline-flex items-center rounded-full bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest"
                                    : "inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700"
                              }
                            >
                              {actionLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function logIdLike(value: string) {
  return /^\d+$/.test(value);
}



