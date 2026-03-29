import { NextRequest } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import { getPrisma } from "@/lib/prisma";

function padZero(n: number) {
  return String(n).padStart(2, "0");
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
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

export async function GET(request: NextRequest) {
  const auth = await requireStudentPortalStudent(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const year = parseInt(searchParams.get("year") ?? String(now.getFullYear()), 10);
  const month = parseInt(searchParams.get("month") ?? String(now.getMonth() + 1), 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return Response.json({ error: "유효하지 않은 연월입니다." }, { status: 400 });
  }

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const prisma = getPrisma();

  const [examSessions, civilExams, pinnedNotices] = await Promise.all([
    prisma.examSession.findMany({
      where: {
        examType: auth.student.examType,
        isCancelled: false,
        examDate: { gte: monthStart, lte: monthEnd },
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
    prisma.civilServiceExam.findMany({
      where: {
        isActive: true,
        OR: [
          { writtenDate: { gte: monthStart, lte: monthEnd } },
          { interviewDate: { gte: monthStart, lte: monthEnd } },
          { resultDate: { gte: monthStart, lte: monthEnd } },
        ],
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
    }),
    prisma.notice.findMany({
      where: {
        isPinned: true,
        isPublished: true,
        publishedAt: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        title: true,
        publishedAt: true,
      },
      take: 10,
    }).catch(() => [] as never[]),
  ]);

  type CalEvent = {
    id: string;
    date: string;
    type: "EXAM_SESSION" | "CIVIL_EXAM" | "NOTICE";
    title: string;
    color: "ember" | "forest" | "sky" | "gray";
    link?: string;
  };

  const events: CalEvent[] = [];

  // Exam sessions — group by date
  const examByDate = new Map<string, { subjects: string[]; week: number | null }>();
  for (const sess of examSessions) {
    const dk = toDateKey(sess.examDate);
    const subLabel = sess.displaySubjectName?.trim() || getSubjectLabel(sess.subject);
    const existing = examByDate.get(dk);
    if (existing) {
      existing.subjects.push(subLabel);
    } else {
      examByDate.set(dk, { subjects: [subLabel], week: sess.week });
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

  // Civil exams
  for (const ce of civilExams) {
    if (ce.writtenDate && ce.writtenDate >= monthStart && ce.writtenDate <= monthEnd) {
      events.push({
        id: `civil-written-${ce.id}`,
        date: toDateKey(ce.writtenDate),
        type: "CIVIL_EXAM",
        title: `[필기] ${ce.name}`,
        color: "forest",
        link: "/student/civil-exams",
      });
    }
    if (ce.interviewDate && ce.interviewDate >= monthStart && ce.interviewDate <= monthEnd) {
      events.push({
        id: `civil-interview-${ce.id}`,
        date: toDateKey(ce.interviewDate),
        type: "CIVIL_EXAM",
        title: `[면접] ${ce.name}`,
        color: "forest",
        link: "/student/civil-exams",
      });
    }
    if (ce.resultDate && ce.resultDate >= monthStart && ce.resultDate <= monthEnd) {
      events.push({
        id: `civil-result-${ce.id}`,
        date: toDateKey(ce.resultDate),
        type: "CIVIL_EXAM",
        title: `[발표] ${ce.name}`,
        color: "forest",
        link: "/student/civil-exams",
      });
    }
  }

  // Pinned notices — show on publication date
  for (const notice of pinnedNotices) {
    if (notice.publishedAt) {
      events.push({
        id: `notice-${notice.id}`,
        date: toDateKey(notice.publishedAt),
        type: "NOTICE",
        title: `[공지] ${notice.title}`,
        color: "sky",
        link: `/student/notices`,
      });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  return Response.json({ data: events });
}
