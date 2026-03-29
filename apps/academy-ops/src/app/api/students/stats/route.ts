import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const prisma = getPrisma();
  const academyId = resolveVisibleAcademyId(auth.context);
  const academyScope = academyId === null ? {} : { academyId };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);

  const [totalStudents, activeStudents, newThisMonth, inactiveCount] = await Promise.all([
    prisma.student.count({ where: academyScope }),
    prisma.student.count({ where: { ...academyScope, isActive: true } }),
    prisma.student.count({ where: { ...academyScope, createdAt: { gte: monthStart } } }),
    prisma.student.count({ where: { ...academyScope, isActive: false } }),
  ]);

  const examTypeRaw = await prisma.student.groupBy({
    by: ["examType"],
    where: academyScope,
    _count: { examType: true },
  });
  const examTypeDistribution = examTypeRaw.map((r) => ({
    examType: r.examType as string,
    count: r._count.examType,
  }));

  const latestEnrollmentRows = await prisma.courseEnrollment.findMany({
    where: academyScope,
    select: {
      academyId: true,
      examNumber: true,
      status: true,
      createdAt: true,
    },
    orderBy: [{ examNumber: "asc" }, { createdAt: "desc" }],
  });
  const latestStatusMap = new Map<string, string>();
  for (const row of latestEnrollmentRows) {
    const key = `${row.academyId}:${row.examNumber}`;
    if (!latestStatusMap.has(key)) {
      latestStatusMap.set(key, row.status);
    }
  }
  const statusCounter = new Map<string, number>();
  for (const status of latestStatusMap.values()) {
    statusCounter.set(status, (statusCounter.get(status) ?? 0) + 1);
  }
  const statusDistribution = Array.from(statusCounter.entries()).map(([status, count]) => ({
    status,
    count,
  }));

  const monthlyRaw = await prisma.student.findMany({
    where: { ...academyScope, createdAt: { gte: twelveMonthsAgo } },
    select: { createdAt: true },
  });

  const monthlyMap = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, 0);
  }
  for (const student of monthlyRaw) {
    const key = `${student.createdAt.getFullYear()}-${String(student.createdAt.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyMap.has(key)) {
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
    }
  }
  const monthlyNewStudents = Array.from(monthlyMap.entries()).map(([month, count]) => ({
    month,
    count,
  }));

  const generationRaw = await prisma.student.groupBy({
    by: ["generation"],
    where: { ...academyScope, generation: { not: null } },
    _count: { generation: true },
    orderBy: { generation: "asc" },
  });
  const gradeDistribution = generationRaw.map((r) => ({
    generation: r.generation !== null ? String(r.generation) : "미정",
    count: r._count.generation,
  }));

  return NextResponse.json({
    data: {
      kpi: { totalStudents, activeStudents, newThisMonth, inactiveCount },
      examTypeDistribution,
      statusDistribution,
      monthlyNewStudents,
      gradeDistribution,
    },
  });
}