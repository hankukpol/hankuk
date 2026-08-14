import { ExamType, Gender } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantSessionContext } from "@/lib/tenant-session.server";
import { getEffectiveOperationContext } from "@/lib/exam-operation";
import { validateExamNumberWithRange } from "@/lib/fire/exam-number";
import { validatePoliceExamNumberWithRange } from "@/lib/police/exam-number";
import { prisma } from "@/lib/prisma";
import { consumeFixedWindowRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { isExamTypeForTenant } from "@/lib/tenant-exam";
import type { TenantType } from "@/lib/tenant";
import {
  isActiveExamRouteError,
  resolveActiveExamForWrite,
} from "@/lib/active-exam";
import { checkExamNumberAvailability } from "@/lib/police/pre-registration";

export const runtime = "nodejs";

const CHECK_WINDOW_MS = 60 * 1000;
const CHECK_LIMIT_PER_IP = 30;

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseExamType(tenantType: TenantType, value: string | null): ExamType | null {
  return isExamTypeForTenant(tenantType, value) ? value : null;
}

function parseGender(value: string | null): Gender | null {
  if (value === Gender.MALE) return Gender.MALE;
  if (value === Gender.FEMALE) return Gender.FEMALE;
  return null;
}

export async function GET(request: NextRequest) {
  const operation = await getEffectiveOperationContext();
  if (!operation.features.preRegistration && !operation.features.answerInput) {
    return NextResponse.json({ error: "응시번호 입력 기간이 아닙니다." }, { status: 403 });
  }
  const tenantSession = await getCurrentTenantSessionContext();
  if (!tenantSession) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { session, tenantType } = tenantSession;

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
  const examType = parseExamType(tenantType, searchParams.get("examType"));
  const gender = parseGender(searchParams.get("gender"));

  if (!regionId || !examNumber || !examType || (tenantType === "fire" && !gender)) {
    return NextResponse.json(
      { error: tenantType === "fire" ? "regionId, examNumber, examType, gender가 모두 필요합니다." : "regionId, examNumber, examType이 모두 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const userId = Number(session.user.id);
    const activeExam = await resolveActiveExamForWrite({
      db: prisma,
      tenantType,
      context: "api/exam-number/check GET",
      requestedExamId: examId,
    });
    const effectiveExamId = activeExam.id;

    if (tenantType === "police") {
      const region = await prisma.region.findUnique({
        where: { id: regionId },
        select: { name: true, isActive: true },
      });
      if (!region?.isActive) {
        return NextResponse.json({
          available: false,
          reason: "비활성 지역은 수험번호를 확인할 수 없습니다.",
        });
      }
    }

    const quota = await prisma.examRegionQuota.findUnique({
      where: {
        examId_regionId: { examId: effectiveExamId, regionId },
      },
      select: {
        examNumberStartCareer: true,
        examNumberEndCareer: true,
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

    const validation =
      tenantType === "police"
        ? validatePoliceExamNumberWithRange({ examNumber, examType, quota })
        : validateExamNumberWithRange({
            examNumber,
            context: {
              examType,
              gender: gender!,
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

    if (tenantType === "police") {
      const availability = await checkExamNumberAvailability({
        examId: effectiveExamId,
        regionId,
        examType,
        examNumber,
        userId,
      });
      if (!availability.available) {
        return NextResponse.json({ available: false, reason: availability.reason });
      }
      return NextResponse.json({ available: true });
    }

    const duplicate = await prisma.submission.findFirst({
      where: {
        examId: effectiveExamId,
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
    if (isActiveExamRouteError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("응시번호 확인 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "응시번호 확인에 실패했습니다." }, { status: 500 });
  }
}

