import { ExamType, SubmissionSuspicionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";
import {
  getTenantExamTypeErrorMessage,
  isExamTypeForTenant,
  TENANT_EXAM_TYPES,
} from "@/lib/tenant-exam";
import type { TenantType } from "@/lib/tenant";
import { getClientIp } from "@/lib/request-ip";
import {
  isActiveExamRouteError,
  lockActiveExamStateForWrite,
  resolveActiveExamForWrite,
} from "@/lib/active-exam";
import {
  checkExamNumberAvailability,
  lockExamNumberMutation,
  lockUserExamMutation,
} from "@/lib/police/pre-registration";
import { parsePoliceExamNumberInput } from "@/lib/police/exam-number";
import { parseExamNumberInput as parseFireExamNumberInput } from "@/lib/fire/exam-number";
import { hasPoliceWrittenCutoff } from "@/lib/police/written-policy";
import {
  buildAdminSubmissionOrderBy,
  buildAdminSubmissionWhere,
  parseAdminSubmissionSort,
} from "@/lib/admin-submissions";

export const runtime = "nodejs";

class AdminSubmissionWriteError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "AdminSubmissionWriteError";
  }
}

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

function parseExamType(tenantType: TenantType, value: string | null): ExamType | null {
  return isExamTypeForTenant(tenantType, value) ? value : null;
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
    const examType = parseExamType(guard.tenantType, searchParams.get("examType"));
    const search = searchParams.get("search")?.trim() ?? "";
    const suspicious = searchParams.get("suspicious");
    const suspicionStatusValue = searchParams.get("suspicionStatus");
    const suspicionStatus = Object.values(SubmissionSuspicionStatus).includes(
      suspicionStatusValue as SubmissionSuspicionStatus
    )
      ? (suspicionStatusValue as SubmissionSuspicionStatus)
      : null;
    const submissionSort = parseAdminSubmissionSort(
      searchParams.get("sortBy"),
      searchParams.get("sortOrder")
    );

    if (searchParams.get("examType") && !examType) {
      return NextResponse.json({ error: getTenantExamTypeErrorMessage(guard.tenantType) }, { status: 400 });
    }

    const where = buildAdminSubmissionWhere(
      {
        examId,
        regionId,
        userId,
        examType,
        search,
        suspicious,
        suspicionStatus,
      },
      { allowedExamTypes: TENANT_EXAM_TYPES[guard.tenantType] }
    );

    const skip = (page - 1) * limit;
    const [totalCount, submissions] = await prisma.$transaction(async (tx) =>
      Promise.all([
        tx.submission.count({ where }),
        tx.submission.findMany({
          where,
          orderBy: buildAdminSubmissionOrderBy(submissionSort),
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
            suspicionStatus: true,
            suspicionManualDecision: true,
            suspicionReviewNote: true,
            suspicionReviewedAt: true,
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
              select: {
                isFailed: true,
              },
            },
          },
        }),
      ])
    );

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
        suspicionStatus: submission.suspicionStatus,
        suspicionManualDecision: submission.suspicionManualDecision,
        suspicionReviewNote: submission.suspicionReviewNote,
        suspicionReviewedAt: submission.suspicionReviewedAt,
        hasCutoff:
          guard.tenantType === "police"
            ? hasPoliceWrittenCutoff({
                examType: submission.examType,
                totalScore: Number(submission.totalScore),
                subjectScores: submission.subjectScores,
              })
            : submission.subjectScores.some((score) => score.isFailed),
        createdAt: submission.createdAt,
      })),
    });
  } catch (error) {
    console.error("관리자 제출 목록 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "제출 목록 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("submissions");
  if (featureError) return featureError;

  const { searchParams } = new URL(request.url);
  const submissionId = parsePositiveInt(searchParams.get("id"));
  if (!submissionId) {
    return NextResponse.json({ error: "판정할 제출 ID가 필요합니다." }, { status: 400 });
  }

  const adminUserId = Number(guard.session.user.id);
  if (!Number.isInteger(adminUserId) || adminUserId < 1) {
    return NextResponse.json({ error: "관리자 정보를 확인할 수 없습니다." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { decision?: unknown; note?: unknown };
    const decision = body.decision === "CLEAR" || body.decision === "EXCLUDE"
      ? body.decision
      : null;
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!decision) {
      return NextResponse.json(
        { error: "판정은 정상 처리 또는 통계 제외 중에서 선택해 주세요." },
        { status: 400 }
      );
    }
    if (note.length > 500) {
      return NextResponse.json({ error: "판정 메모는 500자 이내로 입력해 주세요." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.submission.findFirst({
        where: {
          id: submissionId,
          examType: { in: [...TENANT_EXAM_TYPES[guard.tenantType]] },
        },
        select: {
          id: true,
          suspicionStatus: true,
          suspicionAutoReason: true,
        },
      });
      if (!submission) {
        throw new AdminSubmissionWriteError("제출 데이터를 찾을 수 없습니다.", 404);
      }

      const nextStatus = decision === "EXCLUDE"
        ? SubmissionSuspicionStatus.EXCLUDED
        : SubmissionSuspicionStatus.CLEAR;
      const reviewedAt = new Date();

      await tx.submission.update({
        where: { id: submission.id },
        data: {
          isSuspicious: decision === "EXCLUDE",
          suspicionStatus: nextStatus,
          suspicionManualDecision: true,
          suspicionReviewNote: note || null,
          suspicionReviewedAt: reviewedAt,
          suspiciousReason:
            decision === "EXCLUDE"
              ? note || submission.suspicionAutoReason || "관리자 통계 제외 판정"
              : submission.suspicionAutoReason,
        },
      });

      await tx.submissionLog.create({
        data: {
          submissionId: submission.id,
          userId: adminUserId,
          action: decision === "EXCLUDE" ? "SUSPICION_EXCLUDE" : "SUSPICION_CLEAR",
          ipAddress: getClientIp(request),
          changedFields: JSON.stringify({
            previousStatus: submission.suspicionStatus,
            nextStatus,
            note: note || null,
          }),
        },
      });

      return { nextStatus, reviewedAt };
    });

    return NextResponse.json({
      success: true,
      submissionId,
      suspicionStatus: result.nextStatus,
      reviewedAt: result.reviewedAt,
    });
  } catch (error) {
    if (error instanceof AdminSubmissionWriteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("성적 의심 판정 처리 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "성적 의심 판정을 저장하지 못했습니다." }, { status: 500 });
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

    const examNumber = guard.tenantType === "police"
      ? parsePoliceExamNumberInput(body.examNumber)
      : parseFireExamNumberInput(body.examNumber);
    if (!examNumber) {
      return NextResponse.json(
        { error: `응시번호는 ${guard.tenantType === "police" ? 5 : 10}자리 숫자로 입력해 주세요.` },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await lockActiveExamStateForWrite(tx, guard.tenantType);
      const submission = await tx.submission.findFirst({
        where: {
          id: submissionId,
          examType: { in: [...TENANT_EXAM_TYPES[guard.tenantType]] },
        },
        select: {
          id: true,
          userId: true,
          examId: true,
          regionId: true,
          examType: true,
        },
      });
      if (!submission) {
        throw new AdminSubmissionWriteError("제출 데이터를 찾을 수 없습니다.", 404);
      }
      await resolveActiveExamForWrite({
        db: tx,
        tenantType: guard.tenantType,
        context: "api/admin/submissions PUT",
        requestedExamId: submission.examId,
      });
      await lockUserExamMutation(tx, { userId: submission.userId, examId: submission.examId });
      await lockExamNumberMutation(tx, {
        examId: submission.examId,
        regionId: submission.regionId,
        examNumber,
      });
      const ownPreRegistration = await tx.preRegistration.findUnique({
        where: { userId_examId: { userId: submission.userId, examId: submission.examId } },
        select: { id: true },
      });
      const availability = await checkExamNumberAvailability({
        db: tx,
        examId: submission.examId,
        regionId: submission.regionId,
        examType: submission.examType,
        examNumber,
        userId: submission.userId,
        excludeSubmissionId: submission.id,
        excludePreRegistrationId: ownPreRegistration?.id,
      });
      if (!availability.available) {
        throw new AdminSubmissionWriteError(
          availability.reason ?? "수험번호를 사용할 수 없습니다.",
          409
        );
      }
      await tx.submission.update({
        where: { id: submission.id },
        data: { examNumber },
      });
    });

    return NextResponse.json({ success: true, submissionId, examNumber });
  } catch (error) {
    if (isActiveExamRouteError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof AdminSubmissionWriteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
    await prisma.$transaction(async (tx) => {
      await lockActiveExamStateForWrite(tx, guard.tenantType);
      const submission = await tx.submission.findFirst({
        where: {
          id: submissionId,
          examType: { in: [...TENANT_EXAM_TYPES[guard.tenantType]] },
        },
        select: { id: true, userId: true, examId: true },
      });
      if (!submission) {
        throw new AdminSubmissionWriteError("삭제할 제출 데이터를 찾을 수 없습니다.", 404);
      }
      await resolveActiveExamForWrite({
        db: tx,
        tenantType: guard.tenantType,
        context: "api/admin/submissions DELETE",
        requestedExamId: submission.examId,
      });
      await lockUserExamMutation(tx, { userId: submission.userId, examId: submission.examId });
      await tx.submission.delete({ where: { id: submission.id } });
    });

    return NextResponse.json({
      success: true,
      deletedSubmissionId: submissionId,
    });
  } catch (error) {
    if (isActiveExamRouteError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof AdminSubmissionWriteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("제출 데이터 삭제 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "제출 데이터 삭제에 실패했습니다." }, { status: 500 });
  }
}
