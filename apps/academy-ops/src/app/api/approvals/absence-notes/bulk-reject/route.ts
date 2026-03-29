import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { ids, comment } = body as { ids: unknown; comment?: unknown };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids는 비어 있지 않은 배열이어야 합니다." }, { status: 400 });
    }

    const idList = ids as number[];
    if (!idList.every((id) => typeof id === "number")) {
      return NextResponse.json({ error: "ids는 숫자 배열이어야 합니다." }, { status: 400 });
    }

    const adminNote = typeof comment === "string" && comment.trim() ? comment.trim() : null;

    const result = await getPrisma().absenceNote.updateMany({
      where: {
        id: { in: idList },
        status: "PENDING",
      },
      data: {
        status: "REJECTED",
        ...(adminNote ? { adminNote } : {}),
      },
    });

    return NextResponse.json({ data: { updated: result.count } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "일괄 반려에 실패했습니다." },
      { status: 400 },
    );
  }
}
