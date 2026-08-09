import {
  CalibrationScoreBasis,
  CalibrationSnapshotPhase,
  CalibrationSourceType,
  ExamType,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import {
  capturePoliceCalibrationSnapshots,
  type OfficialCalibrationInput,
} from "@/lib/police/calibration-snapshot";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function enumValue<T extends string>(values: readonly T[], value: unknown): T | null {
  return typeof value === "string" && values.includes(value as T) ? value as T : null;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  if (guard.tenantType !== "police") {
    return NextResponse.json({ error: "경찰 캘리브레이션 전용 API입니다." }, { status: 404 });
  }
  const featureError = await requireAdminSiteFeature("stats");
  if (featureError) return featureError;

  const examId = positiveInt(request.nextUrl.searchParams.get("examId"));
  if (!examId) {
    return NextResponse.json({ error: "유효한 examId가 필요합니다." }, { status: 400 });
  }

  const snapshots = await prisma.predictionCalibrationSnapshot.findMany({
    where: { examId },
    orderBy: [{ capturedAt: "asc" }, { regionId: "asc" }, { examType: "asc" }],
    select: {
      id: true,
      regionId: true,
      examType: true,
      phase: true,
      capturedAt: true,
      recruitCount: true,
      applicantCount: true,
      passMultiple: true,
      modelVersion: true,
      validParticipantCount: true,
      cutoffCount: true,
      suspiciousCount: true,
      rawAverageScore: true,
      finalAverageScore: true,
      sampleRankAtRecruitCountRawScore: true,
      sampleRankAtRecruitCountFinalScore: true,
      rawBoundaryTieCount: true,
      finalBoundaryTieCount: true,
      officialCutScore: true,
      officialPassCount: true,
      officialScoreBasis: true,
      officialSourceType: true,
      officialSourceReference: true,
      officialCutAboveSampleRatio: true,
      region: { select: { name: true } },
    },
  });
  return NextResponse.json({ snapshots });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  if (guard.tenantType !== "police") {
    return NextResponse.json({ error: "경찰 캘리브레이션 전용 API입니다." }, { status: 404 });
  }
  const featureError = await requireAdminSiteFeature("stats");
  if (featureError) return featureError;

  const body = await request.json() as Record<string, unknown>;
  const examId = positiveInt(body.examId);
  const regionId = body.regionId === undefined ? undefined : positiveInt(body.regionId) ?? undefined;
  const phase = enumValue(Object.values(CalibrationSnapshotPhase), body.phase);
  const examType = body.examType === undefined
    ? undefined
    : enumValue([ExamType.PUBLIC, ExamType.CAREER] as const, body.examType) ?? undefined;
  if (!examId || !phase) {
    return NextResponse.json({ error: "유효한 examId와 phase가 필요합니다." }, { status: 400 });
  }

  let official: OfficialCalibrationInput | undefined;
  if (phase === CalibrationSnapshotPhase.RESULT_DAY) {
    const cutScore = finiteNumber(body.officialCutScore);
    const passCount = positiveInt(body.officialPassCount);
    const scoreBasis = enumValue(Object.values(CalibrationScoreBasis), body.officialScoreBasis);
    const sourceType = enumValue(Object.values(CalibrationSourceType), body.officialSourceType);
    const sourceReference = typeof body.officialSourceReference === "string"
      ? body.officialSourceReference.trim()
      : "";
    if (!regionId || !examType || cutScore === null || !passCount || !scoreBasis || !sourceType || !sourceReference) {
      return NextResponse.json(
        { error: "결과 발표일 스냅샷에는 지역·채용유형·공식 합격선·합격인원·점수 기준·출처가 모두 필요합니다." },
        { status: 400 }
      );
    }
    official = { cutScore, passCount, scoreBasis, sourceType, sourceReference };
  }

  const snapshots = await capturePoliceCalibrationSnapshots({
    examId,
    phase,
    regionId,
    examType,
    official,
  });
  return NextResponse.json({ success: true, snapshotCount: snapshots.length, snapshots });
}
