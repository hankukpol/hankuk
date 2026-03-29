import { ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePage(value: string | null): number {
  return parsePositiveInt(value) ?? 1;
}

function parseLimit(value: string | null): number {
  const parsed = parsePositiveInt(value) ?? 20;
  return Math.min(parsed, 50);
}

function parseExamType(value: string | null): ExamType | null {
  if (value === ExamType.PUBLIC) return ExamType.PUBLIC;
  if (value === ExamType.CAREER_RESCUE) return ExamType.CAREER_RESCUE;
  if (value === ExamType.CAREER_ACADEMIC) return ExamType.CAREER_ACADEMIC;
  if (value === ExamType.CAREER_EMT) return ExamType.CAREER_EMT;
  return null;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("submissions");
  if (featureError) return featureError;

  try {
    const { searchParams } = new URL(request.url);
    const page = parsePage(searchParams.get("page"));
    const limit = parseLimit(searchParams.get("limit"));
    const examId = parsePositiveInt(searchParams.get("examId"));
    const regionId = parsePositiveInt(searchParams.get("regionId"));
    const userId = parsePositiveInt(searchParams.get("userId"));
    const examType = parseExamType(searchParams.get("examType"));
    const search = searchParams.get("search")?.trim() ?? "";
    const suspicious = searchParams.get("suspicious");

    if (searchParams.get("examType") && !examType) {
      return NextResponse.json({ error: "examType은 PUBLIC, CAREER_RESCUE, CAREER_ACADEMIC, CAREER_EMT여야 합니다." }, { status: 400 });
    }

    const where = {
      ...(examId ? { examId } : {}),
      ...(regionId ? { regionId } : {}),
      ...(userId ? { userId } : {}),
      ...(examType ? { examType } : {}),
      ...(suspicious === "true"
        ? { isSuspicious: true }
        : suspicious === "false"
          ? { isSuspicious: false }
          : {}),
      ...(search
        ? {
            OR: [
              { user: { name: { contains: search } } },
              { user: { phone: { contains: search } } },
              { examNumber: { contains: search } },
            ],
          }
        : {}),
    };

    const skip = (page - 1) * limit;
    const [totalCount, submissions] = await prisma.$transaction([
      prisma.submission.count({ where }),
      prisma.submission.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          examId: true,
          userId: true,
          regionId: true,
          examType: true,
          gender: true,
          examNumber: true,
          totalScore: true,
          finalScore: true,
          bonusType: true,
          bonusRate: true,
          isSuspicious: true,
          suspiciousReason: true,
          createdAt: true,
          user: {
            select: {
              name: true,
              phone: true,
            },
          },
          region: {
            select: {
              name: true,
            },
          },
          exam: {
            select: {
              name: true,
            },
          },
          subjectScores: {
            where: {
              isFailed: true,
            },
            take: 1,
            select: {
              id: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const safePage = Math.min(page, totalPages);

    return NextResponse.json({
      pagination: {
        page: safePage,
        limit,
        totalCount,
        totalPages,
      },
      submissions: submissions.map((submission) => ({
        id: submission.id,
        examId: submission.examId,
        userId: submission.userId,
        userName: submission.user.name,
        userPhone: submission.user.phone,
        examName: submission.exam.name,
        examType: submission.examType,
        regionId: submission.regionId,
        regionName: submission.region.name,
        gender: submission.gender,
        examNumber: submission.examNumber,
        totalScore: Number(submission.totalScore),
        finalScore: Number(submission.finalScore),
        bonusType: submission.bonusType,
        bonusRate: Number(submission.bonusRate),
        isSuspicious: submission.isSuspicious,
        suspiciousReason: submission.suspiciousReason,
        hasCutoff: submission.subjectScores.length > 0,
        createdAt: submission.createdAt,
      })),
    });
  } catch (error) {
    console.error("관리자 제출 목록 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "제출 목록 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("submissions");
  if (featureError) return featureError;

  const { searchParams } = new URL(request.url);
  const submissionId = parsePositiveInt(searchParams.get("id"));

  if (!submissionId) {
    return NextResponse.json({ error: "수정할 제출 ID가 필요합니다." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { examNumber?: unknown };
    if (!("examNumber" in body)) {
      return NextResponse.json({ error: "examNumber 필드가 필요합니다." }, { status: 400 });
    }

    const examNumber = typeof body.examNumber === "string" ? body.examNumber.trim() : "";

    const exists = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "제출 데이터를 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.submission.update({
      where: { id: submissionId },
      data: { examNumber },
    });

    return NextResponse.json({ success: true, submissionId, examNumber });
  } catch (error) {
    console.error("제출 응시번호 수정 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "응시번호 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("submissions");
  if (featureError) return featureError;

  const { searchParams } = new URL(request.url);
  const submissionId = parsePositiveInt(searchParams.get("id"));
  const confirmed = searchParams.get("confirm") === "true";

  if (!submissionId) {
    return NextResponse.json({ error: "삭제할 제출 ID가 필요합니다." }, { status: 400 });
  }
  if (!confirmed) {
    return NextResponse.json({ error: "confirm=true 파라미터가 필요합니다." }, { status: 400 });
  }

  try {
    const exists = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "삭제할 제출 데이터를 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.submission.delete({
      where: { id: submissionId },
    });

    return NextResponse.json({
      success: true,
      deletedSubmissionId: submissionId,
    });
  } catch (error) {
    console.error("제출 데이터 삭제 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "제출 데이터 삭제에 실패했습니다." }, { status: 500 });
  }
}
