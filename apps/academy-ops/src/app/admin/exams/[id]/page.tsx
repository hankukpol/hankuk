import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, ExamDivision, ExamEventType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const EVENT_TYPE_LABEL: Record<ExamEventType, string> = {
  MORNING: "아침모의고사",
  MONTHLY: "월말평가",
  SPECIAL: "특강모의고사",
  EXTERNAL: "외부모의고사",
};

const EVENT_TYPE_COLOR: Record<ExamEventType, string> = {
  MORNING: "border-ember/20 bg-ember/10 text-ember",
  MONTHLY: "border-forest/20 bg-forest/10 text-forest",
  SPECIAL: "border-blue-200 bg-blue-50 text-blue-600",
  EXTERNAL: "border-purple-200 bg-purple-50 text-purple-600",
};

const EVENT_TYPE_HUB: Record<ExamEventType, string> = {
  MORNING: "/admin/exams/morning",
  MONTHLY: "/admin/exams/monthly",
  SPECIAL: "/admin/exams/special",
  EXTERNAL: "/admin/exams/external",
};

const DIVISION_LABEL: Record<ExamDivision, string> = {
  GONGCHAE_M: "공채 남자",
  GONGCHAE_F: "공채 여자",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

const DIVISION_BADGE: Record<ExamDivision, string> = {
  GONGCHAE_M: "bg-blue-50 text-blue-700 border-blue-200",
  GONGCHAE_F: "bg-pink-50 text-pink-700 border-pink-200",
  GYEONGCHAE: "bg-purple-50 text-purple-700 border-purple-200",
  ONLINE: "bg-slate/10 text-slate border-ink/10",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ExamEventDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { id } = await params;
  const prisma = getPrisma();

  const event = await prisma.examEvent.findUnique({
    where: { id },
    include: {
      registrations: {
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              phone: true,
              examType: true,
            },
          },
        },
        orderBy: { registeredAt: "asc" },
      },
    },
  });

  if (!event) notFound();

  const activeRegs = event.registrations.filter((r) => !r.cancelledAt);
  const cancelledRegs = event.registrations.filter((r) => r.cancelledAt);

  // Per-division breakdown
  const divisionCounts = (Object.keys(DIVISION_LABEL) as ExamDivision[]).map((d) => ({
    division: d,
    label: DIVISION_LABEL[d],
    count: activeRegs.filter((r) => r.division === d).length,
    paid: activeRegs.filter((r) => r.division === d && r.isPaid).length,
  }));

  const totalPaid = activeRegs.filter((r) => r.isPaid).length;
  const totalUnpaid = activeRegs.filter((r) => !r.isPaid).length;
  const totalRevenue = activeRegs.reduce((s, r) => s + r.paidAmount, 0);

  // Score-related: try to find matching ExamSession(s) by date
  // ExamEvent has examDate; ExamSession has examDate too — link by date & type if applicable
  const examDateOnly = event.examDate.toISOString().slice(0, 10);

  // Find exam sessions on the same date (for score entry links)
  const relatedSessions = await prisma.examSession.findMany({
    where: {
      examDate: {
        gte: new Date(examDateOnly),
        lt: new Date(
          new Date(examDateOnly).getTime() + 24 * 60 * 60 * 1000
        ),
      },
    },
    select: {
      id: true,
      subject: true,
      displaySubjectName: true,
      examType: true,
      week: true,
      isLocked: true,
      _count: { select: { scores: true } },
    },
    orderBy: [{ examType: "asc" }, { subject: "asc" }],
  });

  // Score summary per session on this date
  type SessionScoreSummary = {
    sessionId: number;
    subjectLabel: string;
    examType: string;
    week: number;
    scoreCount: number;
    isLocked: boolean;
    avgScore: number | null;
    maxScore: number | null;
  };

  const sessionSummaries: SessionScoreSummary[] = [];

  for (const session of relatedSessions) {
    const scores = await prisma.score.findMany({
      where: {
        sessionId: session.id,
        finalScore: { not: null },
      },
      select: { finalScore: true },
    });

    const validScores = scores.map((s) => s.finalScore as number);
    const avgScore =
      validScores.length > 0
        ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10
        : null;
    const maxScore = validScores.length > 0 ? Math.max(...validScores) : null;

    sessionSummaries.push({
      sessionId: session.id,
      subjectLabel: session.displaySubjectName ?? session.subject,
      examType: session.examType,
      week: session.week,
      scoreCount: session._count.scores,
      isLocked: session.isLocked,
      avgScore,
      maxScore,
    });
  }

  return (
    <div className="space-y-8 p-8 sm:p-10">
      {/* ── 뒤로가기 ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 text-sm text-slate">
        <Link href="/admin/exams" className="transition hover:text-ink">
          시험 관리 센터
        </Link>
        <span>/</span>
        <Link
          href={EVENT_TYPE_HUB[event.eventType]}
          className="transition hover:text-ink"
        >
          {EVENT_TYPE_LABEL[event.eventType]}
        </Link>
        <span>/</span>
        <span className="text-ink">{event.title}</span>
      </div>

      {/* ── 헤더 ────────────────────────────────────────────────────────────── */}
      <div>
        <div
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] ${EVENT_TYPE_COLOR[event.eventType]}`}
        >
          {EVENT_TYPE_LABEL[event.eventType]}
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">{event.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate">
          <span>
            시험일:{" "}
            <span className="font-medium text-ink">
              {event.examDate.toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </span>
          </span>
          {event.venue && (
            <span>
              장소: <span className="font-medium text-ink">{event.venue}</span>
            </span>
          )}
          {event.registrationDeadline && (
            <span>
              접수 마감:{" "}
              <span className="font-medium text-ink">
                {event.registrationDeadline.toLocaleDateString("ko-KR")}
              </span>
            </span>
          )}
          {event.registrationFee > 0 && (
            <span>
              참가비:{" "}
              <span className="font-medium text-ember">
                {event.registrationFee.toLocaleString("ko-KR")}원
              </span>
            </span>
          )}
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
              event.isActive
                ? "border-forest/20 bg-forest/10 text-forest"
                : "border-ink/10 bg-ink/5 text-slate"
            }`}
          >
            {event.isActive ? "접수중" : "마감"}
          </span>
        </div>
      </div>

      {/* ── 접수 현황 KPI ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          접수 현황
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <article className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">총 접수</p>
            <p className="mt-3 text-2xl font-bold text-ink">{activeRegs.length}명</p>
            {cancelledRegs.length > 0 && (
              <p className="mt-1 text-xs text-slate">취소 {cancelledRegs.length}건 제외</p>
            )}
          </article>
          <article className="rounded-[24px] border border-forest/20 bg-forest/5 p-5 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest">납부 완료</p>
            <p className="mt-3 text-2xl font-bold text-forest">{totalPaid}명</p>
          </article>
          <article
            className={`rounded-[24px] border p-5 shadow-panel ${
              totalUnpaid > 0 ? "border-amber-200 bg-amber-50/60" : "border-ink/10 bg-white"
            }`}
          >
            <p
              className={`text-xs font-semibold uppercase tracking-[0.16em] ${
                totalUnpaid > 0 ? "text-amber-700" : "text-slate"
              }`}
            >
              납부 미완료
            </p>
            <p
              className={`mt-3 text-2xl font-bold ${totalUnpaid > 0 ? "text-amber-600" : "text-ink"}`}
            >
              {totalUnpaid}명
            </p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">수납 총액</p>
            <p className="mt-3 text-2xl font-bold text-ember">
              {totalRevenue.toLocaleString("ko-KR")}원
            </p>
          </article>
        </div>
      </section>

      {/* ── 구분별 현황 ──────────────────────────────────────────────────────── */}
      {divisionCounts.some((d) => d.count > 0) && (
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
            구분별 현황
          </h2>
          <div className="flex flex-wrap gap-3">
            {divisionCounts
              .filter((d) => d.count > 0)
              .map((d) => (
                <div
                  key={d.division}
                  className={`rounded-[20px] border px-5 py-3 ${DIVISION_BADGE[d.division as ExamDivision]}`}
                >
                  <p className="text-xs font-semibold">{d.label}</p>
                  <p className="mt-1 text-xl font-bold">{d.count}명</p>
                  <p className="mt-0.5 text-xs opacity-70">납부 {d.paid}명</p>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* ── 성적 요약 (같은 날짜 ExamSession 기반) ─────────────────────────── */}
      {sessionSummaries.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">
              성적 요약
              <span className="ml-2 text-xs font-normal text-slate">
                ({examDateOnly} 시험 세션)
              </span>
            </h2>
            <div className="flex gap-2">
              <Link
                href="/admin/scores/input"
                className="rounded-full border border-ember/30 px-3 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember/10"
              >
                성적 입력
              </Link>
              <Link
                href="/admin/scores/edit"
                className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
              >
                성적 수정
              </Link>
            </div>
          </div>
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60">
                    {["과목", "유형", "회차", "입력 수", "평균", "최고점", "상태"].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {sessionSummaries.map((s) => (
                    <tr key={s.sessionId} className="transition hover:bg-mist/50">
                      <td className="px-5 py-3 font-medium text-ink">{s.subjectLabel}</td>
                      <td className="px-5 py-3 text-slate">{s.examType}</td>
                      <td className="px-5 py-3 tabular-nums text-slate">{s.week}주차</td>
                      <td className="px-5 py-3 tabular-nums text-slate">{s.scoreCount}건</td>
                      <td className="px-5 py-3 tabular-nums">
                        {s.avgScore !== null ? (
                          <span className="font-semibold text-forest">{s.avgScore}점</span>
                        ) : (
                          <span className="text-slate/40">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        {s.maxScore !== null ? (
                          <span className="font-semibold text-ember">{s.maxScore}점</span>
                        ) : (
                          <span className="text-slate/40">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            s.isLocked
                              ? "border-ink/10 bg-ink/5 text-slate"
                              : "border-forest/20 bg-forest/10 text-forest"
                          }`}
                        >
                          {s.isLocked ? "잠김" : "편집 가능"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── 등록 학생 목록 ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          등록 학생 목록
          <span className="ml-2 text-xs font-normal text-slate">({activeRegs.length}명)</span>
        </h2>

        {activeRegs.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
            접수된 학생이 없습니다.{" "}
            <Link
              href={EVENT_TYPE_HUB[event.eventType]}
              className="text-ember underline hover:text-ember/80"
            >
              접수 페이지로 이동
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr className="bg-mist/60">
                  {["#", "이름", "학번", "연락처", "구분", "납부", "납부금액", "좌석번호", "접수일시"].map(
                    (h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {activeRegs.map((reg, i) => {
                  const name = reg.student?.name ?? reg.externalName ?? "-";
                  const phone = reg.student?.phone ?? reg.externalPhone ?? "-";
                  const isStudent = !!reg.student;

                  return (
                    <tr key={reg.id} className="transition hover:bg-mist/30">
                      <td className="px-4 py-3 tabular-nums text-xs text-slate">{i + 1}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                        {isStudent ? (
                          <Link
                            href={`/admin/students/${reg.examNumber}`}
                            className="transition hover:text-forest hover:underline"
                          >
                            {name}
                          </Link>
                        ) : (
                          <span>
                            {name}
                            <span className="ml-1 rounded-full bg-slate/10 px-1.5 py-0.5 text-xs text-slate">
                              외부
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate">
                        {reg.examNumber ? (
                          <Link
                            href={`/admin/students/${reg.examNumber}`}
                            className="font-mono text-ember transition hover:underline"
                          >
                            {reg.examNumber}
                          </Link>
                        ) : (
                          <span className="text-slate/50">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">{phone}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${DIVISION_BADGE[reg.division]}`}
                        >
                          {DIVISION_LABEL[reg.division]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            reg.isPaid
                              ? "bg-forest/10 text-forest"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {reg.isPaid ? "납부" : "미납"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate">
                        {reg.paidAmount > 0
                          ? `${reg.paidAmount.toLocaleString("ko-KR")}원`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate">
                        {reg.seatNumber ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {reg.registeredAt.toISOString().slice(0, 16).replace("T", " ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/10 bg-forest text-white">
                  <td className="px-4 py-3 font-bold" colSpan={2}>
                    합계
                  </td>
                  <td colSpan={3} className="px-4 py-3 text-sm">
                    총 {activeRegs.length}명 · 납부 {totalPaid}명 · 미납 {totalUnpaid}명
                  </td>
                  <td />
                  <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums">
                    {totalRevenue.toLocaleString("ko-KR")}원
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ── 취소된 접수 ──────────────────────────────────────────────────────── */}
      {cancelledRegs.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
            취소된 접수
            <span className="ml-2 text-xs font-normal text-slate">({cancelledRegs.length}건)</span>
          </h2>
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr className="bg-mist/60">
                  {["이름", "학번", "구분", "취소일시"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {cancelledRegs.map((reg) => {
                  const name = reg.student?.name ?? reg.externalName ?? "-";
                  const isStudent = !!reg.student;
                  return (
                    <tr key={reg.id} className="opacity-60">
                      <td className="whitespace-nowrap px-4 py-3 text-slate line-through">
                        {isStudent ? (
                          <Link
                            href={`/admin/students/${reg.examNumber}`}
                            className="transition hover:text-forest hover:no-underline hover:opacity-100"
                          >
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate">
                        {reg.examNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate/10 px-2 py-0.5 text-xs text-slate">
                          {DIVISION_LABEL[reg.division]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {reg.cancelledAt
                          ? reg.cancelledAt.toISOString().slice(0, 16).replace("T", " ")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 빠른 액션 ────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          빠른 액션
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/scores/input"
            className="inline-flex items-center gap-2 rounded-xl border border-ember/30 bg-ember/5 px-4 py-2.5 text-sm font-semibold text-ember transition hover:bg-ember/10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
            </svg>
            성적 입력
          </Link>
          <Link
            href="/admin/scores/edit"
            className="inline-flex items-center gap-2 rounded-xl border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink transition hover:border-ember/30 hover:text-ember"
          >
            성적 수정
          </Link>
          <Link
            href={EVENT_TYPE_HUB[event.eventType]}
            className="inline-flex items-center gap-2 rounded-xl border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink transition hover:text-forest"
          >
            &larr; {EVENT_TYPE_LABEL[event.eventType]} 목록
          </Link>
        </div>
      </section>
    </div>
  );
}
