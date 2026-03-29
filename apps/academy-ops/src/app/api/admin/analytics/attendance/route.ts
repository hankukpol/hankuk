import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday-based
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export async function GET(req: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const weeks = parseInt(url.searchParams.get("weeks") ?? "12", 10);

  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - weeks * 7);
  since.setHours(0, 0, 0, 0);

  const prisma = getPrisma();

  // Fetch scores with session info
  const scores = await prisma.score.findMany({
    where: {
      session: {
        examDate: { gte: since },
      },
    },
    select: {
      attendType: true,
      session: {
        select: {
          examDate: true,
          subject: true,
          examType: true,
        },
      },
    },
  });

  // ── Weekly trend ────────────────────────────────────────────────────────
  const weekMap = new Map<string, { attend: number; total: number }>();
  for (const score of scores) {
    const wk = getWeekStart(score.session.examDate);
    if (!weekMap.has(wk)) weekMap.set(wk, { attend: 0, total: 0 });
    const entry = weekMap.get(wk)!;
    entry.total++;
    if (score.attendType !== "ABSENT") entry.attend++;
  }
  const weeklyTrend = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => ({
      week,
      label: week.slice(5), // MM-DD
      attendRate: d.total > 0 ? Math.round((d.attend / d.total) * 100) : 0,
      attend: d.attend,
      total: d.total,
    }));

  // ── Subject comparison ──────────────────────────────────────────────────
  const subjectMap = new Map<
    string,
    { attend: number; absent: number; late: number; makeup: number; total: number }
  >();
  for (const score of scores) {
    const subj = score.session.subject;
    if (!subjectMap.has(subj)) {
      subjectMap.set(subj, { attend: 0, absent: 0, late: 0, makeup: 0, total: 0 });
    }
    const e = subjectMap.get(subj)!;
    e.total++;
    if (score.attendType === "ABSENT") e.absent++;
    else if (score.attendType === "EXCUSED") e.late++;
    else if (score.attendType === "LIVE") e.makeup++;
    else e.attend++;
  }
  const subjectStats = Array.from(subjectMap.entries())
    .map(([subject, d]) => ({
      subject,
      attendRate: d.total > 0 ? Math.round((d.attend / d.total) * 100) : 0,
      ...d,
    }))
    .sort((a, b) => b.total - a.total);

  // ── Day-of-week heatmap ─────────────────────────────────────────────────
  const dowMap = new Map<number, { attend: number; total: number }>();
  for (let i = 0; i < 7; i++) dowMap.set(i, { attend: 0, total: 0 });
  for (const score of scores) {
    const dow = score.session.examDate.getDay(); // 0=Sun
    const e = dowMap.get(dow)!;
    e.total++;
    if (score.attendType !== "ABSENT") e.attend++;
  }
  const DOW_LABEL = ["일", "월", "화", "수", "목", "금", "토"];
  const dowStats = Array.from(dowMap.entries()).map(([dow, d]) => ({
    dow,
    label: DOW_LABEL[dow],
    attendRate: d.total > 0 ? Math.round((d.attend / d.total) * 100) : 0,
    ...d,
  }));

  // ── KPIs ────────────────────────────────────────────────────────────────
  const total = scores.length;
  const attend = scores.filter((s) => s.attendType !== "ABSENT").length;
  const absent = scores.filter((s) => s.attendType === "ABSENT").length;
  const makeup = scores.filter((s) => s.attendType === "LIVE").length;
  const avgAttendRate = total > 0 ? Math.round((attend / total) * 100) : 0;

  // Top 10 most absent students
  const absentByStudent = new Map<string, number>();
  const scoresByStudent = await prisma.score.findMany({
    where: {
      attendType: "ABSENT",
      session: { examDate: { gte: since } },
    },
    select: {
      examNumber: true,
      student: { select: { name: true } },
    },
  });
  for (const row of scoresByStudent) {
    absentByStudent.set(
      row.examNumber,
      (absentByStudent.get(row.examNumber) ?? 0) + 1,
    );
  }
  const studentNameMap = new Map<string, string>();
  for (const row of scoresByStudent) {
    if (!studentNameMap.has(row.examNumber)) {
      studentNameMap.set(row.examNumber, row.student.name);
    }
  }

  const topAbsent = Array.from(absentByStudent.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([examNumber, count]) => ({
      examNumber,
      name: studentNameMap.get(examNumber) ?? examNumber,
      absentCount: count,
    }));

  // Perfect attendance students (no absent at all in period)
  const allScoresByStudent = await prisma.score.groupBy({
    by: ["examNumber"],
    where: {
      session: { examDate: { gte: since } },
    },
    _count: { id: true },
  });
  const absentCounts = await prisma.score.groupBy({
    by: ["examNumber"],
    where: {
      attendType: "ABSENT",
      session: { examDate: { gte: since } },
    },
    _count: { id: true },
  });
  const absentSet = new Set(absentCounts.map((r) => r.examNumber));
  const perfectAttendanceCount = allScoresByStudent.filter(
    (r) => !absentSet.has(r.examNumber) && r._count.id > 0,
  ).length;

  return Response.json({
    data: {
      kpi: {
        avgAttendRate,
        totalAbsent: absent,
        makeupCount: makeup,
        perfectAttendanceCount,
        total,
      },
      weeklyTrend,
      subjectStats,
      dowStats,
      topAbsent,
    },
  });
}
