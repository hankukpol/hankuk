import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { evaluateAutoPassCutRows } from "@/lib/pass-cut-auto-release";
import {
  createPassCutRelease,
  PassCutReleaseServiceError,
} from "@/lib/pass-cut-release.service";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsUncached, revalidateNoticeCache } from "@/lib/site-settings";

export const runtime = "nodejs";

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function toUserErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return "DB 스키마가 현재 코드와 맞지 않습니다. `npx prisma db push` 실행 후 다시 시도해 주세요.";
  }
  return fallbackMessage;
}

interface CreateReleaseBody {
  examId?: number;
  releaseNumber?: number;
  memo?: string;
  autoNotice?: boolean;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("passCut");
  if (featureError) return featureError;

  try {
    const { searchParams } = new URL(request.url);
    const examId = parsePositiveInt(searchParams.get("examId"));
    if (!examId) {
      return NextResponse.json({ error: "examId는 필수입니다." }, { status: 400 });
    }

    const releases = await prisma.passCutRelease.findMany({
      where: { examId },
      orderBy: [{ releaseNumber: "asc" }, { id: "asc" }],
      select: {
        id: true,
        examId: true,
        releaseNumber: true,
        releasedAt: true,
        participantCount: true,
        memo: true,
        admin: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            snapshots: true,
          },
        },
      },
    });

    return NextResponse.json({
      releases: releases.map((release) => ({
        id: release.id,
        examId: release.examId,
        releaseNumber: release.releaseNumber,
        releasedAt: release.releasedAt.toISOString(),
        participantCount: release.participantCount,
        memo: release.memo,
        createdBy: {
          id: release.admin.id,
          name: release.admin.name,
        },
        snapshotCount: release._count.snapshots,
      })),
    });
  } catch (error) {
    console.error("합격컷 발표 이력 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json(
      { error: toUserErrorMessage(error, "합격컷 발표 이력을 불러오지 못했습니다.") },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("passCut");
  if (featureError) return featureError;

  try {
    const adminUserId = Number(guard.session.user.id);
    if (!Number.isInteger(adminUserId) || adminUserId <= 0) {
      return NextResponse.json({ error: "관리자 세션이 올바르지 않습니다." }, { status: 401 });
    }

    let body: CreateReleaseBody;
    try {
      body = (await request.json()) as CreateReleaseBody;
    } catch {
      return NextResponse.json(
        { error: "요청 본문 JSON 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const examId = parsePositiveInt(body.examId);
    const releaseNumber = parsePositiveInt(body.releaseNumber);
    const memo = typeof body.memo === "string" && body.memo.trim() ? body.memo.trim() : null;
    const autoNotice = body.autoNotice !== false;

    if (!examId) {
      return NextResponse.json({ error: "examId는 필수입니다." }, { status: 400 });
    }
    if (!releaseNumber || releaseNumber < 1 || releaseNumber > 4) {
      return NextResponse.json(
        { error: "releaseNumber는 1부터 4 사이여야 합니다." },
        { status: 400 }
      );
    }

    const settings = await getSiteSettingsUncached();
    const includeCareerExamType = Boolean(settings["site.careerExamEnabled"] ?? true);
    const evaluatedRows = await evaluateAutoPassCutRows({
      examId,
      releaseNumberForThreshold: releaseNumber,
      includeCareerExamType,
    });

    const created = await createPassCutRelease({
      examId,
      releaseNumber,
      createdBy: adminUserId,
      source: "ADMIN",
      memo,
      autoNotice,
      snapshots: evaluatedRows.map((row) => ({
        regionId: row.regionId,
        examType: row.examType,
        gender: row.gender,
        participantCount: row.participantCount,
        recruitCount: row.recruitCount,
        averageScore: row.averageScore,
        oneMultipleCutScore: row.oneMultipleCutScore,
        sureMinScore: row.sureMinScore,
        likelyMinScore: row.likelyMinScore,
        possibleMinScore: row.possibleMinScore,
        statusPayload: row.statusPayload,
      })),
    });

    if (autoNotice) {
      revalidateNoticeCache("police");
    }

    return NextResponse.json({
      success: true,
      releaseId: created.id,
      releaseNumber: created.releaseNumber,
      releasedAt: created.releasedAt,
      participantCount: created.participantCount,
      snapshotCount: created.snapshotCount,
    });
  } catch (error) {
    if (error instanceof PassCutReleaseServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "같은 시험과 발표 차수의 합격컷 발표 이력이 이미 존재합니다." },
        { status: 409 }
      );
    }
    console.error("합격컷 발표 생성 중 오류가 발생했습니다.", error);
    return NextResponse.json(
      { error: toUserErrorMessage(error, "합격컷 발표 생성에 실패했습니다.") },
      { status: 500 }
    );
  }
}
