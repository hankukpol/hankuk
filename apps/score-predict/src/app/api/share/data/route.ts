import { ExamType, Gender, Prisma, Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { calculatePrediction } from "@/lib/prediction";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type CountRow = {
  totalCount: bigint | number | null;
  higherCount: bigint | number | null;
};

type RankingBasis = "ALL_PARTICIPANTS" | "NON_CUTOFF_PARTICIPANTS";

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toCount(value: bigint | number | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function getPopulationConditionSql(submissionHasCutoff: boolean): Prisma.Sql {
  if (submissionHasCutoff) {
    return Prisma.sql`AND s."isSuspicious" = false`;
  }

  return Prisma.sql`
    AND s."isSuspicious" = false
    AND NOT EXISTS (
      SELECT 1
      FROM "SubjectScore" sf
      WHERE sf."submissionId" = s.id
        AND sf."isFailed" = true
    )
  `;
}

function getGenderConditionSql(params: {
  examType: ExamType;
  gender: Gender;
  recruitAcademicCombined: number;
}): Prisma.Sql {
  const { examType, gender, recruitAcademicCombined } = params;

  if (examType === ExamType.CAREER_RESCUE) {
    return Prisma.sql`AND s."gender"::text = ${Gender.MALE}`;
  }

  if (examType === ExamType.CAREER_ACADEMIC && recruitAcademicCombined > 0) {
    return Prisma.empty;
  }

  return Prisma.sql`AND s."gender"::text = ${gender}`;
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

  const submission = await prisma.submission.findFirst({
    where: submissionId
      ? {
          id: submissionId,
          ...(isAdmin ? {} : { userId }),
        }
      : {
          ...(isAdmin ? {} : { userId }),
        },
    orderBy: submissionId ? undefined : [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      examType: true,
      gender: true,
      totalScore: true,
      finalScore: true,
      subjectScores: {
        select: {
          isFailed: true,
        },
      },
      exam: {
        select: {
          id: true,
          name: true,
          year: true,
          round: true,
        },
      },
      region: {
        select: {
          id: true,
          name: true,
        },
      },
      user: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "공유 가능한 제출 데이터가 없습니다." }, { status: 404 });
  }

  const submissionHasCutoff = submission.subjectScores.some((score) => score.isFailed);
  const rankingBasis: RankingBasis = submissionHasCutoff
    ? "ALL_PARTICIPANTS"
    : "NON_CUTOFF_PARTICIPANTS";
  const populationConditionSql = getPopulationConditionSql(submissionHasCutoff);
  const quota = await prisma.examRegionQuota.findUnique({
    where: {
      examId_regionId: {
        examId: submission.exam.id,
        regionId: submission.region.id,
      },
    },
    select: {
      recruitAcademicCombined: true,
    },
  });
  const genderConditionSql = getGenderConditionSql({
    examType: submission.examType,
    gender: submission.gender,
    recruitAcademicCombined: quota?.recruitAcademicCombined ?? 0,
  });

  const [rankRow] = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT
      COUNT(*) AS "totalCount",
      SUM(CASE WHEN s."finalScore" > ${Number(submission.finalScore)} THEN 1 ELSE 0 END) AS "higherCount"
    FROM "Submission" s
    WHERE s."examId" = ${submission.exam.id}
      AND s."regionId" = ${submission.region.id}
      AND s."examType"::text = ${submission.examType}
      ${genderConditionSql}
      ${populationConditionSql}
  `);

  const totalParticipants = toCount(rankRow?.totalCount);
  const rank = toCount(rankRow?.higherCount) + 1;

  let predictionGrade: string | null = null;
  try {
    const prediction = await calculatePrediction(
      userId,
      { submissionId: submission.id },
      isAdmin ? Role.ADMIN : Role.USER
    );
    predictionGrade = prediction.summary.predictionGrade;
  } catch {
    predictionGrade = null;
  }

  return NextResponse.json({
    submissionId: submission.id,
    exam: {
      id: submission.exam.id,
      name: submission.exam.name,
      year: submission.exam.year,
      round: submission.exam.round,
    },
    user: {
      name: submission.user.name,
    },
    examType: submission.examType,
    examTypeLabel: submission.examType === "PUBLIC" ? "공채" : submission.examType === "CAREER_RESCUE" ? "구조" : submission.examType === "CAREER_ACADEMIC" ? "소방학과" : "구급",
    region: {
      id: submission.region.id,
      name: submission.region.name,
    },
    totalScore: Number(submission.totalScore),
    finalScore: Number(submission.finalScore),
    rank,
    totalParticipants,
    rankingBasis,
    predictionGrade,
  });
}
