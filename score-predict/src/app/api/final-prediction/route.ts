import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { SubmissionScoringStatus } from "@prisma/client";
import { type AdminPreviewCandidate, buildAdminPreviewCandidates } from "@/lib/admin-preview";
import { authOptions } from "@/lib/auth";
import { parsePositiveInt } from "@/lib/exam-utils";
import {
  calculateFinalRankingDetails,
  calculateKnownFinalRank,
  calculateKnownFinalScore,
  getWrittenScoreMax,
} from "@/lib/final-prediction";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsUncached } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FinalPredictionRequestBody {
  submissionId?: unknown;
  fitnessRawScore?: unknown;
  certificateBonus?: unknown;
}

const MOCK_EXAM_NUMBER_PREFIX = "MOCK-";

const submissionSelect = {
  id: true,
  userId: true,
  examId: true,
  regionId: true,
  examType: true,
  gender: true,
  finalScore: true,
  scoringStatus: true,
  examNumber: true,
  certificateBonus: true,
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
  const settings = await getSiteSettingsUncached();
  return Boolean(settings["site.finalPredictionEnabled"] ?? false);
}

async function findTargetSubmission(params: {
  submissionId: number | null;
  userId: number;
  isAdmin: boolean;
  adminPreviewCandidates: AdminPreviewCandidate[];
}) {
  if (params.submissionId) {
    return prisma.submission.findFirst({
      where: params.isAdmin
        ? { id: params.submissionId, examNumber: { startsWith: MOCK_EXAM_NUMBER_PREFIX } }
        : { id: params.submissionId, userId: params.userId },
      select: submissionSelect,
    });
  }

  if (!params.isAdmin) {
    return prisma.submission.findFirst({
      where: { userId: params.userId },
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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

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
  const adminPreviewCandidates = isAdmin ? await buildAdminPreviewCandidates() : [];

  const { searchParams } = new URL(request.url);
  const submissionIdQuery = parsePositiveInt(searchParams.get("submissionId"));

  const submission = await findTargetSubmission({
    submissionId: submissionIdQuery,
    userId,
    isAdmin,
    adminPreviewCandidates,
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

  const saved = await prisma.finalPrediction.findUnique({
    where: { submissionId: submission.id },
    select: {
      fitnessScore: true,
      interviewScore: true,
      finalScore: true,
      finalRank: true,
      updatedAt: true,
    },
  });

  const writtenScoreMax = getWrittenScoreMax(submission.examType);
  const submissionCertificateBonus = Number(submission.certificateBonus);
  const effectiveCertificateBonus =
    saved?.interviewScore !== null && saved?.interviewScore !== undefined
      ? Number(saved.interviewScore)
      : submissionCertificateBonus;

  const rankInfo =
    !saved?.finalScore
      ? { finalRank: null as number | null, totalParticipants: 0 }
      : await calculateKnownFinalRank({
          examId: submission.examId,
          regionId: submission.regionId,
          examType: submission.examType,
          gender: submission.gender,
          submissionId: submission.id,
        });

  const rankingDetails = !saved?.finalScore
    ? null
    : await calculateFinalRankingDetails({
        examId: submission.examId,
        regionId: submission.regionId,
        examType: submission.examType,
        gender: submission.gender,
        submissionId: submission.id,
      });

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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

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

  const fitnessRawScore = parseNumberInRange(body.fitnessRawScore, 0, 60);
  if (fitnessRawScore === null) {
    return NextResponse.json({ error: "체력 점수는 0 이상 60 이하 숫자여야 합니다." }, { status: 400 });
  }

  const certBonusOverride = parseNumberInRange(body.certificateBonus, 0, 5);

  const submission = await prisma.submission.findFirst({
    where: isAdmin
      ? { id: submissionId, examNumber: { startsWith: MOCK_EXAM_NUMBER_PREFIX } }
      : { id: submissionId, userId },
    select: submissionSelect,
  });

  if (!submission) {
    return NextResponse.json({ error: "해당 제출 데이터를 찾을 수 없습니다." }, { status: 404 });
  }


  if (submission.scoringStatus === SubmissionScoringStatus.PENDING) {
    return NextResponse.json(
      { error: "채점 대기 중입니다. 가답안 발표 후 자동 채점 결과를 확인해 주세요." },
      { status: 409 }
    );
  }
  const writtenScore = Number(submission.finalScore);
  const writtenScoreMax = getWrittenScoreMax(submission.examType);
  const certificateBonus = certBonusOverride !== null ? certBonusOverride : Number(submission.certificateBonus);

  const calculated = calculateKnownFinalScore({
    writtenScore,
    writtenScoreMax,
    fitnessRawScore,
    certificateBonus,
  });

  await prisma.finalPrediction.upsert({
    where: { submissionId: submission.id },
    update: {
      userId: submission.userId,
      fitnessScore: fitnessRawScore,
      interviewScore: certificateBonus,
      interviewGrade: null,
      finalScore: calculated.knownFinalScore,
    },
    create: {
      submissionId: submission.id,
      userId: submission.userId,
      fitnessScore: fitnessRawScore,
      interviewScore: certificateBonus,
      interviewGrade: null,
      finalScore: calculated.knownFinalScore,
    },
  });

  const rankInfo = await calculateKnownFinalRank({
    examId: submission.examId,
    regionId: submission.regionId,
    examType: submission.examType,
    gender: submission.gender,
    submissionId: submission.id,
  });

  await prisma.finalPrediction.update({
    where: { submissionId: submission.id },
    data: { finalRank: rankInfo.finalRank },
  });

  const rankingDetails = await calculateFinalRankingDetails({
    examId: submission.examId,
    regionId: submission.regionId,
    examType: submission.examType,
    gender: submission.gender,
    submissionId: submission.id,
  });

  return NextResponse.json({
    success: true,
    submissionId: submission.id,
    writtenScore,
    writtenScoreMax,
    fitnessRawScore,
    certificateBonus,
    calculation: {
      writtenConverted: calculated.writtenConverted,
      fitnessConverted: calculated.fitnessConverted,
      knownFinalScore: calculated.knownFinalScore,
    },
    rank: rankInfo,
    ranking: rankingDetails,
  });
}
