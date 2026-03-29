import { Prisma, Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { parsePositiveInt } from "@/lib/exam-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PARTICIPANTS = 10;

type ParticipantRow = {
  totalCount: bigint | number | null;
};

type WrongRateRow = {
  subjectId: number;
  subjectName: string;
  questionNumber: number;
  wrongRate: unknown;
  correctAnswer: number;
};

function toCount(value: bigint | number | null | undefined): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function toNumeric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object") {
    const parsed = Number(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
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
  const subjectId = parsePositiveInt(searchParams.get("subjectId"));

  if (searchParams.get("submissionId") && !submissionId) {
    return NextResponse.json({ error: "submissionId가 올바르지 않습니다." }, { status: 400 });
  }
  if (searchParams.get("subjectId") && !subjectId) {
    return NextResponse.json({ error: "subjectId가 올바르지 않습니다." }, { status: 400 });
  }

  const submission = await prisma.submission.findFirst({
    where: submissionId ? { id: submissionId, ...(isAdmin ? {} : { userId }) } : { userId },
    orderBy: submissionId ? undefined : [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      examId: true,
      examType: true,
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "조회할 성적 데이터가 없습니다." }, { status: 404 });
  }

  const [participantRow] = await prisma.$queryRaw<ParticipantRow[]>(Prisma.sql`
    SELECT COUNT(*) AS "totalCount"
    FROM "Submission" s
    WHERE s."examId" = ${submission.examId}
      AND s."examType"::text = ${submission.examType}
      AND s."isSuspicious" = false
  `);

  const totalParticipants = toCount(participantRow?.totalCount);
  if (totalParticipants < MIN_PARTICIPANTS) {
    return NextResponse.json({
      success: true,
      data: {
        totalParticipants,
        isCollecting: true,
        items: [],
      },
    });
  }

  const subjectFilterSql = subjectId
    ? Prisma.sql`AND ua."subjectId" = ${subjectId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<WrongRateRow[]>(Prisma.sql`
    SELECT
      ua."subjectId" AS "subjectId",
      sub."name" AS "subjectName",
      ua."questionNumber" AS "questionNumber",
      ROUND(
        (SUM(CASE WHEN ua."isCorrect" = false THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0))::numeric,
        2
      ) AS "wrongRate",
      MAX(ak."correctAnswer") AS "correctAnswer"
    FROM "UserAnswer" ua
    INNER JOIN "Submission" s ON ua."submissionId" = s.id
    INNER JOIN "Subject" sub ON sub.id = ua."subjectId"
    INNER JOIN "AnswerKey" ak
      ON ak."examId" = s."examId"
     AND ak."subjectId" = ua."subjectId"
     AND ak."questionNumber" = ua."questionNumber"
    WHERE s."examId" = ${submission.examId}
      AND s."examType"::text = ${submission.examType}
      AND s."isSuspicious" = false
      ${subjectFilterSql}
    GROUP BY ua."subjectId", sub."name", ua."questionNumber"
    ORDER BY "wrongRate" DESC, ua."subjectId" ASC, ua."questionNumber" ASC
    LIMIT 5
  `);

  return NextResponse.json({
    success: true,
    data: {
      totalParticipants,
      isCollecting: false,
      items: rows.map((row, index) => ({
        rank: index + 1,
        subjectId: row.subjectId,
        subjectName: row.subjectName,
        questionNumber: row.questionNumber,
        wrongRate: roundNumber(toNumeric(row.wrongRate)),
        correctAnswer: row.correctAnswer,
      })),
    },
  });
}
