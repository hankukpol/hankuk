import { AdminRole, ExamType, StudentType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { previewStudentMigration } from "@/lib/migration/students";

function parseMapping(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || !raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as Record<string, number | undefined>;

  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  );
}

function parseDefaults(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || !raw) {
    throw new Error("기본값 정보가 없습니다.");
  }

  const parsed = JSON.parse(raw) as {
    examType: ExamType;
    studentType: StudentType;
    classNameFallback?: string;
  };

  if (!parsed.examType || !parsed.studentType) {
    throw new Error("직렬과 학생 구분은 필수입니다.");
  }

  return parsed;
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "엑셀 파일이 필요합니다." }, { status: 400 });
    }

    const preview = await previewStudentMigration({
      fileName: file.name,
      fileBuffer: Buffer.from(await file.arrayBuffer()),
      sheetName:
        typeof formData.get("sheetName") === "string" &&
        String(formData.get("sheetName")).trim()
          ? String(formData.get("sheetName"))
          : undefined,
      headerRowIndex:
        typeof formData.get("headerRowIndex") === "string" &&
        String(formData.get("headerRowIndex")).trim() !== ""
          ? Number(formData.get("headerRowIndex"))
          : undefined,
      mapping: parseMapping(formData.get("mapping")),
      defaults: parseDefaults(formData.get("defaults")),
    });

    return NextResponse.json({
      ...preview,
      previewRows: preview.previewRows.slice(0, 20),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "학생 명단 미리보기에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
