import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL, EXAM_TYPE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examNumber: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isSubject(value: string): value is Subject {
  return Object.values(Subject).includes(value as Subject);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

const SUB_NAV = [
  { href: "enrollments", label: "수업" },
  { href: "payments", label: "수납" },
  { href: "scores", label: "성적" },
  { href: "attendance", label: "출결" },
] as const;

export default async function StudentWrongNotesPage({ params, searchParams }: PageProps) {
  const { examNumber } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  await requireAdminContext(AdminRole.TEACHER);

  const db = getPrisma();

  // ── 학생 기본 정보 ────────────────────────────────────────────────────────
  const student = await db.student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      examType: true,
      className: true,
      generation: true,
      isActive: true,
    },
  });
  if (!student) notFound();

  // ── 필터 파싱 ─────────────────────────────────────────────────────────────
  const rawSubject = pickFirst(resolvedSearchParams["subject"]);
  const selectedSubject: Subject | null =
    rawSubject && isSubject(rawSubject) ? rawSubject : null;

  const sortBy = pickFirst(resolvedSearchParams["sort"]) ?? "recent"; // "recent" | "subject"

  // ── 오답노트 목록 ─────────────────────────────────────────────────────────
  const wrongNotes = await db.wrongNoteBookmark.findMany({
    where: {
      examNumber,
      ...(selectedSubject
        ? { question: { questionSession: { subject: selectedSubject } } }
        : {}),
    },
    include: {
      question: {
        select: {
          id: true,
          questionNo: true,
          correctAnswer: true,
          correctRate: true,
          difficulty: true,
          questionSession: {
            select: {
              id: true,
              subject: true,
              displaySubjectName: true,
              examType: true,
              examDate: true,
              week: true,
              period: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: sortBy === "subject"
      ? [{ question: { questionSession: { subject: "asc" } } }, { createdAt: "desc" }]
      : [{ createdAt: "desc" }],
  });

  // ── KPI 계산 ──────────────────────────────────────────────────────────────
  const totalCount = wrongNotes.length;

  // 과목별 집계
  const subjectCountMap = new Map<Subject, number>();
  for (const wn of wrongNotes) {
    const subj = wn.question.questionSession.subject;
    subjectCountMap.set(subj, (subjectCountMap.get(subj) ?? 0) + 1);
  }

  const topSubject =
    subjectCountMap.size > 0
      ? Array.from(subjectCountMap.entries()).sort((a, b) => b[1] - a[1])[0]
      : null;

  // 정답률 낮은 문항 (가장 취약)
  const sortedByCorrectRate = [...wrongNotes]
    .filter((wn) => wn.question.correctRate !== null)
    .sort((a, b) => (a.question.correctRate ?? 100) - (b.question.correctRate ?? 100));
  const weakestQuestion = sortedByCorrectRate[0] ?? null;

  // 메모 있는 항목 수
  const withMemoCount = wrongNotes.filter((wn) => wn.memo?.trim()).length;

  // ── 과목 그룹핑 (subject 정렬 뷰용) ──────────────────────────────────────
  type GroupedEntry = {
    subject: Subject;
    displayLabel: string;
    notes: typeof wrongNotes;
  };

  const groupedBySubject: GroupedEntry[] = [];
  if (sortBy === "subject") {
    const groupMap = new Map<Subject, typeof wrongNotes>();
    for (const wn of wrongNotes) {
      const subj = wn.question.questionSession.subject;
      if (!groupMap.has(subj)) groupMap.set(subj, []);
      groupMap.get(subj)!.push(wn);
    }
    for (const [subject, notes] of groupMap.entries()) {
      const displayLabel =
        notes[0]?.question.questionSession.displaySubjectName?.trim() ||
        SUBJECT_LABEL[subject] ||
        subject;
      groupedBySubject.push({ subject, displayLabel, notes });
    }
    groupedBySubject.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel, "ko"));
  }

  // ── 과목 필터 옵션 ────────────────────────────────────────────────────────
  const subjectOptions = Object.values(Subject)
    .filter((s) => s !== Subject.CUMULATIVE)
    .map((s) => ({ value: s, label: SUBJECT_LABEL[s] ?? s }));

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/students/${examNumber}`}
            className="text-sm text-slate transition hover:text-ember"
          >
            ← {student.name} ({examNumber})
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">
            {student.name}
            <span className="ml-3 text-xl font-normal text-slate">{examNumber}</span>
          </h1>
          <p className="mt-1 text-sm text-slate">
            {EXAM_TYPE_LABEL[student.examType]}
            {student.className ? ` · ${student.className}반` : ""}
            {student.generation ? ` · ${student.generation}기` : ""}
            {!student.isActive && (
              <span className="ml-2 inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold">
                비활성
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── 서브 내비게이션 ──────────────────────────────────────────────── */}
      <div className="mt-6 flex gap-1 border-b border-ink/10">
        {SUB_NAV.map((item) => (
          <Link
            key={item.href}
            href={`/admin/students/${examNumber}/${item.href}`}
            className="rounded-t-2xl px-5 py-2.5 text-sm font-semibold text-slate transition hover:text-ink"
          >
            {item.label}
          </Link>
        ))}
        <span className="-mb-px rounded-t-2xl border border-b-white border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink">
          오답노트
        </span>
      </div>

      {/* ── KPI 카드 ─────────────────────────────────────────────────────── */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            총 오답 북마크
          </p>
          <p className="mt-3 text-3xl font-semibold text-ink">{totalCount}</p>
          <p className="mt-1 text-xs text-slate">저장된 문항 수</p>
        </article>

        <article className="rounded-[28px] border border-ember/20 bg-ember/5 p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">
            가장 많은 과목
          </p>
          <p className="mt-3 text-xl font-semibold text-ember">
            {topSubject
              ? (SUBJECT_LABEL[topSubject[0]] ?? topSubject[0])
              : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">
            {topSubject ? `${topSubject[1]}문항` : "데이터 없음"}
          </p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            가장 취약한 문항
          </p>
          {weakestQuestion ? (
            <>
              <p className="mt-3 text-xl font-semibold text-ink">
                {weakestQuestion.question.questionSession.displaySubjectName?.trim() ||
                  (SUBJECT_LABEL[weakestQuestion.question.questionSession.subject] ??
                    weakestQuestion.question.questionSession.subject)}{" "}
                {weakestQuestion.question.questionNo}번
              </p>
              <p className="mt-1 text-xs text-slate">
                정답률{" "}
                {weakestQuestion.question.correctRate !== null
                  ? `${Math.round(weakestQuestion.question.correctRate * 10) / 10}%`
                  : "—"}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-xl font-semibold text-slate">—</p>
              <p className="mt-1 text-xs text-slate">정답률 데이터 없음</p>
            </>
          )}
        </article>

        <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest">
            메모 있는 문항
          </p>
          <p className="mt-3 text-3xl font-semibold text-forest">{withMemoCount}</p>
          <p className="mt-1 text-xs text-slate">
            {totalCount > 0
              ? `전체의 ${Math.round((withMemoCount / totalCount) * 100)}%`
              : "—"}
          </p>
        </article>
      </section>

      {/* ── 필터 & 정렬 ──────────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        {/* 과목 필터 */}
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/students/${examNumber}/wrong-notes${sortBy !== "recent" ? `?sort=${sortBy}` : ""}`}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              selectedSubject === null
                ? "border-ember/30 bg-ember/10 text-ember"
                : "border-ink/10 bg-white text-slate hover:border-ember/20 hover:text-ember"
            }`}
          >
            전체 과목
          </Link>
          {subjectOptions.map((opt) => {
            const isActive = selectedSubject === opt.value;
            const href = `/admin/students/${examNumber}/wrong-notes?subject=${opt.value}${sortBy !== "recent" ? `&sort=${sortBy}` : ""}`;
            return (
              <Link
                key={opt.value}
                href={href}
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "border-ember/30 bg-ember/10 text-ember"
                    : "border-ink/10 bg-white text-slate hover:border-ember/20 hover:text-ember"
                }`}
              >
                {opt.label}
                {subjectCountMap.has(opt.value) && (
                  <span className="ml-1.5 font-normal text-ink/40">
                    {subjectCountMap.get(opt.value)}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* 정렬 */}
        <div className="flex gap-2">
          <Link
            href={`/admin/students/${examNumber}/wrong-notes${selectedSubject ? `?subject=${selectedSubject}` : ""}`}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              sortBy === "recent"
                ? "border-ink/30 bg-ink text-white"
                : "border-ink/10 bg-white text-slate hover:border-ink/30"
            }`}
          >
            최신순
          </Link>
          <Link
            href={`/admin/students/${examNumber}/wrong-notes?sort=subject${selectedSubject ? `&subject=${selectedSubject}` : ""}`}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              sortBy === "subject"
                ? "border-ink/30 bg-ink text-white"
                : "border-ink/10 bg-white text-slate hover:border-ink/30"
            }`}
          >
            과목순
          </Link>
        </div>
      </div>

      {/* ── 오답 목록 ────────────────────────────────────────────────────── */}
      <div className="mt-6">
        {wrongNotes.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-16 text-center">
            <p className="text-sm text-slate">
              {selectedSubject
                ? `${SUBJECT_LABEL[selectedSubject] ?? selectedSubject} 과목의 오답 북마크가 없습니다.`
                : "저장된 오답 북마크가 없습니다."}
            </p>
          </div>
        ) : sortBy === "subject" ? (
          /* ── 과목별 그룹 뷰 ── */
          <div className="space-y-6">
            {groupedBySubject.map((group) => (
              <section
                key={group.subject}
                className="rounded-[28px] border border-ink/10 bg-white shadow-panel"
              >
                {/* 과목 헤더 */}
                <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                      {group.displayLabel}
                    </span>
                    <span className="text-xs text-slate">{group.notes.length}문항</span>
                  </div>
                </div>

                {/* 문항 목록 */}
                <div className="divide-y divide-ink/5">
                  {group.notes.map((wn) => (
                    <WrongNoteRow key={wn.id} wn={wn} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          /* ── 최신순 단일 테이블 ── */
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      시험일
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      기수
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      과목
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      문항 번호
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      정답
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      정답률
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      메모
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      저장일
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {wrongNotes.map((wn) => {
                    const session = wn.question.questionSession;
                    const subjectLabel =
                      session.displaySubjectName?.trim() ||
                      (SUBJECT_LABEL[session.subject] ?? session.subject);
                    const correctRate = wn.question.correctRate;
                    const isVeryLow = correctRate !== null && correctRate < 30;
                    return (
                      <tr key={wn.id} className="transition hover:bg-mist/40">
                        <td className="px-5 py-3 font-mono text-xs text-slate">
                          {formatDate(session.examDate)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate">
                          {session.period.name}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-ink">
                            {subjectLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                          {wn.question.questionNo}번
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-ink">
                          {wn.question.correctAnswer}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {correctRate !== null ? (
                            <span className={isVeryLow ? "font-semibold text-ember" : "text-slate"}>
                              {Math.round(correctRate * 10) / 10}%
                            </span>
                          ) : (
                            <span className="text-ink/25">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {wn.memo?.trim() ? (
                            <span className="text-xs text-slate">{wn.memo.trim()}</span>
                          ) : (
                            <span className="text-ink/20 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate">
                          {formatDate(wn.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── 하단 요약 통계 (과목별 분포) ─────────────────────────────────── */}
      {subjectCountMap.size > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
            과목별 오답 분포
          </h2>
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <div className="space-y-3">
              {Array.from(subjectCountMap.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([subject, count]) => {
                  const pct =
                    totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
                  return (
                    <div key={subject} className="flex items-center gap-4">
                      <Link
                        href={`/admin/students/${examNumber}/wrong-notes?subject=${subject}`}
                        className="w-28 shrink-0 text-sm font-medium text-ink transition hover:text-ember"
                      >
                        {SUBJECT_LABEL[subject] ?? subject}
                      </Link>
                      <div className="flex-1 overflow-hidden rounded-full bg-ink/5">
                        <div
                          className="h-5 rounded-full bg-ember/50 transition-all"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                      <div className="w-24 shrink-0 text-right text-xs text-slate">
                        <span className="font-semibold text-ink">{count}문항</span>
                        {" "}({pct}%)
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
      )}

      {/* ── 하단 액션 ────────────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/admin/students/${examNumber}/score-trend`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-forest/40 hover:text-forest"
        >
          성적 추이
        </Link>
        <Link
          href={`/admin/students/${examNumber}/scores`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/40 hover:bg-ink/5"
        >
          성적 이력
        </Link>
        <Link
          href={`/admin/wrong-notes`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-slate transition hover:border-ink/30"
        >
          전체 오답 집계
        </Link>
        <Link
          href={`/admin/students/${examNumber}`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-slate transition hover:border-ink/30"
        >
          ← 학생 상세
        </Link>
      </div>
    </div>
  );
}

// ── Sub-component: WrongNoteRow ───────────────────────────────────────────────

function WrongNoteRow({
  wn,
}: {
  wn: {
    id: number;
    memo: string | null;
    createdAt: Date;
    question: {
      id: number;
      questionNo: number;
      correctAnswer: string;
      correctRate: number | null;
      difficulty: string | null;
      questionSession: {
        id: number;
        subject: Subject;
        displaySubjectName: string | null;
        examType: string;
        examDate: Date;
        week: number;
        period: { id: number; name: string };
      };
    };
  };
}) {
  const session = wn.question.questionSession;
  const correctRate = wn.question.correctRate;
  const isVeryLow = correctRate !== null && correctRate < 30;

  return (
    <div className="flex items-start gap-4 px-6 py-4">
      {/* 문항 번호 배지 */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-mist text-sm font-bold text-ink">
        {wn.question.questionNo}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-slate">
            {session.examDate.getFullYear()}년 {session.examDate.getMonth() + 1}월{" "}
            {session.examDate.getDate()}일
          </span>
          <span className="text-xs text-slate">{session.period.name} · {session.week}주차</span>
          {wn.question.difficulty && (
            <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[10px] font-semibold text-slate">
              {wn.question.difficulty}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-ink">
            정답: {wn.question.correctAnswer}
          </span>
          {correctRate !== null && (
            <span
              className={`text-xs font-semibold ${isVeryLow ? "text-ember" : "text-slate"}`}
            >
              정답률 {Math.round(correctRate * 10) / 10}%
              {isVeryLow && (
                <span className="ml-1 inline-flex rounded-full bg-ember/10 px-1.5 py-0.5 text-[10px] text-ember">
                  고난도
                </span>
              )}
            </span>
          )}
        </div>

        {wn.memo?.trim() && (
          <p className="mt-2 rounded-lg bg-mist/80 px-3 py-2 text-xs text-slate">
            {wn.memo.trim()}
          </p>
        )}
      </div>

      <time className="shrink-0 text-xs text-slate">
        {wn.createdAt.toLocaleDateString("ko-KR")}
      </time>
    </div>
  );
}
