import Link from "next/link";
import { AdminRole, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams;
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isSubject(value: string): value is Subject {
  return Object.values(Subject).includes(value as Subject);
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

export default async function AdminWrongNotesPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const rawSubject = pickFirst(searchParams?.["subject"]);
  const selectedSubject: Subject | null =
    rawSubject && isSubject(rawSubject) ? rawSubject : null;

  const db = getPrisma();

  // ── Top 20 most bookmarked problems ───────────────────────────────────────
  // Aggregate wrongNoteBookmarks grouped by questionId
  const topBookmarkedRaw = await db.wrongNoteBookmark.groupBy({
    by: ["questionId"],
    where: selectedSubject
      ? {
          question: {
            questionSession: { subject: selectedSubject },
          },
        }
      : undefined,
    _count: { questionId: true },
    orderBy: { _count: { questionId: "desc" } },
    take: 20,
  });

  // Fetch question details for those top bookmarked
  const topQuestionIds = topBookmarkedRaw.map((r) => r.questionId);
  const topQuestions = await db.examQuestion.findMany({
    where: { id: { in: topQuestionIds } },
    include: {
      questionSession: {
        select: {
          id: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          week: true,
          examType: true,
          period: { select: { name: true } },
        },
      },
    },
  });

  type TopProblem = {
    questionId: number;
    questionNo: number;
    bookmarkCount: number;
    subject: Subject;
    subjectLabel: string;
    examDate: Date;
    sessionId: number;
    periodName: string;
    correctRate: number | null;
  };

  const topProblems: TopProblem[] = topBookmarkedRaw.map((r) => {
    const q = topQuestions.find((tq) => tq.id === r.questionId);
    return {
      questionId: r.questionId,
      questionNo: q?.questionNo ?? 0,
      bookmarkCount: r._count.questionId,
      subject: q?.questionSession.subject ?? Subject.CONSTITUTIONAL_LAW,
      subjectLabel:
        q?.questionSession.displaySubjectName?.trim() ||
        SUBJECT_LABEL[q?.questionSession.subject ?? Subject.CONSTITUTIONAL_LAW],
      examDate: q?.questionSession.examDate ?? new Date(0),
      sessionId: q?.questionSession.id ?? 0,
      periodName: q?.questionSession.period?.name ?? "",
      correctRate: q?.correctRate ?? null,
    };
  });

  // Sort by bookmark count desc (already sorted from groupBy)
  topProblems.sort((a, b) => b.bookmarkCount - a.bookmarkCount);

  // ── Group by subject: total wrong note entries per subject ────────────────
  const subjectGroupRaw = await db.wrongNoteBookmark.groupBy({
    by: ["questionId"],
    _count: { questionId: true },
  });

  // We need subject for each questionId — fetch all unique questionIds and their subjects
  const allQuestionIds = [...new Set(subjectGroupRaw.map((r) => r.questionId))];
  const allQuestionsForSubject = await db.examQuestion.findMany({
    where: { id: { in: allQuestionIds } },
    select: {
      id: true,
      questionSession: {
        select: { subject: true, displaySubjectName: true },
      },
    },
  });

  const questionSubjectMap = new Map<number, Subject>();
  for (const q of allQuestionsForSubject) {
    questionSubjectMap.set(q.id, q.questionSession.subject);
  }

  const subjectCountMap = new Map<Subject, number>();
  for (const r of subjectGroupRaw) {
    const subj = questionSubjectMap.get(r.questionId);
    if (!subj) continue;
    subjectCountMap.set(subj, (subjectCountMap.get(subj) ?? 0) + r._count.questionId);
  }

  type SubjectGroup = { subject: Subject; label: string; count: number };
  const subjectGroups: SubjectGroup[] = Array.from(subjectCountMap.entries())
    .map(([subject, count]) => ({
      subject,
      label: SUBJECT_LABEL[subject] ?? subject,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const totalWrongNoteCount = subjectGroups.reduce((acc, s) => acc + s.count, 0);

  // ── Top 20 students by wrong note count ───────────────────────────────────
  const studentGroupRaw = await db.wrongNoteBookmark.groupBy({
    by: ["examNumber"],
    where: selectedSubject
      ? {
          question: {
            questionSession: { subject: selectedSubject },
          },
        }
      : undefined,
    _count: { examNumber: true },
    orderBy: { _count: { examNumber: "desc" } },
    take: 20,
  });

  const topStudentNumbers = studentGroupRaw.map((r) => r.examNumber);
  const topStudents = await db.student.findMany({
    where: { examNumber: { in: topStudentNumbers } },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      examType: true,
      className: true,
    },
  });

  type StudentEntry = {
    examNumber: string;
    name: string;
    mobile: string | null;
    examType: string;
    className: string | null;
    wrongNoteCount: number;
  };

  const studentEntries: StudentEntry[] = studentGroupRaw.map((r) => {
    const s = topStudents.find((ts) => ts.examNumber === r.examNumber);
    return {
      examNumber: r.examNumber,
      name: s?.name ?? r.examNumber,
      mobile: s?.phone ?? null,
      examType: s?.examType ?? "",
      className: s?.className ?? null,
      wrongNoteCount: r._count.examNumber,
    };
  });

  studentEntries.sort((a, b) => b.wrongNoteCount - a.wrongNoteCount);

  // ── Subject filter links ──────────────────────────────────────────────────
  const subjectFilterOptions = [
    { value: "", label: "전체 과목" },
    ...Object.values(Subject)
      .filter((s) => s !== Subject.CUMULATIVE)
      .map((s) => ({ value: s, label: SUBJECT_LABEL[s] ?? s })),
  ];

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ────────────────────────────────────────────────────────── */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        오답 노트 분석
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">오답 노트 집계</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학생들이 북마크한 오답 문항을 집계하여 취약 문항·과목·학생을 파악합니다.
      </p>

      {/* ── 과목 필터 ────────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap gap-2">
        {subjectFilterOptions.map((opt) => {
          const isActive = (selectedSubject ?? "") === opt.value;
          const href =
            opt.value === ""
              ? "/admin/wrong-notes"
              : `/admin/wrong-notes?subject=${opt.value}`;
          return (
            <Link
              key={opt.value}
              href={href}
              className={`inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? "border-ember/30 bg-ember/10 text-ember"
                  : "border-ink/10 bg-white text-slate hover:border-ember/20 hover:text-ember"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      {/* ── KPI 요약 ─────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              총 오답 북마크
            </p>
            <p className="mt-3 text-3xl font-semibold text-ink">{totalWrongNoteCount}</p>
            <p className="mt-1 text-xs text-slate">전체 학생 누적</p>
          </article>

          <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest">
              오답이 있는 과목
            </p>
            <p className="mt-3 text-3xl font-semibold text-forest">{subjectGroups.length}</p>
            <p className="mt-1 text-xs text-slate">북마크된 과목 수</p>
          </article>

          <article className="rounded-[28px] border border-ember/20 bg-ember/5 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">
              취약 과목 1위
            </p>
            <p className="mt-3 text-xl font-semibold text-ember">
              {subjectGroups[0]?.label ?? "—"}
            </p>
            <p className="mt-1 text-xs text-slate">
              {subjectGroups[0] ? `${subjectGroups[0].count}건` : "데이터 없음"}
            </p>
          </article>

          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
              가장 많이 북마크된 문항
            </p>
            <p className="mt-3 text-xl font-semibold text-ink">
              {topProblems[0]
                ? `${topProblems[0].subjectLabel} ${topProblems[0].questionNo}번`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-slate">
              {topProblems[0] ? `${topProblems[0].bookmarkCount}명 북마크` : "데이터 없음"}
            </p>
          </article>
        </div>
      </section>

      {/* ── 과목별 오답 현황 ─────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          과목별 오답 현황
        </h2>
        {subjectGroups.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            과목별 오답 데이터가 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      과목
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      북마크 수
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      비중
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      필터
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {subjectGroups.map((sg, idx) => {
                    const ratio =
                      totalWrongNoteCount > 0
                        ? Math.round((sg.count / totalWrongNoteCount) * 100)
                        : 0;
                    return (
                      <tr key={sg.subject} className="transition hover:bg-mist/60">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            {idx === 0 && (
                              <span className="rounded-full bg-ember/10 px-1.5 py-0.5 text-[10px] font-bold text-ember">
                                1위
                              </span>
                            )}
                            <span className="font-medium text-ink">{sg.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                          {sg.count}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/10">
                              <div
                                className="h-full rounded-full bg-ember"
                                style={{ width: `${ratio}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate">{ratio}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/wrong-notes?subject=${sg.subject}`}
                            className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
                          >
                            필터
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Top 20 가장 많이 북마크된 문항 ──────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          가장 많이 북마크된 문항 Top 20
          {selectedSubject && (
            <span className="ml-2 font-normal text-ember">
              — {SUBJECT_LABEL[selectedSubject] ?? selectedSubject} 필터 적용
            </span>
          )}
        </h2>
        {topProblems.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            해당 조건의 오답 북마크 데이터가 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      순위
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      과목
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      문항 번호
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      시험일
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      기수
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      정답률
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      북마크 수
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {topProblems.map((problem, idx) => (
                    <tr key={problem.questionId} className="transition hover:bg-mist/60">
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            idx === 0
                              ? "bg-amber-400 text-white"
                              : idx === 1
                                ? "bg-slate-300 text-white"
                                : idx === 2
                                  ? "bg-amber-600 text-white"
                                  : "bg-ink/5 text-slate"
                          }`}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-ink">
                          {problem.subjectLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-ink">
                        {problem.questionNo}번
                      </td>
                      <td className="px-4 py-3 text-slate">
                        {formatDate(problem.examDate)}
                      </td>
                      <td className="px-4 py-3 text-slate">{problem.periodName}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
                        {problem.correctRate !== null
                          ? `${Math.round(problem.correctRate * 10) / 10}%`
                          : <span className="text-ink/25">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center rounded-full bg-ember/10 px-2.5 py-0.5 text-xs font-bold text-ember">
                          {problem.bookmarkCount}명
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Top 20 오답이 많은 학생 ───────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          오답 북마크 많은 학생 Top 20
          {selectedSubject && (
            <span className="ml-2 font-normal text-ember">
              — {SUBJECT_LABEL[selectedSubject] ?? selectedSubject} 필터 적용
            </span>
          )}
        </h2>
        {studentEntries.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            해당 조건의 학생 오답 데이터가 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      순위
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      학번
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      이름
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      반
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      오답 북마크 수
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                      상세
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {studentEntries.map((entry, idx) => (
                    <tr key={entry.examNumber} className="transition hover:bg-mist/60">
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            idx === 0
                              ? "bg-amber-400 text-white"
                              : idx === 1
                                ? "bg-slate-300 text-white"
                                : idx === 2
                                  ? "bg-amber-600 text-white"
                                  : "bg-ink/5 text-slate"
                          }`}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate">{entry.examNumber}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/students/${entry.examNumber}`}
                          className="font-semibold text-ink transition hover:text-ember hover:underline"
                        >
                          {entry.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate">
                        {entry.className ?? <span className="text-ink/25">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center rounded-full bg-ember/10 px-2.5 py-0.5 text-xs font-bold text-ember">
                          {entry.wrongNoteCount}문항
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/students/${entry.examNumber}/wrong-notes`}
                            className="inline-flex items-center rounded-full border border-ember/30 bg-ember/5 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/15"
                          >
                            오답 상세
                          </Link>
                          <Link
                            href={`/admin/students/${entry.examNumber}`}
                            className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
                          >
                            학생 상세
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
