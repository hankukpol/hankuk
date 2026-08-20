import { NextRequest, NextResponse } from "next/server";
import { SubmissionScoringStatus, SubmissionSuspicionStatus } from "@prisma/client";
import { type AdminPreviewCandidate, buildAdminPreviewCandidates } from "@/lib/admin-preview";
import { getCurrentTenantSessionContext } from "@/lib/tenant-session.server";
import { parsePositiveInt } from "@/lib/exam-utils";
import * as fireFinalPrediction from "@/lib/fire/final-prediction";
import * as policeFinalPrediction from "@/lib/police/final-prediction";
import { hasPoliceWrittenCutoff } from "@/lib/police/written-policy";
import { prisma } from "@/lib/prisma";
import { getEffectiveSiteSettings } from "@/lib/exam-operation";
import { isExamTypeForTenant, TENANT_EXAM_TYPES } from "@/lib/tenant-exam";
import type { TenantType } from "@/lib/tenant";
import {
  isActiveExamRouteError,
  lockActiveExamStateForWrite,
  requireSoleActiveExam,
  resolveActiveExamForWrite,
} from "@/lib/active-exam";
import { lockUserExamMutation } from "@/lib/police/pre-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FinalPredictionRequestBody {
  submissionId?: unknown;
  fitnessRawScore?: unknown;
  certificateBonus?: unknown;
  fitnessPassed?: unknown;
  martialDanLevel?: unknown;
}

const MOCK_EXAM_NUMBER_PREFIX = "MOCK-";

class FinalPredictionWriteError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "FinalPredictionWriteError";
  }
}

const submissionSelect = {
  id: true,
  userId: true,
  examId: true,
  regionId: true,
  examType: true,
  gender: true,
  totalScore: true,
  finalScore: true,
  bonusRate: true,
  scoringStatus: true,
  examNumber: true,
  certificateBonus: true,
  suspicionStatus: true,
  subjectScores: {
    select: { isFailed: true },
  },
} as const;

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseNumberInRange(value: unknown, minValue: number, maxValue: number): number | null {
  const parsed = parseFiniteNumber(value);
  if (parsed === null) return null;
  if (parsed < minValue || parsed > maxValue) return null;
  return parsed;
}

function isMockSubmissionExamNumber(value: string): boolean {
  return value.startsWith(MOCK_EXAM_NUMBER_PREFIX);
}

async function ensureFinalPredictionEnabled() {
  const settings = await getEffectiveSiteSettings();
  return Boolean(settings["site.finalPredictionEnabled"] ?? false);
}

async function findTargetSubmission(params: {
  tenantType: TenantType;
  submissionId: number | null;
  userId: number;
  isAdmin: boolean;
  adminPreviewCandidates: AdminPreviewCandidate[];
  activeExamId: number | null;
}) {
  const allowedExamTypes = TENANT_EXAM_TYPES[params.tenantType];
  if (params.submissionId) {
    return prisma.submission.findFirst({
      where: params.isAdmin
        ? {
            id: params.submissionId,
            examId: params.activeExamId ?? undefined,
            examType: { in: [...allowedExamTypes] },
            examNumber: { startsWith: MOCK_EXAM_NUMBER_PREFIX },
          }
        : {
            id: params.submissionId,
            userId: params.userId,
            examId: params.activeExamId ?? undefined,
            examType: { in: [...allowedExamTypes] },
          },
      select: submissionSelect,
    });
  }

  if (!params.isAdmin) {
    return prisma.submission.findFirst({
      where: {
        userId: params.userId,
        examId: params.activeExamId ?? undefined,
        examType: { in: [...allowedExamTypes] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: submissionSelect,
    });
  }

  const firstCandidateSubmissionId = params.adminPreviewCandidates[0]?.submissionId;
  if (!firstCandidateSubmissionId) return null;

  return prisma.submission.findUnique({
    where: { id: firstCandidateSubmissionId },
    select: submissionSelect,
  });
}

export async function GET(request: NextRequest) {
  const tenantSession = await getCurrentTenantSessionContext();
  if (!tenantSession) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { session, tenantType } = tenantSession;

  if (!(await ensureFinalPredictionEnabled())) {
    return NextResponse.json(
      { error: "최종 환산 예측 기능은 준비 중입니다. 관리자 오픈 후 이용 가능합니다." },
      { status: 403 }
    );
  }

  const userId = parsePositiveInt(session.user.id);
  if (!userId) {
    return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const submissionIdQuery = parsePositiveInt(searchParams.get("submissionId"));

  const isAdmin = session.user.role === "ADMIN";
  let activeExamId: number | null = null;
  let adminPreviewCandidates: AdminPreviewCandidate[] = [];
  try {
    activeExamId = (await requireSoleActiveExam({
      db: prisma,
      tenantType,
      context: "api/final-prediction GET",
    })).id;
    adminPreviewCandidates = isAdmin ? await buildAdminPreviewCandidates(tenantType) : [];
  } catch (error) {
    if (isActiveExamRouteError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const submission = await findTargetSubmission({
    tenantType,
    submissionId: submissionIdQuery,
    userId,
    isAdmin,
    adminPreviewCandidates,
    activeExamId,
  });

  if (!submission) {
    if (isAdmin) {
      return NextResponse.json({
        isAdminPreview: true,
        adminPreviewCandidates,
        submissionId: null,
        writtenScore: null,
        writtenScoreMax: null,
        certificateBonus: null,
        finalPrediction: null,
        ranking: null,
      });
    }

    return NextResponse.json({ error: "최종 환산 예측을 조회할 제출 데이터가 없습니다." }, { status: 404 });
  }

  if (!isExamTypeForTenant(tenantType, submission.examType)) {
    return NextResponse.json({ error: "현재 서비스의 시험유형이 아닙니다." }, { status: 409 });
  }

  if (isAdmin && !isMockSubmissionExamNumber(submission.examNumber)) {
    return NextResponse.json(
      { error: "관리자 미리보기는 MOCK 제출 데이터에서만 지원됩니다." },
      { status: 400 }
    );
  }


  if (submission.scoringStatus === SubmissionScoringStatus.PENDING) {
    return NextResponse.json(
      { error: "채점 대기 중입니다. 가답안 발표 후 자동 채점 결과를 확인해 주세요." },
      { status: 409 }
    );
  }
  if (submission.suspicionStatus !== SubmissionSuspicionStatus.CLEAR) {
    return NextResponse.json(
      { error: "성적 검토가 완료되기 전에는 최종 환산 예측을 제공하지 않습니다." },
      { status: 409 }
    );
  }
  if (tenantType === "police" ? hasPoliceWrittenCutoff({
    examType: submission.examType,
    totalScore: Number(submission.totalScore),
    subjectScores: submission.subjectScores,
  }) : submission.subjectScores.some((score) => score.isFailed)) {
    return NextResponse.json(
      { error: "과락 성적은 최종 환산 예측을 제공하지 않습니다." },
      { status: 400 }
    );
  }

  const saved = await prisma.finalPrediction.findUnique({
    where: { submissionId: submission.id },
    select: {
      fitnessScore: true,
      interviewScore: true,
      interviewGrade: true,
      finalScore: true,
      finalRank: true,
      updatedAt: true,
    },
  });

  const writtenScoreMax =
    tenantType === "fire"
      ? fireFinalPrediction.getWrittenScoreMax(submission.examType)
      : submission.examType === "PUBLIC"
        ? 250
        : 250;
  const submissionCertificateBonus = Number(submission.certificateBonus);
  const effectiveCertificateBonus =
    saved?.interviewScore !== null && saved?.interviewScore !== undefined
      ? Number(saved.interviewScore)
      : submissionCertificateBonus;

  const rankParams = {
    examId: submission.examId,
    regionId: submission.regionId,
    examType: submission.examType,
    submissionId: submission.id,
  };
  const rankInfo = !saved?.finalScore
    ? { finalRank: null as number | null, totalParticipants: 0 }
    : tenantType === "police"
      ? await policeFinalPrediction.calculateKnownFinalRank(rankParams)
      : await fireFinalPrediction.calculateKnownFinalRank({
          ...rankParams,
          gender: submission.gender,
        });

  const rankingDetails = !saved?.finalScore
    ? null
    : tenantType === "police"
      ? await policeFinalPrediction.calculateFinalRankingDetails(rankParams)
      : await fireFinalPrediction.calculateFinalRankingDetails({
          ...rankParams,
          gender: submission.gender,
        });

  if (tenantType === "police") {
    const fitnessPassed = saved?.interviewGrade === "PASS";
    const martialDanLevel = saved?.fitnessScore === null || saved?.fitnessScore === undefined
      ? 0
      : Number(saved.fitnessScore);
    const calculated = saved
      ? policeFinalPrediction.calculateKnownFinalScore({
          writtenScore: Number(submission.finalScore),
          fitnessPassed,
          martialDanLevel,
          appliedWrittenBonusRate: policeFinalPrediction.getAppliedPoliceWrittenBonusRate({
            rawWrittenScore: Number(submission.totalScore),
            finalWrittenScore: Number(submission.finalScore),
          }),
        })
      : null;

    return NextResponse.json({
      isAdminPreview: isAdmin,
      ...(isAdmin ? { adminPreviewCandidates } : {}),
      submissionId: submission.id,
      writtenScore: Number(submission.finalScore),
      finalPrediction: saved && calculated
        ? {
            ...calculated,
            fitnessPassed,
            martialDanLevel,
            finalRank: rankInfo.finalRank,
            totalParticipants: rankInfo.totalParticipants,
            updatedAt: saved.updatedAt.toISOString(),
          }
        : null,
      ranking: rankingDetails,
    });
  }

  return NextResponse.json({
    isAdminPreview: isAdmin,
    ...(isAdmin ? { adminPreviewCandidates } : {}),
    submissionId: submission.id,
    writtenScore: Number(submission.finalScore),
    writtenScoreMax,
    submissionCertificateBonus,
    certificateBonus: effectiveCertificateBonus,
    finalPrediction: saved
      ? {
          fitnessRawScore: saved.fitnessScore === null ? 0 : Number(saved.fitnessScore),
          knownFinalScore: saved.finalScore === null ? null : Number(saved.finalScore),
          finalRank: rankInfo.finalRank,
          totalParticipants: rankInfo.totalParticipants,
          updatedAt: saved.updatedAt.toISOString(),
        }
      : null,
    ranking: rankingDetails,
  });
}

export async function POST(request: NextRequest) {
  const tenantSession = await getCurrentTenantSessionContext();
  if (!tenantSession) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { session, tenantType } = tenantSession;

  if (!(await ensureFinalPredictionEnabled())) {
    return NextResponse.json(
      { error: "최종 환산 예측 기능은 준비 중입니다. 관리자 오픈 후 이용 가능합니다." },
      { status: 403 }
    );
  }

  const userId = parsePositiveInt(session.user.id);
  if (!userId) {
    return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN";

  let body: FinalPredictionRequestBody;
  try {
    body = (await request.json()) as FinalPredictionRequestBody;
  } catch {
    return NextResponse.json({ error: "요청 본문(JSON) 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const submissionId = parsePositiveInt(body.submissionId);
  if (!submissionId) {
    return NextResponse.json({ error: "유효한 submissionId가 필요합니다." }, { status: 400 });
  }

  const fitnessRawScore =
    tenantType === "fire" ? parseNumberInRange(body.fitnessRawScore, 0, 60) : null;
  if (tenantType === "fire" && fitnessRawScore === null) {
    return NextResponse.json({ error: "체력 점수는 0 이상 60 이하 숫자여야 합니다." }, { status: 400 });
  }

  const fitnessPassed = tenantType === "police" ? body.fitnessPassed : null;
  if (tenantType === "police" && typeof fitnessPassed !== "boolean") {
    return NextResponse.json({ error: "체력 통과 여부가 올바르지 않습니다." }, { status: 400 });
  }
  const martialDanLevel =
    tenantType === "police" ? parseNumberInRange(body.martialDanLevel, 0, 20) : null;
  if (tenantType === "police" && (martialDanLevel === null || !Number.isInteger(martialDanLevel))) {
    return NextResponse.json({ error: "무도 단수는 0 이상 20 이하 정수여야 합니다." }, { status: 400 });
  }

  const certBonusOverride = parseNumberInRange(body.certificateBonus, 0, 5);

  const submissionWhere = isAdmin
    ? {
        id: submissionId,
        examType: { in: [...TENANT_EXAM_TYPES[tenantType]] },
        examNumber: { startsWith: MOCK_EXAM_NUMBER_PREFIX },
      }
    : {
        id: submissionId,
        userId,
        examType: { in: [...TENANT_EXAM_TYPES[tenantType]] },
      };
  const submission = await prisma.submission.findFirst({
    where: submissionWhere,
    select: submissionSelect,
  });

  if (!submission) {
    return NextResponse.json({ error: "해당 제출 데이터를 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const responseBody = await prisma.$transaction(async (tx) => {
      await lockActiveExamStateForWrite(tx, tenantType);
      await resolveActiveExamForWrite({
        db: tx,
        tenantType,
        context: "api/final-prediction POST",
        requestedExamId: submission.examId,
      });
      await lockUserExamMutation(tx, {
        userId: submission.userId,
        examId: submission.examId,
      });

      // 제출 수정과 동시에 실행되더라도 잠금 이후의 최신 채점값으로 계산한다.
      const currentSubmission = await tx.submission.findFirst({
        where: submissionWhere,
        select: submissionSelect,
      });
      if (!currentSubmission) {
        throw new FinalPredictionWriteError("해당 제출 데이터를 찾을 수 없습니다.", 404);
      }
      if (currentSubmission.scoringStatus === SubmissionScoringStatus.PENDING) {
        throw new FinalPredictionWriteError(
          "채점 대기 중입니다. 가답안 발표 후 자동 채점 결과를 확인해 주세요.",
          409
        );
      }
      if (currentSubmission.suspicionStatus !== SubmissionSuspicionStatus.CLEAR) {
        throw new FinalPredictionWriteError(
          "성적 검토가 완료되기 전에는 최종 환산 예측을 저장할 수 없습니다.",
          409
        );
      }
      if (tenantType === "police" ? hasPoliceWrittenCutoff({
        examType: currentSubmission.examType,
        totalScore: Number(currentSubmission.totalScore),
        subjectScores: currentSubmission.subjectScores,
      }) : currentSubmission.subjectScores.some((score) => score.isFailed)) {
        throw new FinalPredictionWriteError("과락 성적은 최종 환산 예측을 저장할 수 없습니다.", 400);
      }
      if (!isExamTypeForTenant(tenantType, currentSubmission.examType)) {
        throw new FinalPredictionWriteError("현재 서비스의 시험유형이 아닙니다.", 409);
      }

      if (tenantType === "police") {
        const writtenScore = Number(currentSubmission.finalScore);
        const calculated = policeFinalPrediction.calculateKnownFinalScore({
          writtenScore,
          fitnessPassed: fitnessPassed as boolean,
          martialDanLevel: martialDanLevel as number,
          appliedWrittenBonusRate: policeFinalPrediction.getAppliedPoliceWrittenBonusRate({
            rawWrittenScore: Number(currentSubmission.totalScore),
            finalWrittenScore: writtenScore,
          }),
        });

        await tx.finalPrediction.upsert({
          where: { submissionId: currentSubmission.id },
          update: {
            userId: currentSubmission.userId,
            fitnessScore: martialDanLevel,
            interviewScore: null,
            interviewGrade: fitnessPassed ? "PASS" : "FAIL",
            finalScore: calculated.score75,
          },
          create: {
            submissionId: currentSubmission.id,
            userId: currentSubmission.userId,
            fitnessScore: martialDanLevel,
            interviewScore: null,
            interviewGrade: fitnessPassed ? "PASS" : "FAIL",
            finalScore: calculated.score75,
          },
        });

        const rankParams = {
          examId: currentSubmission.examId,
          regionId: currentSubmission.regionId,
          examType: currentSubmission.examType,
          submissionId: currentSubmission.id,
        };
        const rankInfo = await policeFinalPrediction.calculateKnownFinalRank(rankParams, tx);
        await tx.finalPrediction.update({
          where: { submissionId: currentSubmission.id },
          data: { finalRank: rankInfo.finalRank },
        });
        const rankingDetails = await policeFinalPrediction.calculateFinalRankingDetails(rankParams, tx);

        return {
          success: true,
          submissionId: currentSubmission.id,
          calculation: calculated,
          rank: rankInfo,
          ranking: rankingDetails,
        };
      }

      const writtenScore = Number(currentSubmission.finalScore);
      const writtenScoreMax = fireFinalPrediction.getWrittenScoreMax(currentSubmission.examType);
      const certificateBonus =
        certBonusOverride !== null ? certBonusOverride : Number(currentSubmission.certificateBonus);
      const calculated = fireFinalPrediction.calculateKnownFinalScore({
        writtenScore,
        writtenScoreMax,
        fitnessRawScore: fitnessRawScore!,
        certificateBonus,
      });

      await tx.finalPrediction.upsert({
        where: { submissionId: currentSubmission.id },
        update: {
          userId: currentSubmission.userId,
          fitnessScore: fitnessRawScore!,
          interviewScore: certificateBonus,
          interviewGrade: null,
          finalScore: calculated.knownFinalScore,
        },
        create: {
          submissionId: currentSubmission.id,
          userId: currentSubmission.userId,
          fitnessScore: fitnessRawScore!,
          interviewScore: certificateBonus,
          interviewGrade: null,
          finalScore: calculated.knownFinalScore,
        },
      });

      const rankParams = {
        examId: currentSubmission.examId,
        regionId: currentSubmission.regionId,
        examType: currentSubmission.examType,
        gender: currentSubmission.gender,
        submissionId: currentSubmission.id,
      };
      const rankInfo = await fireFinalPrediction.calculateKnownFinalRank(rankParams, tx);
      await tx.finalPrediction.update({
        where: { submissionId: currentSubmission.id },
        data: { finalRank: rankInfo.finalRank },
      });
      const rankingDetails = await fireFinalPrediction.calculateFinalRankingDetails(rankParams, tx);

      return {
        success: true,
        submissionId: currentSubmission.id,
        writtenScore,
        writtenScoreMax,
        fitnessRawScore: fitnessRawScore!,
        certificateBonus,
        calculation: {
          writtenConverted: calculated.writtenConverted,
          fitnessConverted: calculated.fitnessConverted,
          knownFinalScore: calculated.knownFinalScore,
        },
        rank: rankInfo,
        ranking: rankingDetails,
      };
    });

    return NextResponse.json(responseBody);
  } catch (error) {
    if (isActiveExamRouteError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof FinalPredictionWriteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
