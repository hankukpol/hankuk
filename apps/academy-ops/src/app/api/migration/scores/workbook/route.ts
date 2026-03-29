import { AdminRole, ExamType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  executeLegacyWorkbookScores,
  previewLegacyWorkbookScores,
} from "@/lib/migration/scores";

export const runtime = "nodejs";
export const maxDuration = 300;

type Mode = "preview" | "execute";

function parseExamType(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  if (value === ExamType.GONGCHAE || value === ExamType.GYEONGCHAE) {
    return value;
  }

  return null;
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const periodId = Number(formData.get("periodId"));
    const examType = parseExamType(formData.get("examType"));
    const mode = (formData.get("mode") as Mode | null) ?? "preview";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "구간 통합본 파일을 선택해 주세요." }, { status: 400 });
    }

    if (!Number.isFinite(periodId) || periodId <= 0) {
      return NextResponse.json({ error: "시험 기간을 선택해 주세요." }, { status: 400 });
    }

    if (!examType) {
      return NextResponse.json({ error: "직렬을 선택해 주세요." }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    if (mode === "preview") {
      const preview = await previewLegacyWorkbookScores({
        fileName: file.name,
        fileBuffer,
        periodId,
        examType,
      });

      return NextResponse.json(preview);
    }

    const result = await executeLegacyWorkbookScores({
      adminId: auth.context.adminUser.id,
      fileName: file.name,
      fileBuffer,
      periodId,
      examType,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "구간 통합본 마이그레이션 처리에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
