import { AdminRole, PassType } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { ScoreJourneyClient } from "./score-journey-client";

export const dynamic = "force-dynamic";

export type ScoreJourneyData = {
  graduateId: string;
  examNumber: string;
  studentName: string;
  studentMobile: string | null;
  examName: string;
  passType: PassType;
  writtenPassDate: string | null;
  finalPassDate: string | null;
  appointedDate: string | null;
  enrolledMonths: number | null;
  scoreSnapshots: Array<{
    id: string;
    snapshotType: PassType;
    totalEnrolledMonths: number;
    overallAverage: number | null;
    finalMonthAverage: number | null;
    attendanceRate: number | null;
    subjectAverages: Record<string, number>;
    monthlyAverages: Array<{ month: string; avg: number }>;
    first3MonthsAvg: number | null;
    last3MonthsAvg: number | null;
    createdAt: string;
  }>;
  // Raw score history for individual exam sessions
  scoreHistory: Array<{
    sessionId: number;
    subject: string;
    examDate: string;
    finalScore: number | null;
    rawScore: number | null;
  }>;
};

type PageProps = { params: Promise<{ id: string }> };

export default async function ScoreJourneyPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { id } = await params;
  const prisma = getPrisma();

  const record = await prisma.graduateRecord.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
        },
      },
      scoreSnapshots: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!record) notFound();

  // Fetch raw score history from the Score table for this student
  const rawScores = await prisma.score.findMany({
    where: { examNumber: record.examNumber },
    include: {
      session: {
        select: {
          subject: true,
          examDate: true,
        },
      },
    },
    orderBy: { session: { examDate: "asc" } },
  });

  const data: ScoreJourneyData = {
    graduateId: record.id,
    examNumber: record.examNumber,
    studentName: record.student.name,
    studentMobile: record.student.phone ?? null,
    examName: record.examName,
    passType: record.passType,
    writtenPassDate: record.writtenPassDate?.toISOString() ?? null,
    finalPassDate: record.finalPassDate?.toISOString() ?? null,
    appointedDate: record.appointedDate?.toISOString() ?? null,
    enrolledMonths: record.enrolledMonths,
    scoreSnapshots: record.scoreSnapshots.map((s) => ({
      id: s.id,
      snapshotType: s.snapshotType,
      totalEnrolledMonths: s.totalEnrolledMonths,
      overallAverage: s.overallAverage,
      finalMonthAverage: s.finalMonthAverage,
      attendanceRate: s.attendanceRate,
      subjectAverages: s.subjectAverages as Record<string, number>,
      monthlyAverages: s.monthlyAverages as Array<{ month: string; avg: number }>,
      first3MonthsAvg: s.first3MonthsAvg,
      last3MonthsAvg: s.last3MonthsAvg,
      createdAt: s.createdAt.toISOString(),
    })),
    scoreHistory: rawScores.map((s) => ({
      sessionId: s.sessionId,
      subject: s.session.subject,
      examDate: s.session.examDate.toISOString(),
      finalScore: s.finalScore,
      rawScore: s.rawScore,
    })),
  };

  const PASS_TYPE_LABEL: Record<PassType, string> = {
    WRITTEN_PASS: "필기합격",
    FINAL_PASS: "최종합격",
    APPOINTED: "임용",
    WRITTEN_FAIL: "필기불합격",
    FINAL_FAIL: "최종불합격",
  };

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "판정 관리", href: "/admin/graduates" },
          { label: "합격자 관리", href: "/admin/graduates" },
          { label: record.student.name, href: `/admin/graduates/${id}` },
          { label: "성적 궤적" },
        ]}
      />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
            성적 궤적 분석
          </div>
          <h1 className="mt-4 text-3xl font-semibold">
            {record.student.name}
            <span className="ml-2 text-lg font-normal text-slate">
              {PASS_TYPE_LABEL[record.passType]}
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href={`/admin/graduates/${id}`}
            className="rounded-[20px] border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-ink/40 hover:text-ink"
          >
            ← 합격자 상세
          </Link>
          <Link
            href={`/admin/students/${record.examNumber}`}
            className="rounded-[20px] border border-forest/30 bg-forest/5 px-4 py-2 text-sm font-medium text-forest transition-colors hover:bg-forest/10"
          >
            학생 프로필 →
          </Link>
        </div>
      </div>

      <ScoreJourneyClient data={data} />
    </div>
  );
}
