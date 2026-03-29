import { NextRequest, NextResponse } from "next/server";
import { runAutoPassCutRelease } from "@/lib/pass-cut-auto-release";
import { revalidateNoticeCache } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }
  return false;
}

function isAuthorized(request: NextRequest): boolean {
  const expectedSecret = process.env.AUTO_PASSCUT_CRON_SECRET ?? process.env.CRON_SECRET;
  const customHeaderSecret = request.headers.get("x-auto-release-secret");
  const authHeader = request.headers.get("authorization");
  const bearerSecret =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
  const receivedSecret = customHeaderSecret ?? bearerSecret;
  if (!expectedSecret) return false;
  if (!receivedSecret) return false;
  return receivedSecret === expectedSecret;
}

async function runCronTrigger(request: NextRequest, body: Record<string, unknown>) {
  const { searchParams } = new URL(request.url);
  const examId =
    parsePositiveInt(body.examId) ?? parsePositiveInt(searchParams.get("examId"));
  const force = parseBoolean(body.force ?? searchParams.get("force"));

  try {
    const result = await runAutoPassCutRelease({
      examId: examId ?? undefined,
      trigger: "cron",
      force,
    });

    if (result.releaseId) {
      revalidateNoticeCache("police");
    }

    return NextResponse.json({
      triggered: result.triggered,
      examId: result.examId,
      nextReleaseNumber: result.nextReleaseNumber,
      readyRegionRatio: result.readyRegionRatio,
      eligibleRegionCount: result.eligibleRegionCount,
      readyRegionCount: result.readyRegionCount,
      releaseId: result.releaseId,
      reason: result.reason,
    });
  } catch (error) {
    console.error("/api/internal/pass-cut-auto-release 실행 중 오류가 발생했습니다.", error);
    return NextResponse.json(
      { error: "자동 합격컷 발표 실행에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "접근이 거부되었습니다." }, { status: 403 });
  }
  return runCronTrigger(request, {});
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "접근이 거부되었습니다." }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  return runCronTrigger(request, body);
}
