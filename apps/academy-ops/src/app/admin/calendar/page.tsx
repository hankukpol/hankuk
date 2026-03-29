import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { UnifiedCalendar } from "./unified-calendar";
import type { CalendarEvent } from "@/app/api/admin/calendar/events/route";

export const dynamic = "force-dynamic";

// ── helpers ──────────────────────────────────────────────────────────────────

function padZero(n: number) {
  return String(n).padStart(2, "0");
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}

function parseParams(searchParams?: Record<string, string | string[] | undefined>) {
  const yearRaw = Array.isArray(searchParams?.year)
    ? searchParams.year[0]
    : searchParams?.year;
  const monthRaw = Array.isArray(searchParams?.month)
    ? searchParams.month[0]
    : searchParams?.month;

  const now = new Date();
  const year = yearRaw ? parseInt(yearRaw, 10) : now.getFullYear();
  const month = monthRaw ? parseInt(monthRaw, 10) : now.getMonth() + 1;

  if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
    return { year, month };
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function getSubjectLabel(subject: string): string {
  const labels: Record<string, string> = {
    POLICE_SCIENCE: "경찰학",
    CONSTITUTIONAL_LAW: "헌법",
    CRIMINOLOGY: "범죄학",
    CRIMINAL_PROCEDURE: "형사소송법",
    CRIMINAL_LAW: "형법",
    CUMULATIVE: "누적",
  };
  return labels[subject] ?? subject;
}

// ── page ─────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminCalendarPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { year, month } = parseParams(searchParams);

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const prisma = getPrisma();

  const [examSessions, appointments] = await Promise.all([
    prisma.examSession.findMany({
      where: {
        examDate: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        examType: true,
        examDate: true,
        week: true,
        subject: true,
        displaySubjectName: true,
        isCancelled: true,
        period: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { examDate: "asc" },
    }),
    prisma.counselingAppointment.findMany({
      where: {
        scheduledAt: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        counselorName: true,
      },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  // ── Build CalendarEvent array ─────────────────────────────────────────────

  const events: CalendarEvent[] = [];

  // ExamSession events
  for (const session of examSessions) {
    const dateKey = toDateKey(session.examDate);
    const examTypeLabel = session.examType === "GONGCHAE" ? "공채" : "경채";
    const subjectLabel = session.displaySubjectName?.trim() || getSubjectLabel(session.subject);
    const title = `${session.period.name} ${examTypeLabel} ${session.week}회차 (${subjectLabel})`;

    let color: CalendarEvent["color"];
    if (session.isCancelled) {
      color = "gray";
    } else if (session.examType === "GONGCHAE") {
      color = "ember";
    } else {
      color = "forest";
    }

    events.push({
      id: `exam-session-${session.id}`,
      date: dateKey,
      type: "EXAM_SESSION",
      title,
      color,
      status: session.isCancelled ? "CANCELLED" : "ACTIVE",
      link: `/admin/periods`,
      meta: {
        sessionId: session.id,
        periodId: session.period.id,
        periodName: session.period.name,
        examType: session.examType,
        week: session.week,
        subject: session.subject,
        displaySubjectName: session.displaySubjectName,
        isCancelled: session.isCancelled,
      },
    });
  }

  // CounselingAppointment events — grouped by date
  const appointmentsByDate: Record<string, typeof appointments> = {};
  for (const appt of appointments) {
    const dateKey = toDateKey(appt.scheduledAt);
    if (!appointmentsByDate[dateKey]) appointmentsByDate[dateKey] = [];
    appointmentsByDate[dateKey].push(appt);
  }

  for (const [dateKey, appts] of Object.entries(appointmentsByDate)) {
    const activeCount = appts.filter((a) => a.status !== "CANCELLED").length;
    const totalCount = appts.length;
    const displayCount = activeCount > 0 ? activeCount : totalCount;
    const label =
      activeCount > 0 ? `상담 ${displayCount}건` : `상담 ${totalCount}건 (취소포함)`;

    events.push({
      id: `counseling-${dateKey}`,
      date: dateKey,
      type: "COUNSELING_APPOINTMENT",
      title: label,
      color: "sky",
      status: activeCount > 0 ? "SCHEDULED" : "CANCELLED",
      link: `/admin/counseling?date=${dateKey}`,
      meta: {
        totalCount,
        activeCount,
        appointmentIds: appts.map((a) => a.id),
      },
    });
  }

  // Sort by date
  events.sort((a, b) => a.date.localeCompare(b.date));

  return <UnifiedCalendar year={year} month={month} initialEvents={events} />;
}
