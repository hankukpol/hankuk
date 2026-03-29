import type { Metadata } from "next";
import Link from "next/link";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { AcademyCalendar } from "@/components/student-portal/academy-calendar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "학원 캘린더",
};

function padZero(n: number) {
  return String(n).padStart(2, "0");
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}

export default async function StudentCalendarPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            캘린더 준비 중
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            학원 캘린더는 DB 연결 후 사용할 수 있습니다.
          </h1>
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
            학원 캘린더
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            캘린더는 로그인 후 확인할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            학생 포털에 로그인하면 시험 회차, 공채 시험 일정을 달력에서 한눈에 확인할 수 있습니다.
          </p>
        </section>
        <StudentLookupForm redirectPath="/student/calendar" />
      </main>
    );
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
  // Fetch 3 months of data for initial render (current ± adjacent navigation)
  const rangeStart = new Date(year, month - 2, 1, 0, 0, 0, 0);
  const rangeEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

  const prisma = getPrisma();

  const [examSessions, civilExams, pinnedNotices] = await Promise.all([
    // Morning exam sessions for the student's exam type — next 3 months
    prisma.examSession.findMany({
      where: {
        examType: viewer.examType,
        isCancelled: false,
        examDate: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        id: true,
        examDate: true,
        subject: true,
        week: true,
        displaySubjectName: true,
      },
      orderBy: { examDate: "asc" },
    }),
    // Upcoming civil exam written dates — show next 6 months
    prisma.civilServiceExam.findMany({
      where: {
        isActive: true,
        writtenDate: {
          gte: monthStart,
          lte: new Date(year, month + 5, 0, 23, 59, 59, 999),
        },
      },
      select: {
        id: true,
        name: true,
        examType: true,
        writtenDate: true,
        interviewDate: true,
        resultDate: true,
      },
      orderBy: { writtenDate: "asc" },
      take: 20,
    }),
    // Pinned/published notices this month (max 10)
    prisma.notice.findMany({
      where: {
        isPinned: true,
        isPublished: true,
        publishedAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        id: true,
        title: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: "desc" },
      take: 10,
    }).catch(() => [] as never[]),
  ]);

  // ── Build calendar events ──────────────────────────────────────────────────

  type CalEvent = {
    id: string;
    date: string;
    type: "EXAM_SESSION" | "CIVIL_EXAM" | "NOTICE";
    title: string;
    color: "ember" | "forest" | "sky" | "gray";
    link?: string;
  };

  const events: CalEvent[] = [];

  // Group exam sessions by date
  const examByDate = new Map<string, { subjects: string[]; week: number | null }>();
  for (const sess of examSessions) {
    const dk = toDateKey(sess.examDate);
    const subLabel = sess.displaySubjectName?.trim() ||
      (sess.subject === "POLICE_SCIENCE" ? "경찰학" :
       sess.subject === "CONSTITUTIONAL_LAW" ? "헌법" :
       sess.subject === "CRIMINOLOGY" ? "범죄학" :
       sess.subject === "CRIMINAL_PROCEDURE" ? "형사소송법" :
       sess.subject === "CRIMINAL_LAW" ? "형법" :
       sess.subject === "CUMULATIVE" ? "누적" : sess.subject);
    const existing = examByDate.get(dk);
    if (existing) {
      existing.subjects.push(subLabel);
    } else {
      examByDate.set(dk, {
        subjects: [subLabel],
        week: sess.week,
      });
    }
  }
  for (const [dk, info] of examByDate.entries()) {
    const weekLabel = info.week !== null ? ` ${info.week}회차` : "";
    events.push({
      id: `exam-${dk}`,
      date: dk,
      type: "EXAM_SESSION",
      title: `아침 시험${weekLabel} (${info.subjects.slice(0, 2).join("·")}${info.subjects.length > 2 ? "…" : ""})`,
      color: "ember",
      link: "/student/schedule",
    });
  }

  // Civil exam dates
  for (const ce of civilExams) {
    if (ce.writtenDate) {
      const dk = toDateKey(ce.writtenDate);
      events.push({
        id: `civil-written-${ce.id}`,
        date: dk,
        type: "CIVIL_EXAM",
        title: `[필기] ${ce.name}`,
        color: "forest",
        link: "/student/civil-exams",
      });
    }
    if (ce.interviewDate) {
      const dk = toDateKey(ce.interviewDate);
      events.push({
        id: `civil-interview-${ce.id}`,
        date: dk,
        type: "CIVIL_EXAM",
        title: `[면접] ${ce.name}`,
        color: "forest",
        link: "/student/civil-exams",
      });
    }
    if (ce.resultDate) {
      const dk = toDateKey(ce.resultDate);
      events.push({
        id: `civil-result-${ce.id}`,
        date: dk,
        type: "CIVIL_EXAM",
        title: `[발표] ${ce.name}`,
        color: "forest",
        link: "/student/civil-exams",
      });
    }
  }

  // Pinned notices — show on their publication date
  for (const notice of pinnedNotices) {
    if (notice.publishedAt) {
      const dk = toDateKey(notice.publishedAt);
      events.push({
        id: `notice-${notice.id}`,
        date: dk,
        type: "NOTICE",
        title: `[공지] ${notice.title}`,
        color: "sky",
        link: `/student/notices`,
      });
    }
  }

  // Sort
  events.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
              Academy Calendar
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              학원 캘린더
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              시험 회차, 공채 시험 D-day, 공지 마감일을 달력에서 한눈에 확인하세요.
            </p>
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

      {/* Calendar component */}
      <AcademyCalendar
        year={year}
        month={month}
        initialEvents={events}
        studentName={viewer.name}
      />
    </main>
  );
}
