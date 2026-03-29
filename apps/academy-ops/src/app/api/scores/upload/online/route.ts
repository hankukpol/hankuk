import { AdminRole, AttendType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  SCORE_SESSION_LOCKED_MESSAGE,
  executeOnlineScoreUpload,
  previewOnlineScoreUpload,
  type ScoreResolutionInput,
} from "@/lib/scores/service";

export const runtime = "nodejs";
export const maxDuration = 300;

type Mode = "preview" | "execute";

function parseResolutions(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || !raw) {
    return {} satisfies ScoreResolutionInput;
  }

  return JSON.parse(raw) as ScoreResolutionInput;
}

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
    const mainFile = formData.get("mainFile");
    const detailFile = formData.get("detailFile");
    const oxMainFile = formData.get("oxMainFile");
    const oxDetailFile = formData.get("oxDetailFile");
    const sessionId = Number(formData.get("sessionId"));
    const mode = (formData.get("mode") as Mode | null) ?? "preview";
    const attendType = formData.get("attendType") as AttendType | null;
    const oxSessionIdRaw = Number(formData.get("oxSessionId"));
    const oxSessionId =
      Number.isFinite(oxSessionIdRaw) && oxSessionIdRaw > 0 ? oxSessionIdRaw : undefined;
    const resolutions = parseResolutions(formData.get("resolutions"));

    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return NextResponse.json({ error: "시험 회차를 선택하세요." }, { status: 400 });
    }

    if (!(mainFile instanceof File)) {
      return NextResponse.json({ error: "온라인 점수 파일을 선택하세요." }, { status: 400 });
    }

    const mainBuffer = Buffer.from(await mainFile.arrayBuffer());
    const detailBuffer =
      detailFile instanceof File ? Buffer.from(await detailFile.arrayBuffer()) : undefined;
    const oxMainBuffer =
      oxMainFile instanceof File ? Buffer.from(await oxMainFile.arrayBuffer()) : undefined;
    const oxDetailBuffer =
      oxDetailFile instanceof File ? Buffer.from(await oxDetailFile.arrayBuffer()) : undefined;

    if (mode === "preview") {
      const preview = await previewOnlineScoreUpload({
        sessionId,
        oxSessionId,
        mainFileName: mainFile.name,
        mainBuffer,
        detailFileName: detailFile instanceof File ? detailFile.name : undefined,
        detailBuffer,
        oxMainFileName: oxMainFile instanceof File ? oxMainFile.name : undefined,
        oxMainBuffer,
        oxDetailFileName: oxDetailFile instanceof File ? oxDetailFile.name : undefined,
        oxDetailBuffer,
        resolutions,
        attendType: attendType ?? undefined,
      });

      return NextResponse.json(preview);
    }

    const result = await executeOnlineScoreUpload({
      adminId: auth.context.adminUser.id,
      sessionId,
      oxSessionId,
      mainFileName: mainFile.name,
      mainBuffer,
      detailFileName: detailFile instanceof File ? detailFile.name : undefined,
      detailBuffer,
      oxMainFileName: oxMainFile instanceof File ? oxMainFile.name : undefined,
      oxMainBuffer,
      oxDetailFileName: oxDetailFile instanceof File ? oxDetailFile.name : undefined,
      oxDetailBuffer,
      resolutions,
      attendType: attendType ?? undefined,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "온라인 채점 파일 처리에 실패했습니다." },
      { status: getErrorStatus(error) },
    );
  }
}
