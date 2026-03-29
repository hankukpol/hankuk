import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { previewScoreFiles } from "@/lib/migration/scores";

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "점수 파일이 필요합니다." }, { status: 400 });
    }

    const previews = previewScoreFiles(
      await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          buffer: Buffer.from(await file.arrayBuffer()),
        })),
      ),
    );

    return NextResponse.json({ files: previews });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "점수 파일 분석에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
