import { randomInt } from "crypto";
import { ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { buildAdminPreRegistrationWhere } from "@/lib/admin-pre-registrations";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { parsePositiveInt } from "@/lib/exam-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type DrawRequestBody = {
  examId?: unknown;
  regionId?: unknown;
  examType?: unknown;
  search?: unknown;
  winnerCount?: unknown;
};

function parseExamTypeFromBody(value: unknown): ExamType | null {
  if (value === ExamType.PUBLIC) return ExamType.PUBLIC;
  if (value === ExamType.CAREER) return ExamType.CAREER;
  return null;
}

function pickRandomItems<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const target = Math.min(count, pool.length);

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, target);
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("preRegistrations");
  if (featureError) return featureError;

  try {
    const body = (await request.json()) as DrawRequestBody;
    const examId = parsePositiveInt(body.examId);
    const regionId = parsePositiveInt(body.regionId);
    const examTypeRaw = body.examType;
    const examType =
      examTypeRaw === undefined || examTypeRaw === null || examTypeRaw === ""
        ? null
        : parseExamTypeFromBody(examTypeRaw);
    const search = typeof body.search === "string" ? body.search.trim() : "";
    const winnerCount = parsePositiveInt(body.winnerCount);

    if (examTypeRaw !== undefined && examTypeRaw !== null && examTypeRaw !== "" && !examType) {
      return NextResponse.json({ error: "examType은 PUBLIC 또는 CAREER여야 합니다." }, { status: 400 });
    }

    if (!winnerCount) {
      return NextResponse.json({ error: "당첨자 수는 1명 이상이어야 합니다." }, { status: 400 });
    }

    const candidates = await prisma.preRegistration.findMany({
      where: buildAdminPreRegistrationWhere({
        examId,
        regionId,
        examType,
        search,
      }),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        examType: true,
        gender: true,
        examNumber: true,
        updatedAt: true,
        user: {
          select: {
            name: true,
            phone: true,
            contactPhone: true,
          },
        },
        exam: {
          select: {
            name: true,
            year: true,
            round: true,
          },
        },
        region: {
          select: {
            name: true,
          },
        },
      },
    });

    if (candidates.length < 1) {
      return NextResponse.json({ error: "현재 조건에 맞는 사전등록자가 없습니다." }, { status: 404 });
    }

    const winners = pickRandomItems(candidates, winnerCount);

    return NextResponse.json({
      eligibleCount: candidates.length,
      requestedWinnerCount: winnerCount,
      drawnWinnerCount: winners.length,
      drawnAt: new Date().toISOString(),
      winners: winners.map((winner, index) => ({
        drawRank: index + 1,
        id: winner.id,
        userName: winner.user.name,
        userPhone: winner.user.phone, // 로그인 아이디
        userContactPhone: winner.user.contactPhone, // 연락처
        examName: winner.exam.name,
        examYear: winner.exam.year,
        examRound: winner.exam.round,
        regionName: winner.region.name,
        examType: winner.examType,
        gender: winner.gender,
        examNumber: winner.examNumber,
        updatedAt: winner.updatedAt,
      })),
    });
  } catch (error) {
    console.error("사전등록 이벤트 추첨 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "이벤트 추첨에 실패했습니다." }, { status: 500 });
  }
}
