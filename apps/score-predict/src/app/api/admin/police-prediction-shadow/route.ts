import { NextRequest, NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { buildPoliceShadowPredictionRows } from "@/lib/police/shadow-prediction";
import {
  POLICE_SHADOW_MODEL_CALIBRATED,
  POLICE_SHADOW_MODEL_VERSION,
} from "@/lib/police/shadow-prediction-model";
import { getSiteSettingsUncached } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  if (guard.tenantType !== "police") {
    return NextResponse.json({ error: "경찰 관리자 전용 API입니다." }, { status: 404 });
  }
  const featureError = await requireAdminSiteFeature("passCut");
  if (featureError) return featureError;

  const examId = positiveInt(request.nextUrl.searchParams.get("examId"));
  if (!examId) {
    return NextResponse.json({ error: "유효한 examId가 필요합니다." }, { status: 400 });
  }

  try {
    const settings = await getSiteSettingsUncached();
    const result = await buildPoliceShadowPredictionRows({
      examId,
      includeCareerExamType: Boolean(settings["site.careerExamEnabled"] ?? true),
    });
    return NextResponse.json(
      {
        modelVersion: POLICE_SHADOW_MODEL_VERSION,
        calibrated: POLICE_SHADOW_MODEL_CALIBRATED,
        publicExposure: false,
        generatedAt: new Date().toISOString(),
        releaseNumber: result.releaseNumber,
        rows: result.rows,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("경찰 관리자 그림자 합격예측 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json(
      { error: "그림자 합격예측을 계산하지 못했습니다." },
      { status: 500 }
    );
  }
}
