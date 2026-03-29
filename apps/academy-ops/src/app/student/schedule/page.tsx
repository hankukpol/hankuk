import type { Metadata } from "next";
import Link from "next/link";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDateWithWeekday } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { ExamCalendar } from "./exam-calendar";
import { ScheduleClient } from "./schedule-client";
import { SubjectChecklist } from "./subject-checklist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "강의 시간표",
};

export default async function StudentSchedulePage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Student Schedule Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            시간표는 DB 연결 후 사용할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            현재 환경에는 강의 일정 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              학생 포털로 돌아가기
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Student Schedule Login
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            시간표는 로그인 후 확인할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            학생 포털에 로그인하면 배정된 기수의 강의 일정을 확인할 수 있습니다.
          </p>
        </section>

        <StudentLookupForm redirectPath="/student/schedule" />
      </main>
    );
  }

  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);
  const now = new Date();

  // Fetch schedule data, upcoming exams (wider range for calendar), and recent scores
  const [activeEnrollment, upcomingExamSessions, recentScores] = await Promise.all([
    getPrisma().courseEnrollment.findFirst({
      where: {
        examNumber: viewer.examNumber,
        status: "ACTIVE",
        cohortId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: {
        cohortId: true,
        cohort: {
          select: {
            id: true,
            name: true,
            endDate: true,
            lectureSchedules: {
              where: { isActive: true },
              select: {
                id: true,
                subjectName: true,
                instructorName: true,
                dayOfWeek: true,
                startTime: true,
                endTime: true,
                isActive: true,
              },
              orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
            },
          },
        },
      },
    }),
    // Fetch upcoming exams for next 3 months (for calendar)
    getPrisma().examSession.findMany({
      where: {
        examType: viewer.examType,
        isCancelled: false,
        examDate: {
          gte: now,
          lte: new Date(now.getFullYear(), now.getMonth() + 3, 0),
        },
      },
      orderBy: { examDate: "asc" },
      take: 30,
      select: {
        id: true,
        examDate: true,
        subject: true,
        week: true,
        period: {
          select: { name: true },
        },
      },
    }),
    // Fetch last 3 exam dates with scores for this student
    getPrisma().score.findMany({
      where: {
        examNumber: viewer.examNumber,
        finalScore: { not: null },
      },
      orderBy: {
        session: { examDate: "desc" },
      },
      take: 15, // take more, then deduplicate by date below
      select: {
        finalScore: true,
        attendType: true,
        session: {
          select: {
            id: true,
            examDate: true,
            subject: true,
            week: true,
          },
        },
      },
    }),
  ]);

  const schedules = activeEnrollment?.cohort?.lectureSchedules ?? [];
  const cohortName = activeEnrollment?.cohort?.name ?? null;
  const cohortEndDate = activeEnrollment?.cohort?.endDate ?? null;

  // ── Upcoming exam dates for list (next 5) ───────────────────────────────
  const examDateMap = new Map<
    string,
    { examDate: Date; subjects: string[]; week: number | null; periodName: string | null }
  >();
  for (const exam of upcomingExamSessions) {
    const dateKey = exam.examDate.toISOString().slice(0, 10);
    const entry = examDateMap.get(dateKey);
    if (entry) {
      entry.subjects.push(SUBJECT_LABEL[exam.subject] ?? exam.subject);
    } else {
      examDateMap.set(dateKey, {
        examDate: exam.examDate,
        subjects: [SUBJECT_LABEL[exam.subject] ?? exam.subject],
        week: exam.week,
        periodName: exam.period?.name ?? null,
      });
    }
  }
  const upcomingExamDates = Array.from(examDateMap.values()).slice(0, 5);

  // ── Calendar: all upcoming exam date strings ────────────────────────────
  const calendarExamDates = Array.from(examDateMap.keys());

  // ── Countdown ──────────────────────────────────────────────────────────
  const nextExamDate = upcomingExamDates[0]?.examDate ?? null;
  const nextExamDateKey = nextExamDate
    ? nextExamDate.toISOString().slice(0, 10)
    : null;
  const daysUntilNextExam = nextExamDate
    ? Math.max(0, Math.floor((nextExamDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  // ── Subjects for next exam (checklist) ─────────────────────────────────
  const nextExamSubjects = nextExamDateKey
    ? (examDateMap.get(nextExamDateKey)?.subjects ?? [])
    : [];

  // ── Recent scores: deduplicate by date, take last 3 dates ───────────────
  const recentDateMap = new Map<string, { date: Date; week: number | null; subjects: Array<{ label: string; score: number | null }> }>();
  for (const row of recentScores) {
    const dateKey = row.session.examDate.toISOString().slice(0, 10);
    const entry = recentDateMap.get(dateKey);
    const subLabel = SUBJECT_LABEL[row.session.subject] ?? row.session.subject;
    if (entry) {
      entry.subjects.push({ label: subLabel, score: row.finalScore });
    } else {
      recentDateMap.set(dateKey, {
        date: row.session.examDate,
        week: row.session.week,
        subjects: [{ label: subLabel, score: row.finalScore }],
      });
    }
  }

  // Sort by date desc, take 3
  const recentExamDates = Array.from(recentDateMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 3)
    .map(([dateKey, val]) => ({ dateKey, ...val }));

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Student Schedule
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              {viewer.name}의 강의 시간표
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 수강 중인 기수의 요일별 강의 일정을 확인할 수 있습니다.
            </p>
            {cohortName && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                  {cohortName}
                </span>
                {cohortEndDate && (
                  <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                    종료: {formatDateWithWeekday(cohortEndDate)}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털로 돌아가기
            </Link>
          </div>
        </div>
      </section>

      {/* Upcoming exam dates + D-day */}
      <section className="rounded-[28px] border border-ember/20 bg-white p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">예정된 시험 일정</h2>
          {daysUntilNextExam !== null && (
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                daysUntilNextExam === 0
                  ? "border-red-200 bg-red-50 text-red-700"
                  : daysUntilNextExam <= 3
                  ? "border-ember/30 bg-ember/10 text-ember"
                  : "border-forest/20 bg-forest/10 text-forest"
              }`}
            >
              {daysUntilNextExam === 0 ? "오늘 시험" : `다음 시험까지 D-${daysUntilNextExam}`}
            </span>
          )}
        </div>
        {upcomingExamDates.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-ink/10 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-ink">예정된 시험이 없습니다</p>
            <p className="mt-1.5 text-xs text-slate">
              앞으로 예정된 시험 일정이 아직 등록되지 않았습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingExamDates.map((item, idx) => {
              const dateKey = item.examDate.toISOString().slice(0, 10);
              const isNext = idx === 0;
              return (
                <div
                  key={dateKey}
                  className={`flex flex-wrap items-center gap-3 rounded-[20px] border px-4 py-3 ${
                    isNext
                      ? "border-ember/30 bg-ember/5"
                      : "border-ink/10 bg-mist/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isNext && (
                      <span className="inline-flex h-5 items-center rounded-full bg-ember px-2 text-[10px] font-bold text-white">
                        NEXT
                      </span>
                    )}
                    <span className={`text-sm font-semibold ${isNext ? "text-ember" : "text-ink"}`}>
                      {formatDateWithWeekday(item.examDate)}
                    </span>
                  </div>
                  {item.week !== null && (
                    <span className="inline-flex rounded-full border border-ink/10 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate">
                      {item.week}주차
                    </span>
                  )}
                  {item.periodName && (
                    <span className="inline-flex rounded-full border border-forest/20 bg-forest/5 px-2.5 py-0.5 text-xs font-semibold text-forest">
                      {item.periodName}
                    </span>
                  )}
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {item.subjects.map((sub) => (
                      <span
                        key={sub}
                        className="inline-flex rounded-full border border-ink/10 bg-white px-2.5 py-0.5 text-xs text-slate"
                      >
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {cohortEndDate && (
          <p className="mt-3 text-xs text-slate">
            기수 종료일: {formatDateWithWeekday(cohortEndDate)}
          </p>
        )}
      </section>

      {/* Calendar + Checklist: two-column on larger screens */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Mini calendar */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <svg className="h-4 w-4 text-ember" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h2 className="text-base font-semibold text-ink">시험 일정 달력</h2>
          </div>
          <ExamCalendar examDates={calendarExamDates} />
        </section>

        {/* Subject preparation checklist */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <svg className="h-4 w-4 text-forest" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-base font-semibold text-ink">과목별 준비 체크리스트</h2>
          </div>
          {nextExamDate ? (
            <p className="mb-3 text-xs text-slate">
              다음 시험({formatDateWithWeekday(nextExamDate)}) 준비 과목을 체크하세요.
              브라우저에 저장됩니다.
            </p>
          ) : (
            <p className="mb-3 text-xs text-slate">
              예정된 시험이 없을 때도 자유롭게 과목을 체크할 수 있습니다.
            </p>
          )}
          <SubjectChecklist
            subjects={nextExamSubjects}
            nextExamDateKey={nextExamDateKey}
          />
        </section>
      </div>

      {/* Recent scores summary */}
      {recentExamDates.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-slate" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h2 className="text-base font-semibold text-ink">최근 성적 요약</h2>
            </div>
            <Link
              href="/student/scores"
              className="text-xs font-semibold text-ember underline underline-offset-2 hover:text-ember/70"
            >
              전체 보기
            </Link>
          </div>

          <div className="space-y-3">
            {recentExamDates.map(({ dateKey, date, week, subjects }) => {
              const totalScore = subjects.reduce((sum, s) => sum + (s.score ?? 0), 0);
              const scoredCount = subjects.filter((s) => s.score !== null).length;
              const avgScore = scoredCount > 0 ? totalScore / scoredCount : null;

              return (
                <Link
                  key={dateKey}
                  href={`/student/scores/${encodeURIComponent(dateKey)}`}
                  className="block rounded-[20px] border border-ink/10 px-5 py-4 transition hover:border-ember/20 hover:bg-ember/5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {formatDateWithWeekday(date)}
                      </span>
                      {week !== null && (
                        <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[10px] font-semibold text-slate">
                          {week}주차
                        </span>
                      )}
                    </div>
                    {avgScore !== null && (
                      <span
                        className={`text-sm font-bold ${
                          avgScore < 60
                            ? "text-red-600"
                            : avgScore < 80
                            ? "text-amber-600"
                            : "text-forest"
                        }`}
                      >
                        평균 {Math.round(avgScore * 10) / 10}점
                      </span>
                    )}
                  </div>

                  {/* Subject scores */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {subjects.map((s) => (
                      <span
                        key={s.label}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                          s.score === null
                            ? "border-ink/10 bg-mist text-slate"
                            : s.score < 60
                            ? "border-red-200 bg-red-50 text-red-700"
                            : s.score < 80
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-forest/20 bg-forest/5 text-forest"
                        }`}
                      >
                        <span className="font-medium">{s.label}</span>
                        <span className="font-bold">
                          {s.score !== null ? `${Math.round(s.score * 10) / 10}점` : "미응시"}
                        </span>
                      </span>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Schedule content */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        {activeEnrollment === null ? (
          <div className="rounded-[24px] border border-dashed border-ink/10 px-5 py-8 text-center">
            <p className="text-base font-semibold text-ink">현재 수강 중인 기수가 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              활성 수강 등록이 있어야 시간표를 조회할 수 있습니다.
            </p>
            <a
              href={branding.phoneHref ?? undefined}
              className="mt-4 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              문의: {branding.phone ?? "학원 창구"}
            </a>
          </div>
        ) : (
          <ScheduleClient
            schedules={schedules}
            cohortName={cohortName}
            contactPhone={branding.phone}
            contactPhoneHref={branding.phoneHref}
          />
        )}
      </section>
    </main>
  );
}
