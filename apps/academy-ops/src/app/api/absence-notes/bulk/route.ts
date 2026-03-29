import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { reviewAbsenceNote } from "@/lib/absence-notes/service";

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      action: "approve" | "reject";
      ids: number[];
    };

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: "처리할 사유서를 선택하세요." }, { status: 400 });
    }

    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json({ error: "action은 approve 또는 reject이어야 합니다." }, { status: 400 });
    }

    const results = await Promise.allSettled(
      body.ids.map((id) =>
        reviewAbsenceNote({
          adminId: auth.context.adminUser.id,
          noteId: id,
          action: body.action,
          ipAddress: request.headers.get("x-forwarded-for"),
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return NextResponse.json({ succeeded, failed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "일괄 처리에 실패했습니다." },
      { status: 400 },
    );
  }
}
