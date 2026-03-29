import { AdminRole, AttendType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  SCORE_SESSION_LOCKED_MESSAGE,
  deleteMultipleScoreEntries,
  deleteSessionScores,
  executePastedScores,
  previewPastedScores,
} from "@/lib/scores/service";

export const runtime = "nodejs";
export const maxDuration = 300;

type Mode = "preview" | "execute" | "deleteSession" | "deleteScores";

function getErrorStatus(error: unknown) {
  return error instanceof Error && error.message === SCORE_SESSION_LOCKED_MESSAGE ? 409 : 400;
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      mode?: Mode;
      sessionId?: number;
      text?: string;
      attendType?: AttendType;
      scoreIds?: number[];
    };

    if (!body.sessionId) {
      return NextResponse.json({ error: "회차를 선택해 주세요." }, { status: 400 });
    }

    if ((body.mode ?? "preview") === "deleteSession") {
      const result = await deleteSessionScores({
        adminId: auth.context.adminUser.id,
        sessionId: Number(body.sessionId),
        ipAddress: request.headers.get("x-forwarded-for"),
      });

      return NextResponse.json(result);
    }

    if ((body.mode ?? "preview") === "deleteScores") {
      if (!Array.isArray(body.scoreIds) || body.scoreIds.length === 0) {
        return NextResponse.json({ error: "삭제할 성적을 선택해 주세요." }, { status: 400 });
      }

      const scoreIds = body.scoreIds.map((value) => Number(value));
      if (scoreIds.some((value) => !Number.isInteger(value) || value <= 0)) {
        return NextResponse.json({ error: "삭제할 성적 선택이 올바르지 않습니다." }, { status: 400 });
      }

      const result = await deleteMultipleScoreEntries({
        adminId: auth.context.adminUser.id,
        scoreIds,
        ipAddress: request.headers.get("x-forwarded-for"),
      });

      return NextResponse.json(result);
    }

    if (!body.text?.trim()) {
      return NextResponse.json({ error: "붙여넣기 텍스트를 입력해 주세요." }, { status: 400 });
    }

    if ((body.mode ?? "preview") === "preview") {
      const preview = await previewPastedScores({
        sessionId: Number(body.sessionId),
        text: body.text,
        attendType: body.attendType,
      });

      return NextResponse.json(preview);
    }

    const result = await executePastedScores({
      adminId: auth.context.adminUser.id,
      sessionId: Number(body.sessionId),
      text: body.text,
      attendType: body.attendType,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "붙여넣기 성적 처리에 실패했습니다." },
      { status: getErrorStatus(error) },
    );
  }
}
