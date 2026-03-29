import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { SUBJECT_LABEL, EXAM_TYPE_LABEL, ROLE_LABEL, getSubjectDisplayLabel } from "@/lib/constants";
import { buildScoreEditHref } from "@/lib/scores/correction-links";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

// Actions considered score-related edits
const SCORE_ACTIONS = [
  "SCORE_UPDATE",
  "SCORE_DELETE",
  "SCORE_BULK_UPDATE",
  "SCORE_SESSION_DELETE",
];

type ParsedLog = {
  id: number;
  createdAt: Date;
  action: string;
  adminName: string;
  adminRole: string;
  targetId: string;
  before: unknown;
  after: unknown;
  // derived
  sessionLabel: string | null;
  sessionId: number | null;
  originalScore: number | null;
  newScore: number | null;
  delta: number | null;
  note: string | null;
};

function extractScore(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  return null;
}

function extractString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

function extractNumber(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

export default async function StudentScoreChangeHistoryPage({ params }: PageProps) {
  const { examNumber } = await params;

  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();

  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      isActive: true,
    },
  });

  if (!student) notFound();

  // Fetch all score records for this student to get their IDs
  const scores = await prisma.score.findMany({
    where: { examNumber },
    select: {
      id: true,
      sessionId: true,
      session: {
        select: {
          id: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          examType: true,
          week: true,
        },
      },
    },
  });

  // Build a map: scoreId -> session info
  const scoreSessionMap = new Map(
    scores.map((s) => [
      String(s.id),
      {
        sessionId: s.sessionId,
        label: `${format(s.session.examDate, "MM/dd(E)", { locale: ko })} ${getSubjectDisplayLabel(s.session.subject, s.session.displaySubjectName)}`,
        sessionLink: `/admin/scores/sessions/${s.session.id}`,
      },
    ]),
  );

  const scoreIds = scores.map((s) => String(s.id));

  // Fetch audit logs related to these score IDs or the student's examNumber
  // Strategy: targetType=Score with targetId in scoreIds, OR targetType=Student+SCORE_* actions
  let logs: Array<{
    id: number;
    action: string;
    targetType: string;
    targetId: string;
    before: unknown;
    after: unknown;
    createdAt: Date;
    admin: { name: string; role: AdminRole };
  }> = [];

  if (scoreIds.length > 0) {
    const byScoreId = await prisma.auditLog.findMany({
      where: {
        action: { in: SCORE_ACTIONS },
        targetType: "Score",
        targetId: { in: scoreIds },
      },
      include: {
        admin: { select: { name: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    logs.push(...byScoreId);
  }

  // Also check logs where examNumber appears in the targetId or after/before JSON
  // (bulk updates often store examNumber as targetId)
  const byExamNumber = await prisma.auditLog.findMany({
    where: {
      action: { in: SCORE_ACTIONS },
      targetId: { contains: examNumber },
    },
    include: {
      admin: { select: { name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Merge, deduplicate by id
  const seenIds = new Set(logs.map((l) => l.id));
  for (const l of byExamNumber) {
    if (!seenIds.has(l.id)) {
      logs.push(l);
      seenIds.add(l.id);
    }
  }

  // Sort by createdAt desc
  logs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Parse logs into structured rows
  const parsedLogs: ParsedLog[] = logs.map((log) => {
    const sessionInfo = scoreSessionMap.get(log.targetId) ?? null;
    const sessionId = sessionInfo?.sessionId ?? null;
    const sessionLabel = sessionInfo?.label ?? null;

    const originalScore =
      extractScore(log.before, "finalScore") ??
      extractScore(log.before, "rawScore") ??
      null;
    const newScore =
      extractScore(log.after, "finalScore") ??
      extractScore(log.after, "rawScore") ??
      null;
    const delta =
      originalScore !== null && newScore !== null
        ? Math.round((newScore - originalScore) * 10) / 10
        : null;

    const note =
      extractString(log.after, "note") ??
      extractString(log.before, "note") ??
      null;

    return {
      id: log.id,
      createdAt: log.createdAt,
      action: log.action,
      adminName: log.admin.name,
      adminRole: ROLE_LABEL[log.admin.role] ?? log.admin.role,
      targetId: log.targetId,
      before: log.before,
      after: log.after,
      sessionLabel,
      sessionId,
      originalScore,
      newScore,
      delta,
      note,
    };
  });

  // ── KPI calculations ──────────────────────────────────────────────────────
  const editSessionIds = Array.from(
    new Set(
      parsedLogs
        .map((log) => log.sessionId)
        .filter((value): value is number => value !== null),
    ),
  );
  const defaultEditHref = buildScoreEditHref({
    examNumber,
    sessionId: editSessionIds.length === 1 ? editSessionIds[0] : null,
  });
  const totalCount = parsedLogs.length;

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthCount = parsedLogs.filter(
    (l) => l.createdAt >= thisMonthStart,
  ).length;

  // Most active editor
  const editorMap = new Map<string, number>();
  for (const l of parsedLogs) {
    editorMap.set(l.adminName, (editorMap.get(l.adminName) ?? 0) + 1);
  }
  let topEditor = "-";
  let topEditorCount = 0;
  for (const [name, cnt] of editorMap.entries()) {
    if (cnt > topEditorCount) {
      topEditorCount = cnt;
      topEditor = name;
    }
  }

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "학생 목록", href: "/admin/students" },
          { label: `${student.name} (${examNumber})`, href: `/admin/students/${examNumber}` },
          { label: "성적 이력", href: `/admin/students/${examNumber}/scores` },
          { label: "수정 이력" },
        ]}
      />

      {/* ── 헤더 ─────────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/students/${examNumber}/scores`}
            className="text-sm text-slate transition hover:text-ember"
          >
            ← 성적 이력으로
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">
            {student.name}
            <span className="ml-3 text-xl font-normal text-slate">{examNumber}</span>
          </h1>
          <p className="mt-1 text-sm text-slate">성적 수정 이력</p>
        </div>
        <div className="flex items-center gap-2 mt-5">
          <Link
            href={`/admin/students/${examNumber}`}
            className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
          >
            학생 프로필
          </Link>
          <Link
            href={defaultEditHref}
            className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10"
          >
            성적 수정
          </Link>
        </div>
      </div>

      {/* ── KPI 카드 ─────────────────────────────────────────────────────── */}
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            총 수정 건수
          </p>
          <p className="mt-3 text-3xl font-semibold text-ink">{totalCount}</p>
          <p className="mt-1 text-xs text-slate">전체 기간 성적 수정</p>
        </article>

        <article
          className={`rounded-[28px] border p-6 shadow-panel ${
            thisMonthCount > 0
              ? "border-amber-200 bg-amber-50/50"
              : "border-ink/10 bg-white"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-[0.18em] ${
              thisMonthCount > 0 ? "text-amber-700" : "text-slate"
            }`}
          >
            이번달 수정
          </p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              thisMonthCount > 0 ? "text-amber-700" : "text-ink"
            }`}
          >
            {thisMonthCount}
          </p>
          <p className="mt-1 text-xs text-slate">
            {format(now, "yyyy년 M월")} 기준
          </p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            가장 많이 수정한 직원
          </p>
          <p className="mt-3 text-xl font-semibold text-ink truncate">
            {topEditor}
          </p>
          <p className="mt-1 text-xs text-slate">
            {topEditorCount > 0 ? `총 ${topEditorCount}건` : "기록 없음"}
          </p>
        </article>
      </section>

      {/* ── 수정 이력 테이블 ─────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          수정 이력
        </h2>

        {parsedLogs.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-sm text-slate">
            성적 수정 이력이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/60">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate whitespace-nowrap">
                    일시
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                    세션 (과목·날짜)
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate whitespace-nowrap">
                    기존 점수
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate whitespace-nowrap">
                    수정 점수
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate whitespace-nowrap">
                    변화
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate whitespace-nowrap">
                    처리 직원
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                    비고
                  </th>
                  <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate whitespace-nowrap">
                    감사 로그
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {parsedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-mist/40 transition">
                    {/* 일시 */}
                    <td className="px-5 py-3.5 align-top whitespace-nowrap">
                      <p className="font-medium text-ink text-xs">
                        {format(log.createdAt, "yyyy-MM-dd(E)", { locale: ko })}
                      </p>
                      <p className="text-[10px] text-slate">
                        {format(log.createdAt, "HH:mm")}
                      </p>
                    </td>
                    {/* 세션 */}
                    <td className="px-4 py-3.5 align-top">
                      {log.sessionId ? (
                        <>
                          <Link
                            href={`/admin/scores/sessions/${log.sessionId}`}
                            className="text-xs font-medium text-ember underline-offset-2 hover:underline"
                          >
                            {log.sessionLabel ?? `세션 #${log.sessionId}`}
                          </Link>
                          <div className="mt-1">
                            <Link
                              href={buildScoreEditHref({ examNumber, sessionId: log.sessionId })}
                              className="text-[10px] font-semibold text-forest underline-offset-2 hover:underline"
                            >
                              이 회차 수정
                            </Link>
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-slate">
                          {log.sessionLabel ?? `대상 ID: ${log.targetId}`}
                        </span>
                      )}
                      <p className="text-[10px] text-slate/60 mt-0.5">{log.action}</p>
                    </td>
                    {/* 기존 점수 */}
                    <td className="px-4 py-3.5 text-center align-top">
                      {log.originalScore !== null ? (
                        <span className="font-mono text-sm text-slate">
                          {log.originalScore}
                        </span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    {/* 수정 점수 */}
                    <td className="px-4 py-3.5 text-center align-top">
                      {log.newScore !== null ? (
                        <span className="font-mono text-sm font-semibold text-ink">
                          {log.newScore}
                        </span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    {/* 변화 */}
                    <td className="px-4 py-3.5 text-center align-top">
                      {log.delta !== null ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            log.delta > 0
                              ? "bg-emerald-50 text-emerald-700"
                              : log.delta < 0
                                ? "bg-red-50 text-red-600"
                                : "bg-ink/5 text-slate"
                          }`}
                        >
                          {log.delta > 0 ? `+${log.delta}` : String(log.delta)}
                        </span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    {/* 처리 직원 */}
                    <td className="px-4 py-3.5 align-top whitespace-nowrap">
                      <p className="text-xs font-medium text-ink">{log.adminName}</p>
                      <p className="text-[10px] text-slate">{log.adminRole}</p>
                    </td>
                    {/* 비고 */}
                    <td className="px-4 py-3.5 align-top max-w-[160px]">
                      <p className="text-xs text-slate truncate">
                        {log.note ?? "—"}
                      </p>
                    </td>
                    {/* 감사 로그 링크 */}
                    <td className="px-4 py-3.5 text-right align-top">
                      <Link
                        href={`/admin/audit-logs/${log.id}`}
                        className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
                      >
                        상세
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
