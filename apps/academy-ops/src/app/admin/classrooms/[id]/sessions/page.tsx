import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Subject display map ──────────────────────────────────────────────────────

const SUBJECT_LABELS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  POLICE_SCIENCE: "경찰학",
  CUMULATIVE: "누적",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ClassroomSessionsPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.TEACHER);

  const { id } = params;
  const prisma = getPrisma();

  // Fetch classroom with students
  const classroom = await prisma.classroom.findUnique({
    where: { id },
    include: {
      teacher: { select: { name: true } },
      students: {
        select: { examNumber: true },
      },
    },
  });

  if (!classroom) notFound();

  const examNumbers = classroom.students.map((s) => s.examNumber);

  if (examNumbers.length === 0) {
    return (
      <div className="p-8 sm:p-10">
        <BackLink id={id} name={classroom.name} />
        <Badge />
        <h1 className="mt-5 text-3xl font-semibold text-ink">{classroom.name} — 시험 회차</h1>
        <p className="mt-4 text-sm text-slate">이 반에 등록된 학생이 없습니다.</p>
      </div>
    );
  }

  // Find all ExamSessions that have Score records for these students
  const scores = await prisma.score.findMany({
    where: { examNumber: { in: examNumbers } },
    select: {
      sessionId: true,
      examNumber: true,
      finalScore: true,
      attendType: true,
    },
  });

  // Collect unique session IDs
  const sessionIds = Array.from(new Set(scores.map((s) => s.sessionId)));

  if (sessionIds.length === 0) {
    return (
      <div className="p-8 sm:p-10">
        <BackLink id={id} name={classroom.name} />
        <Badge />
        <h1 className="mt-5 text-3xl font-semibold text-ink">{classroom.name} — 시험 회차</h1>
        <p className="mt-4 text-sm text-slate">이 반에 성적 데이터가 없습니다.</p>
      </div>
    );
  }

  // Fetch session details
  const sessions = await prisma.examSession.findMany({
    where: { id: { in: sessionIds } },
    select: {
      id: true,
      week: true,
      subject: true,
      displaySubjectName: true,
      examDate: true,
      examType: true,
      isCancelled: true,
      period: { select: { name: true } },
    },
    orderBy: [{ examDate: "desc" }, { subject: "asc" }],
  });

  // Group scores by sessionId
  const scoresBySession = new Map<number, typeof scores>();
  for (const sc of scores) {
    const arr = scoresBySession.get(sc.sessionId) ?? [];
    arr.push(sc);
    scoresBySession.set(sc.sessionId, arr);
  }

  // Build per-session stats
  const sessionRows = sessions.map((sess) => {
    const sessScores = scoresBySession.get(sess.id) ?? [];
    const totalInClass = examNumbers.length;
    const present = sessScores.filter(
      (s) => s.attendType === "NORMAL" || s.attendType === "LIVE",
    ).length;
    const absent = sessScores.filter(
      (s) => s.attendType === "ABSENT",
    ).length;
    const excused = sessScores.filter(
      (s) => s.attendType === "EXCUSED",
    ).length;

    const scoredList = sessScores
      .map((s) => s.finalScore)
      .filter((v): v is number => v !== null && v !== undefined);
    const avgScore =
      scoredList.length > 0
        ? scoredList.reduce((a, b) => a + b, 0) / scoredList.length
        : null;

    const attendanceRate = totalInClass > 0 ? present / totalInClass : 0;

    return {
      id: sess.id,
      week: sess.week,
      subject: sess.subject,
      displaySubjectName: sess.displaySubjectName,
      examDate: sess.examDate,
      examType: sess.examType,
      isCancelled: sess.isCancelled,
      periodName: sess.period.name,
      totalInClass,
      present,
      absent,
      excused,
      attendanceRate,
      avgScore,
    };
  });

  // KPI aggregates
  const totalSessions = sessionRows.length;
  const nonCancelled = sessionRows.filter((s) => !s.isCancelled);
  const avgAttendance =
    nonCancelled.length > 0
      ? nonCancelled.reduce((s, r) => s + r.attendanceRate, 0) / nonCancelled.length
      : null;
  const scoredSessions = nonCancelled.filter((s) => s.avgScore !== null);
  const avgScore =
    scoredSessions.length > 0
      ? scoredSessions.reduce((s, r) => s + (r.avgScore ?? 0), 0) / scoredSessions.length
      : null;

  // Count distinct periods (exam periods this classroom participates in)
  const distinctPeriods = new Set(sessionRows.map((s) => s.periodName)).size;

  return (
    <div className="p-8 sm:p-10">
      <BackLink id={id} name={classroom.name} />
      <Badge />
      <h1 className="mt-5 text-3xl font-semibold text-ink">{classroom.name} — 시험 회차</h1>
      <p className="mt-2 text-sm text-slate">
        담임: {classroom.teacher.name}
        {classroom.generation != null && ` · ${classroom.generation}기`}
        {" · "}재적 {examNumbers.length}명
      </p>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="총 시험 회차" value={totalSessions} unit="회" />
        <KpiCard
          label="평균 출석률"
          value={avgAttendance !== null ? Math.round(avgAttendance * 100) : null}
          unit="%"
        />
        <KpiCard
          label="평균 점수"
          value={avgScore !== null ? Math.round(avgScore * 10) / 10 : null}
          unit="점"
          decimals={1}
        />
        <KpiCard label="참여 기수" value={distinctPeriods} unit="개" />
      </div>

      {/* Sessions table */}
      <div className="mt-8 overflow-x-auto rounded-[20px] border border-ink/10 bg-white">
        <table className="min-w-full divide-y divide-ink/5 text-sm">
          <thead className="bg-mist">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate">날짜</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate">회차</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate">과목</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate">기간</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate">출석</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate">결석</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate">공결</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate">출석률</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate">평균점수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {sessionRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate">
                  시험 회차 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              sessionRows.map((s) => (
                <tr
                  key={s.id}
                  className={`transition-colors hover:bg-mist/50 ${s.isCancelled ? "opacity-40" : ""}`}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-ink">
                    {s.examDate.toLocaleDateString("ko-KR", {
                      year: "2-digit",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-3 text-slate">
                    <Link
                      href={`/admin/scores/sessions/${s.id}`}
                      className="hover:text-ember font-medium"
                    >
                      {s.week}회차
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-ink">
                    {s.displaySubjectName ?? SUBJECT_LABELS[s.subject] ?? s.subject}
                    {s.isCancelled && (
                      <span className="ml-2 rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] text-slate">
                        취소
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate">{s.periodName}</td>
                  <td className="px-3 py-3 text-center text-forest font-semibold">
                    {s.present}
                  </td>
                  <td className="px-3 py-3 text-center text-red-500 font-semibold">
                    {s.absent}
                  </td>
                  <td className="px-3 py-3 text-center text-amber-600 font-semibold">
                    {s.excused}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {s.isCancelled ? (
                      <span className="text-xs text-slate/40">-</span>
                    ) : (
                      <AttendBadge rate={s.attendanceRate} />
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-xs font-semibold text-ink">
                    {s.avgScore !== null ? `${Math.round(s.avgScore * 10) / 10}점` : (
                      <span className="text-slate/40">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BackLink({ id, name }: { id: string; name: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Link
        href={`/admin/classrooms/${id}`}
        className="text-sm text-slate hover:text-ink"
      >
        ← {name}
      </Link>
    </div>
  );
}

function Badge() {
  return (
    <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
      담임반 · 시험 회차
    </div>
  );
}

function KpiCard({
  label,
  value,
  unit,
  decimals = 0,
}: {
  label: string;
  value: number | null;
  unit: string;
  decimals?: number;
}) {
  return (
    <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-4">
      <p className="text-xs font-medium text-slate">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">
        {value === null ? (
          <span className="text-base text-slate/40">-</span>
        ) : (
          <>
            {decimals > 0 ? value.toFixed(decimals) : value.toLocaleString()}
            <span className="ml-1 text-sm font-normal text-slate">{unit}</span>
          </>
        )}
      </p>
    </div>
  );
}

function AttendBadge({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const colorClass =
    pct >= 90 ? "text-forest font-semibold" : pct >= 70 ? "text-amber-600" : "text-red-600";
  return <span className={`text-xs ${colorClass}`}>{pct}%</span>;
}
