import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, PassType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ProspectDetailClient, type ProspectDetail } from "./prospect-detail-client";
import { BenchmarkPanel } from "./benchmark-panel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

// Compute subject averages from GraduateRecord score snapshots
function calcSubjectAveragesFromSnapshots(
  records: Array<{
    passType: PassType;
    scoreSnapshots: Array<{ snapshotType: PassType; subjectAverages: unknown }>;
  }>,
): Record<string, number> {
  const sums: Record<string, { sum: number; count: number }> = {};
  for (const record of records) {
    const snap =
      record.scoreSnapshots.find((s) => s.snapshotType === record.passType) ??
      record.scoreSnapshots[0];
    if (!snap) continue;
    const subj = snap.subjectAverages as Record<string, number>;
    for (const [subject, avg] of Object.entries(subj)) {
      if (typeof avg !== "number") continue;
      if (!sums[subject]) sums[subject] = { sum: 0, count: 0 };
      sums[subject]!.sum += avg;
      sums[subject]!.count += 1;
    }
  }
  const result: Record<string, number> = {};
  for (const [subject, { sum, count }] of Object.entries(sums)) {
    result[subject] = Math.round((sum / count) * 10) / 10;
  }
  return result;
}

export default async function ProspectDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;

  const prisma = getPrisma();

  const raw = await prisma.consultationProspect.findUnique({
    where: { id },
    include: {
      staff: { select: { name: true } },
    },
  });

  if (!raw) {
    notFound();
  }

  // If there is a linked enrollment, fetch it with student + cohort
  let enrollmentData: ProspectDetail["enrollment"] = null;
  if (raw.enrollmentId) {
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: { id: raw.enrollmentId },
      select: {
        id: true,
        student: {
          select: {
            examNumber: true,
            name: true,
          },
        },
        cohort: {
          select: {
            name: true,
          },
        },
      },
    });
    if (enrollment) {
      enrollmentData = {
        id: enrollment.id,
        student: enrollment.student
          ? {
              examNumber: enrollment.student.examNumber,
              name: enrollment.student.name,
            }
          : null,
        cohort: enrollment.cohort ? { name: enrollment.cohort.name } : null,
      };
    }
  }

  const prospect: ProspectDetail = {
    id: raw.id,
    name: raw.name,
    phone: raw.phone ?? null,
    examType: raw.examType ?? null,
    source: raw.source,
    stage: raw.stage,
    note: raw.note ?? null,
    staffId: raw.staffId,
    enrollmentId: raw.enrollmentId ?? null,
    visitedAt: raw.visitedAt.toISOString(),
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
    staff: raw.staff,
    enrollment: enrollmentData,
  };

  // ── Benchmark data: query recent 50 graduate records ───────────────────────
  const graduateRecords = await prisma.graduateRecord.findMany({
    take: 50,
    include: {
      scoreSnapshots: {
        select: {
          snapshotType: true,
          subjectAverages: true,
          overallAverage: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const benchmarkSubjectAverages = calcSubjectAveragesFromSnapshots(graduateRecords);

  // Compute overall pass average from overallAverage field
  const avgScoreArr = graduateRecords
    .flatMap((r) => r.scoreSnapshots.map((s) => s.overallAverage))
    .filter((v): v is number => typeof v === "number");
  const passAvgScore =
    avgScoreArr.length > 0
      ? Math.round((avgScoreArr.reduce((a, b) => a + b, 0) / avgScoreArr.length) * 10) / 10
      : 0;

  const monthsArr = graduateRecords
    .map((r) => r.enrolledMonths)
    .filter((m): m is number => typeof m === "number");
  const avgMonths =
    monthsArr.length > 0
      ? Math.round(monthsArr.reduce((a, b) => a + b, 0) / monthsArr.length)
      : 0;

  const benchmarkData = {
    totalGraduates: graduateRecords.length,
    subjectAverages: benchmarkSubjectAverages,
    passAvgScore,
    avgMonths,
  };

  // ── Prospect's recent exam scores (last 3 months) ──────────────────────────
  // Only available if the prospect has already registered as a student
  let prospectSubjectScores: Record<string, number> | null = null;
  if (enrollmentData?.student?.examNumber) {
    const examNumber = enrollmentData.student.examNumber;
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const recentScores = await prisma.score.findMany({
      where: {
        examNumber,
        session: { examDate: { gte: threeMonthsAgo } },
        finalScore: { not: null },
      },
      include: {
        session: { select: { subject: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentScores.length > 0) {
      // Group by subject and average
      const subjectSums: Record<string, { sum: number; count: number }> = {};
      for (const score of recentScores) {
        const subject = score.session.subject as string;
        if (score.finalScore === null) continue;
        if (!subjectSums[subject]) subjectSums[subject] = { sum: 0, count: 0 };
        subjectSums[subject]!.sum += score.finalScore;
        subjectSums[subject]!.count += 1;
      }
      prospectSubjectScores = {};
      for (const [subject, { sum, count }] of Object.entries(subjectSums)) {
        prospectSubjectScores[subject] = Math.round((sum / count) * 10) / 10;
      }
    }
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate">
        <Link href="/admin/prospects" className="transition hover:text-ember">
          상담 방문자
        </Link>
        <span>/</span>
        <span className="text-ink">상세</span>
      </nav>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            상담 방문자 상세
          </div>
          <h1 className="mt-4 text-3xl font-semibold">
            {prospect.name}
            {prospect.phone ? (
              <span className="ml-3 text-xl font-normal text-slate">{prospect.phone}</span>
            ) : null}
          </h1>
          <p className="mt-2 text-sm text-slate">
            방문일:{" "}
            {new Date(prospect.visitedAt).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })}
            {prospect.staff ? ` · 담당: ${prospect.staff.name}` : ""}
          </p>
        </div>
        <Link
          href="/admin/prospects"
          className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          ← 목록으로
        </Link>
      </div>

      {/* Main content (2-col on xl) */}
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,2fr)_300px]">
        {/* Left: interactive client component + benchmark */}
        <div className="space-y-6">
          <ProspectDetailClient initialProspect={prospect} />
          <BenchmarkPanel
            subjectScores={prospectSubjectScores}
            benchmarkData={benchmarkData}
            prospectName={prospect.name}
          />
        </div>

        {/* Right: sidebar */}
        <aside className="self-start space-y-4 xl:sticky xl:top-6">
          {/* Quick actions */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <h2 className="text-base font-semibold">바로가기</h2>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/admin/prospects"
                className="inline-flex items-center justify-center rounded-full border border-ink/10 px-4 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                상담 방문자 목록
              </Link>
              <Link
                href="/admin/enrollments/new"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full border border-forest/20 bg-forest/10 px-4 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/20"
              >
                수강 등록하기
              </Link>
            </div>
          </div>

          {/* Record meta */}
          <div className="rounded-[28px] border border-ink/10 bg-mist p-6">
            <h2 className="text-base font-semibold">기록 정보</h2>
            <dl className="mt-4 space-y-3">
              <div>
                <dt className="text-xs font-medium text-slate">기록 ID</dt>
                <dd className="mt-0.5 break-all text-xs text-ink">{prospect.id}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate">등록일시</dt>
                <dd className="mt-0.5 text-sm text-ink">
                  {new Date(prospect.createdAt).toLocaleString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate">마지막 수정</dt>
                <dd className="mt-0.5 text-sm text-ink">
                  {new Date(prospect.updatedAt).toLocaleString("ko-KR", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
              {prospect.staff ? (
                <div>
                  <dt className="text-xs font-medium text-slate">담당 직원</dt>
                  <dd className="mt-0.5 text-sm text-ink">{prospect.staff.name}</dd>
                </div>
              ) : null}
              {prospect.enrollmentId ? (
                <div>
                  <dt className="text-xs font-medium text-slate">수강 연결 여부</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-forest">연결됨</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
