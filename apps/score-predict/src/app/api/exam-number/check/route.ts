import { ExamType, Gender } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { validateExamNumberWithRange } from "@/lib/exam-number";
import { prisma } from "@/lib/prisma";
import { consumeFixedWindowRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

export const runtime = "nodejs";

const CHECK_WINDOW_MS = 60 * 1000;
const CHECK_LIMIT_PER_IP = 30;

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseExamType(value: string | null): ExamType | null {
  if (value === ExamType.PUBLIC) return ExamType.PUBLIC;
  if (value === ExamType.CAREER_RESCUE) return ExamType.CAREER_RESCUE;
  if (value === ExamType.CAREER_ACADEMIC) return ExamType.CAREER_ACADEMIC;
  if (value === ExamType.CAREER_EMT) return ExamType.CAREER_EMT;
  return null;
}

function parseGender(value: string | null): Gender | null {
  if (value === Gender.MALE) return Gender.MALE;
  if (value === Gender.FEMALE) return Gender.FEMALE;
  return null;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rateLimit = consumeFixedWindowRateLimit({
    namespace: "exam-number-check-ip",
    key: ip,
    limit: CHECK_LIMIT_PER_IP,
    windowMs: CHECK_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSec) },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const examId = parsePositiveInt(searchParams.get("examId"));
  const regionId = parsePositiveInt(searchParams.get("regionId"));
  const examNumber = searchParams.get("examNumber")?.trim() ?? "";
  const examType = parseExamType(searchParams.get("examType"));
  const gender = parseGender(searchParams.get("gender"));

  if (!examId || !regionId || !examNumber || !examType || !gender) {
    return NextResponse.json(
      { error: "examId, regionId, examNumber, examType, gender가 모두 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const userId = Number(session.user.id);

    const quota = await prisma.examRegionQuota.findUnique({
      where: {
        examId_regionId: { examId, regionId },
      },
      select: {
        recruitAcademicCombined: true,
        examNumberStartPublicMale: true,
        examNumberEndPublicMale: true,
        examNumberStartPublicFemale: true,
        examNumberEndPublicFemale: true,
        examNumberStartCareerRescue: true,
        examNumberEndCareerRescue: true,
        examNumberStartCareerAcademicMale: true,
        examNumberEndCareerAcademicMale: true,
        examNumberStartCareerAcademicFemale: true,
        examNumberEndCareerAcademicFemale: true,
        examNumberStartCareerAcademicCombined: true,
        examNumberEndCareerAcademicCombined: true,
        examNumberStartCareerEmtMale: true,
        examNumberEndCareerEmtMale: true,
        examNumberStartCareerEmtFemale: true,
        examNumberEndCareerEmtFemale: true,
        examNumberStart: true,
        examNumberEnd: true,
      },
    });

    const validation = validateExamNumberWithRange({
      examNumber,
      context: {
        examType,
        gender,
        recruitAcademicCombined: quota?.recruitAcademicCombined ?? 0,
      },
      quota,
    });
    if (!validation.ok) {
      return NextResponse.json({
        available: false,
        reason: validation.message ?? "응시번호 검증에 실패했습니다.",
      });
    }

    const duplicate = await prisma.submission.findFirst({
      where: {
        examId,
        regionId,
        examNumber,
        userId: { not: userId },
      },
      select: { id: true },
    });

    if (duplicate) {
      return NextResponse.json({
        available: false,
        reason: "이미 다른 사용자가 동일한 응시번호로 제출했습니다.",
      });
    }

    return NextResponse.json({ available: true });
  } catch (error) {
    console.error("응시번호 확인 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "응시번호 확인에 실패했습니다." }, { status: 500 });
  }
}

