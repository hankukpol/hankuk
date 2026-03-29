import { AdminRole, ExamType, StudentType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  executeStudentFileImport,
  executeStudentPasteImport,
  previewStudentFileImport,
  previewStudentPasteImport,
} from "@/lib/students/service";

type Mode = "preview" | "execute";

function parseDefaults(formData: FormData) {
  const raw = formData.get("defaults");

  if (typeof raw !== "string" || !raw) {
    throw new Error("기본값 정보가 필요합니다.");
  }

  return JSON.parse(raw) as {
    examType: ExamType;
    studentType: StudentType;
    duplicateStrategy: "UPDATE" | "SKIP" | "OVERWRITE";
    classNameFallback?: string;
  };
}

function parseMapping(formData: FormData) {
  const raw = formData.get("mapping");
  if (typeof raw !== "string" || !raw) {
    return {};
  }

  return JSON.parse(raw) as Record<string, number | undefined>;
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const mode = (formData.get("mode") as Mode | null) ?? "preview";
    const defaults = parseDefaults(formData);
    const mapping = parseMapping(formData);
    const text = typeof formData.get("text") === "string" ? String(formData.get("text")) : "";
    const file = formData.get("file");

    if (file instanceof File) {
      if (mode === "preview") {
        const preview = await previewStudentFileImport({
          fileName: file.name,
          buffer: Buffer.from(await file.arrayBuffer()),
          defaults,
        });
        return NextResponse.json(preview);
      }

      const result = await executeStudentFileImport({
        adminId: auth.context.adminUser.id,
        fileName: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
        defaults,
        ipAddress: request.headers.get("x-forwarded-for"),
      });

      return NextResponse.json(result);
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "붙여넣기 텍스트 또는 엑셀 파일이 필요합니다." },
        { status: 400 },
      );
    }

    if (mode === "preview") {
      const preview = await previewStudentPasteImport({
        text,
        mapping,
        defaults,
      });
      return NextResponse.json(preview);
    }

    const result = await executeStudentPasteImport({
      adminId: auth.context.adminUser.id,
      text,
      mapping,
      defaults,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "붙여넣기 등록에 실패했습니다." },
      { status: 400 },
    );
  }
}
