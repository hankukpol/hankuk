import { Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantSessionContext } from "@/lib/tenant-session.server";
import { parsePositiveInt } from "@/lib/exam-utils";
import { prisma } from "@/lib/prisma";
import { isExamTypeForTenant, TENANT_EXAM_TYPES } from "@/lib/tenant-exam";
import { isOperationFeatureEnabled } from "@/lib/exam-operation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PARTICIPANTS = 10;
const SCORE_BUCKET_SIZE = 10;

type ParticipantRow = {
  totalCount: bigint | number | null;
};

type DistributionRow = {
  bucket: bigint | number;
  count: bigint | number;
};

function toCount(value: bigint | number | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

function getBucketIndex(score: number, maxScore: number, bucketCount: number): number {
  const safe = Math.max(0, Math.min(maxScore, score));
  if (safe >= maxScore) return bucketCount - 1;
  return Math.max(0, Math.min(bucketCount - 1, Math.floor(safe / SCORE_BUCKET_SIZE)));
}

export async function GET(request: NextRequest) {
  if (!(await isOperationFeatureEnabled("analysis"))) return NextResponse.json({ error: "표본 분석은 아직 공개되지 않았습니다." }, { status: 403 });
  const tenantSession = await getCurrentTenantSessionContext();
  if (!tenantSession?.session.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { session, tenantType } = tenantSession;
  const userId = Number(session.user.id);
  const isAdmin = ((session.user.role as Role | undefined) ?? Role.USER) === Role.ADMIN;
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const submissionId = parsePositiveInt(searchParams.get("submissionId"));
  if (searchParams.get("submissionId") && !submissionId) {
    return NextResponse.json({ error: "submissionId가 올바르지 않습니다." }, { status: 400 });
  }

  const submission = await prisma.submission.findFirst({
    where: submissionId
      ? {
          id: submissionId,
          examType: { in: [...TENANT_EXAM_TYPES[tenantType]] },
          ...(isAdmin ? {} : { userId }),
        }
      : { userId, examType: { in: [...TENANT_EXAM_TYPES[tenantType]] } },
    orderBy: submissionId ? undefined : [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      examId: true,
      examType: true,
      totalScore: true,
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "조회할 성적 데이터가 없습니다." }, { status: 404 });
  }

  if (!isExamTypeForTenant(tenantType, submission.examType)) {
    return NextResponse.json({ error: "현재 서비스의 시험유형이 아닙니다." }, { status: 409 });
  }

  const maxScoreAggregate = await prisma.subject.aggregate({
    where: { examType: submission.examType },
    _sum: { maxScore: true },
  });
  const maxScore = Math.max(SCORE_BUCKET_SIZE, Number(maxScoreAggregate._sum?.maxScore ?? 0));
  const bucketCount = Math.max(1, Math.ceil(maxScore / SCORE_BUCKET_SIZE));

  const [participantRow, distributionRows] = await Promise.all([
    prisma.$queryRaw<ParticipantRow[]>(Prisma.sql`
      SELECT COUNT(*) AS "totalCount"
      FROM "Submission" s
      WHERE s."examId" = ${submission.examId}
        AND s."examType"::text = ${submission.examType}
        AND s."isSuspicious" = false
    `),
    prisma.$queryRaw<DistributionRow[]>(Prisma.sql`
      SELECT
        LEAST(FLOOR(GREATEST(s."totalScore", 0) / ${SCORE_BUCKET_SIZE}), ${bucketCount - 1})::int AS bucket,
        COUNT(*)::bigint AS count
      FROM "Submission" s
      WHERE s."examId" = ${submission.examId}
        AND s."examType"::text = ${submission.examType}
        AND s."isSuspicious" = false
      GROUP BY bucket
      ORDER BY bucket ASC
    `),
  ]);

  const totalParticipants = toCount(participantRow[0]?.totalCount);
  const counts = new Map<number, number>();
  for (const row of distributionRows) {
    const bucket = toCount(row.bucket);
    if (bucket < 0 || bucket >= bucketCount) continue;
    counts.set(bucket, toCount(row.count));
  }

  const myScore = roundNumber(Number(submission.totalScore));
  const myBucket = getBucketIndex(myScore, maxScore, bucketCount);

  return NextResponse.json({
    success: true,
    data: {
      totalParticipants,
      isCollecting: totalParticipants < MIN_PARTICIPANTS,
      myScore,
      myBucket,
      buckets: Array.from({ length: bucketCount }, (_, index) => {
        const start = index * SCORE_BUCKET_SIZE;
        const end = index === bucketCount - 1 ? maxScore : start + SCORE_BUCKET_SIZE;
        return {
          bucket: index,
          label: `${start}~${end}`,
          bucketStart: start,
          bucketEnd: end,
          count: counts.get(index) ?? 0,
          isMyBucket: index === myBucket,
        };
      }),
    },
  });
}
