import { Prisma, Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { parsePositiveInt } from "@/lib/exam-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PARTICIPANTS = 10;
const SCORE_BUCKET_SIZE = 10;
const BUCKET_COUNT = 25;
const MAX_SCORE = 250;

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

function getBucketIndex(score: number): number {
  const safe = Math.max(0, Math.min(MAX_SCORE, score));
  if (safe >= MAX_SCORE) return BUCKET_COUNT - 1;
  return Math.max(0, Math.min(BUCKET_COUNT - 1, Math.floor(safe / SCORE_BUCKET_SIZE)));
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

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
    where: submissionId ? { id: submissionId, ...(isAdmin ? {} : { userId }) } : { userId },
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
        LEAST(FLOOR(GREATEST(s."totalScore", 0) / ${SCORE_BUCKET_SIZE}), ${BUCKET_COUNT - 1})::int AS bucket,
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
    if (bucket < 0 || bucket >= BUCKET_COUNT) continue;
    counts.set(bucket, toCount(row.count));
  }

  const myScore = roundNumber(Number(submission.totalScore));
  const myBucket = getBucketIndex(myScore);

  return NextResponse.json({
    success: true,
    data: {
      totalParticipants,
      isCollecting: totalParticipants < MIN_PARTICIPANTS,
      myScore,
      myBucket,
      buckets: Array.from({ length: BUCKET_COUNT }, (_, index) => {
        const start = index * SCORE_BUCKET_SIZE;
        const end = index === BUCKET_COUNT - 1 ? MAX_SCORE : start + SCORE_BUCKET_SIZE;
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
