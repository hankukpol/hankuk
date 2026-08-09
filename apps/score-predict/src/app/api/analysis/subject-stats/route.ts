import { Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantSessionContext } from "@/lib/tenant-session.server";
import { parsePositiveInt } from "@/lib/exam-utils";
import { prisma } from "@/lib/prisma";
import {
  getTenantSubjectOrder,
  isExamTypeForTenant,
  TENANT_EXAM_TYPES,
} from "@/lib/tenant-exam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParticipantRow = {
  totalCount: bigint | number | null;
};

type SubjectAverageRow = {
  subjectId: number;
  averageScore: unknown;
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
  const tenantSession = await getCurrentTenantSessionContext();
  if (!tenantSession) {
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
      id: true,
      examId: true,
      examType: true,
      subjectScores: {
        select: {
          subjectId: true,
          rawScore: true,
          subject: {
            select: {
              name: true,
              maxScore: true,
            },
          },
        },
      },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "조회할 성적 데이터가 없습니다." }, { status: 404 });
  }

  if (!isExamTypeForTenant(tenantType, submission.examType)) {
    return NextResponse.json({ error: "현재 서비스의 시험유형이 아닙니다." }, { status: 409 });
  }

  const [participantRow] = await prisma.$queryRaw<ParticipantRow[]>(Prisma.sql`
    SELECT COUNT(*) AS "totalCount"
    FROM "Submission" s
    WHERE s."examId" = ${submission.examId}
      AND s."examType"::text = ${submission.examType}
      AND s."isSuspicious" = false
  `);

  const totalParticipants = toCount(participantRow?.totalCount);
  const subjectIds = submission.subjectScores.map((score) => score.subjectId);

  const averageRows =
    subjectIds.length > 0
      ? await prisma.$queryRaw<SubjectAverageRow[]>(Prisma.sql`
          SELECT
            ss."subjectId" AS "subjectId",
            ROUND(AVG(ss."rawScore")::numeric, 2) AS "averageScore"
          FROM "Submission" s
          INNER JOIN "SubjectScore" ss
            ON ss."submissionId" = s.id
           AND ss."subjectId" IN (${Prisma.join(subjectIds)})
          WHERE s."examId" = ${submission.examId}
            AND s."examType"::text = ${submission.examType}
            AND s."isSuspicious" = false
          GROUP BY ss."subjectId"
        `)
      : [];

  const averageMap = new Map(
    averageRows.map((row) => [row.subjectId, roundNumber(toNumeric(row.averageScore))] as const)
  );

  const subjectOrder = getTenantSubjectOrder(tenantType, submission.examType);
  const subjects = [...submission.subjectScores]
    .sort((a, b) => {
      const aIndex = subjectOrder.indexOf(a.subject.name);
      const bIndex = subjectOrder.indexOf(b.subject.name);
      const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
      const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
      if (safeA !== safeB) return safeA - safeB;
      return a.subjectId - b.subjectId;
    })
    .map((score) => ({
      subjectId: score.subjectId,
      subjectName: score.subject.name,
      myScore: roundNumber(Number(score.rawScore)),
      averageScore: averageMap.get(score.subjectId) ?? 0,
      maxPossible: roundNumber(Number(score.subject.maxScore)),
    }));

  return NextResponse.json({
    success: true,
    data: {
      scope: "EXAM_TYPE_ALL",
      totalParticipants,
      subjects,
    },
  });
}

