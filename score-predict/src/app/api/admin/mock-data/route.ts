import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { generateMockData, resetMockData } from "@/lib/mock-data";
import { getSiteSettingsUncached } from "@/lib/site-settings";

export const runtime = "nodejs";

interface GeneratePayload {
  examId?: unknown;
  publicPerRegion?: unknown;
  careerPerRegion?: unknown;
  includeEmploymentBonus?: unknown;
  resetBeforeGenerate?: unknown;
  includeFinalPredictionMock?: unknown;
}

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function parseBoolean(value: unknown, fallbackValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallbackValue;
}

function toUserErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return (
      "데이터베이스 스키마가 최신 코드와 일치하지 않습니다. " +
      "관리자에서 `npx prisma db push` 또는 마이그레이션 적용 후 다시 시도해 주세요."
    );
  }

  if (error instanceof Error) {
    const safeMessages = new Set([
      "활성 시험이 없어 목업 데이터를 생성할 수 없습니다.",
      "생성 가능한 지역/직렬 데이터가 없어 목업 데이터 생성을 건너뛰었습니다.",
    ]);
    if (safeMessages.has(error.message)) {
      return error.message;
    }
  }

  return fallbackMessage;
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("mockData");
  if (featureError) return featureError;

  try {
    let body: GeneratePayload;
    try {
      body = (await request.json()) as GeneratePayload;
    } catch {
      return NextResponse.json({ error: "요청 본문(JSON) 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const settings = await getSiteSettingsUncached();
    const careerExamEnabled = Boolean(settings["site.careerExamEnabled"] ?? true);

    const careerPerRegion = parsePositiveInt(body.careerPerRegion);
    const result = await generateMockData({
      examId: parsePositiveInt(body.examId),
      publicPerRegion: parsePositiveInt(body.publicPerRegion),
      careerRescuePerRegion: careerPerRegion,
      careerAcademicPerRegion: careerPerRegion,
      careerEmtPerRegion: careerPerRegion,
      careerRescueEnabled: careerExamEnabled,
      careerAcademicEnabled: careerExamEnabled,
      careerEmtEnabled: careerExamEnabled,
      includeEmploymentBonus: parseBoolean(body.includeEmploymentBonus, false),
      resetBeforeGenerate: parseBoolean(body.resetBeforeGenerate, true),
      includeFinalPredictionMock: parseBoolean(body.includeFinalPredictionMock, true),
    });

    return NextResponse.json({
      success: true,
      message: "목업 데이터 생성이 완료되었습니다.",
      result,
    });
  } catch (error) {
    const message = toUserErrorMessage(error, "목업 데이터 생성에 실패했습니다.");
    console.error("POST /api/admin/mock-data error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("mockData");
  if (featureError) return featureError;

  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    const examId = parsePositiveInt(searchParams.get("examId"));

    if (scope !== "all" && !examId) {
      return NextResponse.json({ error: "scope=all 이 아니면 examId가 필요합니다." }, { status: 400 });
    }

    const result = await resetMockData({
      examId: scope === "all" ? undefined : examId,
    });

    return NextResponse.json({
      success: true,
      message: "목업 데이터 초기화가 완료되었습니다.",
      result,
    });
  } catch (error) {
    const message = toUserErrorMessage(error, "목업 데이터 초기화에 실패했습니다.");
    console.error("DELETE /api/admin/mock-data error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
