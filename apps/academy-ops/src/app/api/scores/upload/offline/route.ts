import { AdminRole, AttendType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  SCORE_SESSION_LOCKED_MESSAGE,
  executeOfflineScoreUpload,
  previewOfflineScoreUpload,
} from "@/lib/scores/service";

export const runtime = "nodejs";
export const maxDuration = 300;

type Mode = "preview" | "execute";

function getErrorStatus(error: unknown) {
  return error instanceof Error && error.message === SCORE_SESSION_LOCKED_MESSAGE ? 409 : 400;
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const mainFile = formData.get("mainFile") ?? formData.get("file");
    const analysisFile = formData.get("analysisFile");
    const sessionId = Number(formData.get("sessionId"));
    const mode = (formData.get("mode") as Mode | null) ?? "preview";
    const attendType = formData.get("attendType") as AttendType | null;
    const oxSessionIdRaw = Number(formData.get("oxSessionId"));
    const oxSessionId =
      Number.isFinite(oxSessionIdRaw) && oxSessionIdRaw > 0 ? oxSessionIdRaw : undefined;

    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return NextResponse.json({ error: "시험 회차를 선택하세요." }, { status: 400 });
    }

    if (!(mainFile instanceof File)) {
      return NextResponse.json({ error: "오프라인 채점 파일을 선택하세요." }, { status: 400 });
    }

    const mainBuffer = Buffer.from(await mainFile.arrayBuffer());
    const analysisBuffer =
      analysisFile instanceof File ? Buffer.from(await analysisFile.arrayBuffer()) : undefined;

    if (mode === "preview") {
      const result = await previewOfflineScoreUpload({
        sessionId,
        oxSessionId,
        mainFileName: mainFile.name,
        mainBuffer,
        analysisFileName: analysisFile instanceof File ? analysisFile.name : undefined,
        analysisBuffer,
        attendType: attendType ?? undefined,
      });

      return NextResponse.json(result);
    }

    const result = await executeOfflineScoreUpload({
      adminId: auth.context.adminUser.id,
      sessionId,
      oxSessionId,
      mainFileName: mainFile.name,
      mainBuffer,
      analysisFileName: analysisFile instanceof File ? analysisFile.name : undefined,
      analysisBuffer,
      attendType: attendType ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "오프라인 채점 파일 처리에 실패했습니다.",
      },
      { status: getErrorStatus(error) },
    );
  }
}
