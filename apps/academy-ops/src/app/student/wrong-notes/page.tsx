import Link from "next/link";
import { Subject } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { WrongNoteManager } from "@/components/student-portal/wrong-note-manager";
import { PrintButton } from "@/components/student-portal/print-button";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { getStudentPortalViewer, listStudentWrongNotes } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

/** Format ISO date as YYYY.MM.DD */
function fmtDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export default async function StudentWrongNotesPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Wrong Notes Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              오답 노트는 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 학생 답안과 오답 노트 데이터를 불러올 데이터베이스가
              연결되어 있지 않습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학생 포털로 이동
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const student = await getStudentPortalViewer();

  if (!student) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              오답 노트
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              오답 노트
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              오답 노트는 본인 조회가 완료된 뒤에만 열 수 있습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학생 포털로 이동
              </Link>
            </div>
          </section>

          <StudentLookupForm redirectPath="/student/scores/wrong-questions" />
        </div>
      </main>
    );
  }

  const notes = await listStudentWrongNotes({
    examNumber: student.examNumber,
  });
  const branding = await getAcademyRuntimeBranding(student.academyId ?? undefined);

  // 과목별 오답 수 집계
  const subjectCounts = notes.reduce<Partial<Record<Subject, number>>>((acc, note) => {
    acc[note.subject] = (acc[note.subject] ?? 0) + 1;
    return acc;
  }, {});

  const subjectSummary = Object.entries(subjectCounts)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([subject, count]) => ({
      subject: subject as Subject,
      count: count ?? 0,
      label: SUBJECT_LABEL[subject as Subject] ?? subject,
    }));

  // 메모가 있는 노트 수
  const notesWithMemo = notes.filter((note) => note.memo && note.memo.trim()).length;

  // Build grouped data for print layout: subject → notes sorted by repeat count desc
  // Count how many times each questionId appears across all notes
  const questionRepeatMap: Record<number, number> = {};
  for (const n of notes) {
    questionRepeatMap[n.questionId] = (questionRepeatMap[n.questionId] ?? 0) + 1;
  }

  // Group notes by subject, sorted by subject total count desc
  const printGroups = subjectSummary.map(({ subject, label }) => {
    const subjectNotes = notes
      .filter((n) => n.subject === subject)
      .slice()
      .sort((a, b) => (questionRepeatMap[b.questionId] ?? 1) - (questionRepeatMap[a.questionId] ?? 1));
    return { subject, label, subjectNotes };
  });

  const printDate = fmtDate(new Date());

  const mappedNotes = notes.map((note) => ({
    id: note.id,
    questionId: note.questionId,
    memo: note.memo,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    examDate: note.examDate.toISOString(),
    subject: note.subject,
    sessionId: note.sessionId,
    questionNo: note.questionNo,
    correctAnswer: note.correctAnswer,
    correctRate: note.correctRate,
    difficulty: note.difficulty,
    studentAnswer: note.studentAnswer,
  }));

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      {/* ── Print-only layout ─────────────────────────────────────────────────── */}
      {/* Hidden on screen, shown only when window.print() is called */}
      <div className="hidden print:block">
        {/* Print header */}
        <div
          style={{
            borderBottom: "2pt solid #1F4D3A",
            paddingBottom: "8pt",
            marginBottom: "12pt",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div>
            <div style={{ fontSize: "8pt", color: "#4B5563", marginBottom: "3pt" }}>
              {branding.academyName}
            </div>
            <div style={{ fontSize: "14pt", fontWeight: "700", color: "#111827" }}>
              {student.examNumber} {student.name}의 오답 노트
            </div>
          </div>
          <div style={{ fontSize: "8pt", color: "#4B5563", textAlign: "right" }}>
            <div>출력일: {printDate}</div>
            <div>총 {notes.length}문항 · {subjectSummary.length}과목</div>
          </div>
        </div>

        {notes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24pt", color: "#4B5563", fontSize: "10pt" }}>
            저장된 오답이 없습니다.
          </div>
        ) : (
          printGroups.map(({ subject, label, subjectNotes }) => (
            <div key={subject} style={{ marginBottom: "14pt", pageBreakInside: "avoid" }}>
              {/* Subject header */}
              <div
                style={{
                  borderBottom: "1pt solid #111827",
                  paddingBottom: "3pt",
                  marginBottom: "6pt",
                  display: "flex",
                  alignItems: "baseline",
                  gap: "6pt",
                }}
              >
                <span style={{ fontSize: "11pt", fontWeight: "700", color: "#111827" }}>
                  {label}
                </span>
                <span style={{ fontSize: "8pt", color: "#4B5563" }}>
                  {subjectNotes.length}문항
                </span>
              </div>

              {/* Notes table */}
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "8.5pt",
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "#F7F4EF" }}>
                    <th style={{ padding: "3pt 5pt", textAlign: "left", fontWeight: "600", border: "0.5pt solid #e5e7eb", width: "40pt" }}>
                      번호
                    </th>
                    <th style={{ padding: "3pt 5pt", textAlign: "left", fontWeight: "600", border: "0.5pt solid #e5e7eb", width: "55pt" }}>
                      기록일
                    </th>
                    <th style={{ padding: "3pt 5pt", textAlign: "left", fontWeight: "600", border: "0.5pt solid #e5e7eb", width: "30pt" }}>
                      횟수
                    </th>
                    <th style={{ padding: "3pt 5pt", textAlign: "left", fontWeight: "600", border: "0.5pt solid #e5e7eb", width: "30pt" }}>
                      정답
                    </th>
                    <th style={{ padding: "3pt 5pt", textAlign: "left", fontWeight: "600", border: "0.5pt solid #e5e7eb", width: "30pt" }}>
                      내 답
                    </th>
                    <th style={{ padding: "3pt 5pt", textAlign: "left", fontWeight: "600", border: "0.5pt solid #e5e7eb" }}>
                      메모
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subjectNotes.map((note, idx) => {
                    const repeatCount = questionRepeatMap[note.questionId] ?? 1;
                    return (
                      <tr
                        key={note.id}
                        style={{
                          backgroundColor: idx % 2 === 0 ? "#ffffff" : "#fafafa",
                        }}
                      >
                        <td
                          style={{
                            padding: "3pt 5pt",
                            border: "0.5pt solid #e5e7eb",
                            fontWeight: "600",
                          }}
                        >
                          {note.questionNo}번
                        </td>
                        <td style={{ padding: "3pt 5pt", border: "0.5pt solid #e5e7eb", color: "#4B5563" }}>
                          {fmtDate(note.examDate)}
                        </td>
                        <td
                          style={{
                            padding: "3pt 5pt",
                            border: "0.5pt solid #e5e7eb",
                            fontWeight: "600",
                            color: repeatCount > 1 ? "#b91c1c" : "#111827",
                          }}
                        >
                          {repeatCount}회
                        </td>
                        <td
                          style={{
                            padding: "3pt 5pt",
                            border: "0.5pt solid #e5e7eb",
                            fontWeight: "700",
                            color: "#1F4D3A",
                          }}
                        >
                          {note.correctAnswer}
                        </td>
                        <td
                          style={{
                            padding: "3pt 5pt",
                            border: "0.5pt solid #e5e7eb",
                            fontWeight: "700",
                            color: "#b91c1c",
                          }}
                        >
                          {note.studentAnswer ?? "-"}
                        </td>
                        <td style={{ padding: "3pt 5pt", border: "0.5pt solid #e5e7eb", color: "#4B5563" }}>
                          {note.memo ? note.memo.substring(0, 80) + (note.memo.length > 80 ? "…" : "") : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))
        )}

        {/* Print footer */}
        <div
          style={{
            marginTop: "12pt",
            borderTop: "0.5pt solid #e5e7eb",
            paddingTop: "5pt",
            fontSize: "7pt",
            color: "#9ca3af",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{branding.contactLine ?? branding.academyName}</span>
          <span>본 자료는 학원 내부 학습용입니다.</span>
        </div>
      </div>

      {/* ── Screen layout ─────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl space-y-6 print:hidden">
        {/* 헤더 */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                오답 노트
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                {student.name}의 오답 노트
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                성적 조회 화면에서 저장한 오답 문항을 복습하고 메모를 남겨 취약 영역을 집중 관리하세요.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {notes.length > 0 && (
                <PrintButton label="오답노트 인쇄" />
              )}
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                포털로 돌아가기
              </Link>
              <Link
                href="/student/scores"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                성적 조회
              </Link>
            </div>
          </div>

          {/* KPI 카드 */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">저장한 오답</p>
              <p className="mt-3 text-xl font-semibold">{notes.length}문항</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">메모 작성 완료</p>
              <p className="mt-3 text-xl font-semibold">{notesWithMemo}문항</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">가장 많은 오답 과목</p>
              <p className="mt-3 text-xl font-semibold">
                {subjectSummary[0] ? subjectSummary[0].label : "-"}
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">오답이 있는 과목 수</p>
              <p className="mt-3 text-xl font-semibold">{subjectSummary.length}과목</p>
            </article>
          </div>

          {/* 과목별 오답 분포 */}
          {subjectSummary.length > 0 && (
            <div className="mt-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                과목별 오답 현황
              </p>
              <div className="flex flex-wrap gap-2">
                {subjectSummary.map(({ subject, count, label }) => (
                  <span
                    key={subject}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold"
                  >
                    <span>{label}</span>
                    <span className="rounded-full bg-ember/10 px-1.5 py-0.5 text-ember">
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <StudentLookupForm
          currentStudent={{
            examNumber: student.examNumber,
            name: student.name,
            examType: student.examType,
          }}
          redirectPath="/student/scores/wrong-questions"
        />

        <WrongNoteManager initialNotes={mappedNotes} />
      </div>
    </main>
  );
}
